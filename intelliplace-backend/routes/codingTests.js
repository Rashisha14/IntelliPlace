import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { executeWithTestCases, JUDGE0_LANGUAGES } from '../lib/judge0.js';

const router = express.Router();

const authorizeCompany = (req, res, next) => {
  if (!req.user || req.user.userType !== 'company') {
    return res.status(403).json({ success: false, message: 'Company access required' });
  }
  next();
};

const authorizeStudent = (req, res, next) => {
  if (!req.user || req.user.userType !== 'student') {
    return res.status(403).json({ success: false, message: 'Student access required' });
  }
  next();
};

// Create coding test for a job (Company)
router.post('/:jobId/coding-test', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const { title, description, allowedLanguages, timeLimit, cutoff, questions } = req.body;

    // Validate job ownership
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }

    // Check if coding test already exists - if so, delete it first to allow recreation
    const existingTest = await prisma.codingTest.findUnique({ where: { jobId } });
    if (existingTest) {
      await prisma.codingQuestion.deleteMany({ where: { testId: existingTest.id } });
      await prisma.codingTest.delete({ where: { id: existingTest.id } });
    }

    // Validate required fields
    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Title and at least one question are required' });
    }

    // Validate allowed languages
    const validLanguages = allowedLanguages && Array.isArray(allowedLanguages) 
      ? allowedLanguages 
      : Object.values(JUDGE0_LANGUAGES);
    
    // Validate questions
    for (const q of questions) {
      if (!q.title || !q.description || !q.testCases || !q.expectedOutputs) {
        return res.status(400).json({ 
          success: false, 
          message: 'Each question must have title, description, testCases, and expectedOutputs' 
        });
      }
      
      if (!Array.isArray(q.testCases) || !Array.isArray(q.expectedOutputs)) {
        return res.status(400).json({ 
          success: false, 
          message: 'testCases and expectedOutputs must be arrays' 
        });
      }
      
      if (q.testCases.length !== q.expectedOutputs.length) {
        return res.status(400).json({ 
          success: false, 
          message: 'Number of test cases must match number of expected outputs' 
        });
      }
    }

    // Create coding test with questions
    const codingTest = await prisma.codingTest.create({
      data: {
        jobId,
        title,
        description: description || null,
        allowedLanguages: JSON.stringify(validLanguages),
        timeLimit: timeLimit || 60,
        cutoff: cutoff || null,
        questions: {
          create: questions.map(q => {
            const sampleCases = q.sampleCases && Array.isArray(q.sampleCases) && q.sampleCases.length > 0
              ? q.sampleCases.filter(sc => sc?.input?.trim() || sc?.output?.trim())
              : null;
            const firstSample = sampleCases?.[0];
            return {
              title: q.title,
              description: q.description,
              difficulty: q.difficulty || 'MEDIUM',
              points: q.points || 10,
              testCases: JSON.stringify(q.testCases),
              expectedOutputs: JSON.stringify(q.expectedOutputs),
              sampleInput: firstSample?.input || q.sampleInput || null,
              sampleOutput: firstSample?.output || q.sampleOutput || null,
              sampleCases: sampleCases ? JSON.stringify(sampleCases) : null,
              constraints: q.constraints || null
            };
          })
        }
      },
      include: {
        questions: true
      }
    });

    // Parse JSON fields for response
    const testData = {
      ...codingTest,
      allowedLanguages: typeof codingTest.allowedLanguages === 'string' 
        ? JSON.parse(codingTest.allowedLanguages) 
        : codingTest.allowedLanguages,
      questions: codingTest.questions.map(q => ({
        ...q,
        testCases: JSON.parse(q.testCases),
        expectedOutputs: JSON.parse(q.expectedOutputs),
        sampleCases: q.sampleCases ? (typeof q.sampleCases === 'string' ? JSON.parse(q.sampleCases) : q.sampleCases) : null
      }))
    };

    res.status(201).json({
      success: true,
      message: 'Coding test created successfully',
      data: testData
    });
  } catch (error) {
    console.error('Error creating coding test:', error);
    res.status(500).json({ success: false, message: 'Server error creating coding test', error: error.message });
  }
});

