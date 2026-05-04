import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Play,
  Square,
  Users,
  Check,
  X,
  Clock,
  SkipForward,
  Mic,
  Radio,
  Pause,
  MessageSquareQuote,
  Sparkles,
  Plus,
  FastForward,
  Shuffle,
} from 'lucide-react';
import { API_BASE_URL, getRealtimeBaseUrl } from '../config';
import Swal from 'sweetalert2';

function uniqueStudentIdsFromApplications(apps) {
  const seen = new Set();
  const ids = [];
  for (const a of apps || []) {
    const id = Number(a.studentId || a.student?.id);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function pickRandomSubset(ids, count) {
  if (!ids?.length || count < 1) return [];
  const n = Math.min(count, ids.length);
  const pool = [...ids];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

function pickedIdLabel(apps, studentId) {
  for (const a of apps || []) {
    const id = Number(a.studentId || a.student?.id);
    if (id === studentId && a.student?.name) return a.student.name;
  }
  return `Student #${studentId}`;
}

function hydrateGdStateFromDb(gd) {
  if (!gd) return null;
  const prepDuration = Number(gd.prepDuration) || 120;
  const prepEndTime = gd.prepStartedAt
    ? new Date(gd.prepStartedAt).getTime() + prepDuration * 1000
    : null;
  return {
    status: gd.status || 'CREATED',
    topic: gd.topic || '',
    queue: [],
    activeSpeaker: null,
    prepEndTime,
    invitedStudentIds: [],
    joinedStudentIds: [],
    joinedParticipants: [],
    micHot: null,
    discussionStartedAt: null,
    floorGrantedAt: null,
  };
}

export default function CompanyGDManager({
  jobId,
  initialGd,
  applications,
  token,
  eligibleList,
  onSkip,
  pipelineNotice,
}) {
  const [gdState, setGdState] = useState(() => hydrateGdStateFromDb(initialGd));
  const [topic, setTopic] = useState(initialGd?.topic || '');
  const [prepTime, setPrepTime] = useState(Number(initialGd?.prepDuration) || 120);
  const [timeLeft, setTimeLeft] = useState(0);
  const [transcripts, setTranscripts] = useState([]);
  const [liveCaption, setLiveCaption] = useState(null);
  const [evaluations, setEvaluations] = useState({});
  const [room, setRoom] = useState({
    invitedCount: 0,
    joinedCount: 0,
    allJoined: false,
    canStart: false,
    joinedParticipants: [],
  });
  const [readyNotice, setReadyNotice] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeError, setRealtimeError] = useState('');
  const [savedConversation, setSavedConversation] = useState([]);
  const [aiRankings, setAiRankings] = useState([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [runningAiEval, setRunningAiEval] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [inviteCount, setInviteCount] = useState(3);
  const [pickedStudentIds, setPickedStudentIds] = useState([]);
  const socketRef = useRef(null);
  const prepZeroSyncRef = useRef(false);

  const eligiblePoolIds = useMemo(
    () => uniqueStudentIdsFromApplications(applications),
    [applications]
  );
  const appByStudentId = useMemo(() => {
    const m = new Map();
    for (const a of applications || []) {
      const sid = Number(a.studentId || a.student?.id);
      if (sid) m.set(sid, a);
    }
    return m;
  }, [applications]);

  const openSetupModal = useCallback(() => {
    const pool = uniqueStudentIdsFromApplications(applications);
    const maxN = pool.length;
    const defaultCount =
      maxN === 0 ? 0 : maxN < 3 ? maxN : Math.min(6, maxN);
    setInviteCount(defaultCount);
    setPickedStudentIds(pickRandomSubset(pool, defaultCount));
    setIsSetupOpen(true);
  }, [applications]);

  const shufflePickedForCount = useCallback(
    (count) => {
      const pool = eligiblePoolIds;
      const maxN = pool.length;
      const n = Math.min(maxN, Math.max(1, count));
      setInviteCount(n);
      setPickedStudentIds(pickRandomSubset(pool, n));
    },
    [eligiblePoolIds]
  );

  useEffect(() => {
    if (!jobId || !token) return;

    const rt = getRealtimeBaseUrl();
    const numericJobId = parseInt(String(jobId), 10);
    const newSocket = io(rt, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
    });
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      setRealtimeConnected(true);
      setRealtimeError('');
      newSocket.emit('join_gd', {
        jobId: numericJobId,
        userId: 'company',
        role: 'company',
        userName: 'Recruiter',
      });
    });

    newSocket.on('disconnect', () => {
      setRealtimeConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      setRealtimeConnected(false);
      setRealtimeError(err?.message || 'Realtime connection failed');
    });

    newSocket.on('gd_state_update', (state) => {
      if (state) setGdState(state);
    });

    newSocket.on('gd_speaker_transcript', (data) => {
      setTranscripts((prev) => [...prev, data]);
    });

    newSocket.on('gd_live_transcript', (data) => {
      if (!data) return;
      setLiveCaption({
        studentId: data.studentId,
        name: data.name,
        displayText: data.displayText || '',
        isFinal: !!data.isFinal,
      });
    });

    newSocket.on('gd_room_update', (payload) => {
      if (payload) setRoom(payload);
    });

    newSocket.on('gd_recruiter_ready', (payload) => {
      if (!payload) return;
      setRoom(payload);
      setReadyNotice(payload.message || '');
    });

    return () => {
      socketRef.current = null;
      newSocket.disconnect();
    };
  }, [jobId, token]);

  useEffect(() => {
    if (!gdState?.micHot) setLiveCaption(null);
  }, [gdState?.micHot?.studentId]);

  useEffect(() => {
    if (!isSetupOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsSetupOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isSetupOpen]);

  useEffect(() => {
    let timer;
    if (gdState?.status === 'PREP' && gdState.prepEndTime) {
      timer = setInterval(() => {
        const remaining = Math.max(
          0,
          Math.floor((gdState.prepEndTime - Date.now()) / 1000)
        );
        setTimeLeft(remaining);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gdState?.status, gdState?.prepEndTime]);

  useEffect(() => {
    if (gdState?.status !== 'PREP') {
      prepZeroSyncRef.current = false;
      return;
    }
    if (timeLeft > 0) return;
    if (prepZeroSyncRef.current) return;
    prepZeroSyncRef.current = true;
    const jid = parseInt(String(jobId), 10);
    if (Number.isFinite(jid)) {
      socketRef.current?.emit('gd_check_prep', { jobId: jid });
    }
  }, [gdState?.status, timeLeft, jobId]);

  useEffect(() => {
    prepZeroSyncRef.current = false;
  }, [gdState?.prepEndTime, jobId]);

  const [discussionElapsedSec, setDiscussionElapsedSec] = useState(0);
  useEffect(() => {
    if (
      (gdState?.status !== 'ACTIVE' && gdState?.status !== 'PAUSED') ||
      !gdState?.discussionStartedAt
    ) {
      setDiscussionElapsedSec(0);
      return undefined;
    }
    const start = gdState.discussionStartedAt;
    const tick = () =>
      setDiscussionElapsedSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gdState?.status, gdState?.discussionStartedAt]);

  const handleInitializeGD = async () => {
    if (!topic.trim()) {
      Swal.fire({ icon: 'error', title: 'Topic required' });
      return;
    }
    const selectedStudentIds = [...pickedStudentIds];
    if (selectedStudentIds.length < 3) {
      Swal.fire({
        icon: 'error',
        title: 'Not enough candidates',
        text: 'Group discussion needs at least 3 invited candidates. Increase the pool size or use "Invite all eligible".',
      });
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          topic,
          prepDuration: Number(prepTime) || 120,
          selectedStudentIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to initialize GD');
      setRoom(data?.data?.room || room);
      setIsSetupOpen(false);
      Swal.fire({
        icon: 'success',
        title: 'GD room initialized',
        text: 'Candidates have been notified to join the room.',
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    }
  };

  const handleStartGD = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prepDuration: Number(prepTime) || 120 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to start GD');
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    }
  };

  const handleStopGD = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to stop GD');
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    }
  };

  const handlePauseGD = async () => {
    try {
      await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/pause`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleResumeGD = async () => {
    try {
      await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleNextSpeaker = async () => {
    try {
      await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/next-speaker`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error(err);
    }
  };

  const submitEvaluations = async () => {
    const payload = Object.entries(evaluations).map(([appId, status]) => ({
      applicationId: parseInt(appId, 10),
      status,
    }));

    if (payload.length === 0) return;

    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ evaluations: payload }),
      });
      if (res.ok) {
        Swal.fire({ icon: 'success', title: 'Evaluations saved' });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Evaluation failed' });
    }
  };

  const loadSavedConversation = useCallback(async () => {
    if (!jobId || !token) return;
    setLoadingConversation(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/conversation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to load conversation');
      setSavedConversation(Array.isArray(data?.data?.turns) ? data.data.turns : []);
    } catch (err) {
      setSavedConversation([]);
      Swal.fire({ icon: 'error', title: err?.message || 'Failed to load conversation' });
    } finally {
      setLoadingConversation(false);
    }
  }, [jobId, token]);

  const runAiEvaluation = async () => {
    if (!jobId || !token) return;
    setRunningAiEval(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/ai-evaluate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || 'AI evaluation failed');
      }
      const rankings = Array.isArray(data?.data?.rankings) ? data.data.rankings : [];
      setAiRankings(rankings);
      if (rankings.length === 0) {
        Swal.fire({ icon: 'info', title: 'No rankings produced' });
      } else if (data?.data?.source === 'fallback') {
        Swal.fire({
          icon: 'warning',
          title: 'AI unavailable - fallback ranking used',
          text: 'Gemini response was unavailable/empty, so ranking used participation heuristics.',
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: err?.message || 'AI evaluation failed' });
    } finally {
      setRunningAiEval(false);
    }
  };

  const prepPresets = [60, 90, 120];

  useEffect(() => {
    if (gdState?.status !== 'COMPLETED') return;
    void loadSavedConversation();
  }, [gdState?.status, loadSavedConversation]);

  const pipelineChrome = pipelineNotice ? (
    <div className="space-y-4">{pipelineNotice}</div>
  ) : null;

  /* Lobby / setup ---------------------------------------------------------------- */
  if (!gdState || gdState.status === 'CREATED') {
    return (
      <div className="relative py-12 text-center">
        {pipelineChrome}

        <Users className="mx-auto mb-4 h-16 w-16 text-gray-400" />
        <h3 className="mb-2 text-lg font-semibold text-gray-800">
          No Group Discussion Active
        </h3>
        <p className="mb-6 text-gray-600">Set up a live group discussion for candidates</p>

        <button
          type="button"
          onClick={openSetupModal}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-5 w-5" />
          Setup Group Discussion
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="ml-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-6 py-3 text-slate-700 transition-colors hover:bg-slate-200"
          >
            <FastForward className="h-5 w-5" />
            Skip Round
          </button>
        )}

        {eligibleList && <div className="mt-8 border-t pt-6 text-left">{eligibleList}</div>}

        {isSetupOpen && (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 py-8 text-left sm:flex sm:min-h-full sm:items-start sm:justify-center sm:py-12"
            onClick={() => setIsSetupOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gd-setup-title"
          >
            <div
              className="relative mx-auto my-2 flex w-full max-h-[min(calc(100vh-2rem),42rem)] max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl sm:my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
                <h3 id="gd-setup-title" className="text-lg font-bold text-gray-900">
                  Setup Group Discussion
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsSetupOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSetupOpen(false)}
                    className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    aria-label="Close setup"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6">
                <div>
                  <label className="mb-1 block text-sm font-medium">Discussion topic</label>
                  <textarea
                    className="min-h-[80px] w-full rounded border p-2"
                    placeholder="e.g., Impact of AI on software engineering"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">Prep time (after you start GD)</p>
                  <div className="flex flex-wrap gap-2">
                    {prepPresets.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setPrepTime(s)}
                        className={`rounded-full px-3 py-1 text-sm font-semibold ${
                          Number(prepTime) === s
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    className="mt-2 w-full rounded border p-2"
                    value={prepTime}
                    onChange={(e) =>
                      setPrepTime(parseInt(e.target.value, 10) || 120)
                    }
                  />
                </div>

                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                  <p className="mb-1 text-sm font-semibold text-gray-800">
                    Who joins this GD?
                  </p>
                  <p className="mb-3 text-xs text-gray-600">
                    {eligiblePoolIds.length} eligible (coding‑passed). Invite a random subset or everyone. Minimum 3
                    to start.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[140px] flex-1">
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Number to invite
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, eligiblePoolIds.length)}
                        className="w-full rounded border border-gray-300 p-2 text-sm"
                        value={inviteCount}
                        disabled={eligiblePoolIds.length === 0}
                        onChange={(e) => {
                          const maxN = eligiblePoolIds.length;
                          const raw = parseInt(e.target.value, 10);
                          const n = Math.min(maxN, Math.max(1, Number.isFinite(raw) ? raw : 1));
                          shufflePickedForCount(n);
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={eligiblePoolIds.length < 1}
                      onClick={() => shufflePickedForCount(inviteCount)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      <Shuffle className="h-4 w-4" />
                      Randomize
                    </button>
                    <button
                      type="button"
                      disabled={eligiblePoolIds.length < 1}
                      onClick={() => {
                        const all = [...eligiblePoolIds];
                        setInviteCount(all.length);
                        setPickedStudentIds(all);
                      }}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Invite all eligible
                    </button>
                  </div>
                  {eligiblePoolIds.length < 3 && (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      Fewer than 3 eligible candidates — GD cannot be initialized until the pool is large enough.
                    </p>
                  )}
                  {pickedStudentIds.length > 0 && (
                    <div className="mt-3 max-h-[min(12rem,calc(100vh-20rem))] overflow-y-auto rounded border border-gray-200 bg-white p-3 text-left sm:max-h-48">
                      <p className="mb-2 text-xs font-semibold text-gray-700">
                        Selected ({pickedStudentIds.length})
                      </p>
                      <ul className="space-y-1 text-sm text-gray-800">
                        {pickedStudentIds.map((id) => (
                          <li key={id}>{pickedIdLabel(applications, id)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-gray-50 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
                <button
                  type="button"
                  onClick={() => setIsSetupOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200/80"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    pickedStudentIds.length < 3 || eligiblePoolIds.length < 3
                  }
                  onClick={() => handleInitializeGD()}
                  title={
                    pickedStudentIds.length < 3
                      ? 'Select at least 3 candidates'
                      : undefined
                  }
                  className="inline-flex items-center gap-2 rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  Initialize GD
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (gdState.status === 'LOBBY') {
    return (
      <div className="space-y-6">
        {pipelineChrome}

        <div className="rounded-2xl border border-white/10 bg-[#0f1419] p-8 text-zinc-100 shadow-xl">
          <h3 className="text-2xl font-bold">GD Lobby</h3>
          <p className="mt-2 text-sm text-zinc-400">
            The discussion topic stays hidden from candidates until you click <strong className="text-zinc-200">Start GD</strong>.
            Then preparation time runs and the topic is revealed.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Candidates are joining the room. Start is enabled only when all invited candidates join and minimum 3 are present.
          </p>

          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
              realtimeError
                ? 'border-amber-500/40 bg-amber-900/20 text-amber-100'
                : realtimeConnected
                  ? 'border-emerald-500/30 bg-emerald-900/15 text-emerald-200'
                  : 'border-zinc-600 bg-zinc-900/40 text-zinc-400'
            }`}
          >
            Realtime (Socket.IO):{' '}
            {realtimeError
              ? `${realtimeError} — use the same Wi‑Fi IP + port as this page (see dev proxy), not raw :5000 on another device when testing locally.`
              : realtimeConnected
                ? 'Connected — joins from phones on your network should appear here if they open the student app via your PC’s LAN URL.'
                : 'Connecting…'}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-[#12171f] p-4">
              <p className="text-xs text-zinc-500">Invited</p>
              <p className="text-2xl font-bold">{room.invitedCount || 0}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#12171f] p-4">
              <p className="text-xs text-zinc-500">Joined</p>
              <p className="text-2xl font-bold">{room.joinedCount || 0}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#12171f] p-4">
              <p className="text-xs text-zinc-500">Status</p>
              <p
                className={`text-sm font-semibold ${room.canStart ? 'text-emerald-300' : 'text-amber-300'}`}
              >
                {room.canStart ? 'Ready to Start' : 'Waiting for everyone'}
              </p>
            </div>
          </div>

          {readyNotice && (
            <div
              className={`mt-4 rounded-lg border px-4 py-2 text-sm ${
                room.canStart
                  ? 'border-emerald-500/40 bg-emerald-900/20 text-emerald-200'
                  : 'border-amber-500/30 bg-amber-900/20 text-amber-200'
              }`}
            >
              {readyNotice}
            </div>
          )}

          <div className="mt-6 rounded-xl border border-white/10 bg-[#12171f] p-4">
            <h4 className="mb-3 text-sm font-semibold text-zinc-300">
              Joined candidates ({room.joinedParticipants?.length || 0})
            </h4>
            {room.joinedParticipants?.length ? (
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {room.joinedParticipants.map((p) => (
                  <li
                    key={p.studentId}
                    className="rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-sm"
                  >
                    {p.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">No one has joined yet.</p>
            )}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleStartGD}
              disabled={!room.canStart}
              className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold ${
                room.canStart
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'cursor-not-allowed bg-zinc-700 text-zinc-400'
              }`}
            >
              <Play className="h-4 w-4" /> Start GD
            </button>
            <button
              type="button"
              onClick={handleStopGD}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-500"
            >
              <Square className="h-4 w-4" /> Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* Prep ------------------------------------------------------------------------- */
  if (gdState.status === 'PREP') {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    return (
      <div className="space-y-6">
        {pipelineChrome}

        <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-[#15100d] via-[#0f1419] to-[#0f1419] p-10 text-center text-white shadow-xl">
          <Radio className="mx-auto mb-6 h-12 w-12 text-amber-400 opacity-90" />
          <h2 className="text-3xl font-bold">Preparation</h2>
          <p className="mx-auto mt-3 max-w-lg text-lg text-zinc-400">{gdState.topic}</p>
          <div className="mt-10 flex justify-center gap-4 font-mono text-8xl tabular-nums tracking-tighter text-amber-300">
            <Clock className="mt-8 h-10 w-10 text-amber-500/80" />
            {mins}:{secs.toString().padStart(2, '0')}
          </div>
          <p className="mx-auto mt-8 max-w-md text-sm text-zinc-500">
            Students see the topic, may join the queue, then the discussion opens automatically when time hits zero.
          </p>
          <button
            type="button"
            onClick={handleStopGD}
            className="mt-10 inline-flex items-center gap-2 rounded-xl bg-red-600 px-8 py-3 text-sm font-bold hover:bg-red-500"
          >
            <Square className="h-4 w-4" /> Cancel session
          </button>
        </div>
      </div>
    );
  }

  /* Live / paused ---------------------------------------------------------------- */
  if (gdState.status === 'ACTIVE' || gdState.status === 'PAUSED') {
    return (
      <div className="space-y-6">
        {pipelineChrome}

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] text-zinc-100 shadow-xl">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#0f1419] px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/30 text-indigo-300">
                <Mic className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Moderator view</p>
                <h3 className="truncate text-lg font-semibold">Group discussion</h3>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 justify-center px-2">
              <div className="flex max-w-xl flex-col rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-center">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Topic</p>
                <p className="truncate text-sm font-medium text-zinc-100">{gdState.topic}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <span
                className="hidden font-mono text-xs tabular-nums text-zinc-400 sm:inline"
                title="Time since discussion went live"
              >
                Discussion {Math.floor(discussionElapsedSec / 60)}:
                {(discussionElapsedSec % 60).toString().padStart(2, '0')}
              </span>
              {gdState.status === 'PAUSED' ? (
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-200 ring-1 ring-amber-500/40">
                  Paused
                </span>
              ) : (
                <span className="flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-200 ring-1 ring-red-500/40">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
                  Live
                </span>
              )}
              {gdState.status === 'PAUSED' ? (
                <button
                  type="button"
                  onClick={handleResumeGD}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500"
                >
                  <Play className="h-4 w-4" /> Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePauseGD}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600/90 px-4 py-2 text-sm font-semibold hover:bg-amber-500"
                >
                  <Pause className="h-4 w-4" /> Pause
                </button>
              )}
              <button
                type="button"
                onClick={handleStopGD}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold hover:bg-red-500"
              >
                <Square className="h-4 w-4" /> End
              </button>
            </div>
          </header>

          <div className="grid gap-4 p-5 lg:grid-cols-3">
            <section className="rounded-xl border border-white/10 bg-[#12171f] p-5 lg:col-span-1">
              <h4 className="mb-4 flex items-center gap-2 border-b border-white/10 pb-2 text-sm font-semibold text-zinc-300">
                <Mic className="h-4 w-4 text-red-400" /> Active speaker
              </h4>
              {gdState.activeSpeaker ? (
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-bold text-white ring-4 ring-white/10">
                    {gdState.activeSpeaker.name?.charAt(0) ?? '?'}
                  </div>
                  <p className="text-lg font-bold text-white">{gdState.activeSpeaker.name}</p>
                  {gdState.micHot ? (
                    <>
                      <p className="mt-2 flex items-center justify-center gap-2 text-xs font-semibold text-red-300">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
                        Speaking (mic live)
                      </p>
                      {liveCaption?.displayText &&
                        Number(liveCaption.studentId) === Number(gdState.micHot.studentId) && (
                          <div className="mx-auto mt-4 max-w-[220px] rounded-lg border border-red-500/20 bg-black/40 px-3 py-2 text-left">
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-red-300/90">
                              Live
                            </p>
                            <p className="mt-1 max-h-28 overflow-y-auto text-xs leading-relaxed text-zinc-100">
                              {liveCaption.displayText}
                            </p>
                          </div>
                        )}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">Has the floor — hold Space to talk</p>
                  )}
                  <button
                    type="button"
                    onClick={handleNextSpeaker}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold hover:bg-indigo-500"
                  >
                    <SkipForward className="h-4 w-4" /> Skip / next speaker
                  </button>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-zinc-500">Waiting for queue…</p>
              )}
            </section>

            <section className="rounded-xl border border-white/10 bg-[#12171f] p-5 lg:col-span-1">
              <h4 className="mb-4 border-b border-white/10 pb-2 text-sm font-semibold text-zinc-300">
                Speaker queue
              </h4>
              {gdState.queue?.length ? (
                <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {gdState.queue.map((q, idx) => (
                    <li
                      key={`${q.studentId}-${idx}`}
                      className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs text-zinc-600">#{idx + 1}</span>
                      <span className="font-medium text-zinc-200">{q.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-zinc-500">Queue empty</p>
              )}
            </section>

            <section className="flex min-h-[320px] flex-col rounded-xl border border-white/10 bg-[#12171f] p-5 lg:col-span-1">
              <h4 className="mb-4 flex items-center justify-between border-b border-white/10 pb-2 text-sm font-semibold text-zinc-300">
                <span className="flex items-center gap-2">
                  <MessageSquareQuote className="h-4 w-4 text-indigo-400" /> Transcript
                </span>
                <span className="rounded bg-black/40 px-2 py-0.5 text-[10px] text-indigo-300">
                  Deepgram
                </span>
              </h4>
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {gdState?.micHot && liveCaption?.displayText && (
                  <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/25 p-3 text-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/90">
                      Live · {liveCaption.name}
                    </p>
                    <p className="mt-1 leading-relaxed text-zinc-100">{liveCaption.displayText}</p>
                  </div>
                )}
                {transcripts.map((t, idx) => (
                  <div key={idx} className="rounded-lg border border-white/5 bg-black/35 p-3 text-sm">
                    <strong className="block text-indigo-200">{t.name}</strong>
                    <p className="mt-1 leading-relaxed text-zinc-300">
                      {t.text || <em className="text-zinc-600">silent / empty</em>}
                    </p>
                  </div>
                ))}
                {transcripts.length === 0 && (
                  <p className="text-center text-xs text-zinc-500">
                    Speech lines appear after each turn.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  /* Completed -------------------------------------------------------------------- */
  if (gdState.status === 'COMPLETED') {
    return (
      <div className="space-y-6">
        {pipelineChrome}

        <div className="rounded-2xl border border-white/10 bg-[#0f1419] p-8 text-zinc-100 shadow-xl">
          <h3 className="flex items-center gap-2 border-b border-white/10 pb-4 text-xl font-bold">
            <Check className="h-6 w-6 text-emerald-400" />
            Discussion closed
          </h3>
          <p className="mt-4 text-zinc-500">
            Topic: <strong className="text-zinc-200">{gdState.topic}</strong>
          </p>

          <h4 className="mb-4 mt-10 text-lg font-semibold">Evaluate candidates</h4>
          <p className="mb-6 text-sm text-zinc-500">
            Passed candidates can move forward in your pipeline configuration.
          </p>

          <div className="mb-8 rounded-xl border border-white/10 bg-[#12171f] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-sm font-semibold text-zinc-200">Saved GD conversation</h5>
              <button
                type="button"
                onClick={loadSavedConversation}
                className="rounded-lg border border-white/20 px-3 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/5"
              >
                Refresh
              </button>
            </div>
            {loadingConversation ? (
              <p className="text-xs text-zinc-500">Loading saved transcript…</p>
            ) : savedConversation.length ? (
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {savedConversation.map((turn, idx) => (
                  <div key={`${turn.studentId}-${idx}`} className="rounded-lg border border-white/5 bg-black/30 px-3 py-2">
                    <p className="text-xs font-semibold text-indigo-200">
                      #{idx + 1} · {turn.name || `Student ${turn.studentId}`}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-300">{turn.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">No saved transcript turns yet.</p>
            )}
          </div>

          <div className="mb-8 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-indigo-200">AI Evaluate & Rank</p>
                <p className="text-xs text-zinc-400">
                  Uses Gemini to rank candidates from the full saved GD conversation.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={runAiEvaluation}
                  disabled={runningAiEval}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {runningAiEval ? 'Evaluating…' : 'AI Evaluate'}
                </button>
              </div>
            </div>
            {aiRankings.length > 0 && (
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {aiRankings.map((r) => (
                  <div key={r.studentId} className="rounded-lg border border-indigo-500/20 bg-black/25 px-3 py-2">
                    <p className="text-sm font-semibold text-indigo-100">
                      Rank #{r.rank} · {appByStudentId.get(Number(r.studentId))?.student?.name || `Student ${r.studentId}`} · Score {r.score}/10
                    </p>
                    <p className="mt-1 text-xs text-zinc-300">{r.reason}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">Suggested: {r.suggestedStatus}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-10 max-h-[420px] space-y-2 overflow-y-auto pr-2">
            {(applications || []).map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-[#12171f] px-4 py-4"
              >
                <div>
                  <p className="font-medium">{app.student?.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">Status · {app.status}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEvaluations((prev) => ({ ...prev, [app.id]: 'GD_PASSED' }))}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      evaluations[app.id] === 'GD_PASSED' || app.status === 'GD_PASSED'
                        ? 'bg-emerald-600 text-white'
                        : 'border border-emerald-500/50 text-emerald-300 hover:bg-emerald-950/80'
                    }`}
                  >
                    <Check className="mr-1 inline-block h-3.5 w-3.5" /> Pass
                  </button>
                  <button
                    type="button"
                    onClick={() => setEvaluations((prev) => ({ ...prev, [app.id]: 'GD_FAILED' }))}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      evaluations[app.id] === 'GD_FAILED' || app.status === 'GD_FAILED'
                        ? 'bg-red-600 text-white'
                        : 'border border-red-500/50 text-red-300 hover:bg-red-950/80'
                    }`}
                  >
                    <X className="mr-1 inline-block h-3.5 w-3.5" /> Fail
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={submitEvaluations}
              className="rounded-xl bg-indigo-600 px-8 py-3 text-sm font-bold hover:bg-indigo-500"
            >
              Save evaluations
            </button>
            <button
              type="button"
              onClick={() => {
                Swal.fire({
                  title: 'Restart group discussion?',
                  text: 'You can configure a fresh topic and preparation window.',
                  icon: 'warning',
                  showCancelButton: true,
                  confirmButtonColor: '#dc2626',
                  cancelButtonColor: '#4f46e5',
                  confirmButtonText: 'Restart',
                }).then((result) => {
                  if (result.isConfirmed) {
                    setGdState(hydrateGdStateFromDb({ status: 'CREATED', topic: '', prepDuration: 120 }));
                    setTopic('');
                    setPrepTime(120);
                    setTranscripts([]);
                  }
                });
              }}
              className="rounded-xl border border-white/15 px-8 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Host again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
