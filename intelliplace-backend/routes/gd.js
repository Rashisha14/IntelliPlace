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

    // Auto-advance to ACTIVE state when prep ends
    setTimeout(async () => {
      const liveState = activeGDs.get(jobId);
      if (liveState && liveState.status === 'PREP') {
        liveState.status = 'ACTIVE';
        await prisma.groupDiscussion.update({ where: { jobId }, data: { status: 'ACTIVE', startedAt: new Date() } });
        req.io.to(`gd_${jobId}`).emit('gd_state_update', liveState);
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

// Student: Submit Audio (Speech to Text)
router.post('/:jobId/gd/submit-speech', authenticateToken, authorizeStudent, upload.single('audio'), async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const studentId = req.user.id;
    const file = req.file;

    if (!file) {
      // Just step down if no audio (auto skip/silent)
      advanceSpeaker(jobId, req.io);
      return res.json({ success: true, message: 'Skipped' });
    }

    let transcribedText = '';
    
    // Deepgram STT
    if (process.env.DEEPGRAM_API_KEY) {
      try {
        const deepgram = new DeepgramClient({ apiKey: stripEnvQuotes(process.env.DEEPGRAM_API_KEY) });
        const dg = await deepgram.listen.v1.media.transcribeFile(file.buffer, {
          model: 'nova-3',
          smart_format: 'true',
          punctuate: 'true',
        });
        transcribedText = dg?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || '';
      } catch (err) {
        console.error('Deepgram conversion error:', err);
      }
    } else {
      transcribedText = '[Deepgram API Key not configured. Audio recorded but not transcribed.]';
    }

    // Save to DB
    const participant = await prisma.groupDiscussionParticipant.create({
      data: {
        gdId: (await prisma.groupDiscussion.findUnique({ where: { jobId } })).id,
        studentId,
        status: 'SPEAKING_DONE',
        transcribedText,
      }
    });

    // Broadcast output
    broadcastDeepgramOutput(jobId, req.io, {
      studentId,
      name: req.user.name || 'Student',
      text: transcribedText,
      timestamp: new Date().toISOString()
    });

    // Advance queue
    advanceSpeaker(jobId, req.io);

    res.json({ success: true, text: transcribedText });
  } catch (error) {
    console.error('Error submitting speech:', error);
    res.status(500).json({ success: false, message: 'Failed to submit speech' });
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

export default router;