// Get coding test status (simpler endpoint for checking availability)
router.get('/:jobId/coding-test/status', authenticateToken, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const userType = req.user.userType;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const codingTest = await prisma.codingTest.findUnique({
      where: { jobId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        title: true
      }
    });

    if (!codingTest) {
      return res.json({ success: true, data: { exists: false } });
    }

    // For students, check if they're shortlisted
    if (userType === 'student') {
      const application = await prisma.application.findFirst({
        where: {
          jobId: jobId,
          studentId: req.user.id,
          status: 'SHORTLISTED'
        }
      });

      if (!application) {
        return res.json({ 
          success: true, 
          data: { 
            exists: true, 
            status: codingTest.status,
            available: false,
            reason: 'You must be shortlisted to take this test'
          } 
        });
      }
    }

    return res.json({
      success: true,
      data: {
        exists: true,
        status: codingTest.status,
        available: codingTest.status === 'STARTED',
        title: codingTest.title,
        startedAt: codingTest.startedAt
      }
    });
  } catch (error) {
    console.error('Error fetching coding test status:', error);
    res.status(500).json({ success: false, message: 'Server error fetching coding test status' });
  }
});

// Get coding test for a job (Company/Student)
router.get('/:jobId/coding-test', authenticateToken, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const userType = req.user.userType;

    // Validate job exists
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Company can see full test, students can only see if test is started
    if (userType === 'company' && job.companyId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const codingTest = await prisma.codingTest.findUnique({
      where: { jobId },
      include: {
        questions: {
          orderBy: { id: 'asc' }
        }
      }
    });

    if (!codingTest) {
      return res.status(404).json({ success: false, message: 'Coding test not found' });
    }

    // For students, only show test if it's started
    if (userType === 'student') {
      // Check if student has applied and is shortlisted
      const application = await prisma.application.findFirst({
        where: {
          jobId: jobId,
          studentId: req.user.id,
          status: 'SHORTLISTED'
        }
      });

      if (!application) {
        return res.status(403).json({ 
          success: false, 
          message: 'You must be shortlisted to take this test' 
        });
      }

      if (codingTest.status !== 'STARTED') {
        return res.status(403).json({ 
          success: false, 
          message: 'Coding test has not started yet' 
        });
      }
    }

    // Parse JSON fields
    const testData = {
      ...codingTest,
      allowedLanguages: JSON.parse(codingTest.allowedLanguages),
      questions: codingTest.questions.map(q => {
        const sampleCases = q.sampleCases ? (typeof q.sampleCases === 'string' ? JSON.parse(q.sampleCases) : q.sampleCases) : null;
        return {
          ...q,
          testCases: userType === 'company' ? JSON.parse(q.testCases) : undefined, // Hide test cases from students
          expectedOutputs: userType === 'company' ? JSON.parse(q.expectedOutputs) : undefined, // Hide expected outputs from students
          sampleInput: q.sampleInput,
          sampleOutput: q.sampleOutput,
          sampleCases: sampleCases && Array.isArray(sampleCases) ? sampleCases : (q.sampleInput || q.sampleOutput ? [{ input: q.sampleInput || '', output: q.sampleOutput || '' }] : [])
        };
      })
    };

    res.json({ success: true, data: testData });
  } catch (error) {
    console.error('Error fetching coding test:', error);
    res.status(500).json({ success: false, message: 'Server error fetching coding test' });
  }
});

