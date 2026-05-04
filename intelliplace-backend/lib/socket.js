import prisma from './prisma.js';
import { GdDeepgramLiveSession } from './gdDeepgramLive.js';

// Setup global state for GDs
export const activeGDs = new Map();

/** If the current speaker never opens the mic, skip to next after this many ms */
export const FLOOR_OPEN_MIC_DEADLINE_MS = 10_000;

const floorIdleTimers = new Map();
const discussionEndTimers = new Map();

export function clearGdFloorIdleTimer(jobId) {
  const jid = resolveGdJobId(jobId);
  if (jid == null) return;
  const t = floorIdleTimers.get(jid);
  if (t) clearTimeout(t);
  floorIdleTimers.delete(jid);
}

function scheduleFloorIdleTimer(jid, io, expectedSid) {
  clearGdFloorIdleTimer(jid);
  if (expectedSid == null || !io) return;
  const tid = setTimeout(() => {
    floorIdleTimers.delete(jid);
    const g = activeGDs.get(jid);
    if (!g || g.status !== 'ACTIVE' || !g.activeSpeaker) return;
    if (normalizeStudentId(g.activeSpeaker.studentId) !== expectedSid) return;
    if (g.micHot) return;
    advanceSpeaker(jid, io);
  }, FLOOR_OPEN_MIC_DEADLINE_MS);
  floorIdleTimers.set(jid, tid);
}

