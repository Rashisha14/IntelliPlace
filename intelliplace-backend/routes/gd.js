import express from 'express';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import { authenticateToken, authorizeCompany, authorizeStudent } from '../middleware/auth.js';
import { activeGDs, advanceSpeaker, broadcastDeepgramOutput } from '../lib/socket.js';
import { DeepgramClient } from '@deepgram/sdk';

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

// Company: Start or create GD
router.post('/:jobId/gd/start', authenticateToken, authorizeCompany, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const { topic, prepDuration } = req.body;

    let gd = await prisma.groupDiscussion.findUnique({ where: { jobId } });
    if (!gd) {
      gd = await prisma.groupDiscussion.create({
        data: {
          jobId,
          topic,
          prepDuration: parseInt(prepDuration) || 120,
          status: 'PREP',
          prepStartedAt: new Date(),
        }
      });
    } else {
      gd = await prisma.groupDiscussion.update({
        where: { jobId },
        data: {
          topic,
          prepDuration: parseInt(prepDuration) || 120,
          status: 'PREP',
          prepStartedAt: new Date(),
        }
      });
    }

    // Initialize in-memory state
    const prepEndTime = new Date(gd.prepStartedAt.getTime() + gd.prepDuration * 1000);
    const state = {
      status: 'PREP',
      queue: [],
      activeSpeaker: null,
      prepEndTime: prepEndTime.getTime(),
      topic: gd.topic,
    };
    activeGDs.set(jobId, state);

    if (req.io) {
      req.io.to(`gd_${jobId}`).emit('gd_state_update', state);
    }

    const io = req.io;

    // Auto-advance to ACTIVE state when prep ends
    setTimeout(async () => {
      const liveState = activeGDs.get(jobId);
      if (liveState && liveState.status === 'PREP') {
        liveState.status = 'ACTIVE';
        await prisma.groupDiscussion.update({ where: { jobId }, data: { status: 'ACTIVE', startedAt: new Date() } });
        io.to(`gd_${jobId}`).emit('gd_state_update', liveState);
      }
    }, gd.prepDuration * 1000);

    res.json({ success: true, data: gd });
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
    
    const gdState = activeGDs.get(jobId);
    if (gdState) {
      gdState.status = 'COMPLETED';
      gdState.activeSpeaker = null;
      gdState.queue = [];
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
      gdState.status = 'PAUSED';
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
    const { result, error } = await client.listen.prerecorded.transcribeFile(
      req.file.buffer,
      { model: 'nova-2', smart_format: true }
    );

    if (error) throw error;

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    res.json({ success: true, text: transcript });
  } catch (error) {
    console.error('Error transcribing audio:', error);
    res.status(500).json({ success: false, message: 'Failed to transcribe audio', error: error.message });
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

    const participant = await prisma.groupDiscussionParticipant.create({
      data: {
        gdId: gdDb.id,
        studentId,
        status: 'SPEAKING_DONE',
        transcribedText,
      }
    });

    const studentRecord = await prisma.student.findUnique({ where: { id: studentId }});
    const finalSpeakerName = studentRecord?.name || req.user.name || 'Student';

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
    const jobId = parseInt(req.params.jobId);
    const { evaluations } = req.body; // Array of { applicationId, status: 'GD_PASSED' | 'GD_FAILED' }

    if (!Array.isArray(evaluations)) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    for (const evalObj of evaluations) {
      await prisma.application.update({
        where: { id: evalObj.applicationId },
        data: { status: evalObj.status }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error evaluating GD:', error);
    res.status(500).json({ success: false, message: 'Failed to save evaluations' });
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