// Start coding test (Company)
router.post('/:jobId/coding-test/start', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }

    const codingTest = await prisma.codingTest.findUnique({ where: { jobId } });
    if (!codingTest) {
      return res.status(404).json({ success: false, message: 'Coding test not found' });
    }

    // Allow restarting if already started (for flexibility)
    // if (codingTest.status === 'STARTED') {
    //   return res.status(400).json({ success: false, message: 'Coding test is already started' });
    // }

    const updated = await prisma.codingTest.update({
      where: { id: codingTest.id },
      data: {
        status: 'STARTED',
        startedAt: new Date()
      },
      include: {
        questions: {
          orderBy: { id: 'asc' }
        }
      }
    });

    // Test database connection before proceeding
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (dbError) {
      console.error('[Coding Test Start] Database connection error:', dbError);
      if (dbError.code === 'P1001') {
        return res.status(503).json({
          success: false,
          message: 'Database connection failed. Cannot start coding test. Please check:',
          error: {
            code: dbError.code,
            details: [
              '1. Verify your DATABASE_URL in .env file',
              '2. Check if Neon database is active (it may be paused)',
              '3. Visit Neon Console (https://console.neon.tech/) to wake up the database',
              '4. Verify network connectivity',
              '5. Check if database credentials are correct'
            ]
          }
        });
      }
      throw dbError;
    }

    // Get all shortlisted applications for this job
    const shortlistedApplications = await prisma.application.findMany({
      where: {
        jobId: jobId,
        status: 'SHORTLISTED'
      },
      include: {
        student: true
      }
    });

    // Send notifications to all shortlisted students
    let notifiedCount = 0;
    const notificationErrors = [];
    
    console.log(`[Coding Test Start] Found ${shortlistedApplications.length} shortlisted applications for job ${jobId}`);
    
    if (shortlistedApplications.length === 0) {
      console.log(`[Coding Test Start] No shortlisted applications found for job ${jobId}. Skipping notifications.`);
    }
    
    for (const app of shortlistedApplications) {
      // Validate required fields
      if (!app.studentId) {
        console.error(`[Coding Test Start] Application ${app.id} has no studentId. Skipping notification.`);
        notificationErrors.push(`Application ${app.id}: Missing studentId`);
        continue;
      }
      
      if (!app.student) {
        console.error(`[Coding Test Start] Application ${app.id} has no student data. Skipping notification.`);
        notificationErrors.push(`Application ${app.id}: Missing student data`);
        continue;
      }
      
      try {
        console.log(`[Coding Test Start] Creating notification for student ${app.studentId} (${app.student?.name || 'Unknown'}), application ${app.id}, job ${jobId}`);
        
        const notification = await prisma.notification.create({
          data: {
            studentId: app.studentId,
            title: 'Coding Test Started',
            message: `The coding test for "${job.title}" has started. You can now take the test from your applications page.`,
            jobId: jobId,
            applicationId: app.id
          }
        });
        
        console.log(`[Coding Test Start] ✅ Notification created successfully: ID=${notification.id}, Student=${app.studentId}, Job=${jobId}, Application=${app.id}`);
        notifiedCount++;
      } catch (notifError) {
        const errorDetails = {
          message: notifError.message,
          code: notifError.code,
          meta: notifError.meta,
          stack: notifError.stack
        };
        console.error(`[Coding Test Start] ❌ Failed to create notification for student ${app.studentId} (${app.student?.name || 'Unknown'}):`, JSON.stringify(errorDetails, null, 2));
        notificationErrors.push(`Student ${app.studentId} (${app.student?.name || 'Unknown'}): ${notifError.message || 'Unknown error'}`);
      }
    }
    
    console.log(`[Coding Test Start] Notifications sent: ${notifiedCount}/${shortlistedApplications.length}`);
    if (notificationErrors.length > 0) {
      console.error(`[Coding Test Start] Notification errors:`, notificationErrors);
    }
    
    // Verify notifications were actually created in the database
    if (notifiedCount > 0) {
      try {
        const verifyNotifications = await prisma.notification.findMany({
          where: {
            jobId: jobId,
            title: 'Coding Test Started',
            createdAt: {
              gte: new Date(Date.now() - 60000) // Created in the last minute
            }
          },
          select: {
            id: true,
            studentId: true,
            title: true,
            createdAt: true
          }
        });
        console.log(`[Coding Test Start] Verified ${verifyNotifications.length} notifications in database for job ${jobId}`);
        if (verifyNotifications.length !== notifiedCount) {
          console.warn(`[Coding Test Start] ⚠️ Mismatch: Created ${notifiedCount} but found ${verifyNotifications.length} in database`);
        }
      } catch (verifyError) {
        console.error(`[Coding Test Start] Failed to verify notifications:`, verifyError);
      }
    }

    // Parse JSON fields for response
    const testData = {
      ...updated,
      allowedLanguages: JSON.parse(updated.allowedLanguages),
      questions: updated.questions.map(q => ({
        ...q,
        testCases: JSON.parse(q.testCases),
        expectedOutputs: JSON.parse(q.expectedOutputs)
      }))
    };

    res.json({
      success: true,
      message: `Coding test started. ${notifiedCount} shortlisted students notified.`,
      data: testData,
      notified: notifiedCount,
      totalShortlisted: shortlistedApplications.length,
      errors: notificationErrors.length > 0 ? notificationErrors : undefined
    });
  } catch (error) {
    console.error('Error starting coding test:', error);
    res.status(500).json({ success: false, message: 'Server error starting coding test' });
  }
});

