import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Check } from "lucide-react";

const CompanyViewTest = ({ isOpen, onClose, jobId, test }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(test || null);

  useEffect(() => {
    if (!isOpen) return;

    if (test) {
      setData(test);
      return;
    }

    const fetchTest = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `http://localhost:5000/api/jobs/${jobId}/aptitude-test`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        const json = await res.json();
        if (res.ok && json.data) setData(json.data.test);
        else setData(null);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTest();
  }, [isOpen, jobId, test]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-6xl rounded-lg shadow-lg overflow-hidden"
      >
        {/* HEADER */}
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Aptitude Test
            </h2>
            <p className="text-sm text-gray-500">
              Read-only preview of configured test
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : !data ? (
            <div className="text-sm text-gray-500">
              No test configured for this job.
            </div>
          ) : (
            <div className="space-y-8">
              {/* SUMMARY */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                <Summary label="Status" value={data.status || "—"} />
                <Summary
                  label="Cutoff"
                  value={data.cutoff != null ? `${data.cutoff}%` : "—"}
                />
                <Summary
                  label="Total Questions"
                  value={
                    data.totalQuestions ??
                    data.questions?.length ??
                    "—"
                  }
                />
              </div>

              {/* SECTIONS */}
              {Array.isArray(data.sections) &&
                data.sections.map((sec, si) => (
                  <div key={si} className="border rounded-md">
                    {/* SECTION HEADER */}
                    <div className="px-5 py-3 border-b bg-gray-50 flex justify-between items-center">
                      <div className="font-medium text-gray-900">
                        {sec.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {sec.questions} questions
                      </div>
                    </div>

                    {/* QUESTIONS */}
                    <div className="px-5 py-4 space-y-6">
                      {data.questions
                        ?.filter((q) => q.section === sec.name)
                        .map((q, qi) => (
                          <div key={qi} className="space-y-3">
                            {/* QUESTION */}
                            <div className="text-sm font-medium text-gray-900">
                              {qi + 1}. {q.questionText}
                            </div>

                            {/* OPTIONS */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {q.options?.map((opt, oi) => {
                                const correct =
                                  q.correctIndex === oi;
                                return (
                                  <div
                                    key={oi}
                                    className={`flex items-center gap-2 px-3 py-2 border rounded text-sm ${
                                      correct
                                        ? "border-green-600 bg-green-50 text-green-800 font-medium"
                                        : "border-gray-200 bg-white text-gray-700"
                                    }`}
                                  >
                                    {correct && (
                                      <Check
                                        size={14}
                                        className="text-green-700"
                                      />
                                    )}
                                    <span className="font-medium">
                                      {String.fromCharCode(65 + oi)}.
                                    </span>
                                    <span>{opt}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                      {(!data.questions ||
                        data.questions.filter(
                          (q) => q.section === sec.name
                        ).length === 0) && (
                        <div className="text-sm text-gray-500">
                          No questions in this section.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 border-t flex justify-end bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border bg-white hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

/* ---------- SMALL REUSABLE COMPONENT ---------- */

const Summary = ({ label, value }) => (
  <div>
    <div className="text-xs text-gray-500 uppercase tracking-wide">
      {label}
    </div>
    <div className="text-base font-medium text-gray-900">
      {value}
    </div>
  </div>
);

export default CompanyViewTest;