function deepgramApiKeyConfigured() {
  let s = String(process.env.DEEPGRAM_API_KEY ?? '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.length > 0;
}

function canHoldFloor(gd, sid) {
  if (!gd || gd.status !== 'ACTIVE' || sid == null) return false;
  ensureGdQueue(gd);
  const floor = gd.activeSpeaker ? normalizeStudentId(gd.activeSpeaker.studentId) : null;
  if (floor === sid) return true;
  if (!gd.activeSpeaker && gd.queue.length > 0) {
    return normalizeStudentId(gd.queue[0]?.studentId) === sid;
  }
  return false;
}

function ensureGdQueue(gd) {
  if (!gd || typeof gd !== 'object') return;
  if (!Array.isArray(gd.queue)) gd.queue = [];
}

/** Map keys must be numeric job ids — coerces string ids from routes/params */
export function resolveGdJobId(jobId) {
  const n = parseInt(String(jobId ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Prep window length in seconds (recruiter UI: 30–600). */
export function clampPrepDurationSec(raw) {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return 120;
  return Math.min(600, Math.max(30, n));
}

/** Total live GD time: clamp to 5–15 minutes (seconds). Invalid/missing → 15 min. */
export function clampDiscussionDurationSec(raw) {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return 900;
  return Math.min(900, Math.max(300, n));
}

export function clearGdDiscussionEndTimer(jobId) {
  const jid = resolveGdJobId(jobId);
  if (jid == null) return;
  const t = discussionEndTimers.get(jid);
  if (t) clearTimeout(t);
  discussionEndTimers.delete(jid);
}

async function finalizeGdTimedOut(jid, io) {
  clearGdDiscussionEndTimer(jid);
  const gdState = activeGDs.get(jid);
  if (!gdState) return;
  if (gdState.status !== 'ACTIVE' && gdState.status !== 'PAUSED') return;
  try {
    await prisma.groupDiscussion.update({
      where: { jobId: jid },
      data: { status: 'COMPLETED' },
    });
    await prisma.job.update({
      where: { id: jid },
      data: { pipelineGdDone: true },
    });
  } catch (e) {
    console.error('[GD] timed auto-complete failed', e);
    return;
  }
  clearGdFloorIdleTimer(jid);
  gdState.status = 'COMPLETED';
  gdState.activeSpeaker = null;
  gdState.queue = [];
  gdState.prepEndTime = null;
  gdState.micHot = null;
  gdState.discussionStartedAt = null;
  gdState.discussionEndTime = null;
  gdState.floorGrantedAt = null;
  io?.to(`gd_${jid}`).emit('gd_state_update', gdState);
}

export function scheduleGdDiscussionEnd(jobId, io) {
  const jid = resolveGdJobId(jobId);
  if (jid == null || !io) return;
  clearGdDiscussionEndTimer(jid);
  const gd = activeGDs.get(jid);
  if (!gd || gd.status !== 'ACTIVE' || !gd.discussionEndTime) return;
  const ms = Number(gd.discussionEndTime) - Date.now();
  if (!Number.isFinite(ms)) return;
  if (ms <= 0) {
    void finalizeGdTimedOut(jid, io);
    return;
  }
  const tid = setTimeout(() => void finalizeGdTimedOut(jid, io), ms);
  discussionEndTimers.set(jid, tid);
}

/** If discussion is live and the queue is waiting, give the floor to the next person */
export function assignFirstSpeakerIfIdle(jobId, io) {
  const jid = resolveGdJobId(jobId);
  if (jid == null) return;
  const gd = activeGDs.get(jid);
  if (!gd || gd.status !== 'ACTIVE' || gd.activeSpeaker) return;
  ensureGdQueue(gd);
  if (gd.queue.length === 0) return;
  advanceSpeaker(jid, io);
}

/**
 * When prep window has ended (by wall clock), move room to ACTIVE and notify everyone.
 * Used by: /gd/start setTimeout, join_gd (recover after restart), client gd_check_prep at 0:00.
 */
export async function transitionPrepToActiveIfElapsed(jobId, io) {
  const jid = resolveGdJobId(jobId);
  if (jid == null) return false;
  const gd = activeGDs.get(jid);
  if (!gd || gd.status !== 'PREP') return false;
  if (gd.prepEndTime == null) return false;
  const end = Number(gd.prepEndTime);
  if (!Number.isFinite(end) || end <= 0 || Date.now() < end) return false;

  gd.status = 'ACTIVE';
  gd.discussionStartedAt = Date.now();
  gd.micHot = null;
  gd.prepEndTime = null;
  gd.floorGrantedAt = null;
  clearGdFloorIdleTimer(jid);

  const dur = clampDiscussionDurationSec(gd.discussionDurationSec);
  gd.discussionDurationSec = dur;
  gd.discussionEndTime = dur > 0 ? Date.now() + dur * 1000 : null;

  try {
    await prisma.groupDiscussion.update({
      where: { jobId: jid },
      data: { status: 'ACTIVE', startedAt: new Date() },
    });
  } catch (e) {
    console.error('[GD] prep→active DB update failed', e);
  }

  ensureGdQueue(gd);
  assignFirstSpeakerIfIdle(jid, io);
  if (io) {
    io.to(`gd_${jid}`).emit('gd_state_update', gd);
    scheduleGdDiscussionEnd(jid, io);
  }
  return true;
}

export default function setupGDSockets(io) {
  io.on('connection', (socket) => {
    console.log('[Socket] User connected:', socket.id);

    socket.on('join_gd', async ({ jobId, userId, role, userName }) => {
      const parsedJobId = parseInt(String(jobId ?? ''), 10);
      if (!Number.isFinite(parsedJobId) || parsedJobId <= 0) {
        console.warn('[Socket] join_gd ignored: invalid jobId', jobId);
        return;
      }
      socket.join(`gd_${parsedJobId}`);
      console.log(`[Socket] ${role} ${userId} joined socket room gd_${parsedJobId}`);

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
              micHot: null,
              discussionStartedAt: null,
              discussionDurationSec: 900,
              discussionEndTime: null,
              floorGrantedAt: null,
            });
          } else {
          const gdDb = await gdDelegate.findUnique({ where: { jobId: parsedJobId } });
          if (gdDb) {
            const prepEndTime = gdDb.prepStartedAt ? new Date(gdDb.prepStartedAt).getTime() + (gdDb.prepDuration * 1000) : null;
            const discussionStartedAt =
              gdDb.status === 'ACTIVE' && gdDb.startedAt
                ? new Date(gdDb.startedAt).getTime()
                : null;
            const discDur = clampDiscussionDurationSec(gdDb.discussionDurationSec ?? 0);
            const discussionEndTime =
              gdDb.status === 'ACTIVE' &&
              discussionStartedAt != null &&
              discDur > 0
                ? discussionStartedAt + discDur * 1000
                : null;
            activeGDs.set(parsedJobId, {
              status: gdDb.status,
              queue: [],
              activeSpeaker: null,
              prepEndTime,
              topic: gdDb.topic,
              invitedStudentIds: [],
              joinedStudentIds: [],
              joinedParticipants: [],
              micHot: null,
              discussionStartedAt,
              discussionDurationSec: discDur,
              discussionEndTime,
              floorGrantedAt: null,
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
              micHot: null,
              discussionStartedAt: null,
              discussionDurationSec: 900,
              discussionEndTime: null,
              floorGrantedAt: null,
            });
          }
          }
        } catch (e) {
          console.error("Error fetching GD from DB on join:", e);
        }
        if (!activeGDs.has(parsedJobId)) {
          activeGDs.set(parsedJobId, {
            status: 'CREATED',
            queue: [],
            activeSpeaker: null,
            prepEndTime: null,
            topic: '',
            invitedStudentIds: [],
            joinedStudentIds: [],
            joinedParticipants: [],
            micHot: null,
            discussionStartedAt: null,
            discussionDurationSec: 900,
            discussionEndTime: null,
            floorGrantedAt: null,
          });
        }
      }

      // Always use the canonical Map entry (never a throwaway fallback object)
      const currentState = activeGDs.get(parsedJobId);
      if (!currentState) {
        console.warn('[Socket] join_gd: missing GD state after init for job', parsedJobId);
        return;
      }

      socket.data.gdJobId = parsedJobId;
      socket.data.gdUserId = normalizeStudentId(userId);
      socket.data.gdRole = role;
      socket.data.gdUserName = userName || null;

      ensureGdQueue(currentState);
      await transitionPrepToActiveIfElapsed(parsedJobId, io);
      assignFirstSpeakerIfIdle(parsedJobId, io);
      scheduleGdDiscussionEnd(parsedJobId, io);

      if (role === 'student' && currentState) {
        const sid = normalizeStudentId(userId);
        const invites = (currentState.invitedStudentIds || [])
          .map((x) => normalizeStudentId(x))
          .filter(Boolean);
        const openInvite = invites.length === 0;
        const inScope = openInvite || (sid != null && invites.includes(sid));

        if (sid != null && inScope) {
          const joined = new Set(
            (currentState.joinedStudentIds || [])
              .map((x) => normalizeStudentId(x))
              .filter(Boolean)
          );
          joined.add(sid);
          currentState.joinedStudentIds = Array.from(joined);

          const participants = Array.isArray(currentState.joinedParticipants)
            ? [...currentState.joinedParticipants]
            : [];
          if (!participants.some((p) => normalizeStudentId(p.studentId) === sid)) {
            participants.push({ studentId: sid, name: userName || `Student ${sid}` });
          }
          currentState.joinedParticipants = participants;
        } else if (sid != null && !inScope) {
          console.warn(
            `[Socket] Student ${sid} not in invited list for job ${parsedJobId} (invites: ${invites.join(',') || 'none'})`
          );
        } else {
          console.warn('[Socket] join_gd: student missing valid userId', userId);
        }

        const roomPayload = buildRoomUpdatePayload(currentState);
        io.to(`gd_${parsedJobId}`).emit('gd_room_update', roomPayload);
        io.to(`gd_${parsedJobId}`).emit('gd_recruiter_ready', {
          ...roomPayload,
          message: roomPayload.canStart
            ? 'All invited candidates joined. Recruiter can start GD.'
            : 'Waiting for all invited candidates to join.',
        });
        io.to(`gd_${parsedJobId}`).emit('gd_state_update', currentState);
      } else if (role !== 'student') {
        socket.emit('gd_room_update', buildRoomUpdatePayload(currentState));
      }

      socket.emit('gd_state_update', currentState);
    });

    socket.on('gd_check_prep', async ({ jobId }) => {
      const jid = resolveGdJobId(jobId);
      if (jid == null) return;
      await transitionPrepToActiveIfElapsed(jid, io);
    });

    socket.on('request_speak', ({ jobId, studentId, studentName }) => {
      const parsedJobId = parseInt(String(jobId ?? ''), 10);
      if (!Number.isFinite(parsedJobId)) return;
      const gd = activeGDs.get(parsedJobId);
      if (!gd) return;
      ensureGdQueue(gd);

      const sidN = normalizeStudentId(studentId);
      if (sidN == null) return;

      const maxQ =
        Array.isArray(gd.invitedStudentIds) && gd.invitedStudentIds.length > 0
          ? gd.invitedStudentIds.length
          : 12;
      if (gd.queue.length >= maxQ) {
        socket.emit('gd_queue_full', {
          message: 'The speaker queue is full. Wait until someone finishes their turn.',
        });
        return;
      }
      if (gd.queue.some((q) => normalizeStudentId(q.studentId) === sidN)) {
        assignFirstSpeakerIfIdle(parsedJobId, io);
        if (io) io.to(`gd_${parsedJobId}`).emit('gd_state_update', gd);
        return;
      }

      gd.queue.push({
        studentId: sidN,
        name: studentName || `Student ${sidN}`,
      });

      assignFirstSpeakerIfIdle(parsedJobId, io);
      if (io) io.to(`gd_${parsedJobId}`).emit('gd_state_update', gd);
    });

    socket.on('gd_ptt', ({ jobId, active }) => {
      const jid = resolveGdJobId(jobId);
      if (jid == null) return;
      assignFirstSpeakerIfIdle(jid, io);
      const gd = activeGDs.get(jid);
      const sid = normalizeStudentId(socket.data?.gdUserId);
      if (!gd || sid == null || gd.status !== 'ACTIVE') return;
      if (!canHoldFloor(gd, sid)) return;
      if (active) {
        clearGdFloorIdleTimer(jid);
        gd.micHot = {
          studentId: sid,
          name:
            socket.data.gdUserName ||
            gd.activeSpeaker?.name ||
            `Student ${sid}`,
        };
      } else {
        gd.micHot = null;
      }
      if (io) io.to(`gd_${jid}`).emit('gd_state_update', gd);
    });

    socket.on('gd_live_start', async ({ jobId, sampleRate }, cb) => {
      const jid = resolveGdJobId(jobId);
      if (jid == null) {
        cb?.({ ok: false, error: 'invalid_job' });
        return;
      }
      if (!deepgramApiKeyConfigured()) {
        cb?.({ ok: false, error: 'no_deepgram' });
        return;
      }
      assignFirstSpeakerIfIdle(jid, io);
      const gd = activeGDs.get(jid);
      const sid = normalizeStudentId(socket.data?.gdUserId);
      if (!gd || sid == null || gd.status !== 'ACTIVE') {
        cb?.({ ok: false, error: 'inactive' });
        return;
      }
      if (!canHoldFloor(gd, sid)) {
        cb?.({ ok: false, error: 'no_floor' });
        return;
      }

      try {
        await socket.data.dgLive?.close?.();
      } catch (_) {}
      socket.data.dgLive = null;

      const rawSr = parseInt(String(sampleRate ?? 48000), 10);
      const sr =
        Number.isFinite(rawSr) && rawSr >= 8000 && rawSr <= 48000 ? rawSr : 48000;

      const hotName =
        socket.data.gdUserName ||
        gd.activeSpeaker?.name ||
        `Student ${sid}`;

      let session;
      const emitLive = (extra) => {
        if (!session) return;
        io.to(`gd_${jid}`).emit('gd_live_transcript', {
          jobId: jid,
          studentId: sid,
          name: hotName,
          displayText: session.getDisplayText(),
          ...extra,
        });
      };

      session = new GdDeepgramLiveSession({
        apiKey: process.env.DEEPGRAM_API_KEY,
        sampleRate: sr,
        onPartial: () => emitLive({ isFinal: false }),
        onFinal: () => emitLive({ isFinal: true }),
        onError: (err) => console.error('[GD Live]', err?.message || err),
      });

      try {
        await session.connect();
        socket.data.dgLive = session;
        cb?.({ ok: true, sampleRate: sr });
      } catch (e) {
        console.error('[gd_live_start]', e);
        try {
          await session?.close?.();
        } catch (_) {}
        cb?.({ ok: false, error: e?.message || 'connect_failed' });
      }
    });

    socket.on('gd_live_pcm', (buf) => {
      const sess = socket.data.dgLive;
      if (!sess || buf == null) return;
      try {
        const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
        sess.sendPcmBuffer(b);
      } catch (e) {
        console.error('[gd_live_pcm]', e);
      }
    });

    socket.on('gd_live_end', async ({ jobId: _jobId }, cb) => {
      const sess = socket.data.dgLive;
      socket.data.dgLive = null;
      if (!sess) {
        cb?.({ ok: true, fullText: '' });
        return;
      }
      try {
        await sess.close();
      } catch (e) {
        console.error('[gd_live_end]', e);
      }
      const fullText = sess.getFullText();
      cb?.({ ok: true, fullText });
    });

    socket.on('gd_sync_floor', ({ jobId }) => {
      const parsedJobId = resolveGdJobId(jobId);
      if (parsedJobId == null) return;
      assignFirstSpeakerIfIdle(parsedJobId, io);
    });

    socket.on('disconnect', () => {
      if (socket.data?.dgLive) {
        socket.data.dgLive.close().catch(() => {});
        socket.data.dgLive = null;
      }
      const parsedJobId = Number(socket.data?.gdJobId);
      const userId = normalizeStudentId(socket.data?.gdUserId);
      const role = socket.data?.gdRole;
      const userName = socket.data?.gdUserName;
      if (parsedJobId && role === 'student' && userId) {
        const gd = activeGDs.get(parsedJobId);
        if (gd) {
          const hotSid = gd.micHot && normalizeStudentId(gd.micHot.studentId);
          if (hotSid === userId) gd.micHot = null;
          const remaining = new Set(
            (gd.joinedStudentIds || []).map((x) => normalizeStudentId(x)).filter(Boolean)
          );
          remaining.delete(userId);
          gd.joinedStudentIds = Array.from(remaining);
          gd.joinedParticipants = (gd.joinedParticipants || []).filter(
            (p) => normalizeStudentId(p.studentId) !== userId
          );
          const roomPayload = buildRoomUpdatePayload(gd);
          io.to(`gd_${parsedJobId}`).emit('gd_room_update', roomPayload);
          io.to(`gd_${parsedJobId}`).emit('gd_recruiter_ready', {
            ...roomPayload,
            message: roomPayload.canStart
              ? 'All invited candidates joined. Recruiter can start GD.'
              : `${userName || 'A candidate'} left. Waiting for all invited candidates to join.`,
          });
          io.to(`gd_${parsedJobId}`).emit('gd_state_update', gd);
        }
      }
      console.log('[Socket] User disconnected:', socket.id);
    });
  });
}

function normalizeStudentId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
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
  const jid = resolveGdJobId(jobId);
  if (jid == null) return;
  const gd = activeGDs.get(jid);
  if (!gd) {
    console.warn('[GD] advanceSpeaker: no in-memory GD for job', jid);
    return;
  }
  ensureGdQueue(gd);
  clearGdFloorIdleTimer(jid);

  gd.micHot = null;

  if (gd.queue.length > 0) {
    const next = gd.queue.shift();
    const sid = normalizeStudentId(next?.studentId);
    gd.activeSpeaker =
      sid != null
        ? { studentId: sid, name: next.name || `Student ${sid}` }
        : { ...next, studentId: next?.studentId };
    gd.floorGrantedAt = Date.now();
    const floorSid = normalizeStudentId(gd.activeSpeaker?.studentId);
    scheduleFloorIdleTimer(jid, io, floorSid);
  } else {
    gd.activeSpeaker = null;
    gd.floorGrantedAt = null;
  }

  if (io) {
    io.to(`gd_${jid}`).emit('gd_state_update', gd);
  }
}

export function broadcastDeepgramOutput(jobId, io, transcriptData) {
  io.to(`gd_${jobId}`).emit('gd_speaker_transcript', transcriptData);
}
