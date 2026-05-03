import { useEffect, useState, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { Clock, AlertTriangle, Lock, CheckCircle, XCircle } from "lucide-react";
import { API_BASE_URL } from "../config";

const MAX_WARNINGS = 2;

const StudentTakeTest = ({ isOpen, onClose, jobId, onSubmitted }) => {
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState([]);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const submittingRef = useRef(false); // 🔒 SUBMIT LOCK

  /* ---------------- FULLSCREEN ---------------- */
  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      }
    } catch { }
  };

  /* ---------------- VIOLATION HANDLER ---------------- */
  const registerViolation = () => {
    if (result || submittingRef.current) return;

    setWarnings(prev => {
      const next = prev + 1;

      if (next > MAX_WARNINGS) {
        handleSubmit(); // 🔴 AUTO SUBMIT
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
        e.key === "F12" ||
        (e.ctrlKey && ["c", "v", "x", "u", "a"].includes(e.key))
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
      if (!document.fullscreenElement && !result) {
        registerViolation();
      }
    };

    document.addEventListener("keydown", preventKeys);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("keydown", preventKeys);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.exitFullscreen?.();
    };
  }, [isOpen, result]);

  /* ---------------- FETCH QUESTIONS ---------------- */
  useEffect(() => {
    if (!isOpen || !jobId) return;

    setLoading(true);
    setError(null);
    setAnswers({});
    setSections([]);
    setWarnings(0);
    setResult(null);
    setCurrentSectionIndex(0);
    submittingRef.current = false;

    fetch(
      `${API_BASE_URL}/jobs/${jobId}/aptitude-test/questions/public`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      }
    )
      .then(res => res.json())
      .then(json => {
        if (!json.success) {
          throw new Error(json.message || "Unable to load questions");
        }

        const questions = json.data?.questions;
        if (!Array.isArray(questions)) {
          throw new Error("Invalid question format");
        }

        // Group questions by section
        const grouped = {};
        questions.forEach(q => {
          const sec = q.section || "General";
          if (!grouped[sec]) grouped[sec] = [];
          grouped[sec].push(q);
        });

        const sectionsList = Object.entries(grouped).map(([title, questions]) => ({
          title,
          questions
        }));

        setSections(sectionsList);
        setTimeLeft(questions.length * 60);
      })
      .catch((err) => setError(err.message || "Unable to load questions"))
      .finally(() => setLoading(false));
  }, [isOpen, jobId]);

  /* ---------------- TIMER ---------------- */
  useEffect(() => {
    if (!timeLeft || result) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          handleSubmit(); // ⏱ AUTO SUBMIT
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [timeLeft, result]);

  /* ---------------- SUBMIT (LOCKED) ---------------- */
  const handleSubmit = async () => {
    if (submittingRef.current || result) return;
    submittingRef.current = true;

    setLoading(true);
    setShowSecurityModal(false);

    const payload = {
      answers: answers
    };

    try {
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/aptitude-test/submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`
          },
          body: JSON.stringify(payload)
        }
      );

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 400 && json.message?.includes('already submitted')) {
          setError("You have already submitted this test. Multiple submissions are not allowed.");
          return;
        }
        throw new Error();
      }

      setResult(json.data);
      clearInterval(timerRef.current);
      document.exitFullscreen?.();
      onSubmitted?.();
    } catch (err) {
      console.error(err);
      setError("Submission failed");
      submittingRef.current = false; // allow retry only if failed
    } finally {
      setLoading(false);
    }
  };

  const formatTime = s =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(
      2,
      "0"
    )}`;

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = sections.reduce(
    (sum, s) => sum + s.questions.length,
    0
  );

  if (!isOpen) return null;

  /* ---------------- UI ---------------- */
  return (
    <AnimatePresence>
      <div
        ref={containerRef}
        className="fixed inset-0 z-[9999] bg-gray-100 text-gray-900 flex flex-col"
      >
        {/* HEADER */}
        <div className="bg-white border-b px-6 py-4 flex justify-between">
          <div className="flex gap-6 items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600" />
              Aptitude Test
            </h2>

            {!result && (
              <>
                <span className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4" />
                  {formatTime(timeLeft)}
                </span>
                <span className="text-sm text-gray-500">
                  {answeredCount}/{totalQuestions} answered
                </span>
              </>
            )}
          </div>

          {result && (
            <button
              onClick={onClose}
              className="bg-blue-600 px-4 py-2 rounded text-white"
            >
              Close
            </button>
          )}
        </div>

        {/* WARNING BAR */}
        {warnings > 0 && !result && (
          <div className="bg-yellow-100 border-b text-yellow-800 text-center py-2 text-sm">
            <AlertTriangle className="inline w-4 h-4 mr-2" />
            Security warnings: {warnings}/{MAX_WARNINGS}
          </div>
        )}

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 pb-28">
          {error && <p className="text-red-600">{error}</p>}

          {!result && sections.length > 0 && (
            <div className="max-w-4xl mx-auto">
              {/* Section Navigation */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">
                    Section {currentSectionIndex + 1} of {sections.length}
                  </span>
                  <div className="flex gap-2">
                    {sections.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSectionIndex(idx)}
                        className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                          idx === currentSectionIndex
                            ? 'bg-blue-600 text-white'
                            : idx < currentSectionIndex
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  {sections[currentSectionIndex]?.questions.length || 0} questions
                </div>
              </div>

              {/* Current Section */}
              <div className="bg-white rounded-lg shadow-sm border p-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Section {currentSectionIndex + 1}: {sections[currentSectionIndex].title}
                  </h2>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${((currentSectionIndex + 1) / sections.length) * 100}%`
                      }}
                    ></div>
                  </div>
                </div>

                <div className="space-y-6">
                  {sections[currentSectionIndex].questions.map((q, qIdx) => (
                    <div key={q.id} className="border-b border-gray-100 pb-6 last:border-b-0 last:pb-0">
                      <div className="flex items-start gap-4">
                        <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">
                          {qIdx + 1}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 mb-4 leading-relaxed">
                            {q.questionText}
                          </p>

                          <div className="grid gap-3">
                            {q.options.map((opt, i) => (
                              <label
                                key={i}
                                className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                                  answers[q.id] === i
                                    ? "border-blue-500 bg-blue-50 text-blue-900"
                                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={q.id}
                                  checked={answers[q.id] === i}
                                  onChange={() =>
                                    setAnswers(a => ({ ...a, [q.id]: i }))
                                  }
                                  className="mr-3 w-4 h-4 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-gray-700">{opt}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="flex items-center justify-center min-h-full">
              <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                <div className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${
                  result.status === "PASSED"
                    ? "bg-green-100"
                    : "bg-red-100"
                }`}>
                  {result.status === "PASSED" ? (
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  ) : (
                    <XCircle className="w-10 h-10 text-red-600" />
                  )}
                </div>

                <h2 className={`text-3xl font-bold mb-2 ${
                  result.status === "PASSED" ? "text-green-700" : "text-red-700"
                }`}>
                  {result.status === "PASSED" ? "Congratulations! Test Passed" : "Test Failed"}
                </h2>

                <p className="text-gray-600 mb-6">
                  {result.status === "PASSED"
                    ? "Great job! You have successfully passed the aptitude test."
                    : "Don't worry, keep practicing and try again next time."
                  }
                </p>

                <div className="bg-gray-50 rounded-lg p-6 mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-gray-600">Your Score</span>
                    <span className="font-bold text-lg text-gray-900">
                      {result.score}/{result.totalMarks}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Percentage</span>
                    <span className="font-semibold text-gray-900">
                      {Math.round((result.score / result.totalMarks) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        result.status === "PASSED" ? "bg-green-500" : "bg-red-500"
                      }`}
                      style={{
                        width: `${Math.min((result.score / result.totalMarks) * 100, 100)}%`
                      }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500 text-center mt-2">
                    Passing score: {Math.round((result.totalMarks * 0.6))} marks
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  Close Test
                </button>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        {!result && !showSecurityModal && sections.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-6 py-4 flex justify-between items-center z-[9000]">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentSectionIndex(prev => Math.max(0, prev - 1))}
                disabled={currentSectionIndex === 0}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                ← Previous Section
              </button>

              <span className="text-sm text-gray-600">
                Section {currentSectionIndex + 1} of {sections.length}
              </span>

              <button
                onClick={() => setCurrentSectionIndex(prev => Math.min(sections.length - 1, prev + 1))}
                disabled={currentSectionIndex === sections.length - 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Next Section →
              </button>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                Progress: {answeredCount}/{totalQuestions} answered
              </span>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-lg text-white font-semibold disabled:opacity-50 transition-colors"
              >
                Submit Test
              </button>
            </div>
          </div>
        )}

        {/* SECURITY MODAL */}
        {showSecurityModal && warnings <= MAX_WARNINGS && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]">
            <div className="bg-white rounded-lg p-6 w-[420px]">
              <h3 className="font-semibold flex gap-2 mb-3">
                <AlertTriangle className="text-yellow-500" />
                Security Alert
              </h3>
              <p className="text-sm text-gray-600 mb-6">
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
                  className="px-4 py-2 border rounded"
                >
                  Continue Test
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 bg-red-600 text-white rounded"
                >
                  Submit Test
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
};

export default StudentTakeTest;
