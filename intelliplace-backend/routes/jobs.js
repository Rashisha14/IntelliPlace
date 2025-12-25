import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { supabase } from '../lib/supabase.js';
import { createRequire } from 'module';
import axios from 'axios';

const require = createRequire(import.meta.url);

// Ensure DOMMatrix is defined for pdf-parse (pdfjs) which expects browser APIs.
// Try modern maintained polyfill `@thednp/dommatrix` first, fall back to `dommatrix` if needed.
try {
  try {
    const dommatrixPkg = require('@thednp/dommatrix');
    global.DOMMatrix = global.DOMMatrix || dommatrixPkg.DOMMatrix || dommatrixPkg.default || dommatrixPkg;
  } catch (e) {
    const { DOMMatrix } = require('dommatrix');
    global.DOMMatrix = global.DOMMatrix || DOMMatrix;
  }
} catch (err) {
  // If no polyfill is available, the require of pdf-parse will throw a helpful error.
}

// pdf-parse v2.x uses class-based API
const { PDFParse } = require('pdf-parse');


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory where uploaded CVs are stored (relative to repository): intelliplace-backend/uploads/cvs
const uploadsDir = path.join(__dirname, '..', 'uploads', 'cvs');

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
    
   
    let title, description, location, type, salary, deadline, requiredSkills, minCgpa, includeCgpaInShortlisting, allowBacklog, maxBacklog;
    
    if (req.file) {
  
      title = req.body.title;
      description = req.body.description;
      location = req.body.location || null;
      type = req.body.type;
      salary = req.body.salary || null;
      deadline = req.body.deadline || null;
      requiredSkills = req.body.requiredSkills;
      minCgpa = req.body.minCgpa;
      includeCgpaInShortlisting = req.body.includeCgpaInShortlisting;
      allowBacklog = req.body.allowBacklog;
      maxBacklog = req.body.maxBacklog;
    } else {
      
      ({ title, description, location, type, salary, deadline, requiredSkills, minCgpa, includeCgpaInShortlisting, allowBacklog, maxBacklog } = req.body);
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

    // Parse deadline if provided
    let deadlineDate = null;
    if (deadline) {
      deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid deadline date format' });
      }
      // Ensure deadline is in the future
      if (deadlineDate <= new Date()) {
        return res.status(400).json({ success: false, message: 'Deadline must be in the future' });
      }
    }

    const job = await prisma.job.create({
      data: {
        title,
        description,
        location: location || null,
        type,
        salary: salary || null,
        deadline: deadlineDate,
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

    // Check if deadline has passed
    if (job.deadline && new Date(job.deadline) < new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: `Application deadline has passed. The deadline was ${new Date(job.deadline).toLocaleString()}` 
      });
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

// Manual close job applications
router.post('/:jobId/close', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }

    if (job.status === 'CLOSED') {
      return res.status(400).json({ success: false, message: 'Job applications are already closed' });
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'CLOSED' }
    });

    res.json({ 
      success: true, 
      message: 'Job applications closed successfully. New applications are no longer accepted.' 
    });
  } catch (error) {
    console.error('Error closing job applications:', error);
    res.status(500).json({ success: false, message: 'Server error closing job applications' });
  }
});

