import express from 'express';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import { authenticateToken, authorizeCompany, authorizeStudent } from '../middleware/auth.js';
import {
  activeGDs,
  advanceSpeaker,
  broadcastDeepgramOutput,
  clearGdFloorIdleTimer,
  transitionPrepToActiveIfElapsed,
} from '../lib/socket.js';
import { DeepgramClient } from '@deepgram/sdk';
import { evaluateGdConversationGemini } from '../lib/gemini.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });


function stripEnvQuotes(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function getRoomSummary(state) {
  const invitedCount = Array.isArray(state?.invitedStudentIds) ? state.invitedStudentIds.length : 0;
  const joinedCount = Array.isArray(state?.joinedStudentIds) ? state.joinedStudentIds.length : 0;
  const allJoined = invitedCount > 0 && joinedCount >= invitedCount;
  return {
    invitedCount,
    joinedCount,
    allJoined,
    canStart: allJoined && joinedCount >= 3,
  };
}

async function buildConversationForJob(jobId) {
  const gdDb = await prisma.groupDiscussion.findUnique({
    where: { jobId },
    select: { id: true, topic: true, status: true },
  });
  if (!gdDb) return null;
  const rows = await prisma.groupDiscussionParticipant.findMany({
    where: { gdId: gdDb.id },
    orderBy: { createdAt: 'asc' },
    select: {
      studentId: true,
      transcribedText: true,
      createdAt: true,
      student: { select: { id: true, name: true } },
    },
  });
  let turns = rows
    .map((r) => ({
      studentId: Number(r.studentId),
      name: r.student?.name || `Student ${r.studentId}`,
      text: String(r.transcribedText || '').trim(),
      timestamp: r.createdAt,
    }))
    .filter((t) => t.text.length > 0);
  // Fallback to in-memory transcript if DB has no turns (e.g., transient DB issues during live run)
  if (turns.length === 0) {
    const mem = activeGDs.get(jobId);
    if (Array.isArray(mem?.transcriptTurns) && mem.transcriptTurns.length > 0) {
      turns = mem.transcriptTurns
        .map((t) => ({
          studentId: Number(t.studentId),
          name: t.name || `Student ${t.studentId}`,
          text: String(t.text || '').trim(),
          timestamp: t.timestamp || null,
        }))
        .filter((t) => Number.isFinite(t.studentId) && t.text.length > 0);
    }
  }

  const participantsById = new Map();
  for (const t of turns) {
    if (!participantsById.has(t.studentId)) {
      participantsById.set(t.studentId, { studentId: t.studentId, name: t.name });
    }
  }
  return {
    gdId: gdDb.id,
    topic: gdDb.topic || '',
    status: gdDb.status || 'CREATED',
    turns,
    participants: Array.from(participantsById.values()),
  };
}

// Company: Initialize GD room + notify selected candidates (no timer yet)
router.post('/:jobId/gd/initialize', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const { topic, prepDuration } = req.body;
    const selectedStudentIds = Array.isArray(req.body?.selectedStudentIds)
      ? [...new Set(req.body.selectedStudentIds.map((v) => Number(v)).filter(Boolean))]
      : [];

    if (!topic || !String(topic).trim()) {
      return res.status(400).json({ success: false, message: 'Topic is required' });
    }
    if (selectedStudentIds.length < 3) {
      return res.status(400).json({ success: false, message: 'Minimum 3 candidates are required to initialize GD' });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }

    const codingRow = await prisma.codingTest.findUnique({
      where: { jobId },
      select: { status: true },
    });
    const codingRoundDone =
      !!job.pipelineCodingDone || codingRow?.status === 'STOPPED';
    if (!codingRoundDone) {
      return res.status(400).json({
        success: false,
        message: 'Complete or skip the Coding Test stage before initializing Group Discussion.',
      });
    }

    let gd = await prisma.groupDiscussion.findUnique({ where: { jobId } });
    if (!gd) {
      gd = await prisma.groupDiscussion.create({
        data: {
          jobId,
          topic: String(topic).trim(),
          prepDuration: parseInt(prepDuration) || 120,
          // Keep DB status compatible with existing persisted values.
          status: 'CREATED',
          prepStartedAt: null,
        }
      });
    } else {
      gd = await prisma.groupDiscussion.update({
        where: { jobId },
        data: {
          topic: String(topic).trim(),
          prepDuration: parseInt(prepDuration) || 120,
          // Keep DB status compatible with existing persisted values.
          status: 'CREATED',
          prepStartedAt: null,
          startedAt: null,
        }
      });
    }

    const existing = activeGDs.get(jobId);
    const oldJoinedIds = Array.isArray(existing?.joinedStudentIds) ? existing.joinedStudentIds : [];
    const oldJoinedParticipants = Array.isArray(existing?.joinedParticipants) ? existing.joinedParticipants : [];
    const joinedStudentIds = oldJoinedIds.filter((id) => selectedStudentIds.includes(Number(id)));

    // Initialize in-memory room in lobby mode
    const state = {
      status: 'LOBBY',
      queue: existing?.queue || [],
      transcriptTurns: [],
      activeSpeaker: null,
      prepEndTime: null,
      topic: gd.topic,
      prepDuration: gd.prepDuration,
      invitedStudentIds: selectedStudentIds,
      joinedStudentIds,
      joinedParticipants: oldJoinedParticipants.filter((p) => selectedStudentIds.includes(Number(p.studentId))),
      micHot: null,
      discussionStartedAt: null,
      floorGrantedAt: null,
    };
    activeGDs.set(jobId, state);

    // Notify selected candidates to join room
    const applications = await prisma.application.findMany({
      where: { jobId, studentId: { in: selectedStudentIds } },
      select: { id: true, studentId: true },
    });
    for (const app of applications) {
      await prisma.notification.create({
        data: {
          studentId: app.studentId,
          title: 'Group Discussion Room Open',
          message: `GD room for "${job.title}" is initialized. Join now and wait in the lobby until the recruiter starts.`,
          jobId,
          applicationId: app.id,
        }
      });
    }

    if (req.io) {
      req.io.to(`gd_${jobId}`).emit('gd_state_update', state);
      req.io.to(`gd_${jobId}`).emit('gd_room_update', {
        ...getRoomSummary(state),
        joinedParticipants: state.joinedParticipants || [],
      });
    }

    res.json({
      success: true,
      message: `GD initialized. ${applications.length} candidates notified.`,
      data: {
        gd,
        room: {
          ...getRoomSummary(state),
          joinedParticipants: state.joinedParticipants || [],
        },
      },
    });
  } catch (error) {
    console.error('Error initializing GD:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to initialize GD' });
  }
});

