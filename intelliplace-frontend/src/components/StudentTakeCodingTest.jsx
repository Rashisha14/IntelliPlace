import React, { useEffect, useState, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Clock, AlertTriangle, Lock, Play, CheckCircle, XCircle, Loader } from 'lucide-react';
import { API_BASE_URL } from '../config.js';

import CodeMirror from '@uiw/react-codemirror';
import { langs } from '@uiw/codemirror-extensions-langs';
import { basicDark } from '@uiw/codemirror-theme-basic';

const JUDGE0_LANGUAGES = {
  C: 50,
  'C++': 54,
  PYTHON: 92,
  JAVA: 91
};

const LANGUAGE_NAMES = {
  50: 'C',
  54: 'C++',
  92: 'Python',
  91: 'Java'
};

const getLanguageExtension = (languageId) => {
  try {
    switch (parseInt(languageId, 10)) {
      case 50:
      case 54: return [langs.cpp()];
      case 92: return [langs.python()];
      case 91: return [langs.java()];
      default: return [langs.cpp()];
    }
  } catch {
    return [];
  }
};

const MAX_WARNINGS = 1;

class CodeEditorErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err) { console.warn('CodeMirror error, using textarea:', err); }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const StudentTakeCodingTest = ({ isOpen, onClose, jobId, onSubmitted }) => {
  const [loading, setLoading] = useState(false);
  const [testData, setTestData] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [code, setCode] = useState({});
  const [selectedLanguage, setSelectedLanguage] = useState({});
  const [submissions, setSubmissions] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState({});
  const [runOutput, setRunOutput] = useState(null);
  const [showSubmitConfirmModal, setShowSubmitConfirmModal] = useState(false);
  const [submitResultMessage, setSubmitResultMessage] = useState(null);
  const [uiAlert, setUiAlert] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const submittingRef = useRef(false);
  const violationLockRef = useRef(false);

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  const showUiAlert = ({ type = 'info', title, message, onClose }) => {
    setUiAlert({ type, title, message, onClose: onClose || null });
  };

  /* ---------------- FULLSCREEN ---------------- */
  const enterFullscreen = async () => {
    try {
      if (containerRef.current && !document.fullscreenElement && document.fullscreenEnabled) {
        await containerRef.current.requestFullscreen();
      }
    } catch {}
  };

  /* ---------------- VIOLATION HANDLER ---------------- */
  const registerViolation = () => {
    if (submittingRef.current || violationLockRef.current) return;
    violationLockRef.current = true;
    setTimeout(() => {
      violationLockRef.current = false;
    }, 700);

    setWarnings(prev => {
      const next = prev + 1;

      if (next > MAX_WARNINGS) {
        handlePolicyViolationTerminate(next);
        return next;
      }

      setShowSecurityModal(true);
      return next;
    });
  };

