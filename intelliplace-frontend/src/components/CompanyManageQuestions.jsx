import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Trash } from 'lucide-react';

const emptyQuestion = { section: '', questionText: '', options: ['', '', '', ''], correctIndex: 0, marks: 1 };

const CompanyManageQuestions = ({ isOpen, onClose, jobId, onUpdated }) => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState(emptyQuestion);

  useEffect(() => {
    if (isOpen) {
      setMessage(null);
      setForm(emptyQuestion);
      fetchQuestions();
    }
  }, [isOpen]);

  const fetchQuestions = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/jobs/${jobId}/aptitude-test/questions`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const data = await res.json();
      if (res.ok) {
        setQuestions(data.data.questions || []);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to load questions' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally { setLoading(false); }
  }

  const handleOptionChange = (index, value) => {
    setForm(prev => ({ ...prev, options: prev.options.map((o, i) => i === index ? value : o) }));
  }

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      // validation
      if (!form.section || !form.questionText) throw new Error('Section and question text are required');
      if (!Array.isArray(form.options) || form.options.length !== 4 || form.options.some(o => !o)) throw new Error('All 4 options are required');

      const res = await fetch(`http://localhost:5000/api/jobs/${jobId}/aptitude-test/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Question added' });
        setForm(emptyQuestion);
        fetchQuestions();
        onUpdated && onUpdated();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to add question' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally { setLoading(false); }
  }

  const handleDelete = async (qId) => {
    if (!confirm('Delete this question?')) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/jobs/${jobId}/aptitude-test/questions/${qId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Question deleted' });
        fetchQuestions();
        onUpdated && onUpdated();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to delete' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally { setLoading(false); }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
          <h3 className="text-2xl font-semibold text-gray-800">Manage Questions</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors"><X className="w-6 h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {message && (
            <div className={`p-4 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{message.text}</div>
          )}

          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Section</label>
              <input value={form.section} onChange={(e) => setForm(prev => ({ ...prev, section: e.target.value }))} className="input" placeholder="Quantitative" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Question</label>
              <textarea value={form.questionText} onChange={(e) => setForm(prev => ({ ...prev, questionText: e.target.value }))} rows={3} className="input h-20" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Options (select correct)</label>
              <div className="grid grid-cols-1 gap-2">
                {form.options.map((opt, i) => (
                  <label key={i} className="flex items-center gap-2">
                    <input type="radio" name="correct" checked={form.correctIndex === i} onChange={() => setForm(prev => ({ ...prev, correctIndex: i }))} />
                    <input value={opt} onChange={(e) => handleOptionChange(i, e.target.value)} placeholder={`Option ${i+1}`} className="input flex-1" />
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Marks</label>
              <input type="number" min={1} value={form.marks} onChange={(e) => setForm(prev => ({ ...prev, marks: parseInt(e.target.value || '1', 10) }))} className="input w-32" />
            </div>

            <div className="flex justify-end gap-3">
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Adding...' : 'Add Question'}</button>
            </div>
          </form>

          <div>
            <h4 className="text-lg font-semibold">Existing Questions</h4>
            {loading ? (
              <div className="text-center py-6">Loading...</div>
            ) : questions.length === 0 ? (
              <p className="text-gray-600">No questions yet</p>
            ) : (
              <div className="space-y-3 mt-3">
                {questions.map(q => (
                  <div key={q.id} className="border rounded p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm text-gray-600">{q.section}</div>
                        <div className="font-medium text-gray-800">{q.questionText}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDelete(q.id)} className="btn btn-ghost text-red-600"><Trash className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2">
                      {Array.isArray(q.options) ? q.options.map((opt, i) => (
                        <div key={i} className={`px-2 py-1 rounded ${q.correctIndex === i ? 'bg-green-50 text-green-800 font-semibold' : 'bg-gray-50 text-gray-800'}`}>
                          {String.fromCharCode(65 + i)}. {opt}
                        </div>
                      )) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t flex justify-end">
          <button onClick={onClose} className="btn btn-ghost">Close</button>
        </div>
      </motion.div>
    </div>
  );
}

export default CompanyManageQuestions;