// Company: Start GD timer (after everyone joined)
router.post('/:jobId/gd/start', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const io = req.io;
    const state = activeGDs.get(jobId);
    if (!state) return res.status(400).json({ success: false, message: 'Initialize GD first' });

    const room = getRoomSummary(state);
    if (room.joinedCount < 3) {
      return res.status(400).json({ success: false, message: 'Minimum 3 joined candidates required to start GD', data: room });
    }
    if (!room.allJoined) {
      return res.status(400).json({ success: false, message: 'All invited candidates must join before starting GD', data: room });
    }

    const prepDuration = Number(state.prepDuration || req.body?.prepDuration || 120);
    const prepStartedAt = new Date();
    const prepEndTime = prepStartedAt.getTime() + prepDuration * 1000;

    state.status = 'PREP';
    state.prepEndTime = prepEndTime;
    state.transcriptTurns = [];
    state.queue = Array.isArray(state.queue) ? state.queue : [];
    state.activeSpeaker = null;
    state.micHot = null;
    state.discussionStartedAt = null;
    state.floorGrantedAt = null;
    clearGdFloorIdleTimer(jobId);

    await prisma.groupDiscussion.update({
      where: { jobId },
      data: { status: 'PREP', prepStartedAt, prepDuration },
    });

    io?.to(`gd_${jobId}`).emit('gd_state_update', state);

    setTimeout(() => {
      void transitionPrepToActiveIfElapsed(jobId, io);
    }, prepDuration * 1000);

    res.json({ success: true, message: 'GD started', data: { room, status: 'PREP', prepEndTime } });
  } catch (error) {
    console.error('Error starting GD:', error);
    res.status(500).json({ success: false, message: 'Failed to start GD' });
  }
});

