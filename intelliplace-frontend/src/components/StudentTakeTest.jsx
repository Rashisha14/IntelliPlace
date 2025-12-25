import { useEffect, useState } from 'react';
import Modal from './Modal';

const StudentTakeTest = ({ isOpen, onClose, jobId, onSubmitted }) => {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isOpen || !jobId) return;
    setLoading(true);
    setQuestions([]);
    setAnswers({});
    setError(null);
    setResult(null);

    const fetchQuestions = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/jobs/${jobId}/aptitude-test/questions/public`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to fetch questions');
        setQuestions(json.data.questions || []);
      } catch (err) {
        setError(err.message || 'Failed to fetch questions');
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [isOpen, jobId]);

  const handleSelect = (questionId, index) => {
    setAnswers(prev => ({ ...prev, [questionId]: index }));
  };

  const handleSubmit = async () => {
    if (!questions.length) return;
    // simple validation: ensure all questions answered
    const missing = questions.filter(q => typeof answers[q.id] !== 'number');
    if (missing.length > 0) {
      setError(`Please answer all questions (${missing.length} left)`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = { answers: questions.map(q => ({ questionId: q.id, selectedIndex: answers[q.id] })) };
      const res = await fetch(`http://localhost:5000/api/jobs/${jobId}/aptitude-test/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Submission failed');
      setResult({ score: json.data.score, maxScore: json.data.maxScore, passed: json.data.passed });
      if (typeof onSubmitted === 'function') onSubmitted();
    } catch (err) {
      setError(err.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      title={result ? 'Test Result' : 'Aptitude Test'}
      onClose={() => { if (!loading) { onClose(); } }}
      actions={[]}
    >
      <div className="space-y-4">
        {loading && <div className="py-6 text-center">Loading...</div>}
        {error && <div className="p-3 rounded bg-red-50 text-red-800">{error}</div>}

        {!loading && !questions.length && !error && !result && (
          <div className="py-6 text-center text-gray-600">No questions are available or you are not eligible to take this test.</div>
        )}

        {questions.length > 0 && !result && (
          <div>
            <div className="text-sm text-gray-600 mb-2">Questions: {questions.length}</div>
            <div className="space-y-6 max-h-96 overflow-auto pr-2">
              {questions.map((q, idx) => (
                <div key={q.id} className="p-3 border rounded-md bg-white">
                  <div className="font-medium">{idx + 1}. {q.questionText}</div>
                  <div className="mt-2 grid gap-2">
                    {Array.isArray(q.options) ? q.options.map((opt, i) => (
                      <label key={i} className={`flex items-center gap-3 p-2 rounded cursor-pointer ${answers[q.id] === i ? 'bg-gray-100' : ''}`}>
                        <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === i} onChange={() => handleSelect(q.id, i)} />
                        <span className="text-sm">{opt}</span>
                      </label>
                    )) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded-md">Submit Test</button>
              <button onClick={onClose} disabled={loading} className="px-4 py-2 border rounded-md">Close</button>
            </div>
          </div>
        )}

        {result && (
          <div className="p-4 rounded bg-green-50 text-green-800">
            <div className="font-semibold">Result</div>
            <div>Score: {result.score}/{result.maxScore}</div>
            <div>{result.passed ? 'You have passed the aptitude test and remain shortlisted.' : 'You did not meet the cutoff and your application has been rejected.'}</div>
            <div className="mt-4">
              <button onClick={onClose} className="px-4 py-2 bg-indigo-600 text-white rounded-md">Close</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default StudentTakeTest;
