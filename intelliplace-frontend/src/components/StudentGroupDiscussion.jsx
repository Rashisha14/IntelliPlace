import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  Mic,
  MicOff,
  Hand,
  Users,
  Clock,
  Loader2,
  Square,
  MessageSquareQuote,
  Radio,
  Volume2,
} from 'lucide-react';
import { API_BASE_URL, getRealtimeBaseUrl } from '../config';
import { getCurrentUser } from '../utils/auth';

const MAX_HOLD_MS = 60_000;
/** Server skips to next speaker if mic not opened within this window after floor is granted */
const FLOOR_CLAIM_DEADLINE_SEC = 10;
/** While holding PTT: if RMS stays near silence this long after last sound → auto-stop */
const SILENCE_AUTO_STOP_MS = 12_000;
/** Ignore silence detection briefly after starting mic */
const SILENCE_ARM_MS = 3_500;
const RMS_SILENT_BELOW = 1.85;

/** Float32 mono (-1..1) → little-endian int16 PCM for Deepgram `linear16`. */
function floatTo16BitLinearPcm(input) {
  const len = input.length;
  const buf = new ArrayBuffer(len * 2);
  const view = new DataView(buf);
  for (let i = 0; i < len; i++) {
    const x = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return buf;
}

export default function StudentGroupDiscussion({ isOpen, onClose, jobId }) {
  const [gdState, setGdState] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [toast, setToast] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [claimSecsLeft, setClaimSecsLeft] = useState(null);
  /** Live Deepgram line for whoever is on the mic (partial + finals while hot). */
  const [liveCaption, setLiveCaption] = useState(null);

  const user = getCurrentUser();

  const mediaRecorderRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const silenceIntervalRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const lastSoundRef = useRef(0);
  const holdStartedAtRef = useRef(0);
  const holdingRef = useRef(false);
  /** True while MediaRecorder gathering — used for reliable 90s cap */
  const recordingActiveRef = useRef(false);
  /** Prevent Space key default scroll */
  const pttEligibleRef = useRef(false);
  const socketRef = useRef(null);
  /** Ask server to assign floor if ACTIVE but stuck (no activeSpeaker while queue waits) */
  const floorSyncSentRef = useRef(false);
  /** Ask server to flip PREP → ACTIVE when local prep countdown hits 0 (covers missed setTimeout / restart). */
  const prepZeroSyncRef = useRef(false);
  const liveProcessorRef = useRef(null);
  const liveMuteGainRef = useRef(null);
  const liveSendEnabledRef = useRef(false);
  const liveSessionActiveRef = useRef(false);
  const pendingLiveTextRef = useRef('');

  const showToast = useCallback((message, tone = 'error') => {
    setToast({ message, tone });
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, []);

  const submitSpeechText = useCallback(
    async (text) => {
      const trimmed = String(text || '').trim();
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/submit-speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Could not submit your turn');
      }
      return data;
    },
    [jobId]
  );

  const clearSilenceWatcher = () => {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    try {
      liveProcessorRef.current?.disconnect();
      liveMuteGainRef.current?.disconnect();
    } catch (_) {}
    liveProcessorRef.current = null;
    liveMuteGainRef.current = null;
    liveSendEnabledRef.current = false;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  useEffect(() => {
    if (!isOpen || !jobId || user == null) return;
    const numericUserId = Number(user.id ?? user.studentId);
    if (!Number.isFinite(numericUserId)) return;

    const rt = getRealtimeBaseUrl();
    const numericJobId = parseInt(String(jobId), 10);

    const newSocket = io(rt, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
    });

    newSocket.on('connect_error', (err) => {
      showToast(
        `Cannot reach live room (${err?.message || 'network error'}). Open this app using your recruiter PC’s Wi‑Fi IP and port (same URL they use for testing), not localhost.`,
        'error'
      );
    });

    newSocket.on('connect', () => {
      newSocket.emit('join_gd', {
        jobId: numericJobId,
        userId: numericUserId,
        role: 'student',
        userName: user.name || `Student ${numericUserId}`,
      });
    });

    newSocket.on('gd_state_update', (state) => {
      setGdState(state || null);
      setIsJoined(true);
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

    newSocket.on('gd_queue_full', (payload) => {
      showToast(payload?.message || 'Speaker queue is full.', 'error');
    });

    setSocket(newSocket);
    socketRef.current = newSocket;

    return () => {
      liveSendEnabledRef.current = false;
      const jid = parseInt(String(jobId), 10);
      if (liveSessionActiveRef.current && Number.isFinite(jid) && newSocket.connected) {
        liveSessionActiveRef.current = false;
        newSocket.emit('gd_live_end', { jobId: jid });
      }
      clearSilenceWatcher();
      socketRef.current = null;
      floorSyncSentRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      newSocket.disconnect();
    };
  }, [isOpen, jobId, user?.id, user?.studentId, user?.name, showToast]);

  useEffect(() => {
    if (gdState?.status !== 'ACTIVE') {
      floorSyncSentRef.current = false;
      return;
    }
    if (gdState?.activeSpeaker) {
      floorSyncSentRef.current = false;
      return;
    }
    const qLen = Array.isArray(gdState?.queue) ? gdState.queue.length : 0;
    if (qLen === 0) return;
    if (floorSyncSentRef.current) return;
    floorSyncSentRef.current = true;
    const jid = parseInt(String(jobId), 10);
    const t = setTimeout(() => {
      socketRef.current?.emit('gd_sync_floor', { jobId: jid });
    }, 350);
    return () => clearTimeout(t);
  }, [gdState?.status, gdState?.activeSpeaker?.studentId, gdState?.queue?.length, jobId]);

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

  const stopRecording = useCallback(async () => {
    const jid = parseInt(String(jobId), 10);
    if (Number.isFinite(jid)) {
      socketRef.current?.emit('gd_ptt', { jobId: jid, active: false });
    }

    liveSendEnabledRef.current = false;
    recordingActiveRef.current = false;
    holdingRef.current = false;
    pttEligibleRef.current = false;

    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    let liveText = '';
    const needEndLive = liveSessionActiveRef.current;
    if (needEndLive) {
      liveSessionActiveRef.current = false;
      if (Number.isFinite(jid)) {
        liveText = await new Promise((resolve) => {
          const to = setTimeout(() => resolve(''), 9000);
          socketRef.current?.emit('gd_live_end', { jobId: jid }, (ack) => {
            clearTimeout(to);
            resolve(String(ack?.fullText ?? '').trim());
          });
        });
      }
    }
    pendingLiveTextRef.current = liveText;

    clearSilenceWatcher();

    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch (_) {}
    }
    setIsSpeaking(false);
  }, [jobId]);

  const startRecording = useCallback(async () => {
    if (isTranscribing || recordingActiveRef.current) return;

    pendingLiveTextRef.current = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: { ideal: 48000 },
        },
      });

      const ctx = new AudioContext();
      await ctx.resume().catch(() => {});

      const jid = parseInt(String(jobId), 10);
      let liveOk = false;
      if (Number.isFinite(jid) && socketRef.current?.connected) {
        const ack = await new Promise((resolve) => {
          const to = setTimeout(() => resolve({ ok: false }), 5000);
          socketRef.current.emit(
            'gd_live_start',
            { jobId: jid, sampleRate: ctx.sampleRate },
            (r) => {
              clearTimeout(to);
              resolve(r && typeof r === 'object' ? r : { ok: false });
            }
          );
        });
        liveOk = !!ack.ok;
      }

      liveSessionActiveRef.current = liveOk;

      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const preLive = pendingLiveTextRef.current.trim();
        pendingLiveTextRef.current = '';
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;

        if (preLive) {
          setIsTranscribing(true);
          try {
            await submitSpeechText(preLive);
          } catch (err) {
            console.error(err);
            showToast(err?.message || 'Could not save your turn', 'error');
          } finally {
            setIsTranscribing(false);
          }
          return;
        }

        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'speech.webm');

          const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/transcribe-audio`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
            body: formData,
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            showToast(
              data.message || data.error || `Transcription failed (${res.status})`,
              'error'
            );
            return;
          }
          const text = (data.text || '').trim();
          await submitSpeechText(text);
          if (!text) {
            showToast('No speech detected — skipped to next speaker', 'info');
          }
        } catch (err) {
          console.error(err);
          showToast('Network error while transcribing. Try again.', 'error');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recordingActiveRef.current = true;
      holdStartedAtRef.current = Date.now();
      lastSoundRef.current = Date.now();
      recorder.start();
      setIsSpeaking(true);
      if (Number.isFinite(jid)) {
        socketRef.current?.emit('gd_ptt', { jobId: jid, active: true });
      }

      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = ctx;
        analyserRef.current = analyser;

        if (liveOk) {
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          const mute = ctx.createGain();
          mute.gain.value = 0;
          processor.onaudioprocess = (e) => {
            if (!liveSendEnabledRef.current) return;
            const input = e.inputBuffer.getChannelData(0);
            const pcm = floatTo16BitLinearPcm(input);
            socketRef.current?.emit('gd_live_pcm', pcm);
          };
          source.connect(processor);
          processor.connect(mute);
          mute.connect(ctx.destination);
          liveProcessorRef.current = processor;
          liveMuteGainRef.current = mute;
          liveSendEnabledRef.current = true;
        }

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        silenceIntervalRef.current = setInterval(() => {
          if (!analyserRef.current || !recordingActiveRef.current) return;
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += Math.abs(dataArray[i] - 128);
          }
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(1, avg / 48));
          const now = Date.now();
          if (now - holdStartedAtRef.current < SILENCE_ARM_MS) return;

          if (avg > RMS_SILENT_BELOW) {
            lastSoundRef.current = now;
          } else if (now - lastSoundRef.current >= SILENCE_AUTO_STOP_MS) {
            stopRecording();
            showToast('No sound detected — turn ended.', 'info');
          }
        }, 220);
      } catch (audioErr) {
        console.error(audioErr);
        if (liveOk && Number.isFinite(jid)) {
          liveSessionActiveRef.current = false;
          await new Promise((resolve) => {
            socketRef.current?.emit('gd_live_end', { jobId: jid }, () => resolve());
          });
        }
      }

      recordingTimeoutRef.current = setTimeout(() => {
        if (recordingActiveRef.current) stopRecording();
      }, MAX_HOLD_MS);
    } catch (err) {
      console.error(err);
      recordingActiveRef.current = false;
      liveSessionActiveRef.current = false;
      setIsSpeaking(false);
      showToast('Microphone access blocked or unavailable.', 'error');
    }
  }, [jobId, isTranscribing, showToast, stopRecording, submitSpeechText]);

  useEffect(() => {
    const st = gdState?.status;
    if (st === 'PAUSED' || st === 'COMPLETED') {
      void stopRecording();
    }
  }, [gdState?.status, stopRecording]);

  useEffect(() => {
    if (!gdState?.micHot) setLiveCaption(null);
  }, [gdState?.micHot?.studentId]);

  useEffect(() => {
    if (gdState?.status !== 'ACTIVE') return;
    const myId = Number(user?.id ?? user?.studentId);
    const floorId = Number(gdState?.activeSpeaker?.studentId);
    const headId =
      gdState?.queue?.[0] != null ? Number(gdState.queue[0].studentId) : NaN;
    const haveTurn =
      Number.isFinite(myId) &&
      ((Number.isFinite(floorId) && myId === floorId) ||
        (!gdState?.activeSpeaker && Number.isFinite(headId) && myId === headId));
    if (!(recordingActiveRef.current || holdingRef.current)) return;
    if (!haveTurn) void stopRecording();
  }, [
    gdState?.activeSpeaker?.studentId,
    gdState?.queue,
    gdState?.status,
    stopRecording,
    user?.id,
    user?.studentId,
  ]);

  useEffect(() => {
    const myId = Number(user.id ?? user.studentId);
    const floorId = Number(gdState?.activeSpeaker?.studentId);
    const headId =
      gdState?.queue?.[0] != null ? Number(gdState.queue[0].studentId) : NaN;
    const isMyTurn =
      gdState?.status === 'ACTIVE' &&
      Number.isFinite(myId) &&
      ((Number.isFinite(floorId) && myId === floorId) ||
        (!gdState?.activeSpeaker && Number.isFinite(headId) && myId === headId));
    pttEligibleRef.current = isMyTurn && !isTranscribing;

    const onKeyDown = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (!pttEligibleRef.current || holdingRef.current) return;
      e.preventDefault();
      holdingRef.current = true;
      startRecording();
    };
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      if (!holdingRef.current) return;
      e.preventDefault();
      stopRecording();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    gdState?.activeSpeaker,
    gdState?.queue,
    gdState?.status,
    isTranscribing,
    startRecording,
    stopRecording,
    user?.id,
    user?.studentId,
  ]);

  const requestToSpeak = () => {
    if (!socket) return;
    const st = gdState?.status;
    if (st !== 'ACTIVE' && st !== 'PREP' && st !== 'LOBBY') return;
    const myId = Number(user.id ?? user.studentId);
    if (!Number.isFinite(myId)) return;
    if (gdState.queue?.some((q) => Number(q.studentId) === myId)) {
      if (st === 'ACTIVE' && !gdState.activeSpeaker) {
        socket.emit('request_speak', {
          jobId: parseInt(String(jobId), 10),
          studentId: myId,
          studentName: user.name,
        });
      }
      return;
    }
    const invitedLen = Array.isArray(gdState.invitedStudentIds)
      ? gdState.invitedStudentIds.length
      : 0;
    const maxQ = invitedLen > 0 ? invitedLen : 12;
    if ((gdState.queue?.length ?? 0) >= maxQ) {
      showToast('Speaker queue is full. Try again after someone finishes.', 'error');
      return;
    }
    socket.emit('request_speak', {
      jobId: parseInt(String(jobId), 10),
      studentId: myId,
      studentName: user.name,
    });
  };

  const myId = Number(user?.id ?? user?.studentId);
  const inQueue =
    Number.isFinite(myId) && gdState?.queue?.some((q) => Number(q.studentId) === myId);
  const myQueueIndex = gdState?.queue?.findIndex((q) => Number(q.studentId) === myId);
  const floorId = Number(gdState?.activeSpeaker?.studentId);
  const headId =
    gdState?.queue?.[0] != null ? Number(gdState.queue[0].studentId) : NaN;
  const isMyTurn =
    gdState?.status === 'ACTIVE' &&
    Number.isFinite(myId) &&
    ((Number.isFinite(floorId) && myId === floorId) ||
      (!gdState?.activeSpeaker && Number.isFinite(headId) && myId === headId));

  useEffect(() => {
    if (!isMyTurn || gdState?.micHot) {
      setClaimSecsLeft(null);
      return undefined;
    }
    if (gdState?.floorGrantedAt == null) {
      setClaimSecsLeft(null);
      return undefined;
    }
    const grant = Number(gdState.floorGrantedAt);
    if (!Number.isFinite(grant)) {
      setClaimSecsLeft(null);
      return undefined;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil(FLOOR_CLAIM_DEADLINE_SEC - (Date.now() - grant) / 1000));
      setClaimSecsLeft(left);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [isMyTurn, gdState?.floorGrantedAt, gdState?.micHot]);

  const invitedLen = Array.isArray(gdState?.invitedStudentIds)
    ? gdState.invitedStudentIds.length
    : 0;
  const maxQueueSlots = invitedLen > 0 ? invitedLen : 12;
  const queueFull = (gdState?.queue?.length ?? 0) >= maxQueueSlots;
  /** Allow tap while already in queue if live but floor not assigned (server heals on duplicate request) */
  const stuckInQueueNoFloor =
    gdState?.status === 'ACTIVE' && inQueue && !gdState?.activeSpeaker;
  const canRequestSpeak =
    !isMyTurn &&
    !queueFull &&
    (gdState?.status === 'ACTIVE' || gdState?.status === 'PREP' || gdState?.status === 'LOBBY') &&
    (!inQueue || stuckInQueueNoFloor);

  const topicRevealed =
    gdState?.status === 'PREP' ||
    gdState?.status === 'ACTIVE' ||
    gdState?.status === 'PAUSED' ||
    gdState?.status === 'COMPLETED';
  const topicDisplay = topicRevealed
    ? gdState?.topic || 'Group discussion'
    : null;

  if (!isOpen) return null;

  const phaseLabel =
    gdState?.status === 'PREP'
      ? 'Preparation'
      : gdState?.status === 'LOBBY'
        ? 'Lobby'
      : gdState?.status === 'ACTIVE'
        ? 'Live discussion'
        : gdState?.status === 'PAUSED'
          ? 'Paused'
          : gdState?.status === 'COMPLETED'
            ? 'Ended'
            : 'Lobby';

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0b0f14] text-zinc-100">
      {/* Top bar — meeting chrome */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0f1419] px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/30 text-indigo-300">
            <Radio className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-zinc-500">IntelliPlace · GD room</p>
            <h1 className="truncate text-lg font-semibold text-white">Group discussion</h1>
          </div>
        </div>

        <div className="flex flex-1 min-w-0 justify-center px-2">
          <div className="flex max-w-2xl flex-col items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-center">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Topic</p>
            {topicRevealed && topicDisplay ? (
              <p className="text-sm font-medium text-zinc-100 line-clamp-2">{topicDisplay}</p>
            ) : (
              <p className="text-sm text-zinc-500">
                Hidden until the host starts the session
              </p>
            )}
            {(gdState?.status === 'ACTIVE' || gdState?.status === 'PAUSED') &&
              gdState?.discussionStartedAt != null && (
                <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-500">
                  Discussion {Math.floor(discussionElapsedSec / 60)}:
                  {(discussionElapsedSec % 60).toString().padStart(2, '0')}
                </p>
              )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              gdState?.status === 'ACTIVE'
                ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40'
                : 'bg-white/10 text-zinc-300'
            }`}
          >
            {gdState?.status === 'ACTIVE' && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
            )}
            {phaseLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/10"
          >
            Leave
          </button>
        </div>
      </header>

      {toast && (
        <div
          className={`mx-auto mt-3 max-w-lg rounded-lg px-4 py-2 text-center text-sm shadow-lg ${
            toast.tone === 'error'
              ? 'border border-red-500/40 bg-red-950/90 text-red-100'
              : 'border border-sky-500/30 bg-sky-950/80 text-sky-100'
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Main stage */}
        <main className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-6 overflow-hidden">
          {!isJoined || !gdState ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-[#12171f]">
              <Loader2 className="h-12 w-12 animate-spin text-indigo-400" />
              <p className="text-zinc-400">Connecting to the live session…</p>
            </div>
          ) : gdState.status === 'CREATED' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/15 bg-[#12171f] p-8 text-center">
              <Users className="h-14 w-14 text-zinc-600" />
              <div>
                <h2 className="text-xl font-semibold text-white">Waiting for the host</h2>
                <p className="mt-2 text-zinc-500">
                  Recruiters will start preparation when everyone is ready. Keep this window open.
                </p>
              </div>
            </div>
          ) : gdState.status === 'LOBBY' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-8 rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-indigo-950/30 to-[#12171f] p-8 text-center">
              <Users className="h-16 w-16 text-indigo-300/90" />
              <div>
                <h2 className="text-2xl font-bold text-white">Lobby open</h2>
                <p className="mt-2 max-w-md text-zinc-400">
                  You are in the GD room. Wait until all invited candidates join and recruiter starts the session.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-5 py-3 text-sm text-zinc-300">
                Joined: {Array.isArray(gdState.joinedStudentIds) ? gdState.joinedStudentIds.length : 0}
                {' / '}
                {Array.isArray(gdState.invitedStudentIds) ? gdState.invitedStudentIds.length : 0}
              </div>
              <button
                type="button"
                onClick={requestToSpeak}
                disabled={!canRequestSpeak}
                className={`inline-flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold shadow-lg transition ${!canRequestSpeak ? 'cursor-not-allowed bg-white/10 text-zinc-500' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
              >
                <Hand className="h-5 w-5" />
                {inQueue
                  ? 'In speaker queue'
                  : queueFull
                    ? 'Queue full'
                    : 'Request to speak'}
              </button>
              {queueFull && !inQueue && (
                <p className="text-xs text-amber-400/90">Queue is full — wait for a turn to finish.</p>
              )}
            </div>
          ) : gdState.status === 'PREP' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-8 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-950/40 to-[#12171f] p-8 text-center">
              <Clock className="h-16 w-16 text-amber-400/90" />
              <div>
                <h2 className="text-2xl font-bold text-white">Preparation time</h2>
                {topicDisplay && (
                  <p className="mx-auto mt-3 max-w-lg text-base font-medium leading-snug text-amber-100/95">
                    {topicDisplay}
                  </p>
                )}
                <p className="mt-2 max-w-md text-zinc-400">
                  Use this time to organise your thoughts. You may join the speaker queue early.
                </p>
              </div>
              <div className="font-mono text-6xl font-bold tabular-nums text-amber-300">
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </div>

              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <button
                  type="button"
                  onClick={requestToSpeak}
                  disabled={!canRequestSpeak}
                  className={`inline-flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold shadow-lg transition ${
                    !canRequestSpeak
                      ? 'cursor-not-allowed bg-white/10 text-zinc-500'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500'
                  }`}
                >
                  <Hand className="h-5 w-5" />
                  {inQueue
                    ? 'In speaker queue'
                    : queueFull
                      ? 'Queue full'
                      : 'Request to speak'}
                </button>
                <p className="text-xs text-zinc-500">
                  Queue carries over when discussion goes live.
                </p>
              </div>
            </div>
          ) : gdState.status === 'PAUSED' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-yellow-500/30 bg-yellow-950/20 p-8">
              <MicOff className="h-14 w-14 text-yellow-500/70" />
              <h2 className="text-xl font-semibold text-yellow-100">Session paused</h2>
              <p className="text-zinc-400">Hosts may resume shortly.</p>
            </div>
          ) : gdState.status === 'ACTIVE' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              {/* Participant ribbon (simple tiles) */}
              <div className="flex shrink-0 gap-3 overflow-x-auto pb-2">
                <MeetingTile
                  label="Topic"
                  subtitle={topicDisplay || '—'}
                  accent="ring-amber-500/40 bg-amber-950/25"
                  icon={<MessageSquareQuote className="h-6 w-6" />}
                />
                <MeetingTile
                  label={
                    gdState.micHot
                      ? 'Speaking now'
                      : gdState.activeSpeaker
                        ? 'Has the floor'
                        : gdState.queue?.length
                          ? 'Next up'
                          : 'Floor'
                  }
                  subtitle={
                    gdState.micHot?.name ||
                    gdState.activeSpeaker?.name ||
                    gdState.queue?.[0]?.name ||
                    'Open'
                  }
                  accent={
                    gdState.micHot
                      ? 'ring-red-500/60 bg-red-950/35'
                      : gdState.activeSpeaker || gdState.queue?.length
                        ? 'ring-red-500/40 bg-red-950/25'
                        : 'ring-zinc-600 bg-zinc-900/80'
                  }
                  pulse={!!gdState.micHot || !!gdState.activeSpeaker || !!gdState.queue?.length}
                  icon={<Mic className="h-6 w-6" />}
                />
                <MeetingTile
                  label="You"
                  subtitle={user.name || 'Participant'}
                  accent="ring-emerald-500/40 bg-emerald-950/25"
                  icon={<Volume2 className="h-6 w-6" />}
                />
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171f]">
                {isMyTurn ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center overflow-y-auto">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-emerald-400/90">Your turn</p>
                      <h2 className="mt-2 text-2xl font-bold text-white">Push to speak</h2>
                      {claimSecsLeft != null && claimSecsLeft > 0 && !isSpeaking && (
                        <p className="mt-3 font-mono text-lg font-semibold tabular-nums text-amber-300">
                          Open the mic within {claimSecsLeft}s or the next person gets the floor
                        </p>
                      )}
                      <p className="mt-2 text-sm text-zinc-400">
                        Hold Space or press and hold the green mic — max {MAX_HOLD_MS / 1000}s per hold. Release to
                        finish. Extended silence ({SILENCE_AUTO_STOP_MS / 1000}s) ends your turn early.
                      </p>
                    </div>

                    {isTranscribing ? (
                      <div className="flex flex-col items-center gap-3 text-indigo-300">
                        <Loader2 className="h-10 w-10 animate-spin" />
                        <span className="text-sm">Saving your turn…</span>
                      </div>
                    ) : (
                      <>
                        <div
                          className={`relative flex min-h-[11rem] w-full max-w-lg flex-col justify-between gap-4 rounded-2xl border-2 bg-gradient-to-b from-zinc-900/90 to-black/50 p-5 shadow-inner ${
                            isSpeaking
                              ? 'border-red-500/90 shadow-[0_0_48px_rgba(239,68,68,0.18)]'
                              : 'border-emerald-500/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
                                Push-to-talk
                              </p>
                              <p
                                className={`mt-1 text-lg font-semibold ${isSpeaking ? 'text-white' : 'text-zinc-200'}`}
                              >
                                {isSpeaking ? 'Live — release to send' : 'Mic armed'}
                              </p>
                              <p className="mt-1 max-w-[20rem] text-xs leading-relaxed text-zinc-500">
                                Hold <kbd className="rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">Space</kbd> or press and hold the button below. Max{' '}
                                {MAX_HOLD_MS / 1000}s; silence {SILENCE_AUTO_STOP_MS / 1000}s ends early.
                              </p>
                            </div>
                            <div
                              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${
                                isSpeaking
                                  ? 'border-red-400/50 bg-red-950/50 text-red-300'
                                  : 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                              }`}
                              aria-hidden
                            >
                              <Radio className={`h-5 w-5 ${isSpeaking ? 'animate-pulse' : ''}`} />
                            </div>
                          </div>

                          <div
                            className="h-2 w-full overflow-hidden rounded-full bg-zinc-800"
                            aria-label="Input level"
                          >
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-[width] duration-150"
                              style={{ width: `${Math.round(audioLevel * 100)}%` }}
                            />
                          </div>

                          {isSpeaking &&
                            liveCaption &&
                            Number(liveCaption.studentId) === myId &&
                            liveCaption.displayText && (
                              <div className="max-h-24 overflow-y-auto rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-left text-sm leading-snug text-zinc-100">
                                <span className="text-[10px] font-medium uppercase tracking-wider text-cyan-400/90">
                                  You (live)
                                </span>
                                <p className="mt-1">{liveCaption.displayText}</p>
                              </div>
                            )}
                        </div>

                        <button
                          type="button"
                          disabled={isTranscribing}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (!holdingRef.current && !recordingActiveRef.current) {
                              holdingRef.current = true;
                              startRecording();
                            }
                          }}
                          onMouseUp={() => stopRecording()}
                          onMouseLeave={() => {
                            if (holdingRef.current && recordingActiveRef.current) stopRecording();
                          }}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            if (!holdingRef.current && !recordingActiveRef.current) {
                              holdingRef.current = true;
                              startRecording();
                            }
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            stopRecording();
                          }}
                          className={`group relative flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-full text-white shadow-2xl outline-none ring-offset-2 ring-offset-[#12171f] transition-[transform,box-shadow] focus-visible:ring-4 focus-visible:ring-indigo-500 ${
                            isSpeaking
                              ? 'scale-105 bg-gradient-to-br from-red-500 to-red-700 shadow-red-900/40 ring-2 ring-red-300/40'
                              : 'bg-gradient-to-br from-emerald-500 to-teal-700 hover:scale-[1.03] hover:shadow-emerald-900/30 hover:ring-2 hover:ring-emerald-300/30'
                          } ${isTranscribing ? 'cursor-not-allowed opacity-60' : ''}`}
                          aria-label="Hold to speak"
                        >
                          <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/10" />
                          <Mic className={`relative h-12 w-12 drop-shadow-md ${isSpeaking ? 'animate-bounce' : ''}`} />
                          <span className="relative max-w-[6.5rem] text-center text-[11px] font-bold uppercase tracking-widest text-white/95">
                            {isSpeaking ? 'Release' : 'Hold'}
                          </span>
                          <span className="relative text-[9px] font-medium uppercase tracking-wider text-white/70">
                            to talk
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-10 p-8 overflow-y-auto">
                    {gdState.activeSpeaker ? (
                      <div className="flex flex-col items-center text-center">
                        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl font-bold text-white shadow-xl ring-4 ring-white/10">
                          {gdState.activeSpeaker.name?.charAt(0) ?? '?'}
                        </div>
                        <h3 className="text-2xl font-semibold">{gdState.activeSpeaker.name}</h3>
                        {gdState.micHot ? (
                          <>
                            <p className="mt-3 flex animate-pulse items-center justify-center gap-2 text-sm font-medium text-red-300">
                              <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                              On the microphone
                            </p>
                            {liveCaption?.displayText &&
                              Number(liveCaption.studentId) ===
                                Number(gdState.micHot.studentId) && (
                                <div className="mx-auto mt-4 max-w-md rounded-xl border border-red-500/20 bg-black/40 px-4 py-3 text-left">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-red-300/90">
                                    Live caption
                                  </p>
                                  <p className="mt-1 text-sm leading-relaxed text-zinc-100">
                                    {liveCaption.displayText}
                                  </p>
                                </div>
                              )}
                          </>
                        ) : (
                          <p className="mt-3 text-sm text-zinc-500">Waiting to press and hold Space…</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center text-zinc-500">
                        <MicOff className="mb-4 h-16 w-16 opacity-50" />
                        <p>
                          {gdState.queue?.[0]
                            ? `${gdState.queue[0].name} is next — waiting for them to open the mic.`
                            : 'No one has the floor yet.'}
                        </p>
                        {stuckInQueueNoFloor ? (
                          <p className="mt-2 max-w-sm text-sm text-amber-200/90">
                            You’re #{myQueueIndex >= 0 ? myQueueIndex + 1 : 1} in line — tap the button below once to
                            sync your turn and unlock the microphone.
                          </p>
                        ) : (
                          <p className="mt-2 text-sm">Request below when you’re ready.</p>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={requestToSpeak}
                      disabled={!canRequestSpeak || gdState.status !== 'ACTIVE'}
                      className={`inline-flex items-center gap-3 rounded-full px-10 py-4 text-lg font-semibold shadow-lg transition ${
                        !canRequestSpeak || gdState.status !== 'ACTIVE'
                          ? 'cursor-not-allowed bg-white/10 text-zinc-500'
                          : 'bg-indigo-600 text-white hover:bg-indigo-500'
                      }`}
                    >
                      <Hand className="h-6 w-6" />
                      {stuckInQueueNoFloor
                        ? 'Sync my turn & mic'
                        : inQueue
                          ? `In queue${myQueueIndex >= 0 ? ` (#${myQueueIndex + 1})` : ''}`
                          : queueFull
                            ? 'Queue full'
                            : 'Request to speak'}
                    </button>
                    {queueFull && !inQueue && gdState.status === 'ACTIVE' && (
                      <p className="text-center text-xs text-amber-400/90">
                        Queue is full ({maxQueueSlots} slots). Wait for a turn to finish.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-[#12171f] p-12 text-center">
              <Square className="h-14 w-14 text-zinc-600" />
              <h2 className="text-xl font-semibold text-white">This session has ended</h2>
              <p className="text-zinc-400">You can safely leave.</p>
            </div>
          )}
        </main>

        {/* Sidebar — queue + transcripts */}
        <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-white/10 bg-[#0f1419] p-4 lg:w-96 lg:border-l lg:border-t-0 lg:p-6 min-h-0 max-h-[40vh] lg:max-h-none">
          <section className="flex min-h-0 flex-[0_1_42%] flex-col rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
              <h3 className="text-sm font-semibold text-zinc-200">Speaker queue</h3>
              <span className="rounded-md bg-black/40 px-2 py-0.5 text-xs text-zinc-400">
                {(gdState?.queue?.length ?? 0)}
                {maxQueueSlots ? ` / ${maxQueueSlots}` : ''}
              </span>
            </div>
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {!gdState?.queue?.length ? (
                <li className="p-6 text-center text-sm text-zinc-500">No one in queue yet</li>
              ) : (
                gdState.queue.map((q, idx) => (
                  <li
                    key={`${q.studentId}-${idx}`}
                    className={`rounded-lg px-3 py-2 text-sm flex items-center gap-2 border ${
                      Number.isFinite(myId) && Number(q.studentId) === myId
                        ? 'border-indigo-400/60 bg-indigo-950/50'
                        : 'border-white/5 bg-black/25'
                    }`}
                  >
                    <span className="font-mono text-[11px] text-zinc-500">#{idx + 1}</span>
                    <span
                      className={`flex-1 truncate ${
                        Number.isFinite(myId) && Number(q.studentId) === myId
                          ? 'font-semibold text-white'
                          : 'text-zinc-300'
                      }`}
                    >
                      {q.name}
                      {Number.isFinite(myId) && Number(q.studentId) === myId ? ' · you' : ''}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
              <h3 className="text-sm font-semibold text-zinc-200">Live transcript</h3>
              <span className="rounded-md bg-black/40 px-2 py-0.5 text-xs text-indigo-300">Deepgram</span>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {gdState?.micHot && liveCaption?.displayText && (
                <div className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 p-3 text-sm shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/90">
                    Live · {liveCaption.name}
                  </p>
                  <p className="mt-1 leading-relaxed text-zinc-100">{liveCaption.displayText}</p>
                </div>
              )}
              {transcripts.length === 0 ? (
                <p className="text-center text-sm text-zinc-500">Contribution text appears here.</p>
              ) : (
                transcripts.map((t, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-white/5 bg-black/30 p-3 text-sm"
                  >
                    <p className="font-semibold text-indigo-200">
                      {t.name}
                      {Number.isFinite(myId) && Number(t.studentId) === myId ? ' (you)' : ''}
                      <span className="float-right text-[10px] font-normal text-zinc-600">
                        {t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : ''}
                      </span>
                    </p>
                    <p className="mt-2 leading-relaxed text-zinc-300">
                      {t.text ? t.text : <em className="text-zinc-600">(silent)</em>}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MeetingTile({ label, subtitle, accent, pulse, icon }) {
  return (
    <div
      className={`flex min-w-[160px] max-w-[220px] shrink-0 items-center gap-3 rounded-xl border border-white/10 p-4 ring-2 ring-inset ${accent}`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-black/35 text-zinc-200 ${
          pulse ? 'animate-pulse' : ''
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 text-left">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="truncate text-sm font-medium text-white">{subtitle}</p>
      </div>
    </div>
  );
}
