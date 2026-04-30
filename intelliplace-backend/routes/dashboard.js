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
        totalStudents,
        totalCompanies,
        totalJobs,
        totalApplications,
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
          cgpa: true,
          backlog: true,
          createdAt: true,
          applications: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              job: {
                select: {
                  title: true,
                  company: {
                    select: {
                      companyName: true,
                    },
                  },
                },
              },
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
              _count: {
                select: { applications: true }
              }
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

    // Test database connection first
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (dbError) {
      console.error('Database connection error:', dbError);
      if (dbError.code === 'P1001') {
        return res.status(503).json({
          success: false,
          message: 'Database connection failed. Please check:',
          error: {
            code: dbError.code,
            details: [
              '1. Verify your DATABASE_URL in .env file',
              '2. Check if Neon database is active (it may be paused)',
              '3. Visit Neon Console to wake up the database if paused',
              '4. Verify network connectivity',
              '5. Check if database credentials are correct'
            ],
            host: dbError.meta?.database_host || 'unknown'
          }
        });
      }
      throw dbError;
    }

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
    
    // Provide more specific error messages
    if (error.code === 'P1001') {
      return res.status(503).json({
        success: false,
        message: 'Cannot connect to database server',
        error: {
          code: error.code,
          message: 'The database server is unreachable. This usually means:',
          troubleshooting: [
            'Neon databases pause after inactivity - check Neon Console',
            'Verify DATABASE_URL in .env file is correct',
            'Check network connectivity',
            'Ensure database credentials are valid'
          ]
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error fetching stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

// Get analytics for admin dashboard - jobs by status
router.get('/admin/analytics/jobs-by-status', authorizeAdmin, async (req, res) => {
  try {
    const jobsByStatus = await prisma.job.groupBy({
      by: ['status'],
      _count: true,
    });

    const formatted = jobsByStatus.map(item => ({
      status: item.status || 'UNKNOWN',
      count: item._count
    }));

    res.json({
      success: true,
      data: { jobsByStatus: formatted }
    });
  } catch (error) {
    console.error('Error fetching jobs by status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get analytics for admin dashboard - applications by status
router.get('/admin/analytics/applications-by-status', authorizeAdmin, async (req, res) => {
  try {
    const appsByStatus = await prisma.application.groupBy({
      by: ['status'],
      _count: true,
    });

    const formatted = appsByStatus.map(item => ({
      status: item.status || 'UNKNOWN',
      count: item._count
    }));

    res.json({
      success: true,
      data: { applicationsByStatus: formatted }
    });
  } catch (error) {
    console.error('Error fetching applications by status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get analytics for admin dashboard - companies by industry
router.get('/admin/analytics/companies-by-industry', authorizeAdmin, async (req, res) => {
  try {
    const companiesByIndustry = await prisma.company.groupBy({
      by: ['industry'],
      _count: true,
    });

    const formatted = companiesByIndustry
      .filter(item => item.industry !== null)
      .map(item => ({
        industry: item.industry || 'Not Specified',
        count: item._count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 industries

    res.json({
      success: true,
      data: { companiesByIndustry: formatted }
    });
  } catch (error) {
    console.error('Error fetching companies by industry:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get analytics for admin dashboard - students statistics
router.get('/admin/analytics/students-stats', authorizeAdmin, async (req, res) => {
  try {
    const studentsWithApplications = await prisma.student.findMany({
      select: {
        id: true,
        _count: {
          select: {
            applications: true
          }
        }
      }
    });

    const appCounts = studentsWithApplications.map(s => s._count.applications);
    
    const stats = {
      totalStudents: studentsWithApplications.length,
      avgApplicationsPerStudent: appCounts.length > 0 
        ? (appCounts.reduce((a, b) => a + b, 0) / appCounts.length).toFixed(2)
        : 0,
      studentsWith0Apps: appCounts.filter(c => c === 0).length,
      studentsWith1to5Apps: appCounts.filter(c => c > 0 && c <= 5).length,
      studentsWith5plusApps: appCounts.filter(c => c > 5).length
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching students stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }  
});

export default router;