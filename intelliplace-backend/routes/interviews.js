import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken, authorizeCompany, authorizeStudent } from '../middleware/auth.js';
import axios from 'axios';
import { DeepgramClient } from '@deepgram/sdk';
import {
  generateInterviewQuestion as generateInterviewQuestionGemini,
  evaluateInterviewAnswerGemini,
  evaluateInterviewOverallGemini,
  evaluateInterviewSessionEndGemini,
} from '../lib/gemini.js';
import {
  getDeepgramAgentSettings,
  DEEPGRAM_AGENT_WS_URL,
  mergeJobContextIntoAgentSettings,
} from '../lib/deepgramAgentSettings.js';

const router = express.Router();
const INTERVIEW_SERVICE_URL = process.env.INTERVIEW_SERVICE_URL || 'http://localhost:8001';
const ELEVENLABS_API_BASE = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';
/**
 * Default voice matches ElevenLabs quickstart (“George”); library voices may require a paid plan for API — use ELEVENLABS_VOICE_ID for a voice you own on free tier.
 * @see https://elevenlabs.io/docs/capabilities/text-to-speech
 */
const ELEVENLABS_VOICE_ID_DEFAULT = 'JBFqnCBsd6RMkjVDRZzb';
const ELEVENLABS_MODEL_ID_DEFAULT = 'eleven_v3';
const ELEVENLABS_OUTPUT_FORMAT_DEFAULT = 'mp3_44100_128';

function stripEnvQuotes(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/** Same spelling as student profile / login payload `user.name` — used for Q1 and prompts. */
function normalizeCandidateDisplayName(raw) {
  if (raw == null) return '';
  return String(raw).trim().replace(/\s+/g, ' ');
}

function normalizeInterviewQuestionText(raw) {
  if (raw == null) return '';
  return String(raw).trim().replace(/\s+/g, ' ');
}

/** Fixed first question: candidate self-introduction (not AI-generated). */
function buildSelfIntroductionQuestionRecord(displayName) {
  const name = normalizeCandidateDisplayName(displayName);
  const addr = name || 'Candidate';
  return {
    question: `${addr}, please introduce yourself: share your background, what you're studying or working on, skills or projects you'd like to highlight, and what drew you to this role. Take about one or two minutes.`,
    index: 0,
    timestamp: new Date().toISOString(),
  };
}

/** Parse synchronous STT JSON (single channel or multichannel). */
function extractElevenLabsTranscriptText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text.trim();
  const first = payload.transcripts?.[0];
  if (first && typeof first.text === 'string') return first.text.trim();
  return '';
}

function parseElevenLabsErrorBody(error) {
  const data = error.response?.data;
  if (Buffer.isBuffer(data)) {
    try {
      return JSON.parse(data.toString('utf8'));
    } catch {
      return { raw: data.toString('utf8') };
    }
  }
  if (typeof data === 'object' && data !== null) return data;
  return {};
}

/** Build ordered Q&A pairs for adaptive prompts (matches answers to question text by index). */
function buildConversationHistory(questions, answers) {
  const list = Array.isArray(questions) ? questions : JSON.parse(questions || '[]');
  const ans = Array.isArray(answers) ? answers : JSON.parse(answers || '[]');
  const sorted = [...ans].sort(
    (a, b) => (a.questionIndex ?? 0) - (b.questionIndex ?? 0)
  );
  return sorted
    .map((a) => {
      const idx = a.questionIndex;
      const qObj = list.find((q, i) => (q.index !== undefined ? q.index : i) === idx);
      const qText = qObj?.question || '';
      const aText =
        typeof a.answer === 'string' ? a.answer : a.answer != null ? String(a.answer) : '';
      return { question: qText, answer: aText };
    })
    .filter((t) => t.question && t.answer);
}

function safeJsonParse(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Same merge as GET student-session — client can advance without an extra round-trip. */
function mergeSessionQuestionsWithAnswers(sessionRow) {
  if (!sessionRow) return null;
  const questions = JSON.parse(sessionRow.questions || '[]');
  const answers = JSON.parse(sessionRow.answers || '[]');
  const questionsWithAnswers = questions.map((q, idx) => {
    const qIndex = q.index !== undefined ? q.index : idx;
    const answer = answers.find((a) => a.questionIndex === qIndex);
    return {
      ...q,
      index: qIndex,
      answer: answer ? answer.answer : null,
      analysis: answer?.analysis || null,
      answerInputMode: answer?.inputMode || null,
      pairedQuestionText: answer?.questionText || q.question || null,
      geminiEvaluation: answer?.geminiEvaluation || null,
    };
  });
  return {
    ...sessionRow,
    questions: questionsWithAnswers,
    overallEvaluation: safeJsonParse(sessionRow.overallEvaluation, null),
  };
}

/**
 * When every question has an answer and question count reached session cap, mark complete and attach Gemini overall evaluation.
 */
async function finalizeInterviewIfComplete(prismaClient, interview, sessionRow, job, application) {
  if (!sessionRow || sessionRow.status !== 'ACTIVE') {
    return { completed: false, sessionRow };
  }
  const mode = String(sessionRow.mode || '').toUpperCase();
  if (mode !== 'TECH' && mode !== 'HR') {
    return { completed: false, sessionRow };
  }
  const qArr = JSON.parse(sessionRow.questions || '[]');
  const ansArr = JSON.parse(sessionRow.answers || '[]');
  const cap = getMaxQuestionsForSession(sessionRow);
  if (qArr.length < cap || !everyQuestionHasAnswer(qArr, ansArr)) {
    return { completed: false, sessionRow };
  }

  const student = application?.student;
  const turns = ansArr.map((a) => {
    const qi = a.questionIndex;
    const qObj = qArr.find((q, i) => (q.index !== undefined ? q.index : i) === qi);
    return {
      question: qObj?.question || a.questionText || '',
      answer: typeof a.answer === 'string' ? a.answer : '',
      score: a.geminiEvaluation?.score ?? null,
      summary: a.geminiEvaluation?.feedback ?? '',
    };
  });

  let overallEvaluation = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      overallEvaluation = await evaluateInterviewOverallGemini({
        mode,
        jobTitle: job?.title || '',
        jobDescription: job?.description || '',
        candidateName: student?.name || 'Candidate',
        turns,
      });
    } catch (e) {
      console.error('[Interview] overall Gemini evaluation:', e);
    }
  }

  await prismaClient.interviewSession.update({
    where: { id: sessionRow.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      overallEvaluation: overallEvaluation ? JSON.stringify(overallEvaluation) : null,
    },
  });
  await prismaClient.interview.update({
    where: { id: interview.id },
    data: { status: 'COMPLETED' },
  });
  const completedRow = await prismaClient.interviewSession.findUnique({
    where: { id: sessionRow.id },
  });
  return { completed: true, sessionRow: completedRow };
}

/** Max candidate answers before voice agent should wrap up (also in agent prompt). Env: INTERVIEW_VOICE_AGENT_MAX_ANSWERS */
function getVoiceAgentMaxAnswers() {
  const n = parseInt(process.env.INTERVIEW_VOICE_AGENT_MAX_ANSWERS || '8', 10);
  if (!Number.isFinite(n) || n < 4) return 8;
  return Math.min(25, n);
}

/**
 * Gemini: score every Q&A + overall. Used when student ends session or company clicks Evaluate.
 */
