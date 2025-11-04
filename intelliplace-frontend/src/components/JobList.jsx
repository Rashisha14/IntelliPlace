import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Building2, 
  Clock, 
  Download,
  Briefcase,
  MapPin,
  GraduationCap,
  X
} from 'lucide-react';
import { getCurrentUser } from '../utils/auth';

const JobList = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [applyState, setApplyState] = useState({ cgpa: '', backlog: '', cv: null });
  const [message, setMessage] = useState(null);
  const [appliedJobs, setAppliedJobs] = useState(new Set());

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const [jobsRes, applicationsRes] = await Promise.all([
        fetch('http://localhost:5000/api/jobs'),
        fetch('http://localhost:5000/api/jobs/my-applications', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      const jobsJson = await jobsRes.json();
      if (jobsRes.ok) setJobs(jobsJson.data.jobs || []);

      if (applicationsRes.ok) {
        const appJson = await applicationsRes.json();
        const appliedIds = new Set((appJson.data?.applications || []).map(app => app.jobId));
        setAppliedJobs(appliedIds);
      }
    } catch (err) {
      console.error(err);
    } finally { 
      setLoading(false);
    }
  }

  useEffect(() => { fetchJobs(); }, []);

  const openApply = (job) => {
    setSelectedJob(job);
    setApplyState({ cgpa: '', backlog: '', cv: null });
    setMessage(null);
  }

  const handleApplyChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'cv') setApplyState(s => ({ ...s, cv: files[0] }));
    else setApplyState(s => ({ ...s, [name]: value }));
  }

  const submitApplication = async (e) => {
    e.preventDefault();
    if (!selectedJob) return;
    setMessage(null);

    // Validate file size (10MB limit)
    if (applyState.cv && applyState.cv.size > 10 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'CV file size must be less than 10MB' });
      return;
    }

    // Validate file type
    if (applyState.cv) {
      const allowedTypes = ['.pdf', '.doc', '.docx'];
      const ext = applyState.cv.name.toLowerCase().slice(applyState.cv.name.lastIndexOf('.'));
      if (!allowedTypes.includes(ext)) {
        setMessage({ type: 'error', text: 'Only PDF, DOC, and DOCX files are allowed' });
        return;
      }
    }

    const token = localStorage.getItem('token');
    const form = new FormData();
    if (applyState.cv) form.append('cv', applyState.cv);
    if (applyState.cgpa) form.append('cgpa', applyState.cgpa);
    if (applyState.backlog) form.append('backlog', applyState.backlog);

    try {
      const res = await fetch(`http://localhost:5000/api/jobs/${selectedJob.id}/apply`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Applied successfully' });
        setSelectedJob(null);
        fetchJobs(); // Refresh jobs list to update applied status
      } else {
        setMessage({ type: 'error', text: json.message || 'Failed to apply' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {jobs.map(job => {
            const isApplied = appliedJobs.has(job.id);
              return (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`card ${
                  isApplied ? 'border-green-500 bg-green-50/30' : 'hover:shadow-md'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xl font-semibold text-gray-900">{job.title}</h3>
                      {isApplied && (
                        <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                          Applied
                        </span>
                      )}
                    </div>
                    
                    <div className="mb-4">
                      <p className="text-gray-600">{job.description}</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-start gap-2">
                        <Briefcase className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Job Type</p>
                          <p className="font-medium text-gray-900">{job.type || 'Full-time'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Location</p>
                          <p className="font-medium text-gray-900">{job.location || 'Remote'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <GraduationCap className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Min CGPA</p>
                          <p className="font-medium text-gray-900">{job.minCgpa || 'Not specified'}</p>
                        </div>
                      </div>
                    </div>

                    {job.requiredSkills && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-500 mb-2">Required Skills</p>
                        <div className="flex flex-wrap gap-2">
                          {job.requiredSkills.split(',').map((skill, index) => (
                            <span 
                              key={index}
                              className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                            >
                              {skill.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        <span>{job.company?.companyName || 'Unknown Company'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>Posted {new Date(job.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 md:w-48">
                    {isApplied ? (
                      <button
                        disabled
                        className="btn bg-green-100 text-green-700 disabled:opacity-60 cursor-not-allowed w-full"
                      >
                        Applied ✓
                      </button>
                    ) : (
                      <button 
                        onClick={() => openApply(job)}
                        className="btn btn-primary w-full"
                      >
                        Apply Now
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Application Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden"
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900">
                  Apply to {selectedJob.title}
                </h3>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                at {selectedJob.company?.companyName || 'Unknown Company'}
              </p>
            </div>

            <div className="p-6">
              {message && (
                <div className={`p-4 rounded-lg mb-4 ${
                  message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {message.text}
                </div>
              )}

              <form onSubmit={submitApplication} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Your CGPA
                  </label>
                  <input
                    name="cgpa"
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    value={applyState.cgpa}
                    onChange={handleApplyChange}
                    placeholder="Enter your CGPA"
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Active Backlogs
                  </label>
                  <input
                    name="backlog"
                    type="number"
                    min="0"
                    value={applyState.backlog}
                    onChange={handleApplyChange}
                    placeholder="Number of active backlogs"
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upload CV/Resume
                  </label>
                      <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-red-500 transition-colors bg-white">
                    <div className="space-y-2 text-center">
                      <Download className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="flex text-sm text-gray-600">
                        <label htmlFor="cv-upload" className="relative cursor-pointer rounded-md font-medium text-red-600 hover:text-red-500">
                          <span>Upload a file</span>
                          <input
                            id="cv-upload"
                            name="cv"
                            type="file"
                            accept=".pdf,.doc,.docx"
                            onChange={handleApplyChange}
                            className="sr-only"
                          />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        PDF, DOC, DOCX up to 10MB
                      </p>
                      {applyState.cv && (
                        <p className="text-sm text-green-600">
                          Selected: {applyState.cv.name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setSelectedJob(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                  >
                    Submit Application
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default JobList;