// Create an aptitude test for a job
router.post('/:jobId/aptitude-test', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const { sections, cutoff, totalQuestions, questions } = req.body;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) return res.status(404).json({ success: false, message: 'Job not found or access denied' });

    const existing = await prisma.aptitudeTest.findUnique({ where: { jobId } });
    if (existing) return res.status(400).json({ success: false, message: 'Aptitude test already exists for this job' });

    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one section with question count is required' });
    }

    // basic validation for sections
    let expectedTotal = 0;
    for (const s of sections) {
      if (!s.name || typeof s.name !== 'string' || typeof s.questions !== 'number' || s.questions < 1) {
        return res.status(400).json({ success: false, message: 'Each section must have a valid name and a questions count >= 1' });
      }
      expectedTotal += s.questions;
    }

    // If questions provided, validate them
    if (questions) {
      if (!Array.isArray(questions)) {
        return res.status(400).json({ success: false, message: 'Questions must be an array' });
      }

      // Check total count
      if (questions.length !== expectedTotal) {
        return res.status(400).json({ success: false, message: `Total questions provided (${questions.length}) does not match sum of section question counts (${expectedTotal})` });
      }

      // Check per-section counts
      const countsBySection = {};
      for (let idx = 0; idx < sections.length; idx++) {
        countsBySection[sections[idx].name] = 0;
      }

      for (const q of questions) {
        if (!q.section || !q.questionText) return res.status(400).json({ success: false, message: 'Each question must have section and questionText' });
        if (!Array.isArray(q.options) || q.options.length !== 4) return res.status(400).json({ success: false, message: 'Each question must have exactly 4 options' });
        if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) return res.status(400).json({ success: false, message: 'correctIndex must be 0-3' });
        countsBySection[q.section] = (countsBySection[q.section] || 0) + 1;
      }

      for (const s of sections) {
        const got = countsBySection[s.name] || 0;
        if (got !== s.questions) {
          return res.status(400).json({ success: false, message: `Section ${s.name} expects ${s.questions} questions but got ${got}` });
        }
      }
    }

    // Create test and questions inside a transaction
    const createdTest = await prisma.aptitudeTest.create({
      data: {
        jobId,
        sections: sections,
        cutoff: cutoff ? parseInt(cutoff, 10) : null,
        totalQuestions: totalQuestions ? parseInt(totalQuestions, 10) : expectedTotal,
      }
    });

    if (questions && questions.length > 0) {
      const qdata = questions.map(q => ({
        testId: createdTest.id,
        section: q.section,
        questionText: q.questionText,
        options: q.options,
        correctIndex: q.correctIndex,
        marks: q.marks ? parseInt(q.marks, 10) : 1,
      }));

      await prisma.aptitudeQuestion.createMany({ data: qdata });
    }

    const testWithQuestions = await prisma.aptitudeTest.findUnique({ where: { id: createdTest.id }, include: { questions: true } });

    res.status(201).json({ success: true, message: 'Aptitude test created', data: testWithQuestions });
  } catch (error) {
    console.error('Error creating aptitude test:', error);
    res.status(500).json({ success: false, message: 'Server error creating aptitude test' });
  }
});

// Get aptitude test for a job
router.get('/:jobId/aptitude-test', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) return res.status(404).json({ success: false, message: 'Job not found or access denied' });

    const test = await prisma.aptitudeTest.findUnique({ where: { jobId }, include: { questions: true } });
    if (!test) return res.status(404).json({ success: false, message: 'No aptitude test found for this job' });

    res.json({ success: true, data: { test } });
  } catch (error) {
    console.error('Error fetching aptitude test:', error);
    res.status(500).json({ success: false, message: 'Server error fetching aptitude test' });
  }
});

// Start aptitude test for a job (only after applications are closed)
router.post('/:jobId/aptitude-test/start', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) return res.status(404).json({ success: false, message: 'Job not found or access denied' });

    const test = await prisma.aptitudeTest.findUnique({ where: { jobId } });
    if (!test) return res.status(404).json({ success: false, message: 'No aptitude test found for this job' });

    // Auto-close applications before starting the test
    if (job.status !== 'CLOSED') {
      await prisma.job.update({ where: { id: jobId }, data: { status: 'CLOSED' } });
    }

    if (test.status === 'STARTED') return res.status(400).json({ success: false, message: 'Aptitude test has already been started' });

    const updated = await prisma.aptitudeTest.update({ where: { id: test.id }, data: { status: 'STARTED', startedAt: new Date() } });

    // Refresh job to pick up updated status
    const jobUpdated = await prisma.job.findUnique({ where: { id: jobId } });

    // Notify shortlisted applicants
    const shortlistedApps = await prisma.application.findMany({ where: { jobId, status: 'SHORTLISTED' }, include: { student: true } });
    let invited = 0;
    for (const app of shortlistedApps) {
      try {
        await prisma.notification.create({
          data: {
            studentId: app.studentId,
            title: `Aptitude Test: ${job.title}`,
            message: `You're invited to take the aptitude test for ${job.title}. Log in to your dashboard to start the test.`,
            jobId: jobId,
            applicationId: app.id,
          }
        });
        invited++;
      } catch (err) {
        console.error('Failed to create notification for application', app.id, err);
      }
    }

    res.json({ success: true, message: 'Aptitude test started', data: { test: updated, invited, job: jobUpdated } });
  } catch (error) {
    console.error('Error starting aptitude test:', error);
    res.status(500).json({ success: false, message: 'Server error starting aptitude test' });
  }
});