async function persistGeminiEvaluationForSession(prismaClient, sessionRow, interview, job, application) {
  const ansArr = JSON.parse(sessionRow.answers || '[]');
  if (!Array.isArray(ansArr) || ansArr.length === 0) {
    return { ok: false, message: 'No answers to evaluate', sessionRow };
  }

  const qArr = JSON.parse(sessionRow.questions || '[]');
  const mode = String(sessionRow.mode || '').toUpperCase();
  const student = application?.student;
  const resumeExcerpt = extractResumeExcerpt(application, student);

  let requiredSkillsText = '';
  if (job?.requiredSkills) {
    try {
      const rs =
        typeof job.requiredSkills === 'string' ? JSON.parse(job.requiredSkills) : job.requiredSkills;
      requiredSkillsText = Array.isArray(rs) ? rs.join(', ') : String(rs);
    } catch {
      requiredSkillsText = String(job.requiredSkills);
    }
  }

  let candidateSkillsText = '';
  if (application?.skills) {
    try {
      const cs =
        typeof application.skills === 'string' ? JSON.parse(application.skills) : application.skills;
      candidateSkillsText = Array.isArray(cs) ? cs.join(', ') : String(cs);
    } catch {
      candidateSkillsText = String(application.skills);
    }
  }

  const turnsForGemini = ansArr.map((a) => {
    const qi = a.questionIndex;
    const qObj = qArr.find((q, i) => (q.index !== undefined ? q.index : i) === qi);
    return {
      questionIndex: qi,
      question: qObj?.question || a.questionText || '',
      answer: typeof a.answer === 'string' ? a.answer : '',
    };
  });

  let endEval = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      endEval = await evaluateInterviewSessionEndGemini({
        mode,
        jobTitle: job?.title || '',
        jobDescription: job?.description || '',
        resumeExcerpt,
        requiredSkillsText,
        candidateSkillsText,
        candidateName: student?.name || 'Candidate',
        turns: turnsForGemini,
      });
    } catch (e) {
      console.error('[Interview] Gemini session evaluation:', e);
    }
  }

  const evalByIndex = new Map();
  if (endEval?.perAnswerEvaluations?.length) {
    for (const ev of endEval.perAnswerEvaluations) {
      if (Number.isFinite(Number(ev.questionIndex))) {
        evalByIndex.set(Number(ev.questionIndex), ev);
      }
    }
  }

  const answersMerged = ansArr.map((a) => {
    const ev = evalByIndex.get(a.questionIndex);
    if (!ev) return { ...a };
    const geminiEvaluation = {
      score: ev.score ?? null,
      feedback: ev.feedback || '',
      criteria: ev.criteria || {},
      evaluatedAt: new Date().toISOString(),
      batch: 'session_end',
    };
    return { ...a, geminiEvaluation };
  });

  const overallEvaluation = endEval?.overall || null;

  await prismaClient.interviewSession.update({
    where: { id: sessionRow.id },
    data: {
      answers: JSON.stringify(answersMerged),
      overallEvaluation: overallEvaluation ? JSON.stringify(overallEvaluation) : null,
    },
  });

  for (const a of answersMerged) {
    const ev = evalByIndex.get(a.questionIndex);
    const qi = a.questionIndex;
    const qObj = qArr.find((q, i) => (q.index !== undefined ? q.index : i) === qi);
    const qText = qObj?.question || a.questionText || '';
    const qaPayload = {
      contentScore: ev?.score ?? null,
      overallScore: ev?.score ?? null,
      feedback: ev?.feedback || null,
      questionText: qText,
      transcribedText: typeof a.answer === 'string' ? a.answer : '',
      analysisData: JSON.stringify({
        inputMode: a.inputMode || 'speech',
        geminiEvaluation: a.geminiEvaluation || null,
        source: 'deepgram_voice_agent',
        evaluationPhase: 'session_end',
      }),
    };
    const existing = await prismaClient.interviewQuestionAnswer.findFirst({
      where: { sessionId: sessionRow.id, questionIndex: qi },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (existing?.id) {
      await prismaClient.interviewQuestionAnswer.update({
        where: { id: existing.id },
        data: qaPayload,
      });
    } else {
      await prismaClient.interviewQuestionAnswer.create({
        data: {
          sessionId: sessionRow.id,
          questionIndex: qi,
          questionText: qText,
          transcribedText: typeof a.answer === 'string' ? a.answer : '',
          contentScore: ev?.score ?? null,
          overallScore: ev?.score ?? null,
          feedback: ev?.feedback || null,
          analysisData: qaPayload.analysisData,
        },
      });
    }
  }

  const fresh = await prismaClient.interviewSession.findUnique({
    where: { id: sessionRow.id },
  });
  return { ok: true, sessionRow: fresh };
}

async function finalizeVoiceAgentSession(prismaClient, interview, sessionRow, job, application) {
  if (!sessionRow || sessionRow.status !== 'ACTIVE') {
    return { completed: false, sessionRow };
  }
  const ansArr = JSON.parse(sessionRow.answers || '[]');
  if (!Array.isArray(ansArr) || ansArr.length === 0) {
    return { completed: false, sessionRow };
  }

  const persist = await persistGeminiEvaluationForSession(
    prismaClient,
    sessionRow,
    interview,
    job,
    application
  );
  if (!persist.ok) {
    return { completed: false, sessionRow: persist.sessionRow };
  }

  await prismaClient.interviewSession.update({
    where: { id: sessionRow.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });
  await prismaClient.interview.update({
    where: { id: interview.id },
    data: { status: 'COMPLETED' },
  });
  const completedRow = await prismaClient.interviewSession.findUnique({
    where: { id: sessionRow.id },
  });
  return { completed: true, sessionRow: completedRow };
}

/** Max AI questions: TECH uses INTERVIEW_TECH_MAX_QUESTIONS (default 12), others use INTERVIEW_MAX_QUESTIONS (default 25). */
function getMaxQuestionsForSession(sessionRow) {
  const globalMax = parseInt(process.env.INTERVIEW_MAX_QUESTIONS || '25', 10);
  if (!sessionRow || String(sessionRow.mode).toUpperCase() !== 'TECH') {
    return globalMax;
  }
  const techMax = parseInt(process.env.INTERVIEW_TECH_MAX_QUESTIONS || '12', 10);
  return Math.min(Math.max(techMax, 1), globalMax);
}

function everyQuestionHasAnswer(questionsArr, answersArr) {
  if (!Array.isArray(questionsArr) || questionsArr.length === 0) return false;
  const answers = Array.isArray(answersArr) ? answersArr : [];
  return questionsArr.every((q, idx) => {
    const qi = q.index !== undefined ? q.index : idx;
    const ans = answers.find((a) => a.questionIndex === qi);
    return ans && ans.answer != null && String(ans.answer).trim() !== '';
  });
}

/** Best-effort plain text from stored CV bytes (skips likely PDF binaries). */
function extractResumeExcerpt(application, student) {
  const tryBuf = (buf) => {
    if (!buf) return '';
    const b = Buffer.from(buf);
    const s = b.toString('utf8');
    const nonPrint = (s.match(/[^\x20-\x7E\n\r\t]/g) || []).length;
    if (nonPrint / Math.max(s.length, 1) > 0.35) return '';
    return s.trim().slice(0, 14000);
  };
  const fromApp = tryBuf(application?.cvData);
  if (fromApp) return fromApp;
  return tryBuf(student?.cvData) || '';
}

/**
 * Core logic for AI-generated next question (used by company route and auto-advance after student answer).
 * @returns {Promise<{ ok: true, newQuestion: object, sessionId: number } | { ok: false, message: string }>}
 */
async function runInterviewQuestionGeneration(prisma, jobId, applicationId, options = {}) {
  const { requireActiveSession = false } = options;

  try {
    const job = await prisma.job.findFirst({
      where: { id: jobId },
      include: {
        applications: {
          where: { id: applicationId },
          include: { student: true },
        },
      },
    });

    if (!job?.applications?.[0]) {
      return { ok: false, message: 'Application not found' };
    }

    const application = job.applications[0];
    const student = application.student;

    const sessionWhere = requireActiveSession
      ? { status: 'ACTIVE' }
      : { status: { in: ['ACTIVE', 'STOPPED'] } };

    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      include: {
        sessions: {
          where: sessionWhere,
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!interview?.sessions?.length) {
      return { ok: false, message: 'No active interview session found' };
    }

    const session = interview.sessions[0];
    const modeUpper = String(session.mode || 'TECH').toUpperCase();
    const questions = JSON.parse(session.questions || '[]');
    const maxQuestions = getMaxQuestionsForSession(session);

    if (questions.length >= maxQuestions) {
      return { ok: false, message: 'Maximum interview questions reached' };
    }

    if (questions.length === 0) {
      const introRecord = buildSelfIntroductionQuestionRecord(student?.name);
      questions.push(introRecord);
      await prisma.interviewSession.update({
        where: { id: session.id },
        data: {
          questions: JSON.stringify(questions),
          currentQuestionIndex: 0,
        },
      });
      return { ok: true, newQuestion: introRecord, sessionId: session.id };
    }

    const answersArr = JSON.parse(session.answers || '[]');
    const previousQuestions = questions.map((q) => q.question);
    const conversationHistory = buildConversationHistory(questions, answersArr);
    const nextQuestionIndex = questions.length;

    let requiredSkills = [];
    if (job.requiredSkills) {
      try {
        requiredSkills =
          typeof job.requiredSkills === 'string' ? JSON.parse(job.requiredSkills) : job.requiredSkills;
        if (!Array.isArray(requiredSkills)) {
          requiredSkills = requiredSkills ? [requiredSkills] : [];
        }
      } catch (e) {
        requiredSkills = [job.requiredSkills];
      }
    }

    let candidateSkills = null;
    if (application.skills) {
      try {
        candidateSkills =
          typeof application.skills === 'string' ? JSON.parse(application.skills) : application.skills;
        if (!Array.isArray(candidateSkills)) {
          candidateSkills = candidateSkills ? [candidateSkills] : null;
        }
      } catch (e) {
        candidateSkills = [application.skills];
      }
    }

    const resumeExcerpt = extractResumeExcerpt(application, student);

    const candidateDisplayName = normalizeCandidateDisplayName(student?.name) || 'Candidate';

    const requestData = {
      mode: modeUpper,
      job_title: job.title,
      job_description: job.description,
      required_skills: requiredSkills,
      candidate_skills: candidateSkills,
      resume_excerpt: resumeExcerpt,
      candidate_profile: `${candidateDisplayName} — CGPA: ${application.cgpa ?? 'N/A'}, Backlogs: ${application.backlog ?? 0}`,
      previous_questions: previousQuestions,
      conversation_history: conversationHistory,
      next_question_index: nextQuestionIndex,
    };

    let questionText;

    const tryInterviewService = async () => {
      const interviewServiceResponse = await axios.post(
        `${INTERVIEW_SERVICE_URL}/generate-question`,
        requestData,
        { timeout: 30000 }
      );
      if (!interviewServiceResponse.data?.success) {
        return null;
      }
      return interviewServiceResponse.data.question;
    };

    const tryGemini = async () => {
      if (!process.env.GEMINI_API_KEY) return null;
      try {
        return await generateInterviewQuestionGemini({
          mode: modeUpper,
          jobTitle: job.title,
          jobDescription: job.description || '',
          requiredSkills,
          candidateSkills,
          resumeExcerpt,
          candidateName: candidateDisplayName,
          previousQuestions,
          conversationHistory,
          nextQuestionIndex,
        });
      } catch (geminiErr) {
        console.error('[Interview] Gemini question generation failed:', geminiErr.message || geminiErr);
        return null;
      }
    };

    // HR: prefer interview microservice (behavioral-only prompts); TECH: keep Gemini-first to avoid changing technical flow.
    if (modeUpper === 'HR') {
      try {
        questionText = await tryInterviewService();
      } catch (httpErr) {
        console.error('[Interview] HR interview service error:', httpErr.message || httpErr);
        questionText = null;
      }
      if (!questionText) {
        questionText = await tryGemini();
      }
    } else {
      questionText = await tryGemini();
      if (!questionText) {
        try {
          questionText = await tryInterviewService();
        } catch (httpErr) {
          console.error('[Interview] External service error:', httpErr.message || httpErr);
          return {
            ok: false,
            message:
              process.env.GEMINI_API_KEY
                ? 'Failed to generate question (Gemini and interview service unavailable)'
                : 'Failed to generate question. Set GEMINI_API_KEY in .env or run the interview microservice.',
          };
        }
        if (!questionText) {
          return { ok: false, message: 'Failed to generate question' };
        }
      }
    }

    if (modeUpper === 'HR' && !questionText) {
      return {
        ok: false,
        message:
          process.env.GEMINI_API_KEY
            ? 'Failed to generate HR question (interview service and Gemini unavailable)'
            : 'Failed to generate HR question. Run the interview microservice on INTERVIEW_SERVICE_URL or set GEMINI_API_KEY.',
      };
    }

    const newQuestion = {
      question: questionText,
      index: questions.length,
      timestamp: new Date().toISOString(),
    };

    questions.push(newQuestion);

    await prisma.interviewSession.update({
      where: { id: session.id },
      data: {
        questions: JSON.stringify(questions),
        currentQuestionIndex: questions.length - 1,
      },
    });

    return { ok: true, newQuestion, sessionId: session.id };
  } catch (err) {
    console.error('[Interview] runInterviewQuestionGeneration:', err);
    return { ok: false, message: err.message || 'Failed to generate question' };
  }
}

// Get all interviews for a job (Company)
router.get('/:jobId/interviews', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);

    // Verify job belongs to company
    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId },
    });

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const interviews = await prisma.interview.findMany({
      where: { jobId },
      include: {
        application: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        sessions: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: { interviews },
    });
  } catch (error) {
    console.error('Error fetching interviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch interviews' });
  }
});

