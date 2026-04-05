import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
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
  VolumeX,
} from 'lucide-react';
import { API_BASE_URL } from '../config.js';
import { getCurrentUser } from '../utils/auth.js';

function normalizeDisplayName(raw) {
  if (raw == null || raw === '') return '';
  return String(raw).trim().replace(/\s+/g, ' ');
}

/** Spoken in order after Start — uses the same name as the backend / login profile when available. */
function buildAiOpeningLines(displayName) {
  const n = normalizeDisplayName(displayName);
  const hi = n ? `Hi, ${n} — ` : 'Hi — ';
  return [
    `${hi}I'm your AI interviewer for IntelliPlace. I'll run this like a real hiring conversation: we'll touch your background, how you think, and how you might fit this role.`,
    "I'll read each question aloud. You'll see the same words as captions on the main screen so you can follow along.",
    n
      ? `${n}, we'll start with your introduction — your first question is in the panel on the right. I'll read it aloud right after this.`
      : "We'll start with your introduction — your first question is in the panel on the right. I'll read it aloud right after this.",
  ];
}

/** student-session merges `answer` onto each question object */
function findNextUnansweredAfter(questions, answeredIndex) {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  const ai = Number(answeredIndex);
  if (Number.isNaN(ai)) return null;
  const items = questions.map((q, i) => ({
    question: q.question,
    index: Number(q.index !== undefined ? q.index : i),
    answer: q.answer,
  }));
  items.sort((a, b) => a.index - b.index);
  for (const item of items) {
    if (item.index <= ai) continue;
    const hasAnswer = item.answer != null && String(item.answer).trim() !== '';
    if (!hasAnswer) return item;
  }
  return null;
}

