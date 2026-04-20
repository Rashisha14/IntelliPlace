import prisma from './prisma.js';

// Setup global state for GDs
export const activeGDs = new Map();

export default function setupGDSockets(io) {
  io.on('connection', (socket) => {
    console.log('[Socket] User connected:', socket.id);

    socket.on('join_gd', async ({ jobId, userId, role }) => {
      const parsedJobId = parseInt(jobId);
      socket.join(`gd_${parsedJobId}`);
      console.log(`[Socket] ${role} ${userId} joined room gd_${parsedJobId}`);

      if (!activeGDs.has(parsedJobId)) {
        // Fetch from DB if missing in memory (e.g. after server restart)
        try {
          const gdDb = await prisma.groupDiscussion.findUnique({ where: { jobId: parsedJobId } });
          if (gdDb) {
            const prepEndTime = gdDb.prepStartedAt ? new Date(gdDb.prepStartedAt).getTime() + (gdDb.prepDuration * 1000) : null;
            activeGDs.set(parsedJobId, {
              status: gdDb.status,
              queue: [],
              activeSpeaker: null,
              prepEndTime,
              topic: gdDb.topic,
            });
          } else {
            activeGDs.set(parsedJobId, {
              status: 'CREATED',
              queue: [],
              activeSpeaker: null,
              prepEndTime: null,
            });
          }
        } catch (e) {
          console.error("Error fetching GD from DB on join:", e);
        }
      }

      // Send current state
      socket.emit('gd_state_update', activeGDs.get(parsedJobId));
    });

    socket.on('request_speak', ({ jobId, studentId, studentName }) => {
      const parsedJobId = parseInt(jobId);
      const gd = activeGDs.get(parsedJobId);
      if (!gd) return;
      
      // Allow multiple queue entries if they aren't back-to-back?
      // For now, allow simple push as requested ("multiple time" allowed)
      gd.queue.push({ studentId, name: studentName });
      
      // If nobody is speaking and status is ACTIVE, auto-assign
      if (!gd.activeSpeaker && gd.status === 'ACTIVE' && gd.queue.length > 0) {
        advanceSpeaker(parsedJobId, io);
      } else {
        io.to(`gd_${parsedJobId}`).emit('gd_state_update', gd);
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
