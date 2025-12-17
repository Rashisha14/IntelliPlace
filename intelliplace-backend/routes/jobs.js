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
// pdf-parse v2.x uses class-based API
const { PDFParse } = require('pdf-parse');


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
          job_description: job.description,
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