// Company: manage questions for a job's aptitude test
router.post('/:jobId/aptitude-test/questions', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const { section, questionText, options, correctIndex, marks } = req.body;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) return res.status(404).json({ success: false, message: 'Job not found or access denied' });

    const test = await prisma.aptitudeTest.findUnique({ where: { jobId } });
    if (!test) return res.status(404).json({ success: false, message: 'No aptitude test found for this job' });

    if (!section || !questionText) return res.status(400).json({ success: false, message: 'Section and question text are required' });
    if (!Array.isArray(options) || options.length !== 4) return res.status(400).json({ success: false, message: 'Exactly 4 options are required' });
    if (typeof correctIndex !== 'number' || correctIndex < 0 || correctIndex > 3) return res.status(400).json({ success: false, message: 'correctIndex must be 0-3' });

    const q = await prisma.aptitudeQuestion.create({
      data: {
        testId: test.id,
        section,
        questionText,
        options,
        correctIndex,
        marks: marks ? parseInt(marks, 10) : 1,
      }
    });

    res.status(201).json({ success: true, message: 'Question created', data: q });
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ success: false, message: 'Server error creating question' });
  }
});

router.get('/:jobId/aptitude-test/questions', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) return res.status(404).json({ success: false, message: 'Job not found or access denied' });

    const test = await prisma.aptitudeTest.findUnique({ where: { jobId } });
    if (!test) return res.status(404).json({ success: false, message: 'No aptitude test found for this job' });

    const questions = await prisma.aptitudeQuestion.findMany({ where: { testId: test.id }, orderBy: { createdAt: 'asc' } });

    res.json({ success: true, data: { questions } });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ success: false, message: 'Server error fetching questions' });
  }
});

router.delete('/:jobId/aptitude-test/questions/:qId', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const qId = parseInt(req.params.qId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) return res.status(404).json({ success: false, message: 'Job not found or access denied' });

    const test = await prisma.aptitudeTest.findUnique({ where: { jobId } });
    if (!test) return res.status(404).json({ success: false, message: 'No aptitude test found for this job' });

    const q = await prisma.aptitudeQuestion.findUnique({ where: { id: qId } });
    if (!q || q.testId !== test.id) return res.status(404).json({ success: false, message: 'Question not found' });

    await prisma.aptitudeQuestion.delete({ where: { id: qId } });
    res.json({ success: true, message: 'Question deleted' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ success: false, message: 'Server error deleting question' });
  }
});

// Student: fetch public questions (only allowed once test is STARTED)
router.get('/:jobId/aptitude-test/questions/public', authenticateToken, authorizeStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const test = await prisma.aptitudeTest.findUnique({ where: { jobId } });
    if (!test) return res.status(404).json({ success: false, message: 'No aptitude test found for this job' });
    if (test.status !== 'STARTED') return res.status(400).json({ success: false, message: 'Test has not started yet' });

    // Ensure the student is shortlisted for this job
    const application = await prisma.application.findFirst({ where: { jobId, studentId } });
    if (!application || application.status !== 'SHORTLISTED') {
      return res.status(403).json({ success: false, message: 'You are not eligible to take this test' });
    }

    const questions = await prisma.aptitudeQuestion.findMany({ where: { testId: test.id }, orderBy: { createdAt: 'asc' } });

    // Strip correctIndex when sending to students
    const publicQuestions = questions.map(q => ({ id: q.id, section: q.section, questionText: q.questionText, options: q.options, marks: q.marks }));

    res.json({ success: true, data: { questions: publicQuestions } });
  } catch (error) {
    console.error('Error fetching public questions:', error);
    res.status(500).json({ success: false, message: 'Server error fetching questions' });
  }
});

