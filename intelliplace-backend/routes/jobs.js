import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { supabase } from '../lib/supabase.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});


const authorizeCompany = (req, res, next) => {
  if (!req.user || req.user.userType !== 'company') return res.status(403).json({ success: false, message: 'Company access required' });
  next();
};

const authorizeStudent = (req, res, next) => {
  if (!req.user || req.user.userType !== 'student') return res.status(403).json({ success: false, message: 'Student access required' });
  next();
};


router.post('/', authenticateToken, authorizeCompany, upload.single('jobDescriptionFile'), async (req, res) => {
  try {
    const companyId = req.user.id;
    
   
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });
    
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found. Please log in again.' });
    }
    
   
    let title, description, location, type, salary, requiredSkills, minCgpa, includeCgpaInShortlisting, allowBacklog, maxBacklog;
    
    if (req.file) {
  
      title = req.body.title;
      description = req.body.description;
      location = req.body.location || null;
      type = req.body.type;
      salary = req.body.salary || null;
      requiredSkills = req.body.requiredSkills;
      minCgpa = req.body.minCgpa;
      includeCgpaInShortlisting = req.body.includeCgpaInShortlisting;
      allowBacklog = req.body.allowBacklog;
      maxBacklog = req.body.maxBacklog;
    } else {
      
      ({ title, description, location, type, salary, requiredSkills, minCgpa, includeCgpaInShortlisting, allowBacklog, maxBacklog } = req.body);
    }

    if (!title || !description || !type) return res.status(400).json({ success: false, message: 'Title, description and type are required' });

    const allowBacklogBool = allowBacklog === 'true' || allowBacklog === true;
    if (allowBacklogBool) {
      if (!maxBacklog || maxBacklog === '') {
        return res.status(400).json({ success: false, message: 'Maximum backlogs allowed is required when "Allow Backlog" is selected' });
      }
      const maxBacklogNum = parseInt(maxBacklog, 10);
      if (isNaN(maxBacklogNum) || maxBacklogNum < 1) {
        return res.status(400).json({ success: false, message: 'Maximum backlogs allowed must be at least 1' });
      }
    }

    let jobDescriptionFileUrl = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const filePath = `job-descriptions/${companyId}-${Date.now()}${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('job-descriptions')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return res.status(500).json({ success: false, message: 'Error uploading job description file' });
      }

  
      const { data: publicData } = supabase.storage
        .from('job-descriptions')
        .getPublicUrl(filePath);

      jobDescriptionFileUrl = publicData.publicUrl;
    }

  
    let parsedSkills = null;
    if (requiredSkills) {
      if (typeof requiredSkills === 'string') {
        try {
          parsedSkills = JSON.parse(requiredSkills);
        } catch {
          parsedSkills = requiredSkills.split(',').map(s => s.trim()).filter(s => s);
        }
      } else if (Array.isArray(requiredSkills)) {
        parsedSkills = requiredSkills;
      }
    }

    const job = await prisma.job.create({
      data: {
        title,
        description,
        location: location || null,
        type,
        salary: salary || null,
        requiredSkills: parsedSkills ? (Array.isArray(parsedSkills) ? parsedSkills.join(',') : String(parsedSkills)) : null,
        minCgpa: minCgpa ? parseFloat(minCgpa) : null,
        includeCgpaInShortlisting: includeCgpaInShortlisting === 'false' || includeCgpaInShortlisting === false ? false : true,
        allowBacklog: allowBacklogBool,
        maxBacklog: allowBacklogBool && maxBacklog ? parseInt(maxBacklog, 10) : null,
        jobDescriptionFileUrl: jobDescriptionFileUrl || null,
        companyId: companyId
      }
    });

    res.status(201).json({ success: true, message: 'Job created', data: job });
  } catch (error) {
    console.error('Error creating job:', error);
    
   
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid company ID. Please log out and log in again.' 
      });
    }
    
    res.status(500).json({ success: false, message: 'Server error creating job', error: error.message });
  }
});


router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = search ? {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    } : {};

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({ where, skip, take: parseInt(limit), orderBy: { createdAt: 'desc' }, include: { company: true } }),
      prisma.job.count({ where })
    ]);

    res.json({ success: true, data: { jobs, pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), limit: parseInt(limit) } } });
  } catch (error) {
    console.error('Error listing jobs:', error);
    res.status(500).json({ success: false, message: 'Server error listing jobs' });
  }
});


router.post('/:jobId/apply', authenticateToken, authorizeStudent, upload.single('cv'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const file = req.file;

    
    const { skills, cgpa, backlog } = req.body;

    
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    
    if (job.status !== 'OPEN') {
      return res.status(400).json({ success: false, message: 'Applications for this job are closed' });
    }

    
    const existing = await prisma.application.findFirst({ where: { studentId, jobId } });
    if (existing) return res.status(400).json({ success: false, message: 'Already applied to this job' });

    
    const appCgpa = cgpa ? parseFloat(cgpa) : null;
    const appBacklog = backlog !== undefined && backlog !== null && backlog !== '' 
      ? parseInt(backlog, 10) 
      : null;

    
    let passesCgpa = true;
    if (job.includeCgpaInShortlisting !== false && typeof job.minCgpa === 'number') {
      if (appCgpa === null || isNaN(appCgpa)) {
        return res.status(400).json({ 
          success: false, 
          message: 'CGPA is required for this application. Please provide your CGPA in the form.' 
        });
      }
      passesCgpa = appCgpa >= job.minCgpa;
    }

    
    let passesBacklog = true;
    if (job.allowBacklog === false || job.allowBacklog === null || job.allowBacklog === undefined) {
     
      if (appBacklog === null || isNaN(appBacklog)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Backlog count is required for this application. Please provide your backlog count in the form.' 
        });
      }
      passesBacklog = (appBacklog === 0);
    } else if (job.allowBacklog === true) {
      
      if (typeof job.maxBacklog === 'number') {
        if (appBacklog === null || isNaN(appBacklog)) {
          return res.status(400).json({ 
            success: false, 
            message: 'Backlog count is required for this application. Please provide your backlog count in the form.' 
          });
        }
        passesBacklog = (appBacklog <= job.maxBacklog);
      } else {
        passesBacklog = true;
      }
    }

    if (!passesCgpa || !passesBacklog) {
      const reasons = [];
      if (!passesCgpa) {
        reasons.push(`CGPA ${appCgpa} < required ${job.minCgpa}`);
      }
      if (!passesBacklog) {
        if (job.allowBacklog === false || job.allowBacklog === null || job.allowBacklog === undefined) {
          reasons.push(`Active backlogs ${appBacklog} not allowed (zero backlogs required)`);
        } else if (job.allowBacklog === true && typeof job.maxBacklog === 'number') {
          reasons.push(`Active backlogs ${appBacklog} exceeds maximum allowed ${job.maxBacklog}`);
        } else {
          reasons.push(`Active backlogs ${appBacklog} not allowed`);
        }
      }

      return res.status(400).json({
        success: false,
        message: 'You do not meet the eligibility criteria for this job',
        details: reasons.join('; ')
      });
    }

    let cvUrl = null;
    if (file) {
      const ext = path.extname(file.originalname).toLowerCase();
      const filePath = `cvs/${studentId}-${Date.now()}${ext}`; 

      const { error: uploadError } = await supabase.storage
        .from('Resume')              
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return res.status(500).json({ success: false, message: 'Error uploading CV' });
      }

      const { data: publicData } = supabase.storage
        .from('Resume')
        .getPublicUrl(filePath);

      cvUrl = publicData.publicUrl;

      await prisma.student.update({
        where: { id: studentId },
        data: { cvUrl },
      });
    }


    const application = await prisma.application.create({
      data: {
        studentId,
        jobId,
        skills: skills ? (Array.isArray(skills) ? skills.join(',') : String(skills)) : null,
        cgpa: cgpa ? parseFloat(cgpa) : null,
        backlog: backlog ? parseInt(backlog) : null,
        cvUrl,
      }
    });

    res.status(201).json({ success: true, message: 'Applied successfully', data: { application } });
  } catch (error) {
    console.error('Error applying to job:', error);
    res.status(500).json({ success: false, message: 'Server error applying to job' });
  }
});

router.post('/:jobId/shortlist', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) return res.status(404).json({ success: false, message: 'Job not found or access denied' });

    await prisma.job.update({ where: { id: jobId }, data: { status: 'CLOSED' } });

    const applications = await prisma.application.findMany({ where: { jobId }, include: { student: true } });

    let shortlisted = 0;
    let rejected = 0;

    for (const app of applications) {
      const student = app.student;

      const appCgpa = typeof app.cgpa === 'number' ? app.cgpa : (student?.cgpa ?? null);
      const appBacklog = typeof app.backlog === 'number' ? app.backlog : (student?.backlog ?? 0);

      let passesCgpa = true;
      if (job.includeCgpaInShortlisting !== false && typeof job.minCgpa === 'number') {
        passesCgpa = (typeof appCgpa === 'number') ? (appCgpa >= job.minCgpa) : false;
      }

      let passesBacklog = true;
      if (job.allowBacklog === false || job.allowBacklog === null || job.allowBacklog === undefined) {
        passesBacklog = (appBacklog === 0);
      } else if (job.allowBacklog === true) {
        if (typeof job.maxBacklog === 'number') {
          passesBacklog = (appBacklog <= job.maxBacklog);
        } else {
          passesBacklog = true;
        }
      }

      const newStatus = (passesCgpa && passesBacklog) ? 'SHORTLISTED' : 'REJECTED';

      
      let decisionReason = '';
      if (newStatus === 'SHORTLISTED') {
        const criteria = [];
        if (job.includeCgpaInShortlisting !== false && typeof job.minCgpa === 'number') {
          criteria.push('CGPA');
        }
        criteria.push('backlog');
        decisionReason = `Shortlisted — meets ${criteria.join(' and ')} requirements`;
      } else {
        const reasons = [];
        if (!passesCgpa && job.includeCgpaInShortlisting !== false) {
          reasons.push(`CGPA ${appCgpa === null ? 'N/A' : appCgpa} < required ${job.minCgpa}`);
        }
        if (!passesBacklog) {
          if (job.allowBacklog === false || job.allowBacklog === null || job.allowBacklog === undefined) {
            reasons.push(`Active backlogs ${appBacklog} not allowed`);
          } else if (job.allowBacklog === true && typeof job.maxBacklog === 'number') {
            reasons.push(`Active backlogs ${appBacklog} exceeds maximum allowed ${job.maxBacklog}`);
          } else {
            reasons.push(`Active backlogs ${appBacklog} not allowed`);
          }
        }
        decisionReason = `Rejected — ${reasons.join('; ')}`;
      }

      await prisma.application.update({ where: { id: app.id }, data: { status: newStatus, decisionReason } });

      
      try {
        await prisma.notification.create({
          data: {
            studentId: app.studentId,
            title: `Application ${newStatus}`,
            message: `Your application for ${job.title} has been ${newStatus.toLowerCase()}. ${decisionReason}`,
            decisionReason,
            jobId: jobId,
            applicationId: app.id
          }
        });
      } catch (nerr) {
        console.error('Failed to create notification:', nerr);
      }

      if (newStatus === 'SHORTLISTED') shortlisted++; else rejected++;
    }

    res.json({ success: true, message: 'Shortlisting complete', data: { shortlisted, rejected } });
  } catch (error) {
    console.error('Error shortlisting applications:', error);
    res.status(500).json({ success: false, message: 'Server error shortlisting applications' });
  }
});


router.get('/my-applications', authenticateToken, authorizeStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const applications = await prisma.application.findMany({
      where: { studentId },
      include: { job: { include: { company: true } } }
    });

    res.json({
      success: true,
      data: {
        applications: applications.map(app => ({
          ...app,
          cvBase64: undefined 
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching student applications:', error);
    res.status(500).json({ success: false, message: 'Server error fetching applications' });
  }
});


router.get('/cv/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);
    
  
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'CV file not found' });
    }

    
    const cvPath = `/uploads/cvs/${filename}`;
    const application = await prisma.application.findFirst({
      where: {
        OR: [
          { cvUrl: cvPath },
          { student: { cvUrl: cvPath } }
        ],
        OR: [
          { studentId: req.user.id }, 
          { job: { companyId: req.user.id } } 
        ]
      }
    });

    if (!application) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

  
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' :
                       ext === '.doc' ? 'application/msword' :
                       ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                       'application/octet-stream';
    
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename=${filename}`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving CV:', error);
    res.status(500).json({ success: false, message: 'Server error serving CV' });
  }
});

router.get('/:jobId/applicants', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) return res.status(404).json({ success: false, message: 'Job not found or access denied' });

    const applications = await prisma.application.findMany({ where: { jobId }, include: { student: true } });

    
    const result = applications.map(app => ({
      id: app.id,
      status: app.status,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      skills: app.skills,
      cgpa: app.cgpa,
      backlog: app.backlog,
      cvUrl: app.cvUrl || (app.student && app.student.cvUrl) || null,
      student: app.student ? {
        id: app.student.id,
        name: app.student.name,
        email: app.student.email,
        rollNumber: app.student.rollNumber,
        phone: app.student.phone,
        cgpa: app.student.cgpa,
        backlog: app.student.backlog,
      } : null,
    }));

    res.json({ success: true, data: { applications: result } });
  } catch (error) {
    console.error('Error fetching applicants:', error);
    res.status(500).json({ success: false, message: 'Server error fetching applicants' });
  }
});

export default router;
