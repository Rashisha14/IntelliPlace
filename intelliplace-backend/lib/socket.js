import prisma from './prisma.js';

// Setup global state for GDs
export const activeGDs = new Map();

export default function setupGDSockets(io) {
  io.on('connection', (socket) => {
    console.log('[Socket] User connected:', socket.id);

    socket.on('join_gd', async ({ jobId, userId, role, userName }) => {
      const parsedJobId = parseInt(jobId);
      socket.join(`gd_${parsedJobId}`);
      console.log(`[Socket] ${role} ${userId} joined room gd_${parsedJobId}`);

      if (!activeGDs.has(parsedJobId)) {
        // Fetch from DB if missing in memory (e.g. after server restart)
        try {
          const gdDelegate = prisma?.groupDiscussion;
          if (!gdDelegate?.findUnique) {
            console.error(
              '[Socket] Prisma client has no groupDiscussion delegate. Run: cd intelliplace-backend && npx prisma generate'
            );
            activeGDs.set(parsedJobId, {
              status: 'CREATED',
              queue: [],
              activeSpeaker: null,
              prepEndTime: null,
              topic: '',
              invitedStudentIds: [],
              joinedStudentIds: [],
              joinedParticipants: [],
            });
          } else {
          const gdDb = await gdDelegate.findUnique({ where: { jobId: parsedJobId } });
          if (gdDb) {
            const prepEndTime = gdDb.prepStartedAt ? new Date(gdDb.prepStartedAt).getTime() + (gdDb.prepDuration * 1000) : null;
            activeGDs.set(parsedJobId, {
              status: gdDb.status,
              queue: [],
              activeSpeaker: null,
              prepEndTime,
              topic: gdDb.topic,
              invitedStudentIds: [],
              joinedStudentIds: [],
              joinedParticipants: [],
            });
          } else {
            activeGDs.set(parsedJobId, {
              status: 'CREATED',
              queue: [],
              activeSpeaker: null,
              prepEndTime: null,
              topic: '',
              invitedStudentIds: [],
              joinedStudentIds: [],
              joinedParticipants: [],
            });
          }
          }
        } catch (e) {
          console.error("Error fetching GD from DB on join:", e);
        }
      }

      // Send current state (never emit bare undefined to clients)
      const currentState = activeGDs.get(parsedJobId) || {
        status: 'CREATED',
        queue: [],
        activeSpeaker: null,
        prepEndTime: null,
        topic: '',
        invitedStudentIds: [],
        joinedStudentIds: [],
        joinedParticipants: [],
      };

      socket.data.gdJobId = parsedJobId;
      socket.data.gdUserId = Number(userId) || null;
      socket.data.gdRole = role;
      socket.data.gdUserName = userName || null;

      if (role === 'student' && currentState) {
        const sid = Number(userId);
        const inScope = !Array.isArray(currentState.invitedStudentIds) || currentState.invitedStudentIds.length === 0 || currentState.invitedStudentIds.includes(sid);
        if (sid && inScope) {
          const joined = new Set((currentState.joinedStudentIds || []).map(Number));
          joined.add(sid);
          currentState.joinedStudentIds = Array.from(joined);

          const participants = Array.isArray(currentState.joinedParticipants) ? currentState.joinedParticipants : [];
          if (!participants.some((p) => Number(p.studentId) === sid)) {
            participants.push({ studentId: sid, name: userName || `Student ${sid}` });
          }
          currentState.joinedParticipants = participants;
        }
        const roomPayload = buildRoomUpdatePayload(currentState);
        io.to(`gd_${parsedJobId}`).emit('gd_room_update', roomPayload);
        io.to(`gd_${parsedJobId}`).emit('gd_recruiter_ready', {
          ...roomPayload,
          message: roomPayload.canStart
            ? 'All invited candidates joined. Recruiter can start GD.'
            : 'Waiting for all invited candidates to join.',
        });
      }

      socket.emit(
        'gd_state_update',
        currentState
      );
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
      const parsedJobId = Number(socket.data?.gdJobId);
      const userId = Number(socket.data?.gdUserId);
      const role = socket.data?.gdRole;
      const userName = socket.data?.gdUserName;
      if (parsedJobId && role === 'student' && userId) {
        const gd = activeGDs.get(parsedJobId);
        if (gd) {
          const remaining = new Set((gd.joinedStudentIds || []).map(Number));
          remaining.delete(userId);
          gd.joinedStudentIds = Array.from(remaining);
          gd.joinedParticipants = (gd.joinedParticipants || []).filter((p) => Number(p.studentId) !== userId);
          const roomPayload = buildRoomUpdatePayload(gd);
          io.to(`gd_${parsedJobId}`).emit('gd_room_update', roomPayload);
          io.to(`gd_${parsedJobId}`).emit('gd_recruiter_ready', {
            ...roomPayload,
            message: roomPayload.canStart
              ? 'All invited candidates joined. Recruiter can start GD.'
              : `${userName || 'A candidate'} left. Waiting for all invited candidates to join.`,
          });
        }
      }
      console.log('[Socket] User disconnected:', socket.id);
    });
  });
}

function buildRoomUpdatePayload(gd) {
  const invitedCount = Array.isArray(gd.invitedStudentIds) ? gd.invitedStudentIds.length : 0;
  const joinedCount = Array.isArray(gd.joinedStudentIds) ? gd.joinedStudentIds.length : 0;
  const allJoined = invitedCount > 0 && joinedCount >= invitedCount;
  return {
    invitedCount,
    joinedCount,
    allJoined,
    canStart: allJoined && joinedCount >= 3,
    joinedParticipants: gd.joinedParticipants || [],
  };
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