// Start an interview session (Company)
router.post('/:jobId/interviews/:applicationId/start', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const applicationId = parseInt(req.params.applicationId);
    const { mode } = req.body; // "TECH" or "HR"
    const modeNorm = String(mode || '').trim().toUpperCase();

    if (!modeNorm || !['TECH', 'HR'].includes(modeNorm)) {
      return res.status(400).json({ success: false, message: 'Mode must be TECH or HR' });
    }

    // Verify job belongs to company
    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId },
      include: {
        applications: {
          where: { id: applicationId },
          include: {
            student: true,
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const application = job.applications[0];
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    // Get or create interview
    let interview = await prisma.interview.findUnique({
      where: { applicationId },
    });

    if (!interview) {
      interview = await prisma.interview.create({
        data: {
          applicationId,
          jobId,
          date: new Date(),
          type: modeNorm,
          status: 'IN_PROGRESS',
        },
      });
    } else {
      interview = await prisma.interview.update({
        where: { id: interview.id },
        data: { status: 'IN_PROGRESS', type: modeNorm },
      });
    }

    // Questions are recorded as the Deepgram Voice Agent progresses (see POST .../agent-answer).
    const session = await prisma.interviewSession.create({
      data: {
        interviewId: interview.id,
        mode: modeNorm,
        status: 'ACTIVE',
        questions: JSON.stringify([]),
        currentQuestionIndex: 0,
      },
    });

    // Send notification to student (title/message must be recognizable as "interview" for client routing)
    try {
      const isHr = modeNorm === 'HR';
      await prisma.notification.create({
        data: {
          studentId: application.studentId,
          title: isHr ? 'HR interview started' : 'Interview started',
          message: isHr
            ? `Your HR interview for "${job.title}" is ready. Open My Applications to join — this round is behavioral only (no coding or technical trivia).`
            : `Your technical interview for "${job.title}" has started. Open My Applications to join when you are ready.`,
          jobId: jobId,
          applicationId: applicationId,
        },
      });
      console.log(`[Interview Start] Notification sent to student ${application.studentId} (${modeNorm})`);
    } catch (notifError) {
      console.error(`[Interview Start] Failed to send notification:`, notifError);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      data: {
        interview,
        session,
        message: 'Interview session started',
      },
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    res.status(500).json({ success: false, message: 'Failed to start interview' });
  }
});

// Generate next question (Company) — same engine as auto-advance after candidate answers
router.post('/:jobId/interviews/:applicationId/generate-question', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const applicationId = parseInt(req.params.applicationId);

    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId },
    });

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const result = await runInterviewQuestionGeneration(prisma, jobId, applicationId, {
      requireActiveSession: false,
    });

    if (!result.ok) {
      const status = result.message === 'Application not found' ? 404 : 500;
      return res.status(status).json({ success: false, message: result.message });
    }

    res.json({
      success: true,
      data: {
        question: result.newQuestion,
        sessionId: result.sessionId,
      },
    });
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(500).json({ success: false, message: 'Failed to generate question' });
  }
});