// Student: submit aptitude test answers
router.post('/:jobId/aptitude-test/submit', authenticateToken, authorizeStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const { answers } = req.body; // [{ questionId, selectedIndex }]

    if (!Array.isArray(answers)) return res.status(400).json({ success: false, message: 'Answers array required' });

    const test = await prisma.aptitudeTest.findUnique({ where: { jobId } });
    if (!test) return res.status(404).json({ success: false, message: 'No aptitude test found for this job' });
    if (test.status !== 'STARTED') return res.status(400).json({ success: false, message: 'Test is not currently accepting submissions' });

    const application = await prisma.application.findFirst({ where: { jobId, studentId } });
    if (!application || application.status !== 'SHORTLISTED') return res.status(403).json({ success: false, message: 'You are not eligible to take this test' });

    // Prevent multiple submissions
    const existing = await prisma.aptitudeSubmission.findFirst({ where: { testId: test.id, studentId } });
    if (existing) return res.status(400).json({ success: false, message: 'You have already submitted the test' });

    const questions = await prisma.aptitudeQuestion.findMany({ where: { testId: test.id } });
    const qMap = {};
    let maxScore = 0;
    questions.forEach(q => { qMap[q.id] = q; maxScore += q.marks || 1; });

    let score = 0;
    for (const ans of answers) {
      if (!ans || typeof ans.questionId !== 'number' || typeof ans.selectedIndex !== 'number') continue;
      const q = qMap[ans.questionId];
      if (!q) continue;
      if (ans.selectedIndex === q.correctIndex) score += q.marks || 1;
    }

    const passed = typeof test.cutoff === 'number' ? (score >= test.cutoff) : true;

    const submission = await prisma.aptitudeSubmission.create({
      data: {
        testId: test.id,
        studentId,
        answers: answers,
        score,
        maxScore,
        passed
      }
    });

    // Update application status & notify student if failed
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!passed) {
      const decisionReason = `Failed aptitude test (score ${score}/${maxScore})`;
      await prisma.application.update({ where: { id: application.id }, data: { status: 'REJECTED', decisionReason } });

      await prisma.notification.create({
        data: {
          studentId,
          title: `Aptitude Test Result: ${job?.title || ''}`,
          message: `You scored ${score}/${maxScore} on the aptitude test. You have not met the cutoff and your application has been rejected.`,
          jobId,
          applicationId: application.id,
          decisionReason
        }
      });
    } else {
      const decisionReason = `Passed aptitude test (score ${score}/${maxScore})`;
      await prisma.notification.create({
        data: {
          studentId,
          title: `Aptitude Test Result: ${job?.title || ''}`,
          message: `You scored ${score}/${maxScore} on the aptitude test. You have passed and remain shortlisted.`,
          jobId,
          applicationId: application.id,
          decisionReason
        }
      });
    }

    res.json({ success: true, data: { submissionId: submission.id, score, maxScore, passed } });
  } catch (error) {
    console.error('Error submitting aptitude test:', error);
    res.status(500).json({ success: false, message: 'Server error submitting test' });
  }
});

