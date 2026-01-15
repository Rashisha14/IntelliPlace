import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Video, Code, Users, Play, Square, CheckCircle, Loader } from 'lucide-react';

const CompanyStartInterview = ({ isOpen, onClose, jobId, applicationId, application, job }) => {
  const [mode, setMode] = useState(null); // 'TECH' or 'HR'
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingQuestion, setGeneratingQuestion] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (isOpen && applicationId) {
      fetchSession();
    }
  }, [isOpen, applicationId]);

  const fetchSession = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `http://localhost:5000/api/jobs/${jobId}/interviews/${applicationId}/session`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.data?.session) {
          setSession(data.data.session);
          setMode(data.data.session.mode);
          setQuestions(data.data.session.questions || []);
          const lastQuestion = data.data.session.questions?.[data.data.session.questions.length - 1];
          if (lastQuestion && !lastQuestion.answer) {
            setCurrentQuestion(lastQuestion);
          }
        }
      } else if (res.status === 404) {
        // No session exists yet
        setSession(null);
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
        `http://localhost:5000/api/jobs/${jobId}/interviews/${applicationId}/start`,
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
        setMessage({ type: 'success', text: 'Interview session started!' });
        // Generate first question
        setTimeout(() => {
          handleGenerateQuestion();
        }, 500);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to start interview' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to start interview' });
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
        `http://localhost:5000/api/jobs/${jobId}/interviews/${applicationId}/generate-question`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();
      if (res.ok) {
        const newQuestion = data.data.question;
        setCurrentQuestion(newQuestion);
        setQuestions((prev) => [...prev, newQuestion]);
        setAnswer('');
        setMessage({ type: 'success', text: 'Question generated!' });
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to generate question' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to generate question' });
    } finally {
      setGeneratingQuestion(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!answer.trim()) {
      setMessage({ type: 'error', text: 'Please provide an answer' });
      return;
    }

    setSubmittingAnswer(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `http://localhost:5000/api/jobs/${jobId}/interviews/${applicationId}/submit-answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            answer: answer,
            questionIndex: currentQuestion?.index,
          }),
        }
      );

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Answer submitted!' });
        setAnswer('');
        // Update question in list
        setQuestions((prev) =>
          prev.map((q, idx) =>
            idx === currentQuestion.index ? { ...q, answer: answer } : q
          )
        );
        setCurrentQuestion(null);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to submit answer' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to submit answer' });
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleCompleteInterview = async () => {
    if (!window.confirm('Are you sure you want to complete this interview session?')) {
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `http://localhost:5000/api/jobs/${jobId}/interviews/${applicationId}/complete`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Interview completed!' });
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
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

        {/* Content */}
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
            // Mode Selection
            <div className="space-y-6">
              <div className="text-center">
                <h4 className="text-lg font-semibold text-gray-800 mb-2">
                  Select Interview Mode
                </h4>
                <p className="text-gray-600">
                  Choose the type of interview you want to conduct
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
            // Interview Session
            <div className="space-y-6">
              {/* Session Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Mode:</span>
                    <span
                      className={`ml-2 px-3 py-1 rounded-full text-sm font-medium ${
                        mode === 'TECH'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {mode === 'TECH' ? 'Technical' : 'HR'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Questions: {questions.length}
                  </div>
                </div>
              </div>

              {/* Current Question */}
              {currentQuestion && (
                <div className="border-2 border-indigo-200 rounded-lg p-6 bg-indigo-50">
                  <div className="flex items-start justify-between mb-4">
                    <h5 className="font-semibold text-gray-800">
                      Question {currentQuestion.index + 1}
                    </h5>
                    {currentQuestion.answer && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                  <p className="text-gray-700 mb-4">{currentQuestion.question}</p>

                  {!currentQuestion.answer ? (
                    <div className="space-y-3">
                      <textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Enter your notes/observations about the candidate's answer..."
                        rows="6"
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={handleSubmitAnswer}
                          disabled={submittingAnswer || !answer.trim()}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {submittingAnswer ? (
                            <span className="flex items-center gap-2">
                              <Loader className="w-4 h-4 animate-spin" />
                              Submitting...
                            </span>
                          ) : (
                            'Submit Answer'
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg p-4 border">
                      <p className="text-sm font-medium text-gray-700 mb-2">Your Notes:</p>
                      <p className="text-gray-600">{currentQuestion.answer}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Question History */}
              {questions.length > 0 && (
                <div>
                  <h5 className="font-semibold text-gray-800 mb-3">Question History</h5>
                  <div className="space-y-3">
                    {questions.map((q, idx) => (
                      <div
                        key={idx}
                        className="border rounded-lg p-4 bg-white"
                        onClick={() => {
                          if (!q.answer) {
                            setCurrentQuestion(q);
                            setAnswer('');
                          }
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium text-gray-600">
                                Q{idx + 1}:
                              </span>
                              {q.answer && (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              )}
                            </div>
                            <p className="text-gray-700">{q.question}</p>
                            {q.answer && (
                              <div className="mt-2 pt-2 border-t">
                                <p className="text-sm text-gray-600">
                                  <strong>Notes:</strong> {q.answer}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={handleGenerateQuestion}
                  disabled={generatingQuestion || (currentQuestion && !currentQuestion.answer)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingQuestion ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Generate Next Question
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