// Stop coding test (Company)
router.post('/:jobId/coding-test/stop', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }

    const codingTest = await prisma.codingTest.findUnique({ where: { jobId } });
    if (!codingTest) {
      return res.status(404).json({ success: false, message: 'Coding test not found' });
    }

    if (codingTest.status !== 'STARTED') {
      return res.status(400).json({ success: false, message: 'Coding test is not started' });
    }

    const updated = await prisma.codingTest.update({
      where: { id: codingTest.id },
      data: {
        status: 'STOPPED'
      },
      include: {
        questions: {
          orderBy: { id: 'asc' }
        }
      }
    });

    // Parse JSON fields for response
    const testData = {
      ...updated,
      allowedLanguages: JSON.parse(updated.allowedLanguages),
      questions: updated.questions.map(q => ({
        ...q,
        testCases: JSON.parse(q.testCases),
        expectedOutputs: JSON.parse(q.expectedOutputs)
      }))
    };

    res.json({
      success: true,
      message: 'Coding test stopped successfully',
      data: testData
    });
  } catch (error) {
    console.error('Error stopping coding test:', error);
    res.status(500).json({ success: false, message: 'Server error stopping coding test' });
  }
});

// Update coding test settings (Company)
router.put('/:jobId/coding-test', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const { title, description, allowedLanguages, timeLimit, cutoff, questions } = req.body;

    // Validate job ownership
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }

    const codingTest = await prisma.codingTest.findUnique({ 
      where: { jobId },
      include: { questions: true }
    });
    
    if (!codingTest) {
      return res.status(404).json({ success: false, message: 'Coding test not found' });
    }

    // Don't allow editing if test is STARTED (to prevent issues with active tests)
    if (codingTest.status === 'STARTED') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot edit coding test while it is active. Please stop the test first.' 
      });
    }

    // Validate allowed languages
    const validLanguages = allowedLanguages && Array.isArray(allowedLanguages) 
      ? allowedLanguages 
      : JSON.parse(codingTest.allowedLanguages);

    // Update coding test
    const updated = await prisma.codingTest.update({
      where: { id: codingTest.id },
      data: {
        title: title || codingTest.title,
        description: description !== undefined ? description : codingTest.description,
        allowedLanguages: JSON.stringify(validLanguages),
        timeLimit: timeLimit || codingTest.timeLimit,
        cutoff: cutoff !== undefined ? cutoff : codingTest.cutoff
      }
    });

    // Update questions if provided
    if (questions && Array.isArray(questions)) {
      // Delete existing questions
      await prisma.codingQuestion.deleteMany({
        where: { testId: codingTest.id }
      });

      // Create new questions
      for (const q of questions) {
        const sampleCases = q.sampleCases && Array.isArray(q.sampleCases) && q.sampleCases.length > 0
          ? q.sampleCases.filter(sc => sc?.input?.trim() || sc?.output?.trim())
          : null;
        const firstSample = sampleCases?.[0];
        await prisma.codingQuestion.create({
          data: {
            testId: codingTest.id,
            title: q.title,
            description: q.description,
            difficulty: q.difficulty || 'MEDIUM',
            points: q.points || 10,
            testCases: JSON.stringify(q.testCases || []),
            expectedOutputs: JSON.stringify(q.expectedOutputs || []),
            sampleInput: firstSample?.input || q.sampleInput || null,
            sampleOutput: firstSample?.output || q.sampleOutput || null,
            sampleCases: sampleCases ? JSON.stringify(sampleCases) : null,
            constraints: q.constraints || null
          }
        });
      }
    }

    // Fetch updated test with questions
    const updatedTest = await prisma.codingTest.findUnique({
      where: { id: codingTest.id },
      include: {
        questions: {
          orderBy: { id: 'asc' }
        }
      }
    });

    // Parse JSON fields for response
    const testData = {
      ...updatedTest,
      allowedLanguages: JSON.parse(updatedTest.allowedLanguages),
      questions: updatedTest.questions.map(q => ({
        ...q,
        testCases: JSON.parse(q.testCases),
        expectedOutputs: JSON.parse(q.expectedOutputs)
      }))
    };

    res.json({
      success: true,
      message: 'Coding test updated successfully',
      data: testData
    });
  } catch (error) {
    console.error('Error updating coding test:', error);
    res.status(500).json({ success: false, message: 'Server error updating coding test' });
  }
});

