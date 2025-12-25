import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Trash2,
  X,
  CheckCircle,
  AlertCircle,
  Check
} from "lucide-react";
import Swal from "sweetalert2";

const defaultSections = [
  { name: "Quantitative", questions: 10 },
  { name: "Logical Reasoning", questions: 10 },
  { name: "English", questions: 10 }
];

const emptyQuestion = {
  questionText: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  marks: 1
};

const CompanyCreateTest = ({ isOpen, onClose, jobId, onCreated }) => {
  const [sections, setSections] = useState([]);
  const [questionsBySection, setQuestionsBySection] = useState({});
  const [activeSection, setActiveSection] = useState(0);

  const [cutoff, setCutoff] = useState(50);
  const [loading, setLoading] = useState(false);

  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState(emptyQuestion);

  /* ---------- INIT ---------- */
  useEffect(() => {
    if (!isOpen) return;
    setSections(defaultSections);
    const map = {};
    defaultSections.forEach((_, i) => (map[i] = []));
    setQuestionsBySection(map);
    setActiveSection(0);
    setCutoff(50);
  }, [isOpen]);

  if (!isOpen) return null;

  /* ---------- SECTION ---------- */

  const updateSection = (i, key, value) => {
    setSections((p) =>
      p.map((s, idx) => (idx === i ? { ...s, [key]: value } : s))
    );
  };

  const addSection = () => {
    setSections((p) => [...p, { name: "New Section", questions: 5 }]);
    setQuestionsBySection((p) => ({ ...p, [sections.length]: [] }));
    setActiveSection(sections.length);
  };

  const removeSection = (i) => {
    if (sections.length === 1) return;
    Swal.fire({
      title: "Remove Section?",
      text: "All questions inside this section will be deleted",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626"
    }).then((res) => {
      if (!res.isConfirmed) return;
      setSections((p) => p.filter((_, idx) => idx !== i));
      setQuestionsBySection((p) => {
        const n = { ...p };
        delete n[i];
        return n;
      });
      setActiveSection(0);
    });
  };

  /* ---------- QUESTION ---------- */

  const addQuestion = () => {
    if (!newQuestion.questionText || newQuestion.options.some((o) => !o)) {
      Swal.fire("Incomplete", "Fill question and all options", "warning");
      return;
    }

    if (
      questionsBySection[activeSection].length >=
      sections[activeSection].questions
    ) {
      Swal.fire(
        "Limit Reached",
        "This section already has required questions",
        "warning"
      );
      return;
    }

    setQuestionsBySection((p) => ({
      ...p,
      [activeSection]: [...p[activeSection], newQuestion]
    }));

    setNewQuestion(emptyQuestion);
    setShowAddQuestion(false);
  };

  const removeQuestion = (qi) => {
    setQuestionsBySection((p) => ({
      ...p,
      [activeSection]: p[activeSection].filter((_, i) => i !== qi)
    }));
  };

  /* ---------- VALIDATION ---------- */

  const allSectionsComplete = sections.every(
    (s, i) => questionsBySection[i]?.length === s.questions
  );

  /* ---------- SUBMIT ---------- */

  const handleSubmit = async () => {
    if (!allSectionsComplete) {
      Swal.fire(
        "Incomplete Quiz",
        "Each section must have exact number of questions",
        "error"
      );
      return;
    }

    try {
      setLoading(true);
      const questions = [];

      sections.forEach((s, i) =>
        questionsBySection[i].forEach((q) =>
          questions.push({ ...q, section: s.name })
        )
      );

      const res = await fetch(
        `http://localhost:5000/api/jobs/${jobId}/aptitude-test`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`
          },
          body: JSON.stringify({
            sections,
            cutoff,
            totalQuestions: questions.length,
            questions
          })
        }
      );

      if (!res.ok) throw new Error();

      Swal.fire({
        icon: "success",
        title: "Quiz Created Successfully",
        confirmButtonColor: "#2563eb"
      }).then(() => {
        onCreated?.();
        onClose();
      });
    } catch {
      Swal.fire("Error", "Failed to create quiz", "error");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- UI ---------- */

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-6xl rounded-xl shadow-xl overflow-hidden"
      >
        {/* HEADER */}
        <div className="flex justify-between p-5 border-b">
          <h2 className="text-xl font-semibold">Create Quiz</h2>
          <button onClick={onClose}><X /></button>
        </div>

        {/* BODY */}
        <div className="grid grid-cols-4 h-[70vh]">
          {/* SECTIONS */}
          <div className="border-r bg-gray-50 p-4 space-y-3 overflow-y-auto">
            {sections.map((s, i) => {
              const count = questionsBySection[i]?.length || 0;
              const done = count === s.questions;

              return (
                <div
                  key={i}
                  onClick={() => setActiveSection(i)}
                  className={`relative p-4 rounded-xl border cursor-pointer transition ${
                    activeSection === i
                      ? "bg-blue-50 border-blue-500"
                      : "bg-white hover:bg-gray-100"
                  }`}
                >
                  {/* REMOVE */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSection(i);
                    }}
                    className="absolute top-2 right-2 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>

                  <input
                    className="font-semibold bg-transparent outline-none w-full"
                    value={s.name}
                    onChange={(e) =>
                      updateSection(i, "name", e.target.value)
                    }
                  />

                  <div className="flex justify-between items-center mt-2">
                    <input
                      type="number"
                      min={1}
                      className="input w-20 text-xs"
                      value={s.questions}
                      onChange={(e) =>
                        updateSection(i, "questions", +e.target.value || 1)
                      }
                    />

                    {done ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                        <CheckCircle size={14} /> Complete
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-600 text-xs font-medium">
                        <AlertCircle size={14} /> Pending
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-gray-200">
                      {count}/{s.questions} questions
                    </span>
                  </div>
                </div>
              );
            })}

            <button
              onClick={addSection}
              className="w-full py-2 border rounded-lg bg-white text-sm"
            >
              + Add Section
            </button>
          </div>

          {/* QUESTIONS */}
          <div className="col-span-3 p-6 overflow-y-auto">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {sections[activeSection]?.name}
              </h3>
              <button
                onClick={() => setShowAddQuestion(true)}
                className="btn btn-primary"
              >
                + Add Question
              </button>
            </div>

            <div className="space-y-4">
              {questionsBySection[activeSection]?.map((q, qi) => (
                <div key={qi} className="border rounded-xl p-4 bg-gray-50">
                  <div className="flex justify-between">
                    <p className="font-medium">
                      Q{qi + 1}. {q.questionText}
                    </p>
                    <button onClick={() => removeQuestion(qi)}>
                      <Trash2 size={16} className="text-red-500" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {q.options.map((o, oi) => (
                      <div
                        key={oi}
                        className={`flex items-center gap-2 p-2 rounded-lg border ${
                          q.correctIndex === oi
                            ? "bg-green-100 border-green-500 text-green-800 font-semibold"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        {q.correctIndex === oi && <Check size={14} />}
                        {String.fromCharCode(65 + oi)}. {o}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-5 border-t bg-gray-50 flex justify-between items-center">
          <div>
            <label className="text-sm font-semibold">Cutoff (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
              className="input w-32"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!allSectionsComplete || loading}
            className="btn btn-primary"
          >
            {loading ? "Creating..." : "Create Quiz"}
          </button>
        </div>
      </motion.div>

      {/* ADD QUESTION MODAL */}
      {showAddQuestion && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl w-full max-w-lg shadow-lg">
            <h3 className="text-lg font-semibold mb-4">
              Add Question –{" "}
              <span className="text-blue-600">
                {sections[activeSection]?.name}
              </span>
            </h3>

            <textarea
              className="input h-20"
              placeholder="Question text"
              value={newQuestion.questionText}
              onChange={(e) =>
                setNewQuestion({ ...newQuestion, questionText: e.target.value })
              }
            />

            <div className="space-y-2 mt-3">
              {newQuestion.options.map((o, i) => (
                <label
                  key={i}
                  className={`flex gap-2 p-2 rounded-lg border cursor-pointer ${
                    newQuestion.correctIndex === i
                      ? "bg-green-50 border-green-500"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    checked={newQuestion.correctIndex === i}
                    onChange={() =>
                      setNewQuestion({ ...newQuestion, correctIndex: i })
                    }
                  />
                  <input
                    className="input flex-1"
                    placeholder={`Option ${i + 1}`}
                    value={o}
                    onChange={(e) => {
                      const opts = [...newQuestion.options];
                      opts[i] = e.target.value;
                      setNewQuestion({ ...newQuestion, options: opts });
                    }}
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowAddQuestion(false)} className="btn">
                Cancel
              </button>
              <button onClick={addQuestion} className="btn btn-primary">
                Add Question
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyCreateTest;
