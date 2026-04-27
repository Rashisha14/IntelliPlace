import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Code,
  Users,
  Play,
  Square,
  CheckCircle,
  Loader,
  Settings,
  Sparkles,
} from 'lucide-react';
import { API_BASE_URL } from '../config.js';

const CompanyStartInterview = ({ isOpen, onClose, jobId, applicationId, application, job, onRefresh }) => {
  const [mode, setMode] = useState(null);
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generatingQuestion, setGeneratingQuestion] = useState(false);
  const [message, setMessage] = useState(null);
  const [interviewStatus, setInterviewStatus] = useState('STOPPED');
  const [showControls, setShowControls] = useState(true);
  const [evaluatingAi, setEvaluatingAi] = useState(false);
  const [aiEval, setAiEval] = useState(null);

  useEffect(() => {
    if (isOpen && applicationId) {
      fetchSession();
      const interval = setInterval(fetchSession, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, applicationId]);

  const fetchSession = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/session`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.data?.session) {
          const sessionData = data.data.session;
          setSession(sessionData);
          setMode(sessionData.mode);
          setInterviewStatus(sessionData.status || 'ACTIVE');

          const questionsList = Array.isArray(sessionData.questions)
            ? sessionData.questions
            : JSON.parse(sessionData.questions || '[]');
          setQuestions(questionsList);

          const oe =
            sessionData.overallEvaluation && typeof sessionData.overallEvaluation === 'object'
              ? sessionData.overallEvaluation
              : null;
          setAiEval(oe);

          const unansweredQ = questionsList.find((q) => !q.answer);
          if (unansweredQ) {
            setCurrentQuestion(unansweredQ);
          } else if (questionsList.length > 0) {
            setCurrentQuestion(questionsList[questionsList.length - 1]);
          }
        }
      } else if (res.status === 404) {
        setSession(null);
        setInterviewStatus('STOPPED');
      }
    } catch (err) {
      console.error('Error fetching session:', err);
    }
  };

  const handleStartInterview = async (selectedMode) => {
    setLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ mode: selectedMode }),
        }
      );

      const data = await res.json();
      if (res.ok) {
        setMode(selectedMode);
        setSession(data.data.session);
        setInterviewStatus('ACTIVE');
        setMessage({
          type: 'success',
          text: 'Interview session started! The first question is the candidate self-introduction — generate the next question after they submit it.',
        });
        await fetchSession();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to start interview' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to start interview' });
    } finally {
      setLoading(false);
    }
  };

  const handleStopInterview = async () => {
    if (!window.confirm('Stop the interview? Students will no longer be able to submit answers.')) {
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/stop`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json();
      if (res.ok) {
        setInterviewStatus('STOPPED');
        setMessage({ type: 'success', text: 'Interview stopped' });
        await fetchSession();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to stop interview' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to stop interview' });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuestion = async () => {
    setGeneratingQuestion(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/generate-question`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json();
      if (res.ok) {
        const newQuestion = data.data.question;
        setCurrentQuestion(newQuestion);
        setQuestions((prev) => [...prev, newQuestion]);
        setMessage({ type: 'success', text: 'Question generated!' });
        await fetchSession();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to generate question' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to generate question' });
    } finally {
      setGeneratingQuestion(false);
    }
  };

  const handleCompleteInterview = async () => {
    if (!window.confirm('Complete this interview session?')) {
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/complete`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Interview completed!' });
        setInterviewStatus('COMPLETED');
        if (onRefresh) onRefresh();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to complete interview' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to complete interview' });
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluateWithAi = async () => {
    setEvaluatingAi(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/voice-session/evaluate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (res.ok) {
        if (data.data?.overallEvaluation) {
          setAiEval(data.data.overallEvaluation);
        }
        if (data.data?.session) {
          const s = data.data.session;
          setSession(s);
          const qList = Array.isArray(s.questions) ? s.questions : JSON.parse(s.questions || '[]');
          setQuestions(qList);
          const oe =
            s.overallEvaluation && typeof s.overallEvaluation === 'object' ? s.overallEvaluation : null;
          if (oe) setAiEval(oe);
        }
        setMessage({ type: 'success', text: data.data?.message || 'AI evaluation updated.' });
        if (onRefresh) onRefresh();
      } else {
        setMessage({ type: 'error', text: data.message || 'Evaluation failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Evaluation failed' });
    } finally {
      setEvaluatingAi(false);
    }
  };

  const hasAnyAnswer = questions.some((q) => !!q.answer);
  const canRunAiEval =
    session &&
    hasAnyAnswer &&
    (interviewStatus === 'COMPLETED' || interviewStatus === 'STOPPED');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
          <div>
            <h3 className="text-2xl font-semibold text-gray-800">Conduct Interview</h3>
            {application?.student && (
              <p className="text-sm text-gray-600 mt-1">
                Interviewing: {application.student.name}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {message && (
            <div
              className={`mb-4 p-3 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800'
                  : 'bg-red-50 text-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          {!session ? (
            <div className="space-y-6">
              <div className="text-center">
                <h4 className="text-lg font-semibold text-gray-800 mb-2">
                  Select Interview Mode
                </h4>
                <p className="text-gray-600">
                  Technical interviews start with getting to know the candidate, then move gradually toward role-specific depth; questions usually follow up on what they already said, like a real conversation.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleStartInterview('TECH')}
                  disabled={loading}
                  className="p-6 border-2 border-blue-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Code className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                  <h5 className="font-semibold text-gray-800 mb-2">Technical Interview</h5>
                  <p className="text-sm text-gray-600">
                    Assess technical skills and problem-solving abilities
                  </p>
                </button>

                <button
                  onClick={() => handleStartInterview('HR')}
                  disabled={loading}
                  className="p-6 border-2 border-green-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Users className="w-12 h-12 text-green-600 mx-auto mb-3" />
                  <h5 className="font-semibold text-gray-800 mb-2">HR Interview</h5>
                  <p className="text-sm text-gray-600">
                    Evaluate soft skills, communication, and cultural fit
                  </p>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700">Mode:</span>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      mode === 'TECH'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {mode === 'TECH' ? 'Technical' : 'HR'}
                  </span>
                  <span className="text-sm text-gray-600">
                    Questions: {questions.length}
                  </span>
                  <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                    interviewStatus === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {interviewStatus}
                  </span>
                </div>
                <div className="flex gap-2">
                  {interviewStatus === 'ACTIVE' && (
                    <button
                      onClick={handleStopInterview}
                      disabled={loading}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Square className="w-4 h-4" />
                      Stop Interview
                    </button>
                  )}
                  {interviewStatus === 'STOPPED' && (
                    <button
                      onClick={() => handleStartInterview(mode)}
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      Resume Interview
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex gap-3 items-start">
                <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <p className="font-medium">Automatic flow</p>
                  <p className="text-blue-800/90 mt-1">
                    The next question is generated automatically after each candidate answer (while the session is active).
                    Use &quot;Generate another question&quot; only if you want an extra prompt on top of the automatic one.
                  </p>
                </div>
              </div>

              {canRunAiEval && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-violet-900">AI evaluation (Gemini)</p>
                      <p className="text-sm text-violet-800/90 mt-1">
                        Score the full Q&amp;A transcript, per-answer feedback, and a hiring verdict. Run after the
                        candidate has finished or the session is stopped.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleEvaluateWithAi}
                      disabled={evaluatingAi}
                      className="inline-flex items-center gap-2 shrink-0 px-4 py-2 bg-violet-700 text-white rounded-lg hover:bg-violet-800 disabled:opacity-50"
                    >
                      {evaluatingAi ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Evaluate with AI
                    </button>
                  </div>
                  {aiEval && typeof aiEval === 'object' && (
                    <div className="rounded-md border border-violet-100 bg-white p-4 text-left text-gray-800 space-y-3">
                      {aiEval.overallScore != null && (
                        <p>
                          <span className="text-sm text-gray-500">Overall score</span>
                          <span className="ml-2 text-2xl font-bold text-violet-700">{aiEval.overallScore}</span>
                          <span className="text-gray-500">/10</span>
                        </p>
                      )}
                      {aiEval.verdict && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {String(aiEval.verdict).replace(/_/g, ' ')}
                        </p>
                      )}
                      {aiEval.executiveSummary && (
                        <p className="text-sm leading-relaxed">{aiEval.executiveSummary}</p>
                      )}
                      {aiEval.hiringRationale && (
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1">Rationale</p>
                          <p className="text-sm leading-relaxed text-gray-700">{aiEval.hiringRationale}</p>
                        </div>
                      )}
                      {Array.isArray(aiEval.strengthsOverall) && aiEval.strengthsOverall.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1">Strengths</p>
                          <ul className="list-disc list-inside text-sm text-gray-700">
                            {aiEval.strengthsOverall.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(aiEval.risksOrGaps) && aiEval.risksOrGaps.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1">Risks / gaps</p>
                          <ul className="list-disc list-inside text-sm text-gray-700">
                            {aiEval.risksOrGaps.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aiEval.recommendation && (
                        <p className="text-sm font-medium text-violet-900 border-t border-gray-100 pt-3">
                          {aiEval.recommendation}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowControls((s) => !s)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
                >
                  <span className="flex items-center gap-2 font-medium text-gray-800">
                    <Settings className="w-4 h-4" />
                    Interview controls &amp; info
                  </span>
                  <span className="text-xs text-gray-500">{showControls ? 'Hide' : 'Show'}</span>
                </button>
                {showControls && (
                  <div className="px-4 py-3 text-sm text-gray-600 space-y-2 border-t border-gray-100 bg-white">
                    <p>
                      <strong className="text-gray-800">Transcript:</strong> Scroll below for every question and full candidate answer.
                      This view refreshes every few seconds while the modal is open.
                    </p>
                    <p>
                      <strong className="text-gray-800">Stopping:</strong> Stop ends the session so the candidate cannot submit more answers.
                      Complete marks the interview finished when you are done reviewing.
                    </p>
                    <p className="text-xs text-gray-500">
                      Server options: auto next question after each answer (default on), max questions cap — configure via backend env{' '}
                      <code className="bg-gray-100 px-1 rounded">INTERVIEW_AUTO_NEXT</code>,{' '}
                      <code className="bg-gray-100 px-1 rounded">INTERVIEW_MAX_QUESTIONS</code>.
                    </p>
                  </div>
                )}
              </div>

              {currentQuestion && (
                <div className="border-2 border-indigo-200 rounded-lg p-6 bg-indigo-50">
                  <div className="flex items-start justify-between mb-4">
                    <h5 className="font-semibold text-gray-800">
                      Question {currentQuestion.index !== undefined ? currentQuestion.index + 1 : questions.indexOf(currentQuestion) + 1}
                    </h5>
                    {currentQuestion.answer && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                  <p className="text-gray-700 mb-4">{currentQuestion.question}</p>

                  {currentQuestion.answer ? (
                    <div className="space-y-4">
                      <div className="bg-white rounded-lg p-4 border">
                        <p className="text-sm font-medium text-gray-700 mb-2">Candidate's Answer:</p>
                        <p className="text-gray-800 whitespace-pre-wrap">{currentQuestion.answer}</p>
                      </div>
                      
                      {currentQuestion.analysis && (
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                          <p className="text-sm font-medium text-blue-800 mb-2">Analysis & Feedback:</p>
                          {currentQuestion.analysis.content_score !== undefined && (
                            <div className="grid grid-cols-3 gap-4 mb-3">
                              <div>
                                <span className="text-xs text-gray-600">Content Score</span>
                                <p className="text-lg font-bold text-blue-600">
                                  {currentQuestion.analysis.content_score?.toFixed(1) || 'N/A'}/10
                                </p>
                              </div>
                              {currentQuestion.analysis.confidence_score !== undefined && (
                                <div>
                                  <span className="text-xs text-gray-600">Confidence</span>
                                  <p className="text-lg font-bold text-purple-600">
                                    {currentQuestion.analysis.confidence_score?.toFixed(1) || 'N/A'}/10
                                  </p>
                                </div>
                              )}
                              {currentQuestion.analysis.overall_score !== undefined && (
                                <div>
                                  <span className="text-xs text-gray-600">Overall</span>
                                  <p className="text-lg font-bold text-green-600">
                                    {currentQuestion.analysis.overall_score?.toFixed(1) || 'N/A'}/10
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                          {currentQuestion.analysis.feedback && (
                            <p className="text-sm text-gray-700">{currentQuestion.analysis.feedback}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-sm text-yellow-800">Waiting for candidate's answer...</p>
                    </div>
                  )}
                </div>
              )}

              {questions.length > 0 && (
                <div>
                  <h5 className="font-semibold text-gray-800 mb-1">Full transcript — questions &amp; answers</h5>
                  <p className="text-xs text-gray-500 mb-3">Click a row to focus it above. Long answers are scrollable.</p>
                  <div className="space-y-3">
                    {questions.map((q, idx) => {
                      const qIndex = q.index !== undefined ? q.index : idx;
                      return (
                        <div
                          key={idx}
                          className={`border rounded-lg p-4 bg-white cursor-pointer transition-colors ${
                            currentQuestion === q ? 'border-indigo-500 bg-indigo-50' : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setCurrentQuestion(q)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium text-gray-600">
                                  Q{qIndex + 1}:
                                </span>
                                {q.answer ? (
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                ) : (
                                  <span className="text-xs text-yellow-600">Pending</span>
                                )}
                              </div>
                              <p className="text-gray-700 mb-2">{q.question}</p>
                              {q.answer && (
                                <div className="mt-2 pt-2 border-t">
                                  <p className="text-xs font-medium text-gray-600 mb-1">Answer:</p>
                                  <p className="text-sm text-gray-800 whitespace-pre-wrap max-h-48 overflow-y-auto rounded bg-gray-50 p-2">
                                    {q.answer}
                                  </p>
                                  {q.analysis?.overall_score !== undefined && (
                                    <p className="text-xs text-blue-600 mt-1">
                                      Score: {q.analysis.overall_score.toFixed(1)}/10
                                    </p>
                                  )}
                                  {q.geminiEvaluation?.score != null && (
                                    <p className="text-xs text-violet-700 mt-1">
                                      AI score: {q.geminiEvaluation.score}/10
                                      {q.geminiEvaluation.feedback
                                        ? ` — ${q.geminiEvaluation.feedback}`
                                        : ''}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={handleGenerateQuestion}
                  disabled={generatingQuestion || interviewStatus !== 'ACTIVE'}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border-2 border-blue-600 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingQuestion ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Generate another question
                    </>
                  )}
                </button>
                <button
                  onClick={handleCompleteInterview}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" />
                  Complete Interview
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default CompanyStartInterview;