// Submit answer (Student or Company)
// Student submits audio/video, Company submits text notes
router.post('/:jobId/interviews/:applicationId/submit-answer', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType; // JWT uses userType (not .type)
    const jobId = parseInt(req.params.jobId);
    const applicationId = parseInt(req.params.applicationId);
    const { answer, questionIndex, audio_data, video_frames, question, inputMode } = req.body;

    // Get active interview session
    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      include: {
        application: {
          include: {
            student: true,
          },
        },
        job: true,
        sessions: {
          where: { status: { in: ['ACTIVE', 'STOPPED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!interview || interview.sessions.length === 0) {
      return res.status(404).json({ success: false, message: 'No active interview session found' });
    }

    // Verify permissions
    if (userType === 'company') {
      if (interview.job.companyId !== userId) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
    } else if (userType === 'student') {
      if (interview.application.studentId !== userId) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
    }

    const session = interview.sessions[0];
    const questions = JSON.parse(session.questions || '[]');
    const answers = JSON.parse(session.answers || '[]');

    const questionIdx = questionIndex !== undefined ? questionIndex : session.currentQuestionIndex;

    if (questionIdx < 0 || questionIdx >= questions.length) {
      return res.status(400).json({ success: false, message: 'Invalid question index' });
    }

    let analysisResult = null;

    // If student submitted audio/video, analyze it
    if (userType === 'student' && (audio_data || video_frames)) {
      try {
        const currentQuestion = questions[questionIdx]?.question || question;
        
        // Call interview service for analysis
        const analysisResponse = await axios.post(
          `${INTERVIEW_SERVICE_URL}/analyze-answer`,
          {
            question: currentQuestion,
            question_index: questionIdx,
            audio_data: audio_data,
            video_frames: video_frames || [],
            mode: session.mode,
          },
          { timeout: 60000 } // 60 second timeout for analysis
        );

        if (analysisResponse.data.success) {
          analysisResult = analysisResponse.data.data;
          
          // Store analysis in database
          await prisma.interviewQuestionAnswer.create({
            data: {
              sessionId: session.id,
              questionIndex: questionIdx,
              questionText: currentQuestion,
              transcribedText: analysisResult.transcribed_text,
              contentScore: analysisResult.content_score,
              confidenceScore: analysisResult.confidence_score,
              emotionScores: JSON.stringify(analysisResult.emotion_scores || {}),
              overallScore: analysisResult.overall_score,
              feedback: analysisResult.feedback,
              analysisData: JSON.stringify(analysisResult.analysis_data || {}),
            },
          });
        }
      } catch (analysisError) {
        console.error('Error analyzing answer:', analysisError);
        // Continue even if analysis fails
      }
    }

    const resolvedQuestionText = questions[questionIdx]?.question || question || '';
    // Add or update answer (pair question + answer for evaluation; inputMode = speech | text)
    const resolvedInputMode =
      inputMode === 'speech' || inputMode === 'text' ? inputMode : audio_data || video_frames ? 'speech' : 'text';
    const answerTextFinal = answer || analysisResult?.transcribed_text || 'Audio/video submitted';

    let geminiEvaluation = null;
    if (
      userType === 'student' &&
      answerTextFinal &&
      String(answerTextFinal).trim() &&
      !audio_data &&
      !video_frames &&
      process.env.GEMINI_API_KEY
    ) {
      try {
        geminiEvaluation = await evaluateInterviewAnswerGemini({
          mode: session.mode,
          jobTitle: interview.job?.title || '',
          jobDescription: interview.job?.description || '',
          questionText: resolvedQuestionText,
          answerText: String(answerTextFinal).trim(),
          candidateName: interview.application?.student?.name || 'Candidate',
        });
      } catch (ge) {
        console.error('[Interview] Gemini per-answer evaluation:', ge);
      }
    }

    const answerData = {
      questionIndex: questionIdx,
      questionText: resolvedQuestionText || null,
      answer: answerTextFinal,
      timestamp: new Date().toISOString(),
      analysis: analysisResult,
      inputMode: resolvedInputMode,
      geminiEvaluation,
    };

    // Update existing answer or add new one
    const existingAnswerIndex = answers.findIndex((a) => a.questionIndex === questionIdx);
    if (existingAnswerIndex >= 0) {
      answers[existingAnswerIndex] = answerData;
    } else {
      answers.push(answerData);
    }

    // Update session
    await prisma.interviewSession.update({
      where: { id: session.id },
      data: {
        answers: JSON.stringify(answers),
      },
    });

    // Persist each answer in a queryable table for recruiter/reporting use.
    if (userType === 'student') {
      const existingQa = await prisma.interviewQuestionAnswer.findFirst({
        where: { sessionId: session.id, questionIndex: questionIdx },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      const qaPayload = {
        sessionId: session.id,
        questionIndex: questionIdx,
        questionText: resolvedQuestionText || questions[questionIdx]?.question || '',
        transcribedText: String(answerTextFinal || '').trim(),
        contentScore: geminiEvaluation?.score ?? analysisResult?.content_score ?? null,
        overallScore: geminiEvaluation?.score ?? analysisResult?.overall_score ?? null,
        feedback:
          geminiEvaluation?.feedback ||
          analysisResult?.feedback ||
          null,
        analysisData: JSON.stringify({
          inputMode: resolvedInputMode,
          geminiEvaluation: geminiEvaluation || null,
          realtimeTranscription: resolvedInputMode === 'speech',
          source: geminiEvaluation ? 'gemini' : analysisResult ? 'analysis_service' : 'none',
          rawAnalysis: analysisResult || null,
        }),
      };
      if (existingQa?.id) {
        await prisma.interviewQuestionAnswer.update({
          where: { id: existingQa.id },
          data: qaPayload,
        });
      } else {
        await prisma.interviewQuestionAnswer.create({
          data: qaPayload,
        });
      }
    }

    let nextQuestionAuto = null;
    let generationError = null;
    const autoEnabled = process.env.INTERVIEW_AUTO_NEXT !== 'false';
    const shouldAutoGenerate =
      autoEnabled &&
      userType === 'student' &&
      session.status === 'ACTIVE' &&
      answer &&
      String(answer).trim() &&
      !audio_data &&
      !video_frames &&
      questionIdx === questions.length - 1;

    if (shouldAutoGenerate) {
      const gen = await runInterviewQuestionGeneration(prisma, jobId, applicationId, {
        requireActiveSession: true,
      });
      if (gen.ok) {
        nextQuestionAuto = gen.newQuestion;
      } else {
        generationError = gen.message || 'Next question could not be generated';
        console.warn('[Interview] Auto next question skipped:', generationError);
      }
    }

    const freshSessionRow = await prisma.interviewSession.findUnique({
      where: { id: session.id },
    });
    let sessionForClient = mergeSessionQuestionsWithAnswers(freshSessionRow);

    let interviewCompleted = false;
    if (freshSessionRow?.status === 'ACTIVE') {
      const fin = await finalizeInterviewIfComplete(
        prisma,
        interview,
        freshSessionRow,
        interview.job,
        interview.application
      );
      if (fin.completed) {
        interviewCompleted = true;
        generationError = null;
        sessionForClient = mergeSessionQuestionsWithAnswers(fin.sessionRow);
      }
    }

    res.json({
      success: true,
      data: {
        answer: answerData,
        analysis: analysisResult,
        message: 'Answer submitted successfully',
        nextQuestion: nextQuestionAuto || undefined,
        autoGenerated: !!nextQuestionAuto,
        session: sessionForClient,
        generationError: interviewCompleted ? undefined : generationError || undefined,
        interviewCompleted,
        overallEvaluation: sessionForClient?.overallEvaluation || undefined,
      },
    });
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ success: false, message: 'Failed to submit answer' });
  }
});

// One turn from Deepgram Voice Agent: store Q&A only — Gemini runs once at voice-session/complete
router.post(
  '/:jobId/interviews/:applicationId/agent-answer',
  authenticateToken,
  authorizeStudent,
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const jobId = parseInt(req.params.jobId, 10);
      const applicationId = parseInt(req.params.applicationId, 10);
      const { questionText, answerText } = req.body || {};

      const q = normalizeInterviewQuestionText(questionText);
      const a = typeof answerText === 'string' ? answerText.trim() : '';
      if (!q || !a) {
        return res.status(400).json({ success: false, message: 'questionText and answerText are required' });
      }

      const application = await prisma.application.findFirst({
        where: { id: applicationId, studentId, jobId },
      });
      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const interview = await prisma.interview.findUnique({
        where: { applicationId },
        include: {
          application: { include: { student: true } },
          job: true,
          sessions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!interview?.sessions?.length) {
        return res.status(404).json({ success: false, message: 'No active interview session found' });
      }

      const session = interview.sessions[0];
      let questions = JSON.parse(session.questions || '[]');
      const answers = JSON.parse(session.answers || '[]');

      let questionIdx;
      const matchIdx = questions.findIndex((item) => normalizeInterviewQuestionText(item.question) === q);
      if (matchIdx >= 0) {
        questionIdx =
          questions[matchIdx].index !== undefined ? questions[matchIdx].index : matchIdx;
      } else {
        questionIdx = questions.length;
        questions.push({
          question: q,
          index: questionIdx,
          timestamp: new Date().toISOString(),
        });
      }

      const resolvedInputMode = 'speech';

      const answerData = {
        questionIndex: questionIdx,
        questionText: q,
        answer: a,
        timestamp: new Date().toISOString(),
        analysis: null,
        inputMode: resolvedInputMode,
        geminiEvaluation: null,
      };

      const existingAnswerIndex = answers.findIndex((x) => x.questionIndex === questionIdx);
      if (existingAnswerIndex >= 0) {
        answers[existingAnswerIndex] = answerData;
      } else {
        answers.push(answerData);
      }

      await prisma.interviewSession.update({
        where: { id: session.id },
        data: {
          questions: JSON.stringify(questions),
          answers: JSON.stringify(answers),
          currentQuestionIndex: questionIdx,
        },
      });

      const existingQa = await prisma.interviewQuestionAnswer.findFirst({
        where: { sessionId: session.id, questionIndex: questionIdx },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      const qaPayload = {
        sessionId: session.id,
        questionIndex: questionIdx,
        questionText: q,
        transcribedText: a,
        contentScore: null,
        overallScore: null,
        feedback: null,
        analysisData: JSON.stringify({
          inputMode: resolvedInputMode,
          source: 'deepgram_voice_agent',
          evaluationPending: true,
        }),
      };
      if (existingQa?.id) {
        await prisma.interviewQuestionAnswer.update({ where: { id: existingQa.id }, data: qaPayload });
      } else {
        await prisma.interviewQuestionAnswer.create({ data: qaPayload });
      }

      const freshSessionRow = await prisma.interviewSession.findUnique({ where: { id: session.id } });
      const sessionForClient = mergeSessionQuestionsWithAnswers(freshSessionRow);

      const answerCount = answers.length;
      const maxVoice = getVoiceAgentMaxAnswers();
      const shouldEndInterview = answerCount >= maxVoice;

      return res.json({
        success: true,
        data: {
          message: 'Answer recorded (Gemini evaluation runs when you end the interview)',
          session: sessionForClient,
          answerCount,
          maxVoiceAnswers: maxVoice,
          shouldEndInterview,
        },
      });
    } catch (error) {
      console.error('[Interview] agent-answer:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to store agent answer' });
    }
  }
);

router.post(
  '/:jobId/interviews/:applicationId/voice-session/complete',
  authenticateToken,
  authorizeStudent,
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const jobId = parseInt(req.params.jobId, 10);
      const applicationId = parseInt(req.params.applicationId, 10);

      const application = await prisma.application.findFirst({
        where: { id: applicationId, studentId, jobId },
      });
      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const interview = await prisma.interview.findUnique({
        where: { applicationId },
        include: {
          application: { include: { student: true } },
          job: true,
          sessions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!interview?.sessions?.length) {
        return res.status(404).json({ success: false, message: 'No active interview session found' });
      }

      const sessionRow = interview.sessions[0];
      const fin = await finalizeVoiceAgentSession(
        prisma,
        interview,
        sessionRow,
        interview.job,
        interview.application
      );

      if (!fin.completed) {
        return res.status(400).json({
          success: false,
          message: 'Nothing to finalize — answer at least one question before ending the interview.',
        });
      }

      const sessionForClient = mergeSessionQuestionsWithAnswers(fin.sessionRow);
      return res.json({
        success: true,
        data: {
          message: 'Interview completed',
          session: sessionForClient,
          overallEvaluation: sessionForClient?.overallEvaluation || undefined,
        },
      });
    } catch (error) {
      console.error('[Interview] voice-session/complete:', error);
      res.status(500).json({ success: false, message: 'Failed to complete interview' });
    }
  }
);

/** Company: re-run or first-run Gemini evaluation on latest voice session (Q&A) without changing session status. */
router.post(
  '/:jobId/interviews/:applicationId/voice-session/evaluate',
  authenticateToken,
  authorizeCompany,
  async (req, res) => {
    try {
      const companyId = req.user.id;
      const jobId = parseInt(req.params.jobId, 10);
      const applicationId = parseInt(req.params.applicationId, 10);

      const job = await prisma.job.findFirst({
        where: { id: jobId, companyId },
      });
      if (!job) {
        return res.status(404).json({ success: false, message: 'Job not found' });
      }

      const interview = await prisma.interview.findUnique({
        where: { applicationId },
        include: {
          application: { include: { student: true } },
          job: true,
          sessions: {
            where: { status: { in: ['ACTIVE', 'STOPPED', 'COMPLETED'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!interview?.sessions?.length) {
        return res.status(404).json({ success: false, message: 'No session found' });
      }

      const sessionRow = interview.sessions[0];
      const persist = await persistGeminiEvaluationForSession(
        prisma,
        sessionRow,
        interview,
        interview.job,
        interview.application
      );

      if (!persist.ok) {
        return res.status(400).json({
          success: false,
          message: persist.message || 'No answers to evaluate',
        });
      }

      const sessionForClient = mergeSessionQuestionsWithAnswers(persist.sessionRow);
      return res.json({
        success: true,
        data: {
          message: process.env.GEMINI_API_KEY
            ? 'Evaluation complete'
            : 'Answers saved; set GEMINI_API_KEY for AI scores and feedback',
          session: sessionForClient,
          overallEvaluation: sessionForClient?.overallEvaluation || undefined,
        },
      });
    } catch (error) {
      console.error('[Interview] voice-session/evaluate:', error);
      res.status(500).json({ success: false, message: 'Failed to evaluate interview' });
    }
  }
);

router.post('/:jobId/interviews/:applicationId/stop', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const applicationId = parseInt(req.params.applicationId);

    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId },
    });

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      include: {
        sessions: {
          where: { status: { in: ['ACTIVE', 'STOPPED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!interview || interview.sessions.length === 0) {
      return res.status(404).json({ success: false, message: 'No active interview session found' });
    }

    const session = interview.sessions[0];

    await prisma.interviewSession.update({
      where: { id: session.id },
      data: {
        status: 'STOPPED',
      },
    });

    res.json({
      success: true,
      data: {
        message: 'Interview stopped successfully',
      },
    });
  } catch (error) {
    console.error('Error stopping interview:', error);
    res.status(500).json({ success: false, message: 'Failed to stop interview' });
  }
});

router.get('/:jobId/interviews/:applicationId/student-session', authenticateToken, authorizeStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const applicationId = parseInt(req.params.applicationId);

    // Verify application belongs to student
    const application = await prisma.application.findFirst({
      where: { id: applicationId, studentId, jobId },
      include: {
        job: true,
        student: { select: { name: true } },
      },
    });

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    // Get interview with active session
    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      include: {
        sessions: {
          where: { status: { in: ['ACTIVE', 'STOPPED', 'COMPLETED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!interview || interview.sessions.length === 0) {
      return res.status(404).json({ success: false, message: 'No active interview session found' });
    }

    const session = interview.sessions[0];
    const questions = JSON.parse(session.questions || '[]');
    const answers = JSON.parse(session.answers || '[]');

    const questionsWithAnswers = questions.map((q, idx) => {
      const qIndex = q.index !== undefined ? q.index : idx;
      const answer = answers.find((a) => a.questionIndex === qIndex);
      return {
        ...q,
        index: qIndex,
        answer: answer ? answer.answer : null,
        analysis: answer?.analysis || null,
        answerInputMode: answer?.inputMode || null,
        pairedQuestionText: answer?.questionText || q.question || null,
        geminiEvaluation: answer?.geminiEvaluation || null,
      };
    });

    const candidateDisplayName = normalizeCandidateDisplayName(application.student?.name);
    const proctoringLive = await getLiveProctoringWarnings(interview.id);

    res.json({
      success: true,
      data: {
        interview,
        session: {
          ...session,
          questions: questionsWithAnswers,
          overallEvaluation: safeJsonParse(session.overallEvaluation, null),
        },
        job: application.job,
        techQuestionCap: getMaxQuestionsForSession(session),
        candidateDisplayName,
        proctoringLive,
      },
    });
  } catch (error) {
    console.error('Error fetching student interview session:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch interview session' });
  }
});

// Get interview session details (Company)
router.get('/:jobId/interviews/:applicationId/session', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const applicationId = parseInt(req.params.applicationId);

    // Verify job belongs to company
    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId },
    });

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Get interview with active session
    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      include: {
        application: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
                cgpa: true,
                backlog: true,
              },
            },
          },
        },
        sessions: {
          where: { status: { in: ['ACTIVE', 'STOPPED', 'COMPLETED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }

    const session = interview.sessions[0];
    if (!session) {
      return res.status(404).json({ success: false, message: 'No session found' });
    }

    const questions = JSON.parse(session.questions || '[]');
    const answers = JSON.parse(session.answers || '[]');

    const questionsWithAnswers = questions.map((q, idx) => {
      const qIndex = q.index !== undefined ? q.index : idx;
      const answer = answers.find((a) => a.questionIndex === qIndex);
      return {
        ...q,
        index: qIndex,
        answer: answer ? answer.answer : null,
        analysis: answer?.analysis || null,
        answerInputMode: answer?.inputMode || null,
        pairedQuestionText: answer?.questionText || q.question || null,
        geminiEvaluation: answer?.geminiEvaluation || null,
      };
    });

    const proctoringLive = await getLiveProctoringWarnings(interview.id);

    res.json({
      success: true,
      data: {
        interview,
        session: {
          ...session,
          questions: questionsWithAnswers,
          overallEvaluation: safeJsonParse(session.overallEvaluation, null),
        },
        proctoringLive,
      },
    });
  } catch (error) {
    console.error('Error fetching interview session:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch interview session' });
  }
});

// Complete interview session (Company)
router.post('/:jobId/interviews/:applicationId/complete', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const applicationId = parseInt(req.params.applicationId);

    // Verify job belongs to company
    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId },
    });

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Get active interview session
    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      include: {
        sessions: {
          where: { status: { in: ['ACTIVE', 'STOPPED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!interview || interview.sessions.length === 0) {
      return res.status(404).json({ success: false, message: 'No active interview session found' });
    }

    const session = interview.sessions[0];
    const fullInterview = await prisma.interview.findUnique({
      where: { id: interview.id },
      include: {
        application: { include: { student: true } },
        job: true,
      },
    });

    if (!fullInterview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }

    // Evaluate transcript answers first so score is available immediately after completion.
    const persisted = await persistGeminiEvaluationForSession(
      prisma,
      session,
      fullInterview,
      fullInterview.job,
      fullInterview.application
    );

    let completedSession = session;
    if (persisted.ok && persisted.sessionRow) {
      completedSession = persisted.sessionRow;
    }

    // Update session to completed
    await prisma.interviewSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Update interview status
    await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: 'COMPLETED',
      },
    });

    const refreshed = await prisma.interviewSession.findUnique({
      where: { id: session.id },
    });
    const sessionForClient = mergeSessionQuestionsWithAnswers(refreshed || completedSession);

    res.json({
      success: true,
      data: {
        message: persisted.ok
          ? 'Interview completed and transcript evaluated'
          : process.env.GEMINI_API_KEY
            ? 'Interview completed. Evaluation could not be generated for this session.'
            : 'Interview completed. Set GEMINI_API_KEY to generate transcript score.',
        session: sessionForClient,
        overallEvaluation: sessionForClient?.overallEvaluation || undefined,
      },
    });
  } catch (error) {
    console.error('Error completing interview:', error);
    res.status(500).json({ success: false, message: 'Failed to complete interview' });
  }
});