  const reportPolicyViolation = async (violationCount) => {
    try {
      await fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test/violation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          violationCount,
          reason: 'focus_or_fullscreen_violation'
        })
      });
    } catch (err) {
      console.error('Failed to report policy violation:', err);
    }
  };

  const handlePolicyViolationTerminate = async (violationCount) => {
    if (submittingRef.current) return;
    // Fallback hard-close even if network requests hang.
    const hardCloseTimer = setTimeout(() => {
      try {
        onSubmitted?.();
        onClose();
      } catch {}
    }, 2500);

    await reportPolicyViolation(violationCount);
    await handleFinalSubmit({
      autoSubmitted: true,
      reason: 'policy_violation',
      customMessage:
        'Policy violated more than once. Your test has been submitted automatically and the recruiter has been notified.',
      closeImmediately: true
    });
    clearTimeout(hardCloseTimer);
  };

  /* ---------------- SECURITY ---------------- */
  useEffect(() => {
    if (!isOpen) return;

    enterFullscreen();

    const preventKeys = e => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && ['c', 'v', 'x', 'u', 'a'].includes(e.key))
      ) {
        e.preventDefault();
        registerViolation();
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) registerViolation();
    };

    const onBlur = () => {
      registerViolation();
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement && !submittingRef.current) {
        registerViolation();
      }
    };

    document.addEventListener('keydown', preventKeys);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('keydown', preventKeys);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.exitFullscreen?.();
    };
  }, [isOpen]);

  /* ---------------- FETCH TEST ---------------- */
  useEffect(() => {
    if (!isOpen || !jobId) return;

    setLoading(true);
    setTestData(null);
    setCode({});
    setSelectedLanguage({});
    setSubmissions({});
    setWarnings(0);
    setSubmitting(false);
    submittingRef.current = false;

    fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    })
      .then(async res => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.message || 'Failed to load coding test');
        }
        return json;
      })
      .then(json => {
        if (json.success && json.data) {
          const test = json.data;
          setTestData(test);
          setTimeLeft((test.timeLimit || 60) * 60); // Convert minutes to seconds
          
          // Initialize code and language for each question
          const initialCode = {};
          const initialLanguage = {};
          const allowedLangs = Array.isArray(test.allowedLanguages) 
            ? test.allowedLanguages 
            : (typeof test.allowedLanguages === 'string' ? JSON.parse(test.allowedLanguages) : []);
          
          if (allowedLangs.length > 0 && test.questions && test.questions.length > 0) {
            test.questions.forEach(q => {
              initialCode[q.id] = getDefaultCode(allowedLangs[0]);
              initialLanguage[q.id] = allowedLangs[0];
            });
            setCode(initialCode);
            setSelectedLanguage(initialLanguage);
          }
        } else {
          throw new Error(json.message || 'Invalid test data');
        }
      })
      .catch(err => {
        console.error('Error loading coding test:', err);
        showUiAlert({
          type: 'error',
          title: 'Failed to load coding test',
          message: err.message || 'Make sure the test has been started.',
          onClose: () => onClose(),
        });
      })
      .finally(() => setLoading(false));
  }, [isOpen, jobId]);

  /* ---------------- TIMER ---------------- */
  useEffect(() => {
    if (!timeLeft || submittingRef.current) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          handleFinalSubmit({ autoSubmitted: true, reason: 'time_up' });
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [timeLeft]);

  /* ---------------- DEFAULT CODE TEMPLATES ---------------- */
  const getDefaultCode = (languageId) => {
    const templates = {
      50: `#include <stdio.h>

int main() {
    // Your code here
    
    return 0;
}`,
      54: `#include <iostream>
using namespace std;

int main() {
    // Your code here
    
    return 0;
}`,
      92: `# Your code here`,
      91: `public class Solution {
    public static void main(String[] args) {
        // Your code here
    }
}`
    };
    return templates[languageId] || '';
  };

  /* ---------------- RUN CODE (TEST WITH SAMPLE) ---------------- */
  const handleRunCode = async (questionId) => {
    const currentCode = code[questionId];
    const currentLang = selectedLanguage[questionId];
    const question = testData.questions.find(q => q.id === questionId);

    if (!currentCode || !currentCode.trim()) {
      showUiAlert({ type: 'warning', title: 'Code required', message: 'Please write some code first.' });
      return;
    }

    const hasSample = (question.sampleCases && question.sampleCases.length > 0) || question.sampleInput;
    if (!hasSample) {
      showUiAlert({ type: 'info', title: 'No sample input', message: 'No sample input available for this question.' });
      return;
    }

    setRunning(prev => ({ ...prev, [questionId]: true }));
    setRunOutput(null);

    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test/run-sample`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          questionId,
          languageId: currentLang,
          code: currentCode
        })
      });

      const json = await res.json();

      if (json.success) {
        const result = json.data.results?.[0];
        if (!result) {
          setRunOutput({ status: 'error', title: 'No result', message: 'No result returned from sample run' });
          return;
        }
        if (result.passed) {
          setRunOutput({
            status: 'passed',
            title: 'Sample Test Passed!',
            message: result.actual ?? '(no output)',
            details: result.executionTime != null ? `Execution time: ${result.executionTime}s` : null
          });
        } else {
          const isInternalError = result.status === 'INTERNAL_ERROR';
          const mainMsg = result.error || `Expected: ${result.expected ?? '?'}, Got: ${result.actual ?? '?'}`;
          const details = isInternalError
            ? 'Judge0 encountered an error. This may be temporary—try again. Ensure Judge0 Docker is running.'
            : (result.actual !== undefined && result.actual !== '' ? `Your output: ${result.actual}` : null);
          setRunOutput({
            status: 'failed',
            title: isInternalError ? 'Execution Error' : 'Sample Test Failed',
            message: mainMsg,
            details
          });
        }
      } else {
        setRunOutput({ status: 'error', title: 'Error', message: json.message || 'Failed to run code' });
      }
    } catch (err) {
      console.error(err);
      setRunOutput({ status: 'error', title: 'Error', message: err.message || 'Failed to run code' });
    } finally {
      setRunning(prev => ({ ...prev, [questionId]: false }));
    }
  };

  /* ---------------- SUBMIT CODE FOR QUESTION ---------------- */
  const handleSubmitQuestion = async (questionId) => {
    const currentCode = code[questionId];
    const currentLang = selectedLanguage[questionId];

    if (!currentCode || !currentCode.trim()) {
      showUiAlert({ type: 'warning', title: 'Code required', message: 'Please write some code first.' });
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          questionId,
          languageId: currentLang,
          code: currentCode
        })
      });

      const json = await res.json();

      if (json.success) {
        const sub = json.data.submission;
        const passedCount = sub.passedCount;
        const totalCount = sub.totalCount;
        setSubmissions(prev => ({
          ...prev,
          [questionId]: {
            ...sub,
            passedCount,
            totalCount,
            results: Array.isArray(json.data.results) ? json.data.results : (sub.results || []),
            testCaseResults: sub.testCaseResults ?? json.data.results ?? []
          }
        }));

        const pts = testData.questions.find(q => q.id === questionId)?.points || 0;
        if (passedCount === totalCount) {
          showUiAlert({
            type: 'success',
            title: '🎉 Congratulations! All test cases passed!',
            message: `Excellent work! You scored ${sub.score?.toFixed(1) ?? 0}/${pts} points.`,
          });
        } else {
          showUiAlert({
            type: 'warning',
            title: `${passedCount}/${totalCount} test cases passed`,
            message: `Score: ${sub.score?.toFixed(1) ?? 0}/${pts} points. Keep trying!`,
          });
        }
      } else {
        showUiAlert({ type: 'error', title: 'Submit failed', message: json.message || 'Failed to submit code.' });
      }
    } catch (err) {
      console.error(err);
      showUiAlert({ type: 'error', title: 'Submit failed', message: 'Failed to submit code.' });
    } finally {
      setSubmitting(false);
      // Also clear running state in case it was stuck
      setRunning(prev => ({ ...prev, [questionId]: false }));
    }
  };

  /* ---------------- FINAL SUBMIT ---------------- */
  const handleFinalSubmit = async ({
    autoSubmitted = false,
    reason = 'manual',
    customMessage = null,
    closeImmediately = false
  } = {}) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setShowSecurityModal(false);

    // Submit all questions that haven't been submitted yet
    const questionsToSubmit = testData.questions.filter(q => !submissions[q.id]);
    
    for (const question of questionsToSubmit) {
      const currentCode = code[question.id];
      const currentLang = selectedLanguage[question.id];
      
      if (currentCode && currentCode.trim()) {
        try {
          await fetchWithTimeout(`${API_BASE_URL}/jobs/${jobId}/coding-test/submit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
              questionId: question.id,
              languageId: currentLang,
              code: currentCode
            })
          });
        } catch (err) {
          console.error('Error submitting question:', err);
        }
      }
    }

    // Tell backend the test is finished so it can evaluate and update the application status
    try {
      const finishRes = await fetchWithTimeout(`${API_BASE_URL}/jobs/${jobId}/coding-test/finish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      const finishData = await finishRes.json();
      
      if (finishRes.ok && finishData.success && finishData.data) {
        setTestResult(finishData.data);
        setSubmitResultMessage(null); // Clear any previous message
        setSubmitting(false);
        return; // Exit early to show result screen
      } else if (finishRes.status === 400 && finishData.message?.includes('already completed')) {
        showUiAlert({
          type: 'error',
          title: 'Test Already Completed',
          message: 'You have already completed this coding test. Multiple submissions are not allowed.',
          onClose: () => onClose()
        });
        setSubmitting(false);
        return;
      } else {
        console.error('Error finalizing test:', finishData.message);
      }
    } catch (err) {
      console.error('Error finalizing test:', err);
    }

    clearInterval(timerRef.current);
    document.exitFullscreen?.();
    
    // Clear all running states
    setRunning({});
    setSubmitting(false);
  };

  const handleManualFinalSubmit = async () => {
    if (submittingRef.current) return;
    setShowSubmitConfirmModal(true);
  };

  const formatTime = s => {
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const currentQuestion = testData?.questions?.[currentQuestionIndex];
  const currentSubmission = currentQuestion ? submissions[currentQuestion.id] : null;
  const currentCodeValue = currentQuestion ? code[currentQuestion.id] || '' : '';
  const currentLangValue = currentQuestion ? selectedLanguage[currentQuestion.id] : null;
  const currentTestCaseResults = useMemo(() => {
    if (!currentSubmission) return [];
    if (Array.isArray(currentSubmission.results)) return currentSubmission.results;
    if (Array.isArray(currentSubmission.testCaseResults)) return currentSubmission.testCaseResults;
    if (typeof currentSubmission.testCaseResults === 'string') {
      try {
        const parsed = JSON.parse(currentSubmission.testCaseResults);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [currentSubmission]);
  const allowedLangs = useMemo(() => {
    try {
      const raw = testData?.allowedLanguages;
      return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
    } catch {
      return [];
    }
  }, [testData?.allowedLanguages]);
  const currentSampleCases = useMemo(() => {
    if (!currentQuestion) return [];
    if (Array.isArray(currentQuestion.sampleCases) && currentQuestion.sampleCases.length > 0) {
      return currentQuestion.sampleCases
        .map((sc) => ({
          input: sc?.input ?? '',
          output: sc?.output ?? '',
        }))
        .filter((sc) => String(sc.input).trim() || String(sc.output).trim());
    }
    if (currentQuestion.sampleInput || currentQuestion.sampleOutput) {
      return [
        {
          input: currentQuestion.sampleInput || '',
          output: currentQuestion.sampleOutput || '',
        },
      ];
    }
    return [];
  }, [currentQuestion]);
  const editorExtensions = useMemo(
    () => getLanguageExtension(currentLangValue || 54),
    [currentLangValue]
  );
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        ref={containerRef}
        className="fixed inset-0 z-[9999] bg-[#1a1a1a] text-gray-100 flex flex-col min-h-screen"
      >
        {/* HEADER - LeetCode-style dark bar */}
        <div className="flex-shrink-0 h-12 bg-[#262626] border-b border-[#3d3d3d] flex items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#f97316]" />
              <span className="font-semibold text-white text-sm">{testData?.title || 'Coding Test'}</span>
            </div>
            {!submittingRef.current && !testResult && (
              <>
                <span className="flex items-center gap-1.5 text-[#a3a3a3] text-sm">
                  <Clock className="w-4 h-4" />
                  {formatTime(timeLeft)}
                </span>
                {/* Question tabs - LeetCode style */}
                <div className="flex items-center gap-1">
                  {testData?.questions?.map((q, idx) => {
                    const submission = submissions[q.id];
                    const isCurrent = idx === currentQuestionIndex;
                    return (
                      <button
                        key={q.id}
                        onClick={() => { setCurrentQuestionIndex(idx); setRunOutput(null); }}
                        className={`w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center transition-colors ${
                          isCurrent
                            ? 'bg-[#f97316] text-white'
                            : submission?.status === 'ACCEPTED'
                            ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/40'
                            : submission
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-[#3d3d3d] text-[#a3a3a3] hover:bg-[#525252] hover:text-white'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {(submitting || submittingRef.current || testResult) && (
            <button onClick={onClose} className="text-sm text-[#a3a3a3] hover:text-white px-3 py-1.5 rounded">
              Close
            </button>
          )}
        </div>

        {/* WARNING BAR */}
        {warnings > 0 && !submittingRef.current && !testResult && (
          <div className="flex-shrink-0 bg-amber-900/40 border-b border-amber-600/50 text-amber-200 text-center py-1.5 text-sm flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Security warnings: {warnings}/{MAX_WARNINGS}
          </div>
        )}

        {/* CONTENT - Split view: Editor (left) | Task + tests (right) */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader className="w-8 h-8 animate-spin text-[#f97316]" />
          </div>
        ) : testData ? (
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* LEFT: Editor workspace (matches screenshot style) */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#0b1020] border-r border-[#2a2f3b]">
              {/* Editor toolbar */}
              <div className="flex-shrink-0 h-11 bg-[#131a2c] border-b border-[#2a2f3b] flex items-center justify-between px-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#aab2c5] px-2 py-1 rounded bg-[#1d2638] border border-[#2e3a52]">
                    Task {currentQuestionIndex + 1}/{testData?.questions?.length || 1}
                  </span>
                  <select
                    value={currentLangValue || ''}
                    onChange={(e) => {
                      const langId = parseInt(e.target.value, 10);
                      setSelectedLanguage(prev => ({ ...prev, [currentQuestion?.id]: langId }));
                      setCode(prev => ({ ...prev, [currentQuestion?.id]: getDefaultCode(langId) }));
                    }}
                    className="bg-[#1d2638] text-[#d4d4d4] text-sm px-3 py-1.5 rounded border border-[#2e3a52] focus:ring-1 focus:ring-[#3b82f6]"
                  >
                    {allowedLangs.map(langId => (
                      <option key={langId} value={langId}>{LANGUAGE_NAMES[langId]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  {currentSubmission && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      currentSubmission.status === 'ACCEPTED' ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {currentSubmission.passedCount != null && currentSubmission.totalCount != null
                        ? `${currentSubmission.passedCount}/${currentSubmission.totalCount} passed`
                        : currentSubmission.status}
                    </span>
                  )}
                  <button
                    onClick={() => handleRunCode(currentQuestion?.id)}
                    disabled={running[currentQuestion?.id]}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-[#2e3a52] text-[#d4d4d4] hover:bg-[#1d2638] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {running[currentQuestion?.id] ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Run code
                  </button>
                  <button
                    onClick={() => handleSubmitQuestion(currentQuestion?.id)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded bg-[#22c55e] text-white font-medium hover:bg-[#16a34a] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </div>

              {/* Code editor */}
              <div className="flex-1 min-h-0 overflow-hidden p-0.5">
                <CodeEditorErrorBoundary
                  fallback={
                    <textarea
                      value={currentCodeValue}
                      onChange={(e) => setCode(prev => ({ ...prev, [currentQuestion?.id]: e.target.value }))}
                      placeholder="// Write your code here"
                      className="w-full h-full min-h-[200px] p-4 bg-[#0b1020] text-[#d4d4d4] font-mono text-sm resize-none border-0 rounded-none focus:outline-none"
                    />
                  }
                >
                  <CodeMirror
                    value={currentCodeValue}
                    onChange={(value) => setCode(prev => ({ ...prev, [currentQuestion?.id]: value }))}
                    extensions={editorExtensions}
                    theme={basicDark}
                    editable={true}
                    placeholder="// Write your code here"
                    basicSetup={{
                      lineNumbers: true,
                      highlightActiveLineGutter: true,
                      highlightActiveLine: true,
                      foldGutter: false,
                      bracketMatching: true,
                      indentOnInput: true,
                      tabSize: currentLangValue === 92 ? 4 : 2
                    }}
                    className="h-full [&_.cm-editor]:h-full [&_.cm-editor]:bg-[#0b1020] [&_.cm-scroller]:overflow-auto [&_.cm-content]:min-h-[200px] [&_.cm-gutters]:bg-[#131a2c] [&_.cm-gutters]:border-0"
                    style={{ height: '100%', minHeight: 200 }}
                  />
                </CodeEditorErrorBoundary>
              </div>
            </div>

            {/* RIGHT: Task + Test Cases panel */}
            <aside className="w-[360px] max-w-[42vw] bg-[#0f1527] text-[#d7deee] flex flex-col border-l border-[#2a2f3b]">
              <div className="border-b border-[#2a2f3b] px-6 py-4">
                <p className="text-xs uppercase tracking-wide text-[#8f9bb6] mb-1">Problem</p>
                <h3 className="text-xl font-bold leading-tight text-white">
                  {currentQuestion?.title || 'Coding Problem'}
                </h3>
                <div className="flex items-center gap-3 mt-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    currentQuestion?.difficulty === 'EASY' 
                      ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                      : currentQuestion?.difficulty === 'MEDIUM' 
                      ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/30'
                      : 'bg-red-900/30 text-red-400 border border-red-500/30'
                  }`}>
                    {currentQuestion?.difficulty || 'MEDIUM'}
                  </span>
                  <span className="text-sm text-[#8f9bb6] font-medium">
                    {currentQuestion?.points || 0} points
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                <div>
                  <p className="text-sm leading-relaxed text-[#cfd7ea] whitespace-pre-wrap">
                    {currentQuestion?.description}
                  </p>
                </div>
                
                {currentQuestion?.constraints && (
                  <div className="bg-[#1a1a2e] rounded-lg p-4 border border-[#2a2f3b]">
                    <p className="text-xs uppercase tracking-wide text-[#8f9bb6] mb-2 font-semibold">Constraints</p>
                    <p className="text-sm whitespace-pre-wrap text-[#b9c4dd] leading-relaxed">
                      {currentQuestion.constraints}
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold mb-3 text-white">Sample Test Cases</p>
                    {currentSampleCases.length > 0 ? (
                      <div className="space-y-3">
                        {currentSampleCases.map((sc, idx) => (
                          <div
                            key={`sample-${idx}`}
                            className="rounded-lg border border-[#2f4b85] bg-[#11203f] p-4"
                          >
                            <p className="text-xs text-[#9fb4df] mb-2 font-medium">Sample Input {idx + 1}</p>
                            <div className="space-y-2 text-xs text-[#d6e1fb] font-mono">
                              <div>
                                <span className="text-[#8fb0ff] font-semibold">Input:</span>
                                <div className="mt-1 p-2 bg-[#0a1628] rounded border border-[#1e3a5f] whitespace-pre-wrap break-words">
                                  {String(sc.input || '(none)')}
                                </div>
                              </div>
                              <div>
                                <span className="text-[#8fb0ff] font-semibold">Output:</span>
                                <div className="mt-1 p-2 bg-[#0a1628] rounded border border-[#1e3a5f] whitespace-pre-wrap break-words">
                                  {String(sc.output || '(none)')}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#8f9bb6] italic">No sample test cases provided</p>
                    )}
                  </div>

                  <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-white">Test Results</p>
                    {currentSubmission?.passedCount != null && currentSubmission?.totalCount != null && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        currentSubmission.passedCount === currentSubmission.totalCount 
                          ? 'bg-green-900/30 text-green-400 border border-green-500/30' 
                          : 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/30'
                      }`}>
                        {currentSubmission.passedCount}/{currentSubmission.totalCount} passed
                      </span>
                    )}
                  </div>

                  {currentTestCaseResults.length > 0 ? (
                    <div className="space-y-3">
                      {currentTestCaseResults.map((tc, idx) => {
                        const passed = !!tc.passed;
                        return (
                          <div
                            key={`${idx}-${tc.status || 'case'}`}
                            className={`rounded-lg border p-4 ${
                              passed
                                ? 'border-green-700/40 bg-green-900/15'
                                : 'border-red-700/40 bg-red-900/15'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <span className="text-sm text-[#aeb9d3] font-medium">Test Case {idx + 1}</span>
                              <span className={`text-sm font-bold px-2 py-1 rounded-full ${
                                passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                              }`}>
                                {passed ? '✓ Passed' : '✗ Failed'}
                              </span>
                            </div>
                            {!passed && (
                              <div className="space-y-2 text-sm text-[#d3dbf0]">
                                {tc.input != null && (
                                  <div>
                                    <span className="text-[#8fb0ff] font-semibold">Input:</span>
                                    <div className="mt-1 p-2 bg-[#0a1628] rounded border border-[#1e3a5f] font-mono text-xs whitespace-pre-wrap break-words">
                                      {String(tc.input)}
                                    </div>
                                  </div>
                                )}
                                {tc.expected != null && (
                                  <div>
                                    <span className="text-[#8fb0ff] font-semibold">Expected:</span>
                                    <div className="mt-1 p-2 bg-[#0a1628] rounded border border-[#1e3a5f] font-mono text-xs whitespace-pre-wrap break-words">
                                      {String(tc.expected)}
                                    </div>
                                  </div>
                                )}
                                {tc.actual != null && (
                                  <div>
                                    <span className="text-red-400 font-semibold">Your Output:</span>
                                    <div className="mt-1 p-2 bg-[#0a1628] rounded border border-red-500/30 font-mono text-xs whitespace-pre-wrap break-words">
                                      {String(tc.actual)}
                                    </div>
                                  </div>
                                )}
                                {tc.error && (
                                  <div>
                                    <span className="text-red-400 font-semibold">Error:</span>
                                    <div className="mt-1 p-2 bg-red-900/20 rounded border border-red-500/30 font-mono text-xs whitespace-pre-wrap break-words text-red-300">
                                      {String(tc.error)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : runOutput ? (
                    <div className={`rounded-lg border p-4 text-sm ${
                      runOutput.status === 'passed'
                        ? 'border-green-700/40 bg-green-900/15 text-green-300'
                        : runOutput.status === 'failed'
                          ? 'border-yellow-700/40 bg-yellow-900/15 text-yellow-200'
                          : 'border-red-700/40 bg-red-900/15 text-red-300'
                    }`}>
                      <p className="font-bold text-sm mb-2">{runOutput.title}</p>
                      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">{runOutput.message}</pre>
                      {runOutput.details && (
                        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed mt-2 opacity-80">{runOutput.details}</pre>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#2a2f3b] flex items-center justify-center">
                        <Play className="w-6 h-6 text-[#8f9bb6]" />
                      </div>
                      <p className="text-xs text-[#8f9bb6]">Run code or submit to see test results</p>
                    </div>
                  )}
                </div>
              </div>
              </div>
            </aside>
          </div>
        ) : null}

        {/* RESULT SCREEN */}
        {testResult && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-lg w-full bg-[#1a1a1a] border border-[#3d3d3d] rounded-xl p-8 text-center">
              <div className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${
                testResult.status === "CODING_PASSED"
                  ? "bg-green-900/30 border border-green-500/50"
                  : "bg-red-900/30 border border-red-500/50"
              }`}>
                {testResult.status === "CODING_PASSED" ? (
                  <CheckCircle className="w-10 h-10 text-green-400" />
                ) : (
                  <XCircle className="w-10 h-10 text-red-400" />
                )}
              </div>

              <h2 className={`text-3xl font-bold mb-2 ${
                testResult.status === "CODING_PASSED" ? "text-green-400" : "text-red-400"
              }`}>
                {testResult.status === "CODING_PASSED" ? "🎉 Congratulations! Test Passed!" : "Test Failed"}
              </h2>

              <p className="text-[#a3a3a3] mb-6">
                {testResult.status === "CODING_PASSED"
                  ? "Excellent work! You have successfully completed the coding test."
                  : "Don't worry, keep practicing and try again next time."
                }
              </p>

              <div className="bg-[#262626] rounded-lg p-6 mb-6 border border-[#3d3d3d]">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-[#a3a3a3]">Score</span>
                  <span className="font-semibold text-white">
                    {testResult.percentage?.toFixed(1) || 0}%
                  </span>
                </div>
                <div className="w-full bg-[#3d3d3d] rounded-full h-3 mb-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${
                      testResult.status === "CODING_PASSED" ? "bg-green-500" : "bg-red-500"
                    }`}
                    style={{
                      width: `${Math.min(testResult.percentage || 0, 100)}%`
                    }}
                  ></div>
                </div>
                <div className="text-xs text-[#a3a3a3] text-center">
                  {testResult.score || 0} points earned
                </div>
              </div>

              <button
                onClick={() => {
                  setTestResult(null);
                  onSubmitted?.();
                  onClose();
                }}
                className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Close Test
              </button>
            </div>
          </div>
        )}

        {/* FOOTER - Navigation */}
        {!submittingRef.current && testData && !testResult && (
          <div className="flex-shrink-0 h-14 bg-[#262626] border-t border-[#3d3d3d] px-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentQuestionIndex(p => Math.max(0, p - 1))}
                disabled={currentQuestionIndex === 0}
                className="px-4 py-2 rounded text-sm border border-[#525252] text-[#d4d4d4] hover:bg-[#3d3d3d] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentQuestionIndex(p => Math.min((testData?.questions?.length || 1) - 1, p + 1))}
                disabled={currentQuestionIndex === (testData?.questions?.length || 1) - 1}
                className="px-4 py-2 rounded text-sm border border-[#525252] text-[#d4d4d4] hover:bg-[#3d3d3d] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <button
                  onClick={handleManualFinalSubmit}
              disabled={submitting}
              className="px-6 py-2.5 rounded text-sm font-semibold bg-[#22c55e] text-white hover:bg-[#16a34a] disabled:opacity-50"
            >
              Submit Test
            </button>
          </div>
        )}

        {/* SECURITY MODAL - dark theme */}
        {showSecurityModal && warnings <= MAX_WARNINGS && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]">
            <div className="bg-[#262626] border border-[#3d3d3d] rounded-lg p-6 w-[420px]">
              <h3 className="font-semibold flex gap-2 mb-3 text-white">
                <AlertTriangle className="text-amber-400" />
                Security Alert
              </h3>
              <p className="text-sm text-[#a3a3a3] mb-6">
                You attempted to switch away from the test screen (Alt+Tab/app switch/fullscreen exit).
                <br />
                Final warning: next violation will auto-submit and report a policy violation.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={async () => {
                    setShowSecurityModal(false);
                    await enterFullscreen();
                  }}
                  className="px-4 py-2 rounded border border-[#525252] text-[#d4d4d4] hover:bg-[#3d3d3d]"
                >
                  Continue Test
                </button>
                <button
                  onClick={() => handleFinalSubmit({ autoSubmitted: false, reason: 'manual' })}
                  className="px-4 py-2 bg-[#22c55e] text-white rounded hover:bg-[#16a34a]"
                >
                  Submit Now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUBMIT CONFIRM MODAL (inside fullscreen UI) */}
        {showSubmitConfirmModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]">
            <div className="bg-[#262626] border border-[#3d3d3d] rounded-lg p-6 w-[440px]">
              <h3 className="font-semibold flex gap-2 mb-3 text-white">
                <AlertTriangle className="text-amber-400" />
                Submit test now?
              </h3>
              <p className="text-sm text-[#a3a3a3] mb-6">
                After submitting, you cannot make further changes.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowSubmitConfirmModal(false)}
                  className="px-4 py-2 rounded border border-[#525252] text-[#d4d4d4] hover:bg-[#3d3d3d]"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowSubmitConfirmModal(false);
                    await handleFinalSubmit({ autoSubmitted: false, reason: 'manual' });
                  }}
                  className="px-4 py-2 bg-[#22c55e] text-white rounded hover:bg-[#16a34a]"
                >
                  Yes, submit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUBMIT RESULT MODAL (inside fullscreen UI) */}
        {submitResultMessage && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]">
            <div className="bg-[#262626] border border-[#3d3d3d] rounded-lg p-6 w-[460px]">
              <h3 className="font-semibold flex gap-2 mb-3 text-white">
                <CheckCircle className="text-emerald-400" />
                Test Submitted
              </h3>
              <p className="text-sm text-[#a3a3a3] mb-6">{submitResultMessage}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    const done = submitResultMessage;
                    setSubmitResultMessage(null);
                    if (done) {
                      onSubmitted?.();
                      onClose();
                    }
                  }}
                  className="px-4 py-2 bg-[#2563eb] text-white rounded hover:bg-[#1d4ed8]"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GENERIC IN-WINDOW ALERT MODAL */}
        {uiAlert && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]">
            <div className="bg-[#262626] border border-[#3d3d3d] rounded-lg p-6 w-[460px]">
              <h3 className="font-semibold flex gap-2 mb-3 text-white">
                {uiAlert.type === 'success' ? (
                  <CheckCircle className="text-emerald-400" />
                ) : uiAlert.type === 'error' ? (
                  <XCircle className="text-rose-400" />
                ) : (
                  <AlertTriangle className="text-amber-400" />
                )}
                {uiAlert.title}
              </h3>
              <p className="text-sm text-[#a3a3a3] mb-6">{uiAlert.message}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    const cb = uiAlert.onClose;
                    setUiAlert(null);
                    if (cb) cb();
                  }}
                  className="px-4 py-2 bg-[#2563eb] text-white rounded hover:bg-[#1d4ed8]"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
};

export default StudentTakeCodingTest;