// Company: view aptitude submissions for this job
router.get('/:jobId/aptitude-test/submissions', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) return res.status(404).json({ success: false, message: 'Job not found or access denied' });

    const test = await prisma.aptitudeTest.findUnique({ where: { jobId } });
    if (!test) return res.status(404).json({ success: false, message: 'No aptitude test found for this job' });

    const subs = await prisma.aptitudeSubmission.findMany({ where: { testId: test.id }, include: { student: true } });

    res.json({ success: true, data: { submissions: subs.map(s => ({ id: s.id, student: { id: s.student.id, name: s.student.name, email: s.student.email }, score: s.score, maxScore: s.maxScore, passed: s.passed, createdAt: s.createdAt })) } });
  } catch (error) {
    console.error('Error fetching aptitude submissions:', error);
    res.status(500).json({ success: false, message: 'Server error fetching submissions' });
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

    // If it's available on disk, serve directly
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.pdf' ? 'application/pdf' :
                         ext === '.doc' ? 'application/msword' :
                         ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                         'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename=${filename}`);
      return res.sendFile(filePath);
    }

    // Not present locally — try to find an application that references this filename (either local or remote URL)
    const application = await prisma.application.findFirst({
      where: {
        AND: [
          {
            OR: [
              { cvUrl: `/uploads/cvs/${filename}` },
              { cvUrl: { endsWith: filename } },
              { student: { cvUrl: { endsWith: filename } } },
            ],
          },
          {
            OR: [
              { studentId: req.user.id },
              { job: { companyId: req.user.id } },
            ],
          },
        ],
      },
      include: { student: true },
    });

    if (!application) {
      return res.status(404).json({ success: false, message: 'CV not found or access denied' });
    }

    const actualUrl = application.cvUrl || application.student?.cvUrl;
    if (!actualUrl || !actualUrl.startsWith('http')) {
      return res.status(404).json({ success: false, message: 'CV file not found' });
    }

    // Proxy the remote file stream to the client so the frontend can render it as if it were local
    const response = await axios.get(actualUrl, { responseType: 'stream', timeout: 30000 });
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename=${filename}`);
    response.data.pipe(res);
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

async function downloadCV(cvUrl) {
  try {
    if (!cvUrl) {
      console.log('     [ATS] No CV URL provided');
      return null;
    }
    
    console.log(`     [ATS] Step 1: Downloading CV from: ${cvUrl.substring(0, 100)}...`);
    
    let buffer = null;
    
    // Check if it's a Supabase URL and extract the file path
    if (cvUrl.includes('supabase.co') || cvUrl.includes('storage.googleapis.com')) {
      console.log(`     [ATS] Detected Supabase/storage URL`);
      
      // Try to extract file path from Supabase URL
      // Supabase URLs look like: https://[project].supabase.co/storage/v1/object/public/Resume/cvs/123-123.pdf
      const urlMatch = cvUrl.match(/\/public\/([^?]+)/);
      if (urlMatch) {
        const filePath = urlMatch[1];
        console.log(`     [ATS] Extracted file path: ${filePath}`);
        
        // Extract bucket name (usually "Resume" based on the code)
        const bucketMatch = filePath.match(/^([^/]+)\/(.+)$/);
        if (bucketMatch) {
          const bucketName = bucketMatch[1];
          const filePathInBucket = bucketMatch[2];
          
          console.log(`     [ATS] Attempting Supabase SDK download from bucket: "${bucketName}", file: "${filePathInBucket}"`);
          
          try {
            const { data: fileData, error: downloadError } = await supabase.storage
              .from(bucketName)
              .download(filePathInBucket);
            
            if (downloadError) {
              console.error(`     [ATS] Supabase SDK download error: ${downloadError.message}`);
              console.error(`     [ATS] Error code: ${downloadError.statusCode || 'N/A'}`);
              
              // Try with just "Resume" bucket as fallback
              if (bucketName !== 'Resume') {
                console.log(`     [ATS] Trying with "Resume" bucket as fallback...`);
                const { data: fallbackData, error: fallbackError } = await supabase.storage
                  .from('Resume')
                  .download(filePathInBucket);
                
                if (!fallbackError && fallbackData) {
                  const arrayBuffer = await fallbackData.arrayBuffer();
                  buffer = Buffer.from(arrayBuffer);
                  console.log(`     [ATS] Downloaded using "Resume" bucket fallback (${buffer.length} bytes)`);
                } else {
                  throw downloadError; // Use original error
                }
              } else {
                throw downloadError;
              }
            } else {
              // Convert Blob to Buffer
              const arrayBuffer = await fileData.arrayBuffer();
              buffer = Buffer.from(arrayBuffer);
              console.log(`     [ATS] Downloaded from Supabase SDK (${buffer.length} bytes)`);
            }
          } catch (supabaseError) {
            // Fallback to HTTP request
            console.log(`     [ATS] Supabase SDK failed, falling back to HTTP download...`);
            try {
              const response = await axios.get(cvUrl, { 
                responseType: 'arraybuffer',
                timeout: 30000,
                maxRedirects: 5
              });
              buffer = Buffer.from(response.data);
              console.log(`     [ATS] HTTP fallback successful (${buffer.length} bytes)`);
            } catch (httpError) {
              console.error(`     [ATS] HTTP fallback also failed: ${httpError.message}`);
              if (httpError.response) {
                console.error(`     [ATS] HTTP Status: ${httpError.response.status}`);
              }
              throw supabaseError; // Throw original Supabase error
            }
          }
        } else {
          // Could not parse path, try HTTP
          console.log(`      [ATS] Could not parse bucket/file from path: ${filePath}`);
          console.log(`     [ATS] Attempting HTTP download...`);
          try {
            const response = await axios.get(cvUrl, { 
              responseType: 'arraybuffer',
              timeout: 30000,
              maxRedirects: 5
            });
            buffer = Buffer.from(response.data);
            console.log(`     [ATS] HTTP download successful (${buffer.length} bytes)`);
          } catch (httpError) {
            console.error(`     [ATS] HTTP download failed: ${httpError.message}`);
            throw httpError;
          }
        }
      } else {
        // Not a standard Supabase URL pattern, try HTTP
        console.log(`      [ATS] URL doesn't match Supabase pattern: ${cvUrl.substring(0, 100)}...`);
        console.log(`     [ATS] Attempting HTTP download...`);
        try {
          const response = await axios.get(cvUrl, { 
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5
          });
          buffer = Buffer.from(response.data);
          console.log(`     [ATS] HTTP download successful (${buffer.length} bytes)`);
        } catch (httpError) {
          console.error(`     [ATS] HTTP download failed: ${httpError.message}`);
          throw httpError;
        }
      }
    } else {
      // Regular HTTP URL
      console.log(`     [ATS] Using HTTP download for non-Supabase URL...`);
      try {
        const response = await axios.get(cvUrl, { 
          responseType: 'arraybuffer',
          timeout: 30000,
          maxRedirects: 5,
          validateStatus: function (status) {
            return status >= 200 && status < 300;
          }
        });
        buffer = Buffer.from(response.data);
        console.log(`     [ATS] HTTP download successful (${buffer.length} bytes)`);
      } catch (httpError) {
        console.error(`     [ATS] HTTP download failed: ${httpError.message}`);
        if (httpError.response) {
          console.error(`     [ATS] HTTP Status: ${httpError.response.status}`);
          console.error(`     [ATS] Response data: ${JSON.stringify(httpError.response.data).substring(0, 200)}`);
        }
        throw httpError;
      }
    }
    
    if (!buffer || buffer.length === 0) {
      console.log('     [ATS] CV download returned empty data');
      return null;
    }
    
    console.log(`     [ATS] CV downloaded successfully (${buffer.length} bytes)`);
    return buffer;
    
  } catch (error) {
    if (error.response) {
      console.error(`     [ATS] HTTP Error ${error.response.status}: ${error.response.statusText}`);
      console.error(`     [ATS] URL: ${cvUrl}`);
    } else if (error.request) {
      console.error(`     [ATS] Network Error: Could not reach CV URL`);
      console.error(`     [ATS] URL: ${cvUrl}`);
    } else {
      console.error(`     [ATS] Download Error: ${error.message}`);
      if (error.stack) {
        console.error(`     [ATS] Stack: ${error.stack.substring(0, 500)}`);
      }
    }
    return null;
  }
}