function inferInterviewDecisionFromOverall(overall) {
  const verdict = String(overall?.verdict || '').toLowerCase();
  const recommendation = String(overall?.recommendation || '').toLowerCase();
  const rationale = String(overall?.hiringRationale || '').toLowerCase();
  const summary = String(overall?.executiveSummary || '').toLowerCase();
  const score = Number(overall?.overallScore);
  const merged = `${recommendation} ${rationale} ${summary}`;

  if (['strong_fit', 'moderate_fit'].includes(verdict)) return 'select';
  if (['weak_fit', 'insufficient_signal'].includes(verdict)) return 'reject';
  if (/\b(hire|select|proceed|recommended|strong fit)\b/.test(merged)) return 'select';
  if (/\b(reject|not recommended|insufficient|weak fit|do not proceed)\b/.test(merged)) return 'reject';
  if (Number.isFinite(score)) return score >= 7 ? 'select' : 'reject';
  return 'reject';
}

router.post('/:jobId/interviews/:applicationId/decision', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const applicationId = parseInt(req.params.applicationId);
    const { decision } = req.body || {};
    const normalized = String(decision || '').toLowerCase();

    if (!['select', 'reject'].includes(normalized)) {
      return res.status(400).json({ success: false, message: 'Decision must be select or reject' });
    }

    const app = await prisma.application.findFirst({
      where: { id: applicationId, jobId },
      include: {
        job: true,
        student: true,
      },
    });

    if (!app || app.job?.companyId !== companyId) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      include: {
        sessions: {
          where: { status: { in: ['COMPLETED', 'STOPPED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!interview?.sessions?.length) {
      return res.status(400).json({ success: false, message: 'Complete the interview before making a decision' });
    }

    const newStatus = normalized === 'select' ? 'SELECTED' : 'INTERVIEW_FAILED';
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: newStatus,
        decisionReason:
          normalized === 'select'
            ? 'Selected after interview evaluation'
            : 'Rejected after interview evaluation',
      },
    });

    try {
      await prisma.notification.create({
        data: {
          studentId: app.studentId,
          title: normalized === 'select' ? 'Interview Selected' : 'Interview Result',
          message:
            normalized === 'select'
              ? `Congratulations! You have been selected for "${app.job?.title || 'this role'}".`
              : `Your interview for "${app.job?.title || 'this role'}" was not selected.`,
          applicationId: app.id,
          jobId,
        },
      });
    } catch (notifErr) {
      console.error('[Interview] decision notification failed:', notifErr);
    }

    return res.json({
      success: true,
      data: {
        applicationId,
        status: newStatus,
      },
      message: normalized === 'select' ? 'Candidate marked as SELECTED' : 'Candidate marked as INTERVIEW_FAILED',
    });
  } catch (error) {
    console.error('Error applying interview decision:', error);
    return res.status(500).json({ success: false, message: 'Failed to apply interview decision' });
  }
});