const StudentInterview = ({
  isOpen,
  onClose,
  jobId,
  applicationId,
  question,
  questionIndex,
  onAnswerSubmitted,
  session: initialSession,
  candidateDisplayName: candidateDisplayNameProp,
}) => {
  const [session, setSession] = useState(initialSession || null);
  const [candidateDisplayName, setCandidateDisplayName] = useState(
    () => normalizeDisplayName(candidateDisplayNameProp) || normalizeDisplayName(getCurrentUser()?.name)
  );
  const [currentQuestion, setCurrentQuestion] = useState(question || null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(
    questionIndex !== undefined ? questionIndex : -1
  );
  const [interviewStarted, setInterviewStarted] = useState(false);
  /** lobby = before Start; opening = AI intro audio; qa = normal questions */
  const [interviewFlowPhase, setInterviewFlowPhase] = useState('lobby');
  const [captionText, setCaptionText] = useState('');
  const [loadingSession, setLoadingSession] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [qaPanelOpen, setQaPanelOpen] = useState(true);
  const [autoSpeakQuestion, setAutoSpeakQuestion] = useState(true);
  const [speakingQuestion, setSpeakingQuestion] = useState(false);
  const [ttsError, setTtsError] = useState(null);

  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const ttsAudioRef = useRef(null);
  const spokenQuestionKeyRef = useRef(null);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const recognitionRef = useRef(null);
  const [isDictating, setIsDictating] = useState(false);

  const openingLines = useMemo(() => {
    const n =
      normalizeDisplayName(candidateDisplayName) || normalizeDisplayName(getCurrentUser()?.name);
    return buildAiOpeningLines(n);
  }, [candidateDisplayName]);

  const questionsList = (() => {
    if (!session?.questions) return [];
    try {
      return Array.isArray(session.questions)
        ? session.questions
        : JSON.parse(session.questions || '[]');
    } catch {
      return [];
    }
  })();

  const totalQuestions = questionsList.length;
  const displayQNum =
    currentQuestionIndex >= 0 ? Math.min(currentQuestionIndex + 1, Math.max(totalQuestions, 1)) : 0;
  /** Hide misleading "of 1" while the interview can still add more questions */
  const showQuestionTotal =
    totalQuestions > 1 || session?.status !== 'ACTIVE' || !interviewStarted;

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

  const stopTts = useCallback(() => {
    const audio = ttsAudioRef.current;
    if (!audio) return;
    try {
      audio.pause();
    } catch (_) {
      // no-op
    }
    audio.src = '';
    ttsAudioRef.current = null;
    setSpeakingQuestion(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopMedia();
      stopTts();
      setInterviewStarted(false);
      setInterviewFlowPhase('lobby');
      setCaptionText('');
      setCurrentQuestion(null);
      setCurrentQuestionIndex(-1);
      setAnswerText('');
      setSubmitted(false);
      setError(null);
      setTtsError(null);
      spokenQuestionKeyRef.current = null;
      setMicOn(true);
      setVideoOn(true);
      setCandidateDisplayName(
        normalizeDisplayName(candidateDisplayNameProp) || normalizeDisplayName(getCurrentUser()?.name)
      );
    }
  }, [isOpen, stopMedia, stopTts, candidateDisplayNameProp]);

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
    if (isOpen && initialSession) {
      setSession(initialSession);
    }
  }, [isOpen, initialSession]);

  useEffect(() => {
    if (!isOpen) return;
    const cn = normalizeDisplayName(candidateDisplayNameProp);
    if (cn) setCandidateDisplayName(cn);
  }, [isOpen, candidateDisplayNameProp]);

  useEffect(() => {
    if (isOpen && jobId && applicationId && !session) {
      fetchSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-load when opening or target application changes
  }, [isOpen, jobId, applicationId, fetchSession]);


  useEffect(() => {
    if (!isOpen || !interviewStarted) {
      stopMedia();
      return;
    }
    const needCamera = interviewFlowPhase === 'opening' || !!currentQuestion;
    if (!needCamera) {
      stopMedia();
      return;
    }

    let cancelled = false;

    const setupMedia = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;

      try {
        if (streamRef.current) {
          streamRef.current.getAudioTracks().forEach((t) => {
            t.enabled = micOn;
          });
          streamRef.current.getVideoTracks().forEach((t) => {
            t.enabled = videoOn;
          });
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.getAudioTracks().forEach((t) => {
          t.enabled = micOn;
        });
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

    setupMedia();
    return () => {
      cancelled = true;
    };
  }, [isOpen, interviewStarted, interviewFlowPhase, currentQuestion, micOn, videoOn, stopMedia]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = micOn;
    });
    stream.getVideoTracks().forEach((t) => {
      t.enabled = videoOn;
    });
  }, [micOn, videoOn]);

  // If session ever has no unanswered question (e.g. race), poll for updates.
  useEffect(() => {
    if (!isOpen || !interviewStarted || currentQuestion || interviewFlowPhase === 'opening') return;
    const id = setInterval(() => {
      fetchSession({ silent: true });
    }, 3000);
    return () => clearInterval(id);
  }, [isOpen, interviewStarted, currentQuestion, interviewFlowPhase, fetchSession]);

  // When session updates (poll or submit), attach the next unanswered question — only after intro audio finished.
  useEffect(() => {
    if (!isOpen || !session || !interviewStarted || interviewFlowPhase !== 'qa' || currentQuestion) return;
    try {
      const questions = Array.isArray(session.questions)
        ? session.questions
        : JSON.parse(session.questions || '[]');
      const unansweredQ = questions.find((q) => !q.answer);
      if (unansweredQ) {
        setCurrentQuestion(unansweredQ.question);
        setCurrentQuestionIndex(
          unansweredQ.index !== undefined ? unansweredQ.index : questions.indexOf(unansweredQ)
        );
        setError(null);
      }
    } catch (_) {
      /* ignore */
    }
  }, [session, isOpen, interviewStarted, interviewFlowPhase, currentQuestion]);

  const speakPlainText = useCallback(
    async (text) => {
      const t = text?.trim();
      if (!t || !jobId || !applicationId) return;
      stopTts();
      setSpeakingQuestion(true);
      setTtsError(null);

      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: t.slice(0, 3000) }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setSpeakingQuestion(false);
        throw new Error(errJson.message || 'Failed to generate speech');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsAudioRef.current = audio;

      await new Promise((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setSpeakingQuestion(false);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setSpeakingQuestion(false);
          reject(new Error('Could not play text-to-speech audio.'));
        };
        audio.play().catch((e) => {
          URL.revokeObjectURL(url);
          setSpeakingQuestion(false);
          reject(e);
        });
      });
    },
    [jobId, applicationId, stopTts]
  );

  const playOpeningSequence = useCallback(async () => {
    for (const line of openingLines) {
      setCaptionText(line);
      await speakPlainText(line);
    }
    setCaptionText('');
  }, [speakPlainText, openingLines]);

  const handleStartInterview = () => {
    if (!session) {
      setError('Interview session not loaded');
      return;
    }

    setInterviewStarted(true);
    setInterviewFlowPhase('opening');
    setCurrentQuestion(null);
    setCurrentQuestionIndex(-1);
    setAnswerText('');
    setSubmitted(false);
    setError(null);
    setTtsError(null);
    setCaptionText('');
    setQaPanelOpen(true);

    (async () => {
      try {
        await playOpeningSequence();
      } catch (err) {
        console.error('Opening TTS:', err);
        setTtsError(err.message || 'Could not play introduction audio.');
      } finally {
        await fetchSession({ silent: true });
        setInterviewFlowPhase('qa');
        spokenQuestionKeyRef.current = null;
        setCaptionText('');
      }
    })();
  };

  const speakCurrentQuestion = useCallback(async () => {
    if (!currentQuestion || !jobId || !applicationId) return;
    setCaptionText(currentQuestion);
    try {
      await speakPlainText(currentQuestion);
    } catch (err) {
      console.error('TTS error:', err);
      setTtsError(err.message || 'Failed to speak question');
    }
  }, [currentQuestion, jobId, applicationId, speakPlainText]);

  useEffect(() => {
    if (
      !isOpen ||
      !interviewStarted ||
      interviewFlowPhase !== 'qa' ||
      !currentQuestion ||
      !autoSpeakQuestion
    ) {
      return;
    }
    setTtsError(null);
    const key = `${currentQuestionIndex}:${currentQuestion}`;
    if (spokenQuestionKeyRef.current === key) return;
    spokenQuestionKeyRef.current = key;
    speakCurrentQuestion();
  }, [
    isOpen,
    interviewStarted,
    interviewFlowPhase,
    currentQuestion,
    currentQuestionIndex,
    autoSpeakQuestion,
    speakCurrentQuestion,
  ]);

  useEffect(() => {
    return () => {
      stopTts();
    };
  }, [stopTts]);

  // Speech-to-Text integration
  useEffect(() => {
    if (!isOpen || interviewFlowPhase !== 'qa' || submitted || !micOn || speakingQuestion) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
      setIsDictating(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    let isCancelled = false;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      if (!isCancelled) setIsDictating(true);
    };

    recognition.onresult = (event) => {
      if (isCancelled) return;
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setAnswerText((prev) => {
          const f = finalTranscript.trim();
          if (!f) return prev;
          if (prev.length === 0) return f;
          return prev + (prev.endsWith(' ') ? '' : ' ') + f;
        });
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
      if (isCancelled) return;
      // Restart recognition if mic is still on and we should still be listening
      if (micOn && interviewFlowPhase === 'qa' && !submitted && !speakingQuestion) {
        try { recognition.start(); } catch(e) {}
      } else {
        setIsDictating(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch(e) {
      console.error('Failed to start speech recognition:', e);
    }

    return () => {
      isCancelled = true;
      try { recognition.stop(); } catch(e) {}
      recognitionRef.current = null;
    };
  }, [isOpen, interviewFlowPhase, submitted, micOn, speakingQuestion]);

  const handleSubmit = async () => {
    if (!answerText.trim()) {
      setError('Please enter your answer');
      return;
    }

    setSubmitting(true);
    setError(null);

    const answeredIndex = Number(currentQuestionIndex);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/submit-answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            questionIndex: currentQuestionIndex,
            answer: answerText,
            question: currentQuestion,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        // Stop submit spinner immediately — polling can take a while
        setSubmitting(false);

        const payload = data.data;
        const nq = payload?.nextQuestion;

        if (payload?.session) {
          setSession(payload.session);
        }

        if (payload?.interviewCompleted || payload?.session?.status === 'COMPLETED') {
          setSubmitted(false);
          setError(null);
          if (onAnswerSubmitted) onAnswerSubmitted(payload);
          return;
        }

        const mergedQuestions = (() => {
          const s = payload?.session;
          if (!s?.questions) return null;
          return Array.isArray(s.questions) ? s.questions : JSON.parse(s.questions || '[]');
        })();

        const advanceTo = (questionText, indexVal) => {
          setCurrentQuestion(questionText);
          setCurrentQuestionIndex(indexVal);
          setAnswerText('');
          setSubmitted(false);
          setError(null);
        };

        // 1) Explicit next from API
        if (nq?.question) {
          advanceTo(nq.question, nq.index !== undefined ? nq.index : answeredIndex + 1);
          fetchSession({ silent: true });
          if (onAnswerSubmitted) onAnswerSubmitted(payload);
          return;
        }

        // 2) Same response includes merged session — pick next unanswered (no extra GET)
        if (mergedQuestions?.length) {
          const next = findNextUnansweredAfter(mergedQuestions, answeredIndex);
          if (next?.question) {
            advanceTo(next.question, next.index);
            if (onAnswerSubmitted) onAnswerSubmitted(payload);
            return;
          }
        }

        if (payload?.generationError) {
          setError(payload.generationError);
          setSubmitted(false);
          if (onAnswerSubmitted) onAnswerSubmitted(payload);
          return;
        }

        if (onAnswerSubmitted) onAnswerSubmitted(payload);

        setSubmitted(true);

        const pollMs = 1500;
        const maxAttempts = 30;
        let lastSessionStatus = session?.status;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, pollMs));
          }

          try {
            const res = await fetch(
              `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/student-session`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) continue;
            const body = await res.json();
            const sess = body.data?.session;
            if (!sess) continue;
            lastSessionStatus = sess.status;

            const questions = Array.isArray(sess.questions)
              ? sess.questions
              : JSON.parse(sess.questions || '[]');
            const next = findNextUnansweredAfter(questions, answeredIndex);

            if (next?.question) {
              setSession(sess);
              advanceTo(next.question, next.index);
              return;
            }
          } catch (pollErr) {
            console.warn('[Interview] poll for next question:', pollErr);
          }
        }

        setSubmitted(false);
        setError(
          lastSessionStatus === 'ACTIVE'
            ? 'The next question is still loading. Wait a few seconds, or ask your interviewer to generate the next question.'
            : 'No further questions in this session.'
        );
      } else {
        setError(data.message || 'Failed to submit answer');
      }
    } catch (err) {
      console.error('Error submitting answer:', err);
      setError('Failed to submit answer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeave = () => {
    stopMedia();
    stopTts();
    onClose();
  };

  if (!isOpen) return null;

  const modeLabel = session?.mode === 'TECH' ? 'Technical' : 'HR';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#1b1b1f] text-zinc-100 shadow-2xl">
      {/* Top meeting bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#252528] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight text-white md:text-base">
              IntelliPlace Interview
            </h1>
            <p className="truncate text-xs text-zinc-400">
              {session ? (
                <>
                  {modeLabel} ·{' '}
                  {session.status === 'COMPLETED'
                    ? 'Completed'
                    : !interviewStarted
                      ? 'Waiting to start'
                      : interviewFlowPhase === 'opening'
                        ? 'Introduction · AI interviewer speaking'
                        : currentQuestion && totalQuestions > 0
                          ? showQuestionTotal
                            ? `Question ${displayQNum} of ${totalQuestions}`
                            : `Question ${displayQNum}`
                          : 'Preparing your first question…'}
                </>
              ) : (
                'Connecting…'
              )}
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

      {/* Main layout */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Video stage */}
        <div className="relative min-h-[42vh] flex-1 bg-[#0f0f12] lg:min-h-0">
          {/* Remote / interviewer placeholder (main stage) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-black">
            <div className="mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-zinc-800 ring-4 ring-zinc-700/50">
              <User className="h-14 w-14 text-zinc-500" strokeWidth={1.25} />
            </div>
            <p className="text-lg font-medium text-zinc-200">AI interviewer</p>
            <p className="mt-1 max-w-md px-6 text-center text-sm text-zinc-500">
              {interviewFlowPhase === 'opening'
                ? 'Introduction: audio plays automatically. Follow along with captions below.'
                : 'When the AI speaks, captions appear at the bottom of this screen. Use the side panel to read the question and type your answer.'}
            </p>
          </div>

          {captionText ? (
            <div className="pointer-events-none absolute bottom-[calc(5.5rem+1rem)] left-0 right-0 z-20 flex justify-center px-4 sm:bottom-28">
              <div className="max-h-[min(40vh,240px)] w-full max-w-3xl overflow-y-auto rounded-xl border border-zinc-700/80 bg-black/75 px-4 py-3 shadow-xl backdrop-blur-md">
                <p className="text-center text-sm leading-relaxed text-zinc-100 sm:text-base">{captionText}</p>
              </div>
            </div>
          ) : null}

          {/* Picture-in-picture: self view */}
          {!qaPanelOpen && session && (
            <button
              type="button"
              onClick={() => setQaPanelOpen(true)}
              className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-full border border-zinc-600 bg-zinc-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm transition hover:bg-zinc-800"
            >
              <MessageSquare className="h-4 w-4" />
              Open Q&amp;A
            </button>
          )}

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
                <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-700">
                  <User className="h-8 w-8 text-zinc-400" />
                </div>
                <span className="text-xs font-medium text-zinc-300">You</span>
                {!videoOn && <span className="mt-1 text-[10px] text-zinc-500">Camera off</span>}
              </div>
            )}
            <div className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
              You
            </div>
          </div>
        </div>

        {/* Q&A side panel */}
        <AnimatePresence>
          {qaPanelOpen && (
            <motion.aside
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              className="flex w-full flex-col border-t border-zinc-800 bg-[#222226] lg:w-[400px] lg:border-l lg:border-t-0"
            >
              <div className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Questions & answers</h2>
                <p className="text-xs text-zinc-500">
                  Expect a natural arc: a few questions about you first, then a gradual shift toward role-specific topics, with follow-ups that reference what you already said.
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
                  <div className="flex flex-1 flex-col items-center justify-center gap-5 py-12 px-4 text-center">
                    <CheckCircle className="h-16 w-16 text-emerald-500" strokeWidth={1.25} />
                    <div>
                      <p className="text-lg font-semibold text-white">
                        {session.mode === 'TECH' ? 'Technical interview complete' : 'Interview complete'}
                      </p>
                      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                        You have answered all questions in this session for this role. Thank you — you can leave when
                        you are ready.
                      </p>
                    </div>
                  </div>
                ) : !interviewStarted ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8 text-center">
                    <div>
                      <p className="text-lg font-medium text-white">Ready to join</p>
                      <p className="mt-2 text-sm text-zinc-400">
                        {modeLabel} interview. When you start, the AI interviewer will introduce the session and then ask
                        for your introduction — audio plays automatically with on-screen captions.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartInterview}
                      className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500"
                    >
                      <Play className="h-5 w-5" />
                      Start interview
                    </button>
                  </div>
                ) : interviewFlowPhase === 'opening' ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10 px-4 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/20">
                      {speakingQuestion ? (
                        <Loader className="h-7 w-7 animate-spin text-blue-400" />
                      ) : (
                        <Volume2 className="h-7 w-7 text-blue-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-lg font-medium text-white">AI interviewer · introduction</p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                        Listen to the introduction on the main screen. When it finishes, your first written question
                        will appear here so you can answer in your own words.
                      </p>
                    </div>
                    {ttsError && (
                      <div className="flex w-full max-w-sm items-start gap-2 rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{ttsError}</span>
                      </div>
                    )}
                  </div>
                ) : currentQuestion ? (
                  <>
                    <div className="mb-4 rounded-xl border border-zinc-700/80 bg-zinc-800/50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-blue-400">
                        Question {displayQNum}
                        {showQuestionTotal && totalQuestions > 0 ? ` of ${totalQuestions}` : ''}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-100">{currentQuestion}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={speakCurrentQuestion}
                          disabled={speakingQuestion}
                          className="inline-flex items-center gap-2 rounded-md border border-zinc-600 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700/60 disabled:opacity-50"
                        >
                          {speakingQuestion ? (
                            <>
                              <Loader className="h-3.5 w-3.5 animate-spin" />
                              Speaking...
                            </>
                          ) : (
                            <>
                              <Volume2 className="h-3.5 w-3.5" />
                              Read aloud
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAutoSpeakQuestion((v) => !v)}
                          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs ${
                            autoSpeakQuestion
                              ? 'border-blue-500 text-blue-300'
                              : 'border-zinc-600 text-zinc-300'
                          }`}
                        >
                          {autoSpeakQuestion ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                          Auto-read {autoSpeakQuestion ? 'On' : 'Off'}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    {ttsError && (
                      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{ttsError}</span>
                      </div>
                    )}

                    {submitted && (
                      <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                        <CheckCircle className="h-4 w-4 shrink-0" />
                        Answer submitted. Loading next question…
                      </div>
                    )}

                    {!submitted && (
                      <div className="flex min-h-0 flex-1 flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-zinc-400">Your answer</label>
                          {isDictating && (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-blue-400">
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                              </span>
                              Listening via Mic...
                            </span>
                          )}
                        </div>
                        <textarea
                          value={answerText}
                          onChange={(e) => setAnswerText(e.target.value)}
                          placeholder="Type your answer here…"
                          rows={10}
                          className="min-h-[160px] flex-1 resize-none rounded-xl border border-zinc-700 bg-[#1b1b1f] px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleSubmit}
                          disabled={submitting || !answerText.trim()}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {submitting ? (
                            <>
                              <Loader className="h-4 w-4 animate-spin" />
                              Submitting…
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              Submit answer
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
                    <Loader className="h-10 w-10 animate-spin text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-zinc-200">Waiting for the first question</p>
                      <p className="mt-2 text-xs text-zinc-500">
                        The interviewer generates questions after the session starts. This screen refreshes every few
                        seconds.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom control bar (Zoom-style) */}
      <footer className="flex h-[72px] shrink-0 items-center justify-center gap-2 border-t border-zinc-800 bg-[#2d2d32] px-4 pb-2">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMicOn((m) => !m)}
            title={micOn ? 'Mute' : 'Unmute'}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
              micOn ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-white text-zinc-900 hover:bg-zinc-200'
            }`}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
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
            title={qaPanelOpen ? 'Hide Q&A panel' : 'Show Q&A panel'}
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
