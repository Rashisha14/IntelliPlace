import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// Admin authorization middleware
const authorizeAdmin = (req, res, next) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// Get admin dashboard stats
router.get('/admin/stats', authorizeAdmin, async (req, res) => {
  try {
    const totalStudents = await prisma.student.count();
    const totalCompanies = await prisma.company.count();
    const totalJobs = await prisma.job.count();
    const totalApplications = await prisma.application.count();

    res.json({
      success: true,
      data: {
      },
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
});

// Get all students with pagination and search
router.get('/admin/students', authorizeAdmin, async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { rollNumber: { contains: search, mode: 'insensitive' } },
      ]
    } : {};

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          rollNumber: true,
          phone: true,
          createdAt: true,
          applications: {
            select: {
              id: true,
              status: true,
              createdAt: true,
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.student.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        students,
        pagination: {
          total,
          pages: Math.ceil(total / parseInt(limit)),
          page: parseInt(page),
          limit: parseInt(limit)
        }
      },
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, message: 'Server error fetching students' });
  }
});

// Get all companies with pagination and search
router.get('/admin/companies', authorizeAdmin, async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search ? {
      OR: [
        { companyName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
      ]
    } : {};

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        select: {
          id: true,
          companyName: true,
          email: true,
          industry: true,
          website: true,
          phone: true,
          createdAt: true,
          jobs: {
            select: {
              id: true,
              title: true,
              status: true,
              createdAt: true,
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.company.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        companies,
        pagination: {
          total,
          pages: Math.ceil(total / parseInt(limit)),
          page: parseInt(page),
          limit: parseInt(limit)
        }
      },
    });
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ success: false, message: 'Server error fetching companies' });
  }
});

// Get company dashboard stats
router.get('/company/stats/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    const jobsPosted = await prisma.job.count({
      where: { companyId: parseInt(companyId) },
    });

    const totalApplications = await prisma.application.count({
      where: { job: { companyId: parseInt(companyId) } },
    });

    const totalInterviews = await prisma.interview.count({
      where: { job: { companyId: parseInt(companyId) } },
    });

    const totalHired = await prisma.application.count({
      where: {
        job: { companyId: parseInt(companyId) },
        status: 'HIRED',
      },
    });

    res.json({
      success: true,
      data: {
        jobsPosted,
        totalApplications,
        totalInterviews,
        totalHired,
      },
    });
  } catch (error) {
    console.error('Error fetching company stats:', error);
    res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
});

// Get student dashboard stats
router.get('/student/stats/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const applicationsSent = await prisma.application.count({
      where: { studentId: parseInt(studentId) },
    });

    const interviews = await prisma.interview.count({
      where: { application: { studentId: parseInt(studentId) } },
    });

    const offers = await prisma.application.count({
      where: {
        studentId: parseInt(studentId),
        status: 'OFFERED',
      },
    });

    const notifications = await prisma.notification.count({
      where: { studentId: parseInt(studentId), read: false },
    });

    res.json({
      success: true,
      data: {
        applicationsSent,
        interviews,
        offers,
        notifications,
      },
    });
  } catch (error) {
    console.error('Error fetching student stats:', error);
    res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
});

export default router;