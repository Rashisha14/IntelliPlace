import React, { useEffect, useState, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Clock, AlertTriangle, Lock, Play, CheckCircle, XCircle, Loader } from 'lucide-react';
import Swal from 'sweetalert2';
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

const MAX_WARNINGS = 2;

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

  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const submittingRef = useRef(false);

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
    if (submittingRef.current) return;

    setWarnings(prev => {
      const next = prev + 1;

      if (next > MAX_WARNINGS) {
        handleFinalSubmit();
        return next;
      }

      setShowSecurityModal(true);
      return next;
    });
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
        Swal.fire('Error', err.message || 'Failed to load coding test. Make sure the test has been started.', 'error');
        onClose();
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
          handleFinalSubmit();
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
      Swal.fire('Error', 'Please write some code first', 'error');
      return;
    }

    const hasSample = (question.sampleCases && question.sampleCases.length > 0) || question.sampleInput;
    if (!hasSample) {
      Swal.fire('Info', 'No sample input available for this question', 'info');
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
      Swal.fire('Error', 'Please write some code first', 'error');
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
          [questionId]: { ...sub, passedCount, totalCount }
        }));

        const pts = testData.questions.find(q => q.id === questionId)?.points || 0;
        if (passedCount === totalCount) {
          Swal.fire({
            icon: 'success',
            title: 'All Test Cases Passed!',
            text: `${passedCount}/${totalCount} test cases passed. Score: ${sub.score?.toFixed(1) ?? 0}/${pts}`,
            confirmButtonColor: '#2563eb'
          });
        } else {
          Swal.fire({
            icon: 'warning',
            title: `${passedCount}/${totalCount} Test Cases Passed`,
            text: `Score: ${sub.score?.toFixed(1) ?? 0}/${pts}`,
            confirmButtonColor: '#f59e0b'
          });
        }
      } else {
        Swal.fire('Error', json.message || 'Failed to submit code', 'error');
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to submit code', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------- FINAL SUBMIT ---------------- */
  const handleFinalSubmit = async () => {
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
          await fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test/submit`, {
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
      await fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test/finish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
    } catch (err) {
      console.error('Error finalizing test:', err);
    }

    clearInterval(timerRef.current);
    document.exitFullscreen?.();
    
    Swal.fire({
      icon: 'success',
      title: 'Test Submitted',
      text: 'Your solutions have been submitted',
      confirmButtonColor: '#2563eb'
    }).then(() => {
      onSubmitted?.();
      onClose();
    });
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
  const allowedLangs = useMemo(() => {
    try {
      const raw = testData?.allowedLanguages;
      return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
    } catch {
      return [];
    }
  }, [testData?.allowedLanguages]);
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
            {!submittingRef.current && (
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
          {(submitting || submittingRef.current) && (
            <button onClick={onClose} className="text-sm text-[#a3a3a3] hover:text-white px-3 py-1.5 rounded">
              Close
            </button>
          )}
        </div>

        {/* WARNING BAR */}
        {warnings > 0 && !submittingRef.current && (
          <div className="flex-shrink-0 bg-amber-900/40 border-b border-amber-600/50 text-amber-200 text-center py-1.5 text-sm flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Security warnings: {warnings}/{MAX_WARNINGS}
          </div>
        )}

        {/* CONTENT - Split view: Problem | Editor */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader className="w-8 h-8 animate-spin text-[#f97316]" />
          </div>
        ) : testData ? (
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* LEFT: Problem description - LeetCode style */}
            <div className="w-[45%] min-w-[320px] max-w-[560px] flex flex-col bg-[#1a1a1a] border-r border-[#3d3d3d] overflow-hidden">
              {currentQuestion && (
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-xl font-semibold text-white">{currentQuestion.title}</h2>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${
                      currentQuestion.difficulty === 'EASY' ? 'bg-[#22c55e]/20 text-[#22c55e]' :
                      currentQuestion.difficulty === 'MEDIUM' ? 'bg-[#f97316]/20 text-[#f97316]' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {currentQuestion.difficulty}
                    </span>
                    <span className="text-sm text-[#737373]">{currentQuestion.points} pts</span>
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <p className="text-[#d4d4d4] whitespace-pre-wrap leading-relaxed mb-4">
                      {currentQuestion.description}
                    </p>
                    {currentQuestion.constraints && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-white mb-2">Constraints</h4>
                        <p className="text-sm text-[#a3a3a3] whitespace-pre-wrap">{currentQuestion.constraints}</p>
                      </div>
                    )}
                    {(() => {
                      const samples = currentQuestion.sampleCases && Array.isArray(currentQuestion.sampleCases) && currentQuestion.sampleCases.length > 0
                        ? currentQuestion.sampleCases
                        : (currentQuestion.sampleInput || currentQuestion.sampleOutput) ? [{ input: currentQuestion.sampleInput || '', output: currentQuestion.sampleOutput || '' }] : [];
                      return samples.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-semibold text-white">Example{samples.length > 1 ? 's' : ''}</h4>
                          {samples.map((sc, idx) => (
                            <div key={idx} className="rounded-lg overflow-hidden border border-[#3d3d3d]">
                              {samples.length > 1 && (
                                <div className="bg-[#262626] px-3 py-1.5 text-xs text-[#737373] border-b border-[#3d3d3d]">Example {idx + 1}</div>
                              )}
                              <div className="bg-[#262626] px-3 py-2 text-xs text-[#737373] border-b border-[#3d3d3d]">Input</div>
                              <pre className="p-3 text-sm font-mono text-[#d4d4d4] bg-[#1a1a1a] overflow-x-auto">
                                {sc.input || '(empty)'}
                              </pre>
                              <div className="bg-[#262626] px-3 py-2 text-xs text-[#737373] border-t border-b border-[#3d3d3d]">Output</div>
                              <pre className="p-3 text-sm font-mono text-[#d4d4d4] bg-[#1a1a1a] overflow-x-auto">
                                {sc.output || '(empty)'}
                              </pre>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Code editor + console - LeetCode style */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
              {/* Editor toolbar */}
              <div className="flex-shrink-0 h-10 bg-[#252526] border-b border-[#3d3d3d] flex items-center justify-between px-3">
                <select
                  value={currentLangValue || ''}
                  onChange={(e) => {
                    const langId = parseInt(e.target.value);
                    setSelectedLanguage(prev => ({ ...prev, [currentQuestion?.id]: langId }));
                    setCode(prev => ({ ...prev, [currentQuestion?.id]: getDefaultCode(langId) }));
                  }}
                  className="bg-[#3d3d3d] text-[#d4d4d4] text-sm px-3 py-1.5 rounded border-0 focus:ring-1 focus:ring-[#f97316]"
                >
                  {allowedLangs.map(langId => (
                    <option key={langId} value={langId}>{LANGUAGE_NAMES[langId]}</option>
                  ))}
                </select>
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-[#525252] text-[#d4d4d4] hover:bg-[#3d3d3d] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {running[currentQuestion?.id] ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Run
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

              {/* Code editor - dark theme */}
              <div className="flex-1 min-h-0 overflow-hidden p-2">
                <CodeEditorErrorBoundary
                  fallback={
                    <textarea
                      value={currentCodeValue}
                      onChange={(e) => setCode(prev => ({ ...prev, [currentQuestion?.id]: e.target.value }))}
                      placeholder="// Write your code here"
                      className="w-full h-full min-h-[200px] p-4 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm resize-none border-0 rounded focus:outline-none"
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
                    className="h-full [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto [&_.cm-content]:min-h-[200px] [&_.cm-gutters]:bg-[#252526] [&_.cm-gutters]:border-0"
                    style={{ height: '100%', minHeight: 200 }}
                  />
                </CodeEditorErrorBoundary>
              </div>

              {/* Console / Run output - LeetCode style */}
              <div className="flex-shrink-0 border-t border-[#3d3d3d]">
                {runOutput ? (
                  <div className={`px-4 py-3 max-h-32 overflow-y-auto ${
                    runOutput.status === 'passed' ? 'bg-[#134e2e]/40 text-[#4ade80]' :
                    runOutput.status === 'failed' ? 'bg-amber-900/30 text-amber-300' :
                    'bg-red-900/30 text-red-300'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{runOutput.title}</span>
                      <button onClick={() => setRunOutput(null)} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
                    </div>
                    <pre className="text-sm font-mono whitespace-pre-wrap break-words">{runOutput.message}</pre>
                    {runOutput.details && <p className="text-xs mt-1 opacity-80">{runOutput.details}</p>}
                  </div>
                ) : (
                  <div className="h-12 px-4 flex items-center text-sm text-[#737373]">
                    Run your code to see output here
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* FOOTER - Navigation */}
        {!submittingRef.current && testData && (
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
              onClick={handleFinalSubmit}
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
                You attempted to leave fullscreen.
                <br />
                Warnings left: {MAX_WARNINGS - warnings + 1}
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
                  onClick={handleFinalSubmit}
                  className="px-4 py-2 bg-[#22c55e] text-white rounded hover:bg-[#16a34a]"
                >
                  Submit Now
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