// Run sample test only (Student) - does not save submission
router.post('/:jobId/coding-test/run-sample', authenticateToken, authorizeStudent, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const { questionId, languageId, code } = req.body;

    if (!questionId || !languageId || !code) {
      return res.status(400).json({ success: false, message: 'questionId, languageId, and code are required' });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const codingTest = await prisma.codingTest.findUnique({
      where: { jobId },
      include: { questions: true }
    });
    if (!codingTest) return res.status(404).json({ success: false, message: 'Coding test not found' });
    if (codingTest.status !== 'STARTED') {
      return res.status(400).json({ success: false, message: 'Coding test has not started yet' });
    }

    const application = await prisma.application.findFirst({
      where: { jobId, studentId: req.user.id, status: 'SHORTLISTED' }
    });
    if (!application) {
      return res.status(403).json({ success: false, message: 'You must be shortlisted to take this test' });
    }

    const question = codingTest.questions.find(q => q.id === questionId);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    const allowedLanguages = typeof codingTest.allowedLanguages === 'string'
      ? JSON.parse(codingTest.allowedLanguages)
      : codingTest.allowedLanguages;
    const langId = parseInt(languageId);
    if (!allowedLanguages.includes(langId)) {
      return res.status(400).json({ success: false, message: 'Language not allowed for this test' });
    }

    let sampleInput, sampleOutput;
    const sampleCases = question.sampleCases ? (typeof question.sampleCases === 'string' ? JSON.parse(question.sampleCases) : question.sampleCases) : null;
    if (sampleCases && Array.isArray(sampleCases) && sampleCases.length > 0 && (sampleCases[0]?.input || sampleCases[0]?.output)) {
      sampleInput = sampleCases[0].input || '';
      sampleOutput = sampleCases[0].output || '';
    } else if (question.sampleInput && question.sampleOutput) {
      sampleInput = question.sampleInput;
      sampleOutput = question.sampleOutput;
    } else {
      const testCases = JSON.parse(question.testCases);
      const expectedOutputs = JSON.parse(question.expectedOutputs);
      if (!testCases.length) {
        return res.status(400).json({ success: false, message: 'No sample input available for this question' });
      }
      sampleInput = testCases[0];
      sampleOutput = expectedOutputs[0] || '';
    }

    const executionResult = await executeWithTestCases(
      code,
      langId,
      [sampleInput],
      [sampleOutput],
      Math.min((codingTest.timeLimit || 60) * 60, 15)
    );

    res.json({
      success: true,
      data: {
        results: executionResult.results,
        passedCount: executionResult.passedCount,
        totalCount: executionResult.totalCount
      }
    });
  } catch (error) {
    console.error('Error running sample:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error running sample' });
  }
});

// Submit code for a question (Student)
router.post('/:jobId/coding-test/submit', authenticateToken, authorizeStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const { questionId, languageId, code } = req.body;

    if (!questionId || !languageId || !code) {
      return res.status(400).json({ 
        success: false, 
        message: 'questionId, languageId, and code are required' 
      });
    }

    // Validate job and test
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const codingTest = await prisma.codingTest.findUnique({
      where: { jobId },
      include: { questions: true }
    });

    if (!codingTest) {
      return res.status(404).json({ success: false, message: 'Coding test not found' });
    }

    if (codingTest.status !== 'STARTED') {
      return res.status(400).json({ 
        success: false, 
        message: 'Coding test has not started yet' 
      });
    }

    // Find the question
    const question = codingTest.questions.find(q => q.id === questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    // Check if language is allowed
    const allowedLanguages = JSON.parse(codingTest.allowedLanguages);
    if (!allowedLanguages.includes(languageId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Language not allowed for this test' 
      });
    }

    // Parse test cases and expected outputs
    const testCases = JSON.parse(question.testCases);
    const expectedOutputs = JSON.parse(question.expectedOutputs);

    // Execute code with test cases
    const executionResult = await executeWithTestCases(
      code,
      languageId,
      testCases,
      expectedOutputs,
      codingTest.timeLimit * 60 // Convert minutes to seconds
    );

    // Calculate score
    const score = (executionResult.passedCount / executionResult.totalCount) * question.points;

    // Determine status
    let status = 'WRONG_ANSWER';
    if (executionResult.passedCount === executionResult.totalCount) {
      status = 'ACCEPTED';
    } else if (executionResult.results.some(r => r.status === 'TIME_LIMIT_EXCEEDED')) {
      status = 'TIME_LIMIT_EXCEEDED';
    } else if (executionResult.results.some(r => r.status === 'COMPILATION_ERROR')) {
      status = 'COMPILATION_ERROR';
    } else if (executionResult.results.some(r => r.status === 'RUNTIME_ERROR')) {
      status = 'RUNTIME_ERROR';
    }

    // Save submission
    const submission = await prisma.codingSubmission.create({
      data: {
        testId: codingTest.id,
        questionId: questionId,
        studentId: studentId,
        languageId: languageId,
        code: code,
        status: status,
        score: score,
        executionTime: executionResult.results.length > 0
          ? executionResult.results.reduce((sum, r) => sum + (r.executionTime || 0), 0) / executionResult.results.length
          : null,
        memoryUsed: executionResult.results.length > 0
          ? executionResult.results.reduce((sum, r) => sum + (r.memoryUsed || 0), 0) / executionResult.results.length
          : null,
        testCaseResults: JSON.stringify(executionResult.results),
        errorMessage: executionResult.results.find(r => r.error)?.error || null
      }
    });

    res.json({
      success: true,
      message: 'Code submitted successfully',
      data: {
        submission: {
          id: submission.id,
          status: submission.status,
          score: submission.score,
          passedCount: executionResult.passedCount,
          totalCount: executionResult.totalCount
        },
        results: executionResult.results
      }
    });
  } catch (error) {
    console.error('Error submitting code:', error);
    res.status(500).json({ success: false, message: 'Server error submitting code' });
  }
});