router.post('/:jobId/interviews/:applicationId/decision/ai', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.id;
    const jobId = parseInt(req.params.jobId);
    const applicationId = parseInt(req.params.applicationId);

    const app = await prisma.application.findFirst({
      where: { id: applicationId, jobId },
      include: {
        job: true,
        student: true,
      },
    });

    if (!app || app.job?.companyId !== companyId) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      include: {
        application: { include: { student: true } },
        job: true,
        sessions: {
          where: { status: { in: ['ACTIVE', 'STOPPED', 'COMPLETED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!interview?.sessions?.length) {
      return res.status(400).json({ success: false, message: 'No interview session found' });
    }

    let sessionRow = interview.sessions[0];
    let overall = safeJsonParse(sessionRow.overallEvaluation, null);

    if (!overall) {
      const persisted = await persistGeminiEvaluationForSession(
        prisma,
        sessionRow,
        interview,
        interview.job,
        interview.application
      );
      if (!persisted.ok) {
        return res.status(400).json({
          success: false,
          message: persisted.message || 'No answers to evaluate',
        });
      }
      sessionRow = persisted.sessionRow || sessionRow;
      overall = safeJsonParse(sessionRow.overallEvaluation, null);
    }

    if (!overall) {
      return res.status(400).json({
        success: false,
        message: 'AI evaluation is unavailable for this interview transcript',
      });
    }

    const aiDecision = inferInterviewDecisionFromOverall(overall);
    const newStatus = aiDecision === 'select' ? 'SELECTED' : 'INTERVIEW_FAILED';

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: newStatus,
        decisionReason:
          aiDecision === 'select'
            ? 'AI transcript evaluation recommended selection'
            : 'AI transcript evaluation recommended rejection',
      },
    });

    try {
      await prisma.notification.create({
        data: {
          studentId: app.studentId,
          title: aiDecision === 'select' ? 'Interview Selected' : 'Interview Result',
          message:
            aiDecision === 'select'
              ? `Congratulations! You have been selected for "${app.job?.title || 'this role'}".`
              : `Your interview for "${app.job?.title || 'this role'}" was not selected.`,
          applicationId: app.id,
          jobId,
        },
      });
    } catch (notifErr) {
      console.error('[Interview] AI decision notification failed:', notifErr);
    }

    return res.json({
      success: true,
      data: {
        applicationId,
        aiDecision,
        status: newStatus,
        overallEvaluation: overall,
      },
      message:
        aiDecision === 'select'
          ? 'AI decision: candidate selected'
          : 'AI decision: candidate rejected',
    });
  } catch (error) {
    console.error('Error applying AI interview decision:', error);
    return res.status(500).json({ success: false, message: 'Failed to apply AI decision' });
  }
});

