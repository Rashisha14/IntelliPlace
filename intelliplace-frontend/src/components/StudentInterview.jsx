import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Loader,
  CheckCircle,
  AlertCircle,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MessageSquare,
  PhoneOff,
  User,
  Briefcase,
  Volume2,
} from 'lucide-react';
import { API_BASE_URL } from '../config.js';
import { getCurrentUser } from '../utils/auth.js';

function normalizeDisplayName(raw) {
  if (raw == null || raw === '') return '';
  return String(raw).trim().replace(/\s+/g, ' ');
}

/**
 * IntelliPlace student interview: Deepgram Voice Agent (wss) drives audio Q&A.
 * Each completed user turn is POSTed to the backend for Gemini scoring + DB storage.
 */
const StudentInterview = ({
  isOpen,
  onClose,
  jobId,
  applicationId,
  onAnswerSubmitted,
  session: initialSession,
  candidateDisplayName: candidateDisplayNameProp,
}) => {
  const [session, setSession] = useState(initialSession || null);
  const [candidateDisplayName, setCandidateDisplayName] = useState(
    () => normalizeDisplayName(candidateDisplayNameProp) || normalizeDisplayName(getCurrentUser()?.name)
  );
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState(null);
  const [agentError, setAgentError] = useState(null);

  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [qaPanelOpen, setQaPanelOpen] = useState(true);

  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const [localStreamReady, setLocalStreamReady] = useState(false);

  const [voiceStarted, setVoiceStarted] = useState(false);
  const [connectingAgent, setConnectingAgent] = useState(false);
  const [agentToken, setAgentToken] = useState(null);
  const [agentSettings, setAgentSettings] = useState(null);
  const [wsUrl, setWsUrl] = useState('wss://agent.deepgram.com/v1/agent/converse');
  const agentHostRef = useRef(null);
  const agentElRef = useRef(null);

  const lastAssistantRef = useRef(null);
  const userPiecesRef = useRef([]);
  const onStructuredMessageRef = useRef(() => {});
  const autoFinalizingRef = useRef(false);
  const [transcript, setTranscript] = useState([]);

  const [endingInterview, setEndingInterview] = useState(false);

  const appendTranscript = useCallback((role, text) => {
    const t = String(text || '').trim();
    if (!t) return;
    setTranscript((prev) => [...prev, { role, text: t, at: Date.now() }]);
  }, []);

  const stopMedia = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setLocalStreamReady(false);
  }, []);

  const destroyAgent = useCallback(() => {
    const el = agentElRef.current;
    const host = agentHostRef.current;
    if (el) {
      try {
        el.removeAttribute('config');
      } catch (_) {
        /* ignore */
      }
      if (host?.contains(el)) {
        try {
          host.removeChild(el);
        } catch (_) {
          /* ignore */
        }
      }
    }
    agentElRef.current = null;
    setVoiceStarted(false);
    setAgentToken(null);
    setAgentSettings(null);
  }, []);

  const postAgentAnswer = useCallback(
    async (questionText, answerText) => {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/agent-answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ questionText, answerText }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Failed to save answer');
      }
      if (data.data?.session) {
        setSession(data.data.session);
      }
      if (onAnswerSubmitted) {
        onAnswerSubmitted(data.data);
      }
      if (data.data?.shouldEndInterview && !autoFinalizingRef.current) {
        autoFinalizingRef.current = true;
        setEndingInterview(true);
        setAgentError(null);
        destroyAgent();
        try {
          const resFin = await fetch(
            `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/voice-session/complete`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
          const dataFin = await resFin.json().catch(() => ({}));
          if (resFin.ok && dataFin.data?.session) {
            setSession(dataFin.data.session);
            if (onAnswerSubmitted) onAnswerSubmitted(dataFin.data);
          } else {
            setAgentError(dataFin.message || 'Could not finalize interview after the planned number of answers');
            autoFinalizingRef.current = false;
          }
        } catch (e) {
          console.error(e);
          setAgentError(e.message || 'Could not finalize interview');
          autoFinalizingRef.current = false;
        } finally {
          setEndingInterview(false);
        }
      }
    },
    [jobId, applicationId, onAnswerSubmitted, destroyAgent]
  );

  useEffect(() => {
    if (!isOpen) {
      stopMedia();
      destroyAgent();
      setSession(null);
      setError(null);
      setAgentError(null);
      setTranscript([]);
      lastAssistantRef.current = null;
      userPiecesRef.current = [];
      setConnectingAgent(false);
      setEndingInterview(false);
      autoFinalizingRef.current = false;
      setCandidateDisplayName(
        normalizeDisplayName(candidateDisplayNameProp) || normalizeDisplayName(getCurrentUser()?.name)
      );
    }
  }, [isOpen, stopMedia, destroyAgent, candidateDisplayNameProp]);

  useEffect(() => {
    if (isOpen && initialSession) {
      setSession(initialSession);
    }
  }, [isOpen, initialSession]);

  useEffect(() => {
    if (!isOpen) return;
    const cn = normalizeDisplayName(candidateDisplayNameProp);
    if (cn) setCandidateDisplayName(cn);
  }, [isOpen, candidateDisplayNameProp]);

  const fetchSession = useCallback(
    async (opts = {}) => {
      const silent = !!opts.silent;
      if (!silent) setLoadingSession(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(
          `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/student-session`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.data?.session) {
            setSession(data.data.session);
            const cn = normalizeDisplayName(data.data?.candidateDisplayName);
            if (cn) setCandidateDisplayName(cn);
            return data.data.session;
          }
        } else if (res.status === 404) {
          setError('No active interview session found');
        }
      } catch (err) {
        console.error('Error fetching session:', err);
        if (!silent) setError('Failed to load interview session');
      } finally {
        if (!silent) setLoadingSession(false);
      }
      return null;
    },
    [jobId, applicationId]
  );

  useEffect(() => {
    if (isOpen && jobId && applicationId && !session) {
      fetchSession();
    }
  }, [isOpen, jobId, applicationId, fetchSession, session]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await import('@deepgram/browser-agent');
      } catch (e) {
        if (!cancelled) console.error('@deepgram/browser-agent:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Preview camera when modal open (before voice starts)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const setup = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        // Video-only preview: Deepgram Voice Agent opens its own microphone when the session starts.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.getVideoTracks().forEach((t) => {
          t.enabled = videoOn;
        });
        streamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setLocalStreamReady(true);
      } catch (e) {
        console.warn('Camera/microphone:', e);
        setLocalStreamReady(false);
      }
    };

    setup();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = videoOn;
    });
  }, [videoOn]);

  const handleStartVoiceAgent = async () => {
    if (!session || session.status !== 'ACTIVE') {
      setError('No active interview session');
      return;
    }
    setError(null);
    setAgentError(null);
    setConnectingAgent(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/voice-agent-config`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Could not load Voice Agent config');
      }
      setAgentToken(data.data.token);
      setAgentSettings(data.data.settings);
      if (data.data.webSocketUrl) {
        setWsUrl(data.data.webSocketUrl);
      }
      setVoiceStarted(true);
    } catch (e) {
      console.error(e);
      setAgentError(e.message || 'Failed to start Voice Agent');
    } finally {
      setConnectingAgent(false);
    }
  };

  useEffect(() => {
    onStructuredMessageRef.current = (ev) => {
      const msg = ev.detail;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'Error') {
        const detail = msg.description || msg.message || msg.code || 'Unknown error';
        setAgentError(typeof detail === 'string' ? detail : JSON.stringify(detail));
        return;
      }
      if (msg.type === 'Warning') {
        console.warn('[Voice Agent]', msg.description || msg);
        return;
      }
      if (msg.type !== 'ConversationText') return;

      if (msg.role === 'user') {
        const piece = String(msg.content || '').trim();
        if (piece) {
          userPiecesRef.current.push(piece);
          appendTranscript('user', piece);
        }
        return;
      }

      if (msg.role === 'assistant') {
        const text = String(msg.content || '').trim();
        appendTranscript('assistant', text);

        const ans = userPiecesRef.current.filter(Boolean).join(' ').trim();
        const prevQ = lastAssistantRef.current;
        if (prevQ && ans) {
          postAgentAnswer(prevQ, ans).catch((e) => {
            console.error('[Interview] agent-answer:', e);
            setAgentError(e.message || 'Failed to save answer');
          });
        }
        userPiecesRef.current = [];
        lastAssistantRef.current = text;
      }
    };
  }, [appendTranscript, postAgentAnswer]);

  const agentSettingsKey =
    agentSettings != null ? JSON.stringify(agentSettings) : '';

  useLayoutEffect(() => {
    if (!voiceStarted || !agentToken || !agentSettings) return;
    const host = agentHostRef.current;
    if (!host) return;

    let cancelled = false;

    let el = agentElRef.current;
    if (!el) {
      el = document.createElement('deepgram-agent');
      el.setAttribute('url', wsUrl);
      el.setAttribute('auth-scheme', 'bearer');
      el.setAttribute('output-sample-rate', '24000');
      el.setAttribute('idle-timeout-ms', '180000');
      el.setAttribute('height', '200');
      el.setAttribute('width', '200');
      host.appendChild(el);
      agentElRef.current = el;
    }

    el.token = agentToken;

    const structuredHandler = (e) => onStructuredMessageRef.current(e);
    const onInvalid = () => setAgentError('Voice Agent: invalid authentication');
    const onMicFail = () => setAgentError('Microphone permission denied or unavailable.');
    const onFailedSetup = () => setAgentError('Voice Agent failed to start. Try again or check the browser console.');
    const onSocketClose = (e) => {
      if (e?.detail?.code && e.detail.code !== 1000) {
        console.warn('[Voice Agent] socket closed', e.detail);
      }
    };

    el.addEventListener('structured message', structuredHandler);
    el.addEventListener('invalid auth', onInvalid);
    el.addEventListener('failed to connect user media', onMicFail);
    el.addEventListener('failed setup', onFailedSetup);
    el.addEventListener('socket close', onSocketClose);

    const applyConfig = () => {
      if (cancelled) return;
      try {
        el.setAttribute('config', agentSettingsKey);
      } catch (err) {
        console.error('[Voice Agent] config:', err);
        setAgentError('Interview settings are too large or invalid. Ask an admin to shorten job description in the database.');
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(applyConfig);
    });

    return () => {
      cancelled = true;
      el.removeEventListener('structured message', structuredHandler);
      el.removeEventListener('invalid auth', onInvalid);
      el.removeEventListener('failed to connect user media', onMicFail);
      el.removeEventListener('failed setup', onFailedSetup);
      el.removeEventListener('socket close', onSocketClose);
      try {
        el.removeAttribute('config');
      } catch (_) {
        /* ignore */
      }
      const h = agentHostRef.current;
      if (h?.contains(el)) {
        try {
          h.removeChild(el);
        } catch (_) {
          /* ignore */
        }
      }
      agentElRef.current = null;
    };
  }, [voiceStarted, agentToken, agentSettingsKey, wsUrl]);

  const handleEndInterview = async () => {
    setEndingInterview(true);
    setAgentError(null);
    destroyAgent();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/voice-session/complete`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.data?.session) {
        setSession(data.data.session);
        if (onAnswerSubmitted) onAnswerSubmitted(data.data);
      } else {
        setAgentError(data.message || 'Could not finalize interview');
      }
    } catch (e) {
      console.error(e);
      setAgentError(e.message || 'Could not finalize interview');
    } finally {
      setEndingInterview(false);
    }
  };

  const handleLeave = () => {
    destroyAgent();
    stopMedia();
    onClose();
  };

  if (!isOpen) return null;

  const modeLabel = session?.mode === 'TECH' ? 'Technical' : 'HR';
  const overall = session?.overallEvaluation;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#1b1b1f] text-zinc-100 shadow-2xl">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#252528] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight text-white md:text-base">
              IntelliPlace Interview · Deepgram Voice Agent
            </h1>
            <p className="truncate text-xs text-zinc-400">
              {session
                ? `${modeLabel} · ${
                    session.status === 'COMPLETED'
                      ? 'Completed'
                      : voiceStarted
                        ? 'Voice session active'
                        : 'Ready to start'
                  }`
                : 'Connecting…'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLeave}
          className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-700/80 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[42vh] flex-1 bg-[#0f0f12] lg:min-h-0">
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-black">
            <div className="mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-zinc-800 ring-4 ring-zinc-700/50">
              <User className="h-14 w-14 text-zinc-500" strokeWidth={1.25} />
            </div>
            <p className="text-lg font-medium text-zinc-200">AI interviewer (Deepgram Agent)</p>
            <p className="mt-1 max-w-lg px-6 text-center text-sm text-zinc-500">
              Speak naturally. The agent listens and responds over voice. Your answers are transcribed and saved;
              after the interview ends, Gemini scores the full session for recruiters.
            </p>
          </div>

          <div className="absolute bottom-4 right-4 z-10 w-[min(42vw,220px)] overflow-hidden rounded-xl border-2 border-zinc-600 bg-zinc-900 shadow-2xl aspect-video">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${!videoOn || !localStreamReady ? 'hidden' : ''}`}
            />
            {(!videoOn || !localStreamReady) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-800">
                <User className="h-10 w-10 text-zinc-500" />
                <span className="mt-2 text-xs text-zinc-400">You</span>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {qaPanelOpen && (
            <motion.aside
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              className="flex w-full flex-col border-t border-zinc-800 bg-[#222226] lg:w-[420px] lg:border-l lg:border-t-0"
            >
              <div className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Live conversation</h2>
                <p className="text-xs text-zinc-500">
                  Powered by Deepgram Voice Agent. Scores and feedback are generated when the interview ends.
                </p>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
                {loadingSession ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-zinc-400">
                    <Loader className="h-10 w-10 animate-spin text-blue-500" />
                    <span className="text-sm">Loading interview session…</span>
                  </div>
                ) : !session ? (
                  <div className="flex flex-1 items-center justify-center text-center text-sm text-zinc-400">
                    No interview session found.
                  </div>
                ) : session.status === 'COMPLETED' ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10 px-4 text-center">
                    <CheckCircle className="h-16 w-16 text-emerald-500" strokeWidth={1.25} />
                    <div className="w-full max-w-md">
                      <p className="text-lg font-semibold text-white">Interview complete</p>
                      {overall && typeof overall === 'object' && (
                        <div className="mt-6 rounded-xl border border-emerald-800/40 bg-emerald-950/25 px-4 py-4 text-left">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                            Overall (Gemini)
                          </p>
                          {overall.overallScore != null && (
                            <p className="mt-2 text-3xl font-bold text-white">
                              {overall.overallScore}
                              <span className="text-lg font-normal text-zinc-500">/10</span>
                            </p>
                          )}
                          {overall.verdict && (
                            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                              {String(overall.verdict).replace(/_/g, ' ')}
                            </p>
                          )}
                          {overall.executiveSummary && (
                            <p className="mt-3 text-sm leading-relaxed text-zinc-200">{overall.executiveSummary}</p>
                          )}
                          {overall.hiringRationale && (
                            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{overall.hiringRationale}</p>
                          )}
                          {overall.recommendation && (
                            <p className="mt-4 text-xs text-emerald-300/90">{overall.recommendation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}
                    {(agentError || connectingAgent || endingInterview) && (
                      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {endingInterview
                            ? 'Wrapping up interview and generating evaluation…'
                            : connectingAgent
                              ? 'Connecting to Voice Agent…'
                              : agentError}
                        </span>
                      </div>
                    )}

                    {!voiceStarted ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
                        <Volume2 className="h-12 w-12 text-blue-500 opacity-90" />
                        <p className="text-sm text-zinc-300">
                          When you continue, we request a short-lived token and connect to Deepgram&apos;s Voice Agent.
                          Allow the microphone when prompted.
                        </p>
                        <button
                          type="button"
                          onClick={handleStartVoiceAgent}
                          disabled={connectingAgent || session.status !== 'ACTIVE'}
                          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500 disabled:opacity-50"
                        >
                          {connectingAgent ? <Loader className="h-5 w-5 animate-spin" /> : null}
                          Start voice interview
                        </button>
                      </div>
                    ) : (
                      <div className="flex min-h-0 flex-1 flex-col gap-3">
                        <p className="text-xs text-zinc-500">
                          Interview in progress. Use <span className="text-zinc-300">End interview</span> when the
                          agent has finished and you are done speaking.
                        </p>
                        <div
                          ref={agentHostRef}
                          className="flex min-h-[200px] items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-900/50 p-4"
                        >
                          <span className="text-xs text-zinc-500">Agent animation / audio</span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-700/80 bg-[#1b1b1f] p-3">
                          {transcript.length === 0 ? (
                            <p className="text-xs text-zinc-500">Transcript appears as you and the agent speak…</p>
                          ) : (
                            <ul className="space-y-3 text-sm">
                              {transcript.map((line, i) => (
                                <li
                                  key={`${line.at}-${i}`}
                                  className={
                                    line.role === 'assistant'
                                      ? 'rounded-lg border border-blue-900/40 bg-blue-950/20 px-3 py-2 text-zinc-200'
                                      : 'rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-zinc-300'
                                  }
                                >
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                    {line.role === 'assistant' ? 'Interviewer' : 'You'}
                                  </span>
                                  <p className="mt-1 whitespace-pre-wrap leading-relaxed">{line.text}</p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={handleEndInterview}
                          disabled={endingInterview}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/60 bg-emerald-950/40 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-950/60 disabled:opacity-50"
                        >
                          {endingInterview ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          End interview &amp; save results
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <footer className="flex h-[72px] shrink-0 items-center justify-center gap-2 border-t border-zinc-800 bg-[#2d2d32] px-4 pb-2">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => !voiceStarted && setMicOn((m) => !m)}
            disabled={voiceStarted}
            title={
              voiceStarted
                ? 'Microphone is used by the Voice Agent'
                : micOn
                  ? 'Preview: camera only until voice starts'
                  : ''
            }
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
              voiceStarted ? 'cursor-not-allowed opacity-50' : ''
            } ${micOn && !voiceStarted ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-zinc-700'}`}
          >
            {voiceStarted ? <Mic className="h-5 w-5" /> : micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => setVideoOn((v) => !v)}
            title={videoOn ? 'Stop video' : 'Start video'}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
              videoOn ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-white text-zinc-900 hover:bg-zinc-200'
            }`}
          >
            {videoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => setQaPanelOpen((o) => !o)}
            title={qaPanelOpen ? 'Hide panel' : 'Show panel'}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
              qaPanelOpen ? 'bg-blue-600 hover:bg-blue-500' : 'bg-zinc-700 hover:bg-zinc-600'
            }`}
          >
            <MessageSquare className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-4 hidden h-8 w-px bg-zinc-600 sm:block" />

        <button
          type="button"
          onClick={handleLeave}
          className="flex h-12 items-center gap-2 rounded-full bg-[#e02828] px-5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#c92222]"
        >
          <PhoneOff className="h-5 w-5" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </footer>
    </div>
  );
};

export default StudentInterview;