async function extractTextFromCV(cvUrl) {
  try {
    console.log(`     [ATS] Step 2: Extracting text from CV...`);
    
    // First, download the CV
    const buffer = await downloadCV(cvUrl);
    
    if (!buffer) {
      console.log('     [ATS] Failed to download CV, cannot extract text');
      return null;
    }
    
    // Check file format
    if (!cvUrl.toLowerCase().endsWith('.pdf')) {
      console.log(`     [ATS] CV format not supported (not PDF): ${cvUrl.substring(cvUrl.lastIndexOf('.'))}`);
      return null;
    }
    
    console.log(`     [ATS] Extracting text from PDF (${buffer.length} bytes)...`);
  
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    const textLength = data.text ? data.text.trim().length : 0;
    
    if (textLength < 50) {
      console.log(`      [ATS] Extracted text is too short (${textLength} characters, minimum 50 required)`);
      return null;
    }
    
    console.log(`     [ATS] Successfully extracted ${textLength} characters from PDF`);
    return data.text;
    
  } catch (error) {
    console.error(`     [ATS] Text extraction error: ${error.message}`);
    if (error.stack) {
      console.error(`     [ATS] Stack: ${error.stack.substring(0, 500)}`);
    }
    return null;
  }
}

async function extractTextFromJobDescriptionPDF(jobDescriptionFileUrl) {
  try {
    if (!jobDescriptionFileUrl) {
      console.log(`   [ATS] No job description PDF URL provided`);
      return null;
    }
    
    console.log(`   [ATS] Extracting text from job description PDF...`);
    console.log(`   [ATS] Job description PDF URL: ${jobDescriptionFileUrl}`);
    
    // Download the job description PDF
    let buffer = null;
    
    // Check if it's a Supabase URL
    if (jobDescriptionFileUrl.includes('supabase.co') || jobDescriptionFileUrl.includes('supabase')) {
      try {
        // Try to extract bucket and file path from URL
        const urlMatch = jobDescriptionFileUrl.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)/);
        if (urlMatch) {
          const bucket = urlMatch[1];
          const filePath = urlMatch[2];
          console.log(`   [ATS] Extracted bucket: ${bucket}, file: ${filePath}`);
          
          const { data, error } = await supabase.storage.from(bucket).download(filePath);
          if (error) {
            console.log(`   [ATS] Supabase SDK download failed: ${error.message}, trying HTTP...`);
            throw error;
          }
          buffer = Buffer.from(await data.arrayBuffer());
          console.log(`   [ATS] Supabase SDK download successful (${buffer.length} bytes)`);
        } else {
          // Try HTTP fallback
          console.log(`   [ATS] Could not parse Supabase URL, trying HTTP...`);
          const response = await axios.get(jobDescriptionFileUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5
          });
          buffer = Buffer.from(response.data);
          console.log(`   [ATS] HTTP download successful (${buffer.length} bytes)`);
        }
      } catch (supabaseError) {
        // Fallback to HTTP
        console.log(`   [ATS] Supabase download failed, trying HTTP fallback...`);
        try {
          const response = await axios.get(jobDescriptionFileUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5
          });
          buffer = Buffer.from(response.data);
          console.log(`   [ATS] HTTP fallback successful (${buffer.length} bytes)`);
        } catch (httpError) {
          console.error(`   [ATS] HTTP download also failed: ${httpError.message}`);
          return null;
        }
      }
    } else {
      // Regular HTTP URL
      try {
        const response = await axios.get(jobDescriptionFileUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
          maxRedirects: 5
        });
        buffer = Buffer.from(response.data);
        console.log(`   [ATS] HTTP download successful (${buffer.length} bytes)`);
      } catch (httpError) {
        console.error(`   [ATS] HTTP download failed: ${httpError.message}`);
        return null;
      }
    }
    
    if (!buffer || buffer.length === 0) {
      console.log(`   [ATS] Job description PDF download returned empty data`);
      return null;
    }
    
    // Check if it's a PDF
    if (!jobDescriptionFileUrl.toLowerCase().endsWith('.pdf')) {
      console.log(`   [ATS] Job description file is not a PDF, skipping text extraction`);
      return null;
    }
    
    // Extract text from PDF
    console.log(`   [ATS] Extracting text from job description PDF (${buffer.length} bytes)...`);
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    const textLength = data.text ? data.text.trim().length : 0;
    
    if (textLength < 10) {
      console.log(`   [ATS] Extracted text is too short (${textLength} characters)`);
      return null;
    }
    
    console.log(`   [ATS] Successfully extracted ${textLength} characters from job description PDF`);
    return data.text;
    
  } catch (error) {
    console.error(`   [ATS] Job description PDF text extraction error: ${error.message}`);
    if (error.stack) {
      console.error(`   [ATS] Stack: ${error.stack.substring(0, 500)}`);
    }
    return null;
  }
}