// Company: Stop GD
router.post('/:jobId/gd/stop', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    
    await prisma.groupDiscussion.update({ where: { jobId }, data: { status: 'COMPLETED' } });
    await prisma.job.update({
      where: { id: jobId },
      data: { pipelineGdDone: true },
    });
    
    const gdState = activeGDs.get(jobId);
    if (gdState) {
      clearGdFloorIdleTimer(jobId);
      gdState.status = 'COMPLETED';
      gdState.activeSpeaker = null;
      gdState.transcriptTurns = [];
      gdState.queue = [];
      gdState.prepEndTime = null;
      gdState.micHot = null;
      gdState.discussionStartedAt = null;
      gdState.floorGrantedAt = null;
      if (req.io) req.io.to(`gd_${jobId}`).emit('gd_state_update', gdState);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error stopping GD:', error);
    res.status(500).json({ success: false, message: 'Failed to stop GD' });
  }
});

// Company: Pause GD
router.post('/:jobId/gd/pause', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    await prisma.groupDiscussion.update({ where: { jobId }, data: { status: 'PAUSED' } });
    
    const gdState = activeGDs.get(jobId);
    if (gdState && gdState.status === 'ACTIVE') {
      clearGdFloorIdleTimer(jobId);
      gdState.status = 'PAUSED';
      gdState.micHot = null;
      if (req.io) req.io.to(`gd_${jobId}`).emit('gd_state_update', gdState);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error pausing GD:', error);
    res.status(500).json({ success: false, message: 'Failed to pause GD' });
  }
});

// Company: Resume GD
router.post('/:jobId/gd/resume', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    await prisma.groupDiscussion.update({ where: { jobId }, data: { status: 'ACTIVE' } });
    
    const gdState = activeGDs.get(jobId);
    if (gdState && gdState.status === 'PAUSED') {
      gdState.status = 'ACTIVE';
      if (req.io) req.io.to(`gd_${jobId}`).emit('gd_state_update', gdState);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error resuming GD:', error);
    res.status(500).json({ success: false, message: 'Failed to resume GD' });
  }
});

// Student: Transcribe Audio using Deepgram
router.post('/:jobId/gd/transcribe-audio', authenticateToken, authorizeStudent, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    const apiKey = stripEnvQuotes(process.env.DEEPGRAM_API_KEY);
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'Deepgram API key not configured' });
    }

    const client = new DeepgramClient({ apiKey });
    // @deepgram/sdk v5: prerecorded API → listen.v1.media.transcribeFile(uploadable, queryOptions)
    const data = await client.listen.v1.media.transcribeFile(req.file.buffer, {
      model: 'nova-2',
      smart_format: true,
    });

    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    res.json({ success: true, text: transcript });
  } catch (error) {
    console.error('Error transcribing audio:', error);
    const detail =
      (typeof error?.body === 'string' && error.body) ||
      error?.body?.err_msg ||
      error?.body?.message ||
      error?.message ||
      'Failed to transcribe audio';
    res.status(500).json({ success: false, message: detail, error: error.message });
  }
});

