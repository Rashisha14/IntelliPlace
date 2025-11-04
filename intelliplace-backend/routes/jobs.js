import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/cvs');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer setup for CV uploads with disk storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename with student ID and timestamp
    const uniqueSuffix = `${req.user.id}-${Date.now()}`;
    cb(null, `cv-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Allow only pdf, doc, docx
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Helper role checks
const authorizeCompany = (req, res, next) => {
  if (!req.user || req.user.userType !== 'company') return res.status(403).json({ success: false, message: 'Company access required' });
  next();
};

const authorizeStudent = (req, res, next) => {
  if (!req.user || req.user.userType !== 'student') return res.status(403).json({ success: false, message: 'Student access required' });
  next();
};

// Create a new job (company only)
router.post('/', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const { title, description, location, type, salary, requiredSkills, minCgpa, allowBacklog } = req.body;

    if (!title || !description || !type) return res.status(400).json({ success: false, message: 'Title, description and type are required' });

    const job = await prisma.job.create({
      data: {
        title,
        description,
        location: location || null,
        type,
        salary: salary || null,
        requiredSkills: requiredSkills ? (Array.isArray(requiredSkills) ? requiredSkills.join(',') : String(requiredSkills)) : null,
        minCgpa: minCgpa ? parseFloat(minCgpa) : null,
        allowBacklog: allowBacklog === 'true' || allowBacklog === true ? true : false,
        companyId: companyId
      }
    });

    res.status(201).json({ success: true, message: 'Job created', data: job });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ success: false, message: 'Server error creating job' });
  }
});

// List jobs (public) with simple filters
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

// Student apply to a job with optional CV upload
router.post('/:jobId/apply', authenticateToken, authorizeStudent, upload.single('cv'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const file = req.file;

    // Applicant-provided fields (optional)
    const { skills, cgpa, backlog } = req.body;

    // Verify job exists
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Disallow applications if job is not OPEN
    if (job.status !== 'OPEN') {
      return res.status(400).json({ success: false, message: 'Applications for this job are closed' });
    }

    // Check existing application
    const existing = await prisma.application.findFirst({ where: { studentId, jobId } });
    if (existing) return res.status(400).json({ success: false, message: 'Already applied to this job' });

    // If CV uploaded, save the file path
    let cvUrl = null;
    if (file) {
      cvUrl = `/uploads/cvs/${file.filename}`;
      // Update student profile with latest CV URL
      await prisma.student.update({
        where: { id: studentId },
        data: { cvUrl }
      });
    }

    // Create application with optional applicant details
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

// Company: shortlist applicants for a job based on job criteria and close applications
router.post('/:jobId/shortlist', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) return res.status(404).json({ success: false, message: 'Job not found or access denied' });

    // Close the job to stop new applications
    await prisma.job.update({ where: { id: jobId }, data: { status: 'CLOSED' } });

    // Fetch applications with student info
    const applications = await prisma.application.findMany({ where: { jobId }, include: { student: true } });

    let shortlisted = 0;
    let rejected = 0;

    for (const app of applications) {
      const student = app.student;

      // Determine CGPA to evaluate: application-level overrides profile
      const appCgpa = typeof app.cgpa === 'number' ? app.cgpa : (student?.cgpa ?? null);
      const appBacklog = typeof app.backlog === 'number' ? app.backlog : (student?.backlog ?? 0);

      let passesCgpa = true;
      if (typeof job.minCgpa === 'number') {
        passesCgpa = (typeof appCgpa === 'number') ? (appCgpa >= job.minCgpa) : false;
      }

      let passesBacklog = true;
      if (job.allowBacklog === false || job.allowBacklog === null || job.allowBacklog === undefined) {
        // If allowBacklog is falsy, require zero backlogs
        passesBacklog = (appBacklog === 0);
      }

      const newStatus = (passesCgpa && passesBacklog) ? 'SHORTLISTED' : 'REJECTED';

      await prisma.application.update({ where: { id: app.id }, data: { status: newStatus } });

      // Create notification for student
      try {
        await prisma.notification.create({
          data: {
            studentId: app.studentId,
            title: `Application ${newStatus}`,
            message: `Your application for ${job.title} has been ${newStatus.toLowerCase()}.`,
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

// Student: get my applications
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
          cvBase64: undefined // Don't send CV data back
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching student applications:', error);
    res.status(500).json({ success: false, message: 'Server error fetching applications' });
  }
});

// Company: list applicants for a job (include student details and cv)
// Serve CV files
router.get('/cv/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'CV file not found' });
    }

    // Security check - verify the user has access to this CV
    const cvPath = `/uploads/cvs/${filename}`;
    const application = await prisma.application.findFirst({
      where: {
        OR: [
          { cvUrl: cvPath },
          { student: { cvUrl: cvPath } }
        ],
        OR: [
          { studentId: req.user.id }, // Student can access their own CV
          { job: { companyId: req.user.id } } // Company can access CVs of their job applicants
        ]
      }
    });

    if (!application) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Set appropriate content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' :
                       ext === '.doc' ? 'application/msword' :
                       ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                       'application/octet-stream';
    
    // Set response headers
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

    // Map to include both application-level fields and student profile
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