router.post('/:jobId/shortlist-ats', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    console.log(`\n [ATS] Starting AI shortlisting for job ${jobId}`);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }

    await prisma.job.update({ where: { id: jobId }, data: { status: 'CLOSED' } });

    const applications = await prisma.application.findMany({ 
      where: { jobId }, 
      include: { student: true } 
    });

    if (applications.length === 0) {
      return res.status(400).json({ success: false, message: 'No applications found for this job' });
    }

    console.log(` [ATS] Found ${applications.length} applications to process`);

    const ATS_SERVICE_URL = process.env.ATS_SERVICE_URL || 'http://localhost:8000';
    console.log(` [ATS] Connecting to ATS service at ${ATS_SERVICE_URL}`);
    
    const requiredSkills = job.requiredSkills 
      ? (typeof job.requiredSkills === 'string' 
          ? job.requiredSkills.split(',').map(s => s.trim()).filter(s => s)
          : job.requiredSkills)
      : [];

    // Extract text from job description PDF if available
    let jobDescriptionPdfText = null;
    if (job.jobDescriptionFileUrl) {
      console.log(` [ATS] Job description PDF found, extracting text...`);
      jobDescriptionPdfText = await extractTextFromJobDescriptionPDF(job.jobDescriptionFileUrl);
      if (jobDescriptionPdfText) {
        console.log(` [ATS] Successfully extracted ${jobDescriptionPdfText.length} characters from job description PDF`);
      } else {
        console.log(` [ATS] Could not extract text from job description PDF, continuing with text description only`);
      }
    } else {
      console.log(` [ATS] No job description PDF found, using text description only`);
    }

    let processed = 0;
    let shortlisted = 0;
    let review = 0;
    let rejected = 0;
    const errors = [];

    for (let i = 0; i < applications.length; i++) {
      const app = applications[i];
      const studentName = app.student?.name || 'Unknown';
      console.log(`\n [ATS] Processing application ${i + 1}/${applications.length}: ${studentName}`);
      try {
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

        if (!passesCgpa || !passesBacklog) {
          console.log(`   [ATS] ${studentName}: Rejected - Does not meet eligibility criteria`);
          await prisma.application.update({
            where: { id: app.id },
            data: { 
              status: 'REJECTED',
              decisionReason: 'Does not meet eligibility criteria (CGPA/Backlog)'
            }
          });
          rejected++;
          continue;
        }

        const cvUrl = app.cvUrl || student?.cvUrl;
        if (!cvUrl) {
          console.log(`    [ATS] ${studentName}: No CV URL found (app.cvUrl: ${app.cvUrl}, student.cvUrl: ${student?.cvUrl})`);
          await prisma.application.update({
            where: { id: app.id },
            data: { 
              status: 'REVIEW',
              decisionReason: 'No CV available for AI evaluation'
            }
          });
          review++;
          continue;
        }

        console.log(`   [ATS] ${studentName}: Processing CV from URL...`);
        console.log(`   [ATS] ${studentName}: Full CV URL: ${cvUrl}`);
        const resumeText = await extractTextFromCV(cvUrl);
        if (!resumeText || resumeText.trim().length < 50) {
          const reason = !resumeText 
            ? 'CV text extraction failed (could not download or parse CV)' 
            : `CV text extraction returned insufficient content (${resumeText.trim().length} characters, minimum 50 required)`;
          console.log(`    [ATS] ${studentName}: ${reason}`);
          await prisma.application.update({
            where: { id: app.id },
            data: { 
              status: 'REVIEW',
              decisionReason: reason
            }
          });
          review++;
          continue;
        }
        console.log(`   [ATS] ${studentName}: Successfully extracted ${resumeText.length} characters from CV`);

        console.log(`   [ATS] ${studentName}: Sending to AI service for evaluation...`);
        const atsRequest = {
          resume_text: resumeText,
          job_title: job.title || 'Software Engineer', // Use job title for role matching
          job_description: job.description || '',
          job_description_pdf_text: jobDescriptionPdfText || null, // Include PDF text if available
          required_skills: requiredSkills,
          min_experience_years: 0,
          education_requirement: null
        };

        const atsResponse = await axios.post(
          `${ATS_SERVICE_URL}/evaluate-resume`,
          atsRequest,
          { timeout: 30000 }
        );

        const atsResult = atsResponse.data;
        const score = (atsResult.final_score * 100).toFixed(1);
        let newStatus = atsResult.decision;
        let decisionReason = `ATS Score: ${score}% - ${atsResult.decision}. ${atsResult.explanation.split('\n')[0]}`;

        console.log(`   [ATS] ${studentName}: Score ${score}% - Decision: ${newStatus}`);

        if (newStatus === 'SHORTLISTED') {
          shortlisted++;
        } else if (newStatus === 'REVIEW') {
          review++;
        } else {
          rejected++;
        }

        await prisma.application.update({
          where: { id: app.id },
          data: { 
            status: newStatus,
            decisionReason: decisionReason.substring(0, 500)
          }
        });

        try {
          await prisma.notification.create({
            data: {
              studentId: app.studentId,
              title: `Application ${newStatus}`,
              message: `Your application for ${job.title} has been evaluated using AI resume analysis. Status: ${newStatus}. ${decisionReason.substring(0, 200)}`,
              applicationId: app.id,
              jobId: jobId
            }
          });
        } catch (notifError) {
          console.error('Error creating notification:', notifError);
        }

        processed++;
        console.log(`   [ATS] ${studentName}: Completed successfully`);
      } catch (error) {
        const studentName = app.student?.name || 'Unknown';
        console.error(`   [ATS] ${studentName}: Error -`, error.message);
        errors.push(`Application ${app.id}: ${error.message}`);
        
        await prisma.application.update({
          where: { id: app.id },
          data: { 
            status: 'REVIEW',
            decisionReason: 'Error during AI evaluation - requires manual review'
          }
        });
        review++;
      }
    }

    console.log(`\n [ATS] Shortlisting complete!`);
    console.log(`    Results: ${processed} processed, ${shortlisted} shortlisted, ${review} review, ${rejected} rejected`);
    if (processed === 0 && review > 0) {
      console.log(`     WARNING: No applications were processed by AI!`);
      console.log(`    This usually means:`);
      console.log(`      - CVs are not available (students didn't upload CVs)`);
      console.log(`      - CV download failed (check Supabase bucket permissions)`);
      console.log(`      - CV format not supported (only PDFs are supported)`);
      console.log(`      - CV text extraction failed`);
      console.log(`    Check the logs above for each application to see the specific reason.`);
    }
    if (errors.length > 0) {
      console.log(`     Errors encountered: ${errors.length}`);
      errors.forEach((err, idx) => console.log(`      ${idx + 1}. ${err}`));
    }

    res.json({
      success: true,
      message: `ATS shortlisting complete. Processed: ${processed}, Shortlisted: ${shortlisted}, Review: ${review}, Rejected: ${rejected}`,
      data: {
        processed,
        shortlisted,
        review,
        rejected,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error(' [ATS] Fatal error in ATS shortlisting:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during ATS shortlisting',
      error: error.message 
    });
  }
});

export default router;
