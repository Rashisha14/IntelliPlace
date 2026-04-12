import prisma from './prisma.js';

// Setup global state for GDs
export const activeGDs = new Map();

export default function setupGDSockets(io) {
  io.on('connection', (socket) => {
    console.log('[Socket] User connected:', socket.id);

    socket.on('join_gd', async ({ jobId, userId, role }) => {
      socket.join(`gd_${jobId}`);
      console.log(`[Socket] ${role} ${userId} joined room gd_${jobId}`);

      if (!activeGDs.has(jobId)) {
        activeGDs.set(jobId, {
          status: 'CREATED',
          queue: [], // array of { studentId, name }
          activeSpeaker: null,
          prepEndTime: null,
        });
      }

      // Send current state
      socket.emit('gd_state_update', activeGDs.get(jobId));
    });

    socket.on('request_speak', ({ jobId, studentId, studentName }) => {
      const gd = activeGDs.get(jobId);
      if (!gd) return;
      
      // Allow multiple queue entries if they aren't back-to-back?
      // For now, allow simple push as requested ("multiple time" allowed)
      gd.queue.push({ studentId, name: studentName });
      
      // If nobody is speaking and status is ACTIVE, auto-assign
      if (!gd.activeSpeaker && gd.status === 'ACTIVE' && gd.queue.length > 0) {
        advanceSpeaker(jobId, io);
      } else {
        io.to(`gd_${jobId}`).emit('gd_state_update', gd);
      }
    });

    socket.on('disconnect', () => {
      console.log('[Socket] User disconnected:', socket.id);
    });
  });
}

export function advanceSpeaker(jobId, io) {
  const gd = activeGDs.get(jobId);
  if (!gd) return;

  if (gd.queue.length > 0) {
    const next = gd.queue.shift();
    gd.activeSpeaker = next;
  } else {
    gd.activeSpeaker = null;
  }

  // Broadcast
  io.to(`gd_${jobId}`).emit('gd_state_update', gd);
}

export function broadcastDeepgramOutput(jobId, io, transcriptData) {
  io.to(`gd_${jobId}`).emit('gd_speaker_transcript', transcriptData);
}