// Text-to-speech for interview question (Student)
router.post(
  '/:jobId/interviews/:applicationId/tts',
  authenticateToken,
  authorizeStudent,
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const jobId = parseInt(req.params.jobId, 10);
      const applicationId = parseInt(req.params.applicationId, 10);
      const { text } = req.body || {};

      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ success: false, message: 'Text is required for TTS' });
      }
      const apiKey = stripEnvQuotes(process.env.ELEVENLABS_API_KEY);
      const voiceId = stripEnvQuotes(process.env.ELEVENLABS_VOICE_ID) || ELEVENLABS_VOICE_ID_DEFAULT;
      if (!apiKey) {
        return res.status(500).json({ success: false, message: 'ElevenLabs API key not configured' });
      }

      // Verify the application belongs to this student for the given job.
      const application = await prisma.application.findFirst({
        where: { id: applicationId, studentId, jobId },
        select: { id: true },
      });
      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const modelId = stripEnvQuotes(process.env.ELEVENLABS_MODEL_ID) || ELEVENLABS_MODEL_ID_DEFAULT;
      const outputFormat =
        stripEnvQuotes(process.env.ELEVENLABS_OUTPUT_FORMAT) || ELEVENLABS_OUTPUT_FORMAT_DEFAULT;
      const ttsPath = `${ELEVENLABS_API_BASE.replace(/\/$/, '')}/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
      const ttsUrl = `${ttsPath}?${new URLSearchParams({ output_format: outputFormat }).toString()}`;

      const ttsRes = await axios.post(
        ttsUrl,
        {
          text: text.trim().slice(0, 3000),
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          responseType: 'arraybuffer',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          timeout: 30000,
        }
      );

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(Buffer.from(ttsRes.data));
    } catch (error) {
      const body = parseElevenLabsErrorBody(error);
      const detail = body?.detail;
      const d = typeof detail === 'object' && detail !== null ? detail : {};
      const logMsg = Buffer.isBuffer(error.response?.data)
        ? error.response.data.toString('utf8')
        : JSON.stringify(body?.detail || body || error.message);
      console.error('Error generating ElevenLabs TTS:', logMsg);

      if (d.code === 'paid_plan_required' || d.type === 'payment_required') {
        return res.status(402).json({
          success: false,
          code: 'paid_plan_required',
          message:
            'ElevenLabs free accounts cannot use premade library voices through the API. Fix one of: (1) Add ELEVENLABS_VOICE_ID to .env with a voice ID from ElevenLabs → Voices → a voice you created (Voice Design / your workspace, not the public library), then restart the server; or (2) Upgrade your ElevenLabs plan so API access to library voices is allowed.',
        });
      }

      const providerMessage =
        typeof d.message === 'string'
          ? d.message
          : typeof body?.message === 'string'
            ? body.message
            : typeof body?.raw === 'string'
              ? body.raw
              : error.message;
      return res.status(500).json({
        success: false,
        message: providerMessage || 'Failed to generate speech',
      });
    }
  }
);

// Voice Agent: short-lived browser token + Settings JSON (never expose DEEPGRAM_API_KEY to the client)
router.get(
  '/:jobId/interviews/:applicationId/voice-agent-config',
  authenticateToken,
  authorizeStudent,
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const jobId = parseInt(req.params.jobId, 10);
      const applicationId = parseInt(req.params.applicationId, 10);
      const apiKey = stripEnvQuotes(process.env.DEEPGRAM_API_KEY);
      if (!apiKey) {
        return res.status(500).json({ success: false, message: 'Deepgram API key not configured' });
      }
      const application = await prisma.application.findFirst({
        where: { id: applicationId, studentId, jobId },
        include: { student: true, job: true },
      });
      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }
      const job = application.job;
      const student = application.student;

      const interviewRec = await prisma.interview.findUnique({
        where: { applicationId },
        include: {
          sessions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
      const mode = interviewRec?.sessions?.[0]?.mode || 'TECH';

      let requiredSkills = [];
      if (job?.requiredSkills) {
        try {
          requiredSkills =
            typeof job.requiredSkills === 'string' ? JSON.parse(job.requiredSkills) : job.requiredSkills;
          if (!Array.isArray(requiredSkills)) {
            requiredSkills = requiredSkills ? [requiredSkills] : [];
          }
        } catch (e) {
          requiredSkills = [job.requiredSkills];
        }
      }
      const requiredSkillsText = requiredSkills.length ? requiredSkills.join(', ') : 'See job description';

      let candidateSkillsText = 'Not specified';
      if (application.skills) {
        try {
          const cs =
            typeof application.skills === 'string' ? JSON.parse(application.skills) : application.skills;
          candidateSkillsText = Array.isArray(cs) ? cs.join(', ') : String(cs);
        } catch {
          candidateSkillsText = String(application.skills);
        }
      }

      const resumeExcerpt = extractResumeExcerpt(application, student);
      const candidateDisplayName = normalizeCandidateDisplayName(student?.name) || 'Candidate';
      const candidateProfile = `${candidateDisplayName} — CGPA: ${application.cgpa ?? 'N/A'}, Backlogs: ${application.backlog ?? 0}`;

      const client = new DeepgramClient({ apiKey });
      const created = await client.auth.v1.tokens.grant();
      const token = created?.access_token;
      if (!token) {
        return res.status(500).json({ success: false, message: 'Could not create Voice Agent token' });
      }

      const maxVoiceAnswers = getVoiceAgentMaxAnswers();
      const settings = mergeJobContextIntoAgentSettings(getDeepgramAgentSettings(), {
        mode,
        jobTitle: job?.title || 'Role',
        jobDescription: job?.description || '',
        requiredSkillsText,
        candidateName: candidateDisplayName,
        candidateProfile,
        candidateSkillsText,
        resumeExcerpt,
        maxInterviewAnswers: maxVoiceAnswers,
      });

      return res.json({
        success: true,
        data: {
          token,
          settings,
          webSocketUrl: DEEPGRAM_AGENT_WS_URL,
          maxVoiceAnswers,
        },
      });
    } catch (err) {
      console.error('[Interview] voice-agent-config:', err);
      const errMsg = err?.body?.err_msg || err?.message || '';
      if (err?.statusCode === 400 && /invalid credentials|credential/i.test(String(errMsg))) {
        return res.status(400).json({
          success: false,
          code: 'deepgram_invalid_key',
          message:
            'Deepgram rejected the API key (invalid credentials). Set DEEPGRAM_API_KEY to your project secret key and restart the server.',
        });
      }
      if (err?.statusCode === 403) {
        return res.status(403).json({
          success: false,
          code: 'deepgram_forbidden',
          message:
            'Deepgram token grant is forbidden for this API key. Use a key with permission to create browser tokens.',
        });
      }
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to load Voice Agent config',
      });
    }
  }
);

/** --- AI Proctoring (JPEG snapshots metadata only — no video stored) ---------------------------- */

const PROCTOR_TYPES = new Set([
  'NO_FACE',
  'MULTIPLE_FACES',
  'LOOKING_AWAY',
  'PHONE_DETECTED',
  'TAB_SWITCH',
  'EXIT_FULLSCREEN',
  'COPY_PASTE',
]);

const PROCTOR_WEIGHTS = {
  NO_FACE: 4,
  MULTIPLE_FACES: 12,
  LOOKING_AWAY: 6,
  PHONE_DETECTED: 15,
  TAB_SWITCH: 8,
  EXIT_FULLSCREEN: 5,
  COPY_PASTE: 10,
};

function computeProctorAggregate(violations) {
  const counts = {};
  for (const v of violations) {
    counts[v.type] = (counts[v.type] || 0) + 1;
  }
  let penalty = 0;
  for (const [type, n] of Object.entries(counts)) {
    const w = PROCTOR_WEIGHTS[type] ?? 5;
    penalty += Math.min(n * w, w * 8);
  }
  const score = Math.round(Math.max(0, Math.min(100, 100 - penalty)) * 100) / 100;
  return { score, counts, penaltyTotal: penalty };
}

async function getLiveProctoringWarnings(interviewId) {
  const focusedTypes = ['PHONE_DETECTED', 'MULTIPLE_FACES'];
  const recent = await prisma.interviewProctorViolation.findMany({
    where: {
      interviewId,
      type: { in: focusedTypes },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      type: true,
      createdAt: true,
      metadata: true,
    },
  });

  const [phoneDetectedCount, multipleFacesCount] = await Promise.all([
    prisma.interviewProctorViolation.count({
      where: { interviewId, type: 'PHONE_DETECTED' },
    }),
    prisma.interviewProctorViolation.count({
      where: { interviewId, type: 'MULTIPLE_FACES' },
    }),
  ]);

  return {
    counts: {
      PHONE_DETECTED: phoneDetectedCount,
      MULTIPLE_FACES: multipleFacesCount,
    },
    recent: recent.map((r) => ({
      type: r.type,
      createdAt: r.createdAt,
      metadata: safeJsonParse(r.metadata, r.metadata || null),
    })),
  };
}

router.post(
  '/:jobId/interviews/:applicationId/proctoring/violation',
  authenticateToken,
  authorizeStudent,
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const jobId = parseInt(req.params.jobId, 10);
      const applicationId = parseInt(req.params.applicationId, 10);
      const { type, clientTimestamp, metadata } = req.body || {};

      if (!type || !PROCTOR_TYPES.has(String(type))) {
        return res.status(400).json({ success: false, message: 'Invalid violation type' });
      }

      const application = await prisma.application.findFirst({
        where: { id: applicationId, studentId, jobId },
      });
      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const interview = await prisma.interview.findUnique({
        where: { applicationId },
        include: {
          sessions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!interview?.sessions?.length) {
        return res.status(400).json({
          success: false,
          message: 'No active interview session — start the interview before proctoring can log violations.',
        });
      }

      let metaStr = null;
      try {
        const payload = {};
        if (clientTimestamp != null) payload.clientTimestamp = clientTimestamp;
        if (metadata != null && typeof metadata === 'object') Object.assign(payload, metadata);
        if (typeof metadata === 'string') metaStr = metadata;
        else if (Object.keys(payload).length) metaStr = JSON.stringify(payload);
      } catch (_) {
        metaStr = null;
      }

      await prisma.interviewProctorViolation.create({
        data: {
          interviewId: interview.id,
          studentId,
          type: String(type),
          metadata: metaStr,
        },
      });

      res.json({ success: true });
    } catch (e) {
      console.error('[Interview] proctoring violation:', e);
      res.status(500).json({ success: false, message: 'Failed to record violation' });
    }
  }
);

router.post(
  '/:jobId/interviews/:applicationId/proctoring/reset',
  authenticateToken,
  authorizeStudent,
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const jobId = parseInt(req.params.jobId, 10);
      const applicationId = parseInt(req.params.applicationId, 10);

      const application = await prisma.application.findFirst({
        where: { id: applicationId, studentId, jobId },
      });
      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const interview = await prisma.interview.findUnique({
        where: { applicationId },
      });
      if (!interview) {
        return res.status(404).json({ success: false, message: 'Interview not found' });
      }

      await prisma.interviewProctorViolation.deleteMany({
        where: { interviewId: interview.id, studentId },
      });

      res.json({ success: true, message: 'Proctoring counters reset' });
    } catch (e) {
      console.error('[Interview] proctoring reset:', e);
      res.status(500).json({ success: false, message: 'Failed to reset proctoring counters' });
    }
  }
);

router.post(
  '/:jobId/interviews/:applicationId/proctoring/finalize',
  authenticateToken,
  authorizeStudent,
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const jobId = parseInt(req.params.jobId, 10);
      const applicationId = parseInt(req.params.applicationId, 10);

      const application = await prisma.application.findFirst({
        where: { id: applicationId, studentId, jobId },
      });
      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const interview = await prisma.interview.findUnique({
        where: { applicationId },
        include: {
          sessions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      if (!interview?.sessions?.length) {
        return res.status(404).json({ success: false, message: 'No interview session found' });
      }

      const violations = await prisma.interviewProctorViolation.findMany({
        where: { interviewId: interview.id, studentId },
      });
      const agg = computeProctorAggregate(violations);
      const summary = JSON.stringify({
        counts: agg.counts,
        penaltyTotal: agg.penaltyTotal,
        score: agg.score,
        finalizedAt: new Date().toISOString(),
      });

      await prisma.interviewSession.update({
        where: { id: interview.sessions[0].id },
        data: {
          proctoringScore: agg.score,
          proctoringSummary: summary,
        },
      });

      res.json({
        success: true,
        data: {
          score: agg.score,
          counts: agg.counts,
          penaltyTotal: agg.penaltyTotal,
        },
      });
    } catch (e) {
      console.error('[Interview] proctoring finalize:', e);
      res.status(500).json({ success: false, message: 'Failed to finalize proctoring' });
    }
  }
);

export default router;