// Get coding submissions for a student (Company/Recruiter view)
router.get('/:jobId/coding-test/submissions/:studentId', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const studentId = parseInt(req.params.studentId);

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }

    const codingTest = await prisma.codingTest.findUnique({ where: { jobId } });
    if (!codingTest) {
      return res.json({ success: true, data: { submissions: [] } });
    }

    const submissions = await prisma.codingSubmission.findMany({
      where: {
        testId: codingTest.id,
        studentId
      },
      include: {
        test: { include: { questions: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get latest submission per question (most recent code)
    const byQuestion = {};
    for (const sub of submissions) {
      if (!byQuestion[sub.questionId] || new Date(sub.createdAt) > new Date(byQuestion[sub.questionId].createdAt)) {
        byQuestion[sub.questionId] = sub;
      }
    }

    const LANGUAGE_NAMES = { 50: 'C', 54: 'C++', 92: 'Python', 71: 'Python', 91: 'Java' };
    const submissionsWithDetails = Object.values(byQuestion).map(sub => {
      const question = sub.test?.questions?.find(q => q.id === sub.questionId);
      return {
        id: sub.id,
        questionId: sub.questionId,
        questionTitle: question?.title || 'Question',
        questionPoints: question?.points ?? null,
        code: sub.code,
        languageId: sub.languageId,
        languageName: LANGUAGE_NAMES[sub.languageId] || `Lang ${sub.languageId}`,
        status: sub.status,
        score: sub.score,
        executionTime: sub.executionTime,
        memoryUsed: sub.memoryUsed,
        errorMessage: sub.errorMessage,
        testCaseResults: sub.testCaseResults ? JSON.parse(sub.testCaseResults) : null,
        createdAt: sub.createdAt
      };
    });

    res.json({
      success: true,
      data: { submissions: submissionsWithDetails }
    });
  } catch (error) {
    console.error('Error fetching coding submissions for recruiter:', error);
    res.status(500).json({ success: false, message: 'Server error fetching coding submissions' });
  }
});

// Get student's submissions for a coding test
router.get('/:jobId/coding-test/submissions', authenticateToken, authorizeStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    const codingTest = await prisma.codingTest.findUnique({ where: { jobId } });
    if (!codingTest) {
      return res.status(404).json({ success: false, message: 'Coding test not found' });
    }

    const submissions = await prisma.codingSubmission.findMany({
      where: {
        testId: codingTest.id,
        studentId: studentId
      },
      include: {
        test: {
          include: {
            questions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const submissionsWithDetails = submissions.map(sub => ({
      ...sub,
      testCaseResults: sub.testCaseResults ? JSON.parse(sub.testCaseResults) : null
    }));

    res.json({
      success: true,
      data: { submissions: submissionsWithDetails }
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ success: false, message: 'Server error fetching submissions' });
  }
});

export default router;

