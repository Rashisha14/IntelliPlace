import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Download } from 'lucide-react';

const CompanyPostJob = ({ isOpen, onClose, onCreated }) => {
  if (!isOpen) return null;
  const [form, setForm] = useState({ title: '', description: '', type: 'FULL_TIME', location: '', salary: '', requiredSkills: '', minCgpa: '', includeCgpaInShortlisting: true, allowBacklog: false, maxBacklog: '', deadline: '' });
  const [jobDescriptionFile, setJobDescriptionFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (name === 'jobDescriptionFile') {
      setJobDescriptionFile(files[0] || null);
    } else {
      setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (jobDescriptionFile && jobDescriptionFile.size > 10 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Job description file size must be less than 10MB' });
      setLoading(false);
      return;
    }

    if (jobDescriptionFile) {
      const allowedTypes = ['.pdf', '.doc', '.docx'];
      const ext = jobDescriptionFile.name.toLowerCase().slice(jobDescriptionFile.name.lastIndexOf('.'));
      if (!allowedTypes.includes(ext)) {
        setMessage({ type: 'error', text: 'Only PDF, DOC, and DOCX files are allowed' });
        setLoading(false);
        return;
      }
    }

    if (form.allowBacklog) {
      if (!form.maxBacklog || form.maxBacklog === '') {
        setMessage({ type: 'error', text: 'Maximum backlogs allowed is required when "Allow Backlog" is selected' });
        setLoading(false);
        return;
      }
      const maxBacklogNum = parseInt(form.maxBacklog, 10);
      if (isNaN(maxBacklogNum) || maxBacklogNum < 1) {
        setMessage({ type: 'error', text: 'Maximum backlogs allowed must be at least 1' });
        setLoading(false);
        return;
      }
    }

    try {
      const token = localStorage.getItem('token');
      
      if (jobDescriptionFile) {
        const formData = new FormData();
        formData.append('title', form.title);
        formData.append('description', form.description);
        formData.append('type', form.type);
        if (form.location) formData.append('location', form.location);
        if (form.salary) formData.append('salary', form.salary);
        if (form.requiredSkills) {
          const skills = form.requiredSkills.split(',').map(s => s.trim()).filter(s => s);
          formData.append('requiredSkills', JSON.stringify(skills));
        }
        if (form.minCgpa) formData.append('minCgpa', form.minCgpa);
        formData.append('includeCgpaInShortlisting', form.includeCgpaInShortlisting);
        formData.append('allowBacklog', form.allowBacklog);
        if (form.maxBacklog) formData.append('maxBacklog', form.maxBacklog);
        if (form.deadline) formData.append('deadline', form.deadline);
        formData.append('jobDescriptionFile', jobDescriptionFile);

        const res = await fetch('http://localhost:5000/api/jobs', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        if (res.ok) {
          setMessage({ type: 'success', text: 'Job created successfully' });
          setForm({ title: '', description: '', type: 'FULL_TIME', location: '', salary: '', requiredSkills: '', minCgpa: '', includeCgpaInShortlisting: true, allowBacklog: false, maxBacklog: '', deadline: '' });
          setJobDescriptionFile(null);
          onCreated && onCreated();
        } else {
          setMessage({ type: 'error', text: data.message || 'Failed to create job' });
        }
      } else {
        const body = {
          ...form,
          requiredSkills: form.requiredSkills ? form.requiredSkills.split(',').map(s => s.trim()).filter(s => s) : [],
          deadline: form.deadline || null,
        };
        const res = await fetch('http://localhost:5000/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok) {
          setMessage({ type: 'success', text: 'Job created successfully' });
          setForm({ title: '', description: '', type: 'FULL_TIME', location: '', salary: '', requiredSkills: '', minCgpa: '', includeCgpaInShortlisting: true, allowBacklog: false, maxBacklog: '', deadline: '' });
          setJobDescriptionFile(null);
          onCreated && onCreated();
        } else {
          setMessage({ type: 'error', text: data.message || 'Failed to create job' });
        }
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
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
          <h3 className="text-2xl font-semibold text-gray-800">Post New Job</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          {message && (
            <div className={`p-4 flex-shrink-0 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message.text}
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto p-6">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Salary (LPA)</label>
                <input
                  name="salary"
                  value={form.salary}
                  onChange={handleChange}
                  placeholder="e.g. 8 - 12 LPA"
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
                  disabled={!form.includeCgpaInShortlisting}
                  className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                    !form.includeCgpaInShortlisting ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                />
                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    name="includeCgpaInShortlisting"
                    checked={form.includeCgpaInShortlisting}
                    onChange={handleChange}
                    className="w-4 h-4 text-[var(--brand-500)] focus:ring-[var(--brand-500)] rounded"
                  />
                  <span className="text-xs text-gray-600">Include CGPA in shortlisting</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Backlog Policy</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="allowBacklog"
                      checked={form.allowBacklog}
                      onChange={handleChange}
                      className="w-4 h-4 text-[var(--brand-500)] focus:ring-[var(--brand-500)] rounded"
                    />
                    <span className="text-sm text-gray-700">Allow Backlog</span>
                  </label>
                  {form.allowBacklog && (
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Maximum Backlogs Allowed <span className="text-red-500">*</span>
                      </label>
                      <input
                        name="maxBacklog"
                        type="number"
                        min="1"
                        value={form.maxBacklog}
                        onChange={handleChange}
                        placeholder="e.g. 2"
                        required
                        className="w-full p-2 text-sm border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Must be at least 1</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Application Deadline <span className="text-gray-400 text-xs font-normal">(Optional)</span>
              </label>
              <input
                name="deadline"
                type="datetime-local"
                value={form.deadline}
                onChange={handleChange}
                className="input"
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job Description File <span className="text-gray-400 text-xs font-normal">(Optional)</span>
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-red-500 transition-colors bg-white">
                <div className="space-y-2 text-center">
                  <Download className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label htmlFor="job-description-upload" className="relative cursor-pointer rounded-md font-medium text-red-600 hover:text-red-500">
                      <span>Upload a file</span>
                      <input
                        id="job-description-upload"
                        name="jobDescriptionFile"
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={handleChange}
                        className="sr-only"
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    PDF, DOC, DOCX up to 10MB
                  </p>
                  {jobDescriptionFile && (
                    <p className="text-sm text-green-600">
                      Selected: {jobDescriptionFile.name}
                    </p>
                  )}
                </div>
              </div>
            </div>
            </div>
          </div>

          <div className="flex justify-end items-center gap-3 p-6 pt-4 border-t flex-shrink-0 bg-white">
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


