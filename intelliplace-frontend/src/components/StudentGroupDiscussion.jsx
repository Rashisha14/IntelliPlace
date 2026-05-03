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
import { API_BASE_URL } from '../config';
import { getCurrentUser } from '../utils/auth';

const MAX_HOLD_MS = 90_000;
/** While holding PTT: if RMS stays near silence this long after last sound → auto-stop */
const SILENCE_AUTO_STOP_MS = 12_000;
/** Ignore silence detection briefly after starting mic */
const SILENCE_ARM_MS = 3_500;
const RMS_SILENT_BELOW = 1.85;

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
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  useEffect(() => {
    if (!isOpen || !jobId) return;

    const backendUrl = API_BASE_URL.replace('/api', '');
    const newSocket = io(backendUrl, { withCredentials: true });

    newSocket.on('connect', () => {
      newSocket.emit('join_gd', { jobId, userId: user.id, role: 'student', userName: user.name });
    });

    newSocket.on('gd_state_update', (state) => {
      setGdState(state || null);
      setIsJoined(true);
    });

    newSocket.on('gd_speaker_transcript', (data) => {
      setTranscripts((prev) => [...prev, data]);
    });

    setSocket(newSocket);

    return () => {
      clearSilenceWatcher();
      newSocket.disconnect();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    };
  }, [isOpen, jobId, user.id]);

  useEffect(() => {
    const st = gdState?.status;
    if (st === 'PAUSED' || st === 'COMPLETED') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsSpeaking(false);
      recordingActiveRef.current = false;
      holdingRef.current = false;
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      clearSilenceWatcher();
    }
  }, [gdState?.status]);

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

  const stopRecording = useCallback(() => {
    recordingActiveRef.current = false;
    holdingRef.current = false;
    pttEligibleRef.current = false;
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    clearSilenceWatcher();
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch (_) {}
    }
    setIsSpeaking(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (isTranscribing || recordingActiveRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
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

          const data = await res.json();
          if (!data.success) {
            showToast(data.message || 'Transcription failed', 'error');
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

      /* Live input level + silence auto-stop */
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = ctx;
        analyserRef.current = analyser;

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
      } catch (_) {
        /* metering optional */
      }

      recordingTimeoutRef.current = setTimeout(() => {
        if (recordingActiveRef.current) stopRecording();
      }, MAX_HOLD_MS);
    } catch (err) {
      console.error(err);
      recordingActiveRef.current = false;
      setIsSpeaking(false);
      showToast('Microphone access blocked or unavailable.', 'error');
    }
  }, [jobId, isTranscribing, showToast, stopRecording, submitSpeechText]);

  useEffect(() => {
    const isMyTurn =
      gdState?.activeSpeaker?.studentId === user.id && gdState?.status === 'ACTIVE';
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
  }, [gdState?.activeSpeaker, gdState?.status, isTranscribing, startRecording, stopRecording, user.id]);

  const requestToSpeak = () => {
    if (!socket) return;
    const st = gdState?.status;
    if (st !== 'ACTIVE' && st !== 'PREP') return;
    if (gdState.queue?.some((q) => q.studentId === user.id)) return;
    socket.emit('request_speak', {
      jobId,
      studentId: user.id,
      studentName: user.name,
    });
  };

  const inQueue = gdState?.queue?.some((q) => q.studentId === user.id);
  const myQueueIndex = gdState?.queue?.findIndex((q) => q.studentId === user.id);
  const isMyTurn =
    gdState?.activeSpeaker?.studentId === user.id && gdState?.status === 'ACTIVE';

  if (!isOpen) return null;

  const topic = gdState?.topic || 'Group discussion';
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
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b0f14] text-zinc-100">
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
            <p className="text-sm font-medium text-zinc-100 line-clamp-2">{topic}</p>
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
                disabled={inQueue}
                className={`inline-flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold shadow-lg transition ${inQueue ? 'cursor-not-allowed bg-white/10 text-zinc-500' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
              >
                <Hand className="h-5 w-5" />
                {inQueue ? 'In speaker queue' : 'Request to speak'}
              </button>
            </div>
          ) : gdState.status === 'PREP' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-8 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-950/40 to-[#12171f] p-8 text-center">
              <Clock className="h-16 w-16 text-amber-400/90" />
              <div>
                <h2 className="text-2xl font-bold text-white">Preparation time</h2>
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
                  disabled={inQueue}
                  className={`inline-flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold shadow-lg transition ${
                    inQueue
                      ? 'cursor-not-allowed bg-white/10 text-zinc-500'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500'
                  }`}
                >
                  <Hand className="h-5 w-5" />
                  {inQueue ? 'In speaker queue' : 'Request to speak'}
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
                <MeetingTile label="Topic" subtitle={topic} accent="ring-amber-500/40 bg-amber-950/25" icon={<MessageSquareQuote className="h-6 w-6" />} />
                <MeetingTile
                  label={gdState.activeSpeaker ? 'Speaker' : 'Floor'}
                  subtitle={gdState.activeSpeaker?.name || 'Open'}
                  accent={
                    gdState.activeSpeaker ? 'ring-red-500/40 bg-red-950/25' : 'ring-zinc-600 bg-zinc-900/80'
                  }
                  pulse={!!gdState.activeSpeaker}
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
                      <p className="mt-2 text-sm text-zinc-400">
                        Hold Space or the microphone button → speak. Release → stop. Max {MAX_HOLD_MS / 1000}s;
                        prolonged silence ({SILENCE_AUTO_STOP_MS / 1000}s) ends automatically.
                      </p>
                    </div>

                    {isTranscribing ? (
                      <div className="flex flex-col items-center gap-3 text-indigo-300">
                        <Loader2 className="h-10 w-10 animate-spin" />
                        <span className="text-sm">Sending audio to Deepgram…</span>
                      </div>
                    ) : (
                      <>
                        <div
                          className={`relative flex h-40 w-full max-w-lg items-center justify-center rounded-2xl border-2 bg-black/40 ${
                            isSpeaking ? 'border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.2)]' : 'border-emerald-500/50'
                          }`}
                        >
                          <div
                            className="absolute inset-x-10 bottom-4 h-2 overflow-hidden rounded-full bg-zinc-800"
                            aria-hidden
                          >
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-[width] duration-150"
                              style={{ width: `${Math.round(audioLevel * 100)}%` }}
                            />
                          </div>
                          <p className={`text-lg ${isSpeaking ? 'text-white' : 'text-zinc-500'}`}>
                            {isSpeaking ? 'Listening… release when finished' : 'Mic ready — press and hold'}
                          </p>
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
                          className={`relative flex h-44 w-44 flex-col items-center justify-center gap-3 rounded-full text-white shadow-2xl transition-transform outline-none ring-offset-2 ring-offset-[#12171f] focus-visible:ring-4 focus-visible:ring-indigo-500 ${
                            isSpeaking
                              ? 'scale-105 bg-red-600 ring-red-400/50'
                              : 'bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.02]'
                          } ${isTranscribing ? 'cursor-not-allowed opacity-60' : ''}`}
                          aria-label="Hold to speak"
                        >
                          <Mic className={`h-12 w-12 ${isSpeaking ? 'animate-bounce' : ''}`} />
                          <span className="max-w-[7rem] text-center text-xs font-bold uppercase tracking-wide">
                            Hold to speak
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
                        <p className="mt-3 flex animate-pulse items-center gap-2 text-sm text-red-300">
                          <span className="inline-block h-2 w-2 rounded-full bg-red-400" /> On the mic
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center text-zinc-500">
                        <MicOff className="mb-4 h-16 w-16 opacity-50" />
                        <p>No one has the floor. Request below when you're ready.</p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={requestToSpeak}
                      disabled={inQueue || gdState.status !== 'ACTIVE'}
                      className={`inline-flex items-center gap-3 rounded-full px-10 py-4 text-lg font-semibold shadow-lg transition ${
                        inQueue || gdState.status !== 'ACTIVE'
                          ? 'cursor-not-allowed bg-white/10 text-zinc-500'
                          : 'bg-indigo-600 text-white hover:bg-indigo-500'
                      }`}
                    >
                      <Hand className="h-6 w-6" />
                      {inQueue ? `In queue${myQueueIndex >= 0 ? ` (#${myQueueIndex + 1})` : ''}` : 'Request to speak'}
                    </button>
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
                      q.studentId === user.id ? 'border-indigo-400/60 bg-indigo-950/50' : 'border-white/5 bg-black/25'
                    }`}
                  >
                    <span className="font-mono text-[11px] text-zinc-500">#{idx + 1}</span>
                    <span className={`flex-1 truncate ${q.studentId === user.id ? 'font-semibold text-white' : 'text-zinc-300'}`}>
                      {q.name}
                      {q.studentId === user.id ? ' · you' : ''}
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
                      {t.studentId === user.id ? ' (you)' : ''}
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