// Student: Submit Audio (Speech to Text) or Manual Text Array
router.post('/:jobId/gd/submit-speech', authenticateToken, authorizeStudent, express.json(), async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const studentId = req.user.id;
    const { text } = req.body;

    let transcribedText = text || '';

    // If perfectly empty string, we can just jump skips
    if (!transcribedText.trim()) {
      advanceSpeaker(jobId, req.io);
      return res.json({ success: true, message: 'Skipped - no audio/text passed' });
    }

    // Save to DB
    const gdDb = await prisma.groupDiscussion.findUnique({ where: { jobId } });
    if (!gdDb) throw new Error('GD not found');

    const studentRecord = await prisma.student.findUnique({ where: { id: studentId }});
    const finalSpeakerName = studentRecord?.name || req.user.name || 'Student';

    try {
      await prisma.groupDiscussionParticipant.create({
        data: {
          gdId: gdDb.id,
          studentId,
          status: 'SPEAKING_DONE',
          transcribedText,
        }
      });
    } catch (persistErr) {
      // Keep the live session flowing even if DB write momentarily fails.
      console.error('[GD] submit-speech DB save failed:', persistErr?.message || persistErr);
    }

    const mem = activeGDs.get(jobId);
    if (mem) {
      if (!Array.isArray(mem.transcriptTurns)) mem.transcriptTurns = [];
      mem.transcriptTurns.push({
        studentId,
        name: finalSpeakerName,
        text: transcribedText,
        timestamp: new Date().toISOString(),
      });
    }

    // Broadcast output heavily
    broadcastDeepgramOutput(jobId, req.io, {
      studentId,
      name: finalSpeakerName,
      text: transcribedText,
      timestamp: new Date().toISOString()
    });

    // Advance queue
    advanceSpeaker(jobId, req.io);

    res.json({ success: true, text: transcribedText, broadcastedTo: `gd_${jobId}` });
  } catch (error) {
    console.error('------- SUBMIT SPEECH ERROR -------');
    console.error(error);
    console.error('-----------------------------------');
    res.status(500).json({ success: false, message: 'Failed to submit voice payload', error: error.message });
  }
});

// Company: Manual override to next in queue
router.post('/:jobId/gd/next-speaker', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    advanceSpeaker(jobId, req.io);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to advance speaker' });
  }
});

// Company: Evaluate GD Results
router.post('/:jobId/gd/evaluate', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    const { evaluations, finalizePipeline } = req.body; // Array of { applicationId, status }; finalizePipeline defaults true
    const shouldFinalizePipeline = finalizePipeline !== false;

    if (!Array.isArray(evaluations)) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
    if (!job || job.companyId !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }

    const normalized = evaluations
      .map((e) => ({
        applicationId: Number(e?.applicationId),
        status: String(e?.status || '').toUpperCase(),
      }))
      .filter((e) => Number.isFinite(e.applicationId) && ['GD_PASSED', 'GD_FAILED'].includes(e.status));
    if (normalized.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid evaluations provided' });
    }

    for (const evalObj of normalized) {
      await prisma.application.updateMany({
        where: { id: evalObj.applicationId, jobId },
        data: {
          status: evalObj.status,
          decisionReason:
            evalObj.status === 'GD_PASSED'
              ? 'Passed Group Discussion by recruiter evaluation'
              : 'Did not clear Group Discussion by recruiter evaluation',
        },
      });
    }

    if (shouldFinalizePipeline) {
      await prisma.job.update({
        where: { id: jobId },
        data: { pipelineGdDone: true },
      });
    }

    res.json({
      success: true,
      data: { updatedCount: normalized.length, finalized: shouldFinalizePipeline },
    });
  } catch (error) {
    console.error('Error evaluating GD:', error);
    res.status(500).json({ success: false, message: 'Failed to save evaluations' });
  }
});

// Company: View full saved GD conversation (from DB transcripts)
router.get('/:jobId/gd/conversation', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
    if (!job || job.companyId !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }
    const convo = await buildConversationForJob(jobId);
    if (!convo) return res.status(404).json({ success: false, message: 'GD not found' });
    res.json({
      success: true,
      data: {
        topic: convo.topic,
        status: convo.status,
        participants: convo.participants,
        turns: convo.turns,
      },
    });
  } catch (error) {
    console.error('Error loading GD conversation:', error);
    res.status(500).json({ success: false, message: 'Failed to load GD conversation' });
  }
});

