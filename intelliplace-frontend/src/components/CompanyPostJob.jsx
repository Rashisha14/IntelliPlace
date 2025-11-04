import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

const CompanyPostJob = ({ isOpen, onClose, onCreated }) => {
  if (!isOpen) return null;
  const [form, setForm] = useState({ title: '', description: '', type: 'FULL_TIME', location: '', salary: '', requiredSkills: '', minCgpa: '', allowBacklog: false });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const body = {
        ...form,
        requiredSkills: form.requiredSkills.split(',').map(s => s.trim()),
      };
      const res = await fetch('http://localhost:5000/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Job created successfully' });
        setForm({ title: '', description: '', type: 'FULL_TIME', location: '', salary: '', requiredSkills: '', minCgpa: '', allowBacklog: false });
        onCreated && onCreated();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to create job' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-2xl font-semibold text-gray-800">Post New Job</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {message && (
          <div className={`p-4 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {message.text}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Senior Software Engineer"
                required
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Describe the role, responsibilities, and requirements"
                required
                rows="4"
                className="input h-28"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  name="type"
                  value={form.type}
                  onChange={handleChange}
                  className="input"
                >
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERNSHIP">Internship</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="e.g. New York, Remote"
                  className="input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Salary</label>
                <input
                  name="salary"
                  value={form.salary}
                  onChange={handleChange}
                  placeholder="e.g. $80,000 - $100,000"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Required Skills</label>
                <input
                  name="requiredSkills"
                  value={form.requiredSkills}
                  onChange={handleChange}
                  placeholder="e.g. React, Node.js, SQL"
                  className="input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum CGPA</label>
                <input
                  name="minCgpa"
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={form.minCgpa}
                  onChange={handleChange}
                  placeholder="e.g. 7.5"
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer mt-6">
                  <input
                    type="checkbox"
                    name="allowBacklog"
                    checked={form.allowBacklog}
                    onChange={handleChange}
                    className="w-4 h-4 text-[var(--brand-500)] focus:ring-[var(--brand-500)] rounded"
                  />
                  <span className="text-sm text-gray-700">Allow Backlog</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end items-center gap-3 mt-6 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Posting...' : 'Post Job'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default CompanyPostJob;
