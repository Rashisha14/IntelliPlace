import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Modal from '../../components/Modal';
import { getCurrentUser } from '../../utils/auth';

const TakeTestPage = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const { jobId } = useParams();

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0); // seconds
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!user || user.userType !== 'student') {
      navigate('/student/login');
      return;
    }

    const fetchQuestions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`http://localhost:5000/api/jobs/${jobId}/aptitude-test/questions/public`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to fetch questions');
        const qs = json.data.questions || [];
        setQuestions(qs);
        setTimeLeft((qs.length || 0) * 60); // 1 minute per question
      } catch (err) {
        setError(err.message || 'Failed to fetch questions');
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [jobId, navigate, user]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current);
          handleAutoSubmit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, timeLeft]);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!result && Object.keys(answers).length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [answers, result]);

  const handleSelect = (questionId, index) => {
    setAnswers(prev => ({ ...prev, [questionId]: index }));
  };

  const handleSubmit = async (confirm = true) => {
    if (confirm && !window.confirm('Submit test now? Once submitted you cannot change answers.')) return;
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
    } catch (err) {
      setError(err.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSubmit = async () => {
    // Auto submit when timer runs out
    if (!questions.length) return;
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
      if (res.ok) {
        setResult({ score: json.data.score, maxScore: json.data.maxScore, passed: json.data.passed });
      }
    } catch (err) {
      console.error('Auto submit failed', err);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const answeredCount = questions.filter(q => typeof answers[q.id] === 'number').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Aptitude Test</h1>
          <div className="text-sm text-gray-700">Time Left: <span className="font-mono">{fmt(timeLeft)}</span></div>
        </div>

        {error && <div className="p-3 mb-4 rounded bg-red-50 text-red-800">{error}</div>}

        {loading && !result && <div className="py-8 text-center">Loading / submitting...</div>}

        {!loading && questions.length === 0 && !result && (
          <div className="p-6 bg-white rounded shadow text-center text-gray-600">No questions available or you are not eligible to take this test.</div>
        )}

        {questions.length > 0 && !result && (
          <div className="bg-white rounded p-6 shadow">
            <div className="mb-4 text-sm text-gray-600">Answered: {answeredCount}/{questions.length}</div>

            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-1">Question {current + 1} of {questions.length}</div>
              <div className="p-4 border rounded">
                <div className="font-medium mb-2">{questions[current].questionText}</div>
                <div className="space-y-2">
                  {Array.isArray(questions[current].options) && questions[current].options.map((opt, i) => (
                    <label key={i} className={`flex items-center gap-3 p-2 rounded cursor-pointer ${answers[questions[current].id] === i ? 'bg-gray-100' : ''}`}>
                      <input type="radio" name={`q-${questions[current].id}`} checked={answers[questions[current].id] === i} onChange={() => handleSelect(questions[current].id, i)} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0} className="px-3 py-2 border rounded">Previous</button>
                <button onClick={() => setCurrent(c => Math.min(questions.length - 1, c + 1))} disabled={current === questions.length - 1} className="px-3 py-2 border rounded">Next</button>
              </div>

              <div className="flex gap-2">
                <button onClick={() => handleSubmit(true)} disabled={loading} className="px-3 py-2 bg-green-600 text-white rounded">Submit Test</button>
                <button onClick={() => navigate('/student/applications')} className="px-3 py-2 border rounded">Back to Applications</button>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-6 p-6 bg-white rounded shadow">
            <h2 className={`text-lg font-semibold ${result.passed ? 'text-green-700' : 'text-red-700'}`}>{result.passed ? 'Passed' : 'Failed'}</h2>
            <div className="mt-2">Score: {result.score}/{result.maxScore}</div>
            <div className="mt-4">
              <button onClick={() => navigate('/student/applications')} className="px-4 py-2 bg-indigo-600 text-white rounded">Back to Applications</button>
            </div>
          </div>
        )}
      </div>

      <Modal open={false} />
    </div>
  );
};

export default TakeTestPage;