// Company: AI evaluate GD transcript and rank participants
router.post('/:jobId/gd/ai-evaluate', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
    if (!job || job.companyId !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Job not found or access denied' });
    }
    const convo = await buildConversationForJob(jobId);
    if (!convo) return res.status(404).json({ success: false, message: 'GD not found' });
    if (!convo.turns.length) {
      return res.status(400).json({ success: false, message: 'No transcript content available to evaluate' });
    }

    const ai = await evaluateGdConversationGemini({
      topic: convo.topic,
      participants: convo.participants,
      turns: convo.turns,
    });
    let rankings = Array.isArray(ai?.rankings) ? ai.rankings : [];
    let source = 'gemini';
    if (!rankings.length) {
      // Fallback: deterministic ranking from transcript volume + turn frequency.
      const agg = new Map();
      for (const t of convo.turns) {
        const sid = Number(t.studentId);
        if (!Number.isFinite(sid)) continue;
        const words = String(t.text || '').trim().split(/\s+/).filter(Boolean).length;
        const row = agg.get(sid) || {
          studentId: sid,
          turns: 0,
          words: 0,
        };
        row.turns += 1;
        row.words += words;
        agg.set(sid, row);
      }
      rankings = Array.from(agg.values())
        .map((r) => ({
          studentId: r.studentId,
          score: Math.min(10, Math.max(1, Math.round((r.words / Math.max(1, r.turns)) / 8 + r.turns / 2))),
          rank: 999,
          reason: 'Fallback ranking from participation volume (AI output unavailable).',
          strengths: ['Participated in discussion'],
          improvements: ['Use AI evaluation after Gemini/API recovery for quality-based ranking'],
        }))
        .sort((a, b) => b.score - a.score)
        .map((r, idx) => ({ ...r, rank: idx + 1 }));
      source = 'fallback';
    }

    const applications = await prisma.application.findMany({
      where: { jobId },
      select: { id: true, studentId: true },
    });
    const appByStudentId = new Map(applications.map((a) => [Number(a.studentId), a.id]));
    const recommendations = rankings
      .map((r) => ({
        studentId: r.studentId,
        applicationId: appByStudentId.get(Number(r.studentId)) || null,
        suggestedStatus: r.score >= 7 ? 'GD_PASSED' : 'GD_FAILED',
        ...r,
      }))
      .filter((r) => Number.isFinite(Number(r.studentId)));

    res.json({
      success: true,
      data: {
        topic: convo.topic,
        participants: convo.participants,
        rankings: recommendations,
        source,
      },
    });
  } catch (error) {
    console.error('Error running AI GD evaluation:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to evaluate GD with AI' });
  }
});

// Debug endpoint for Active GDs
router.get('/debug-gds', (req, res) => {
  const io = req.io;
  const rooms = {};
  if (io) {
    for (const [id, room] of io.sockets.adapter.rooms.entries()) {
      rooms[id] = Array.from(room); // array of socket ids
    }
  }
  
  const gdsObj = {};
  for (const [key, val] of activeGDs.entries()) {
    gdsObj[key] = val;
  }
  
  res.json({
    success: true,
    activeGDs: gdsObj,
    rooms,
  });
});

// VERY IMPORTANT DEBUG ENDPOINT TO VERIFY SOCKET BROADCASTS
router.get('/debug-force-emit', (req, res) => {
  if (req.io) {
    req.io.to('gd_1').emit('gd_speaker_transcript', {
       studentId: 999,
       name: 'TEST BROADCAST SYSTEM',
       text: 'This is a forced test broadcast from the backend. If you see this, Sockets are perfectly working across devices.',
       timestamp: new Date().toISOString()
    });
    res.json({ success: true, message: "Emitted successfully to gd_1" });
  } else {
    res.json({ success: false, message: "req.io not found" });
  }
});

export default router;
