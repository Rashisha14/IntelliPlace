import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Building2, 
  Clock, 
  Download,
  Briefcase,
  MapPin,
  GraduationCap,
  X,
  FileText,
  Globe,IndianRupee
,
  Eye
} from 'lucide-react';
import { getCurrentUser } from '../utils/auth';
import Modal from './Modal';

const JobList = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [applyState, setApplyState] = useState({ cgpa: '', backlog: '', cv: null });
  const [message, setMessage] = useState(null);
  const [modal, setModal] = useState(null);
  const [appliedJobs, setAppliedJobs] = useState(new Set());
  const [applicationStatuses, setApplicationStatuses] = useState({}); // jobId -> status
  const [previewJobDesc, setPreviewJobDesc] = useState(null);
  const [eligibilityError, setEligibilityError] = useState(null);

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
        const applications = appJson.data?.applications || [];
        const appliedIds = new Set(applications.map(app => app.jobId));
        setAppliedJobs(appliedIds);
        
        // Create a map of jobId -> status
        const statusMap = {};
        applications.forEach(app => {
          statusMap[app.jobId] = app.status;
        });
        setApplicationStatuses(statusMap);
      }
    } catch (err) {
      console.error(err);
    } finally { 
      setLoading(false);
    }
  }

  useEffect(() => { fetchJobs(); }, []);

  const checkEligibility = (job, cgpa, backlog) => {
    if (!job) return { eligible: true, error: null };

    const appCgpa = cgpa ? parseFloat(cgpa) : null;
    const appBacklog = backlog !== '' && backlog !== null && backlog !== undefined 
      ? parseInt(backlog, 10) 
      : null;

    // Check if values are provided (only CGPA if company wants to include it)
    if (job.includeCgpaInShortlisting !== false) {
      if (appCgpa === null || isNaN(appCgpa)) {
        return { eligible: false, error: 'Please enter your CGPA' };
      }
    }

    if (appBacklog === null || isNaN(appBacklog)) {
      return { eligible: false, error: 'Please enter your backlog count (enter 0 if you have no backlogs)' };
    }

    const reasons = [];

    // Check CGPA requirement (only if company wants to include it in shortlisting)
    if (job.includeCgpaInShortlisting !== false && typeof job.minCgpa === 'number') {
      if (appCgpa < job.minCgpa) {
        reasons.push(`CGPA ${appCgpa} < required ${job.minCgpa}`);
      }
    }

    // Check backlog requirement
    if (job.allowBacklog === false || job.allowBacklog === null || job.allowBacklog === undefined) {
      // If allowBacklog is falsy, require zero backlogs
      if (appBacklog !== 0) {
        reasons.push(`Active backlogs ${appBacklog} not allowed (zero backlogs required)`);
      }
    } else if (job.allowBacklog === true) {
      // If allowBacklog is true, check maxBacklog limit if specified
      if (typeof job.maxBacklog === 'number') {
        if (appBacklog > job.maxBacklog) {
          reasons.push(`Active backlogs ${appBacklog} exceeds maximum allowed ${job.maxBacklog}`);
        }
      }
    }

    if (reasons.length > 0) {
      return { 
        eligible: false, 
        error: `You do not meet the eligibility criteria: ${reasons.join('; ')}` 
      };
    }

    return { eligible: true, error: null };
  };

  const openApply = (job) => {
    setSelectedJob(job);
    setApplyState({ cgpa: '', backlog: '', cv: null });
    setMessage(null);
    setEligibilityError(null);
  }

  const handleApplyChange = (e) => {
    const { name, value, files } = e.target;
    let newState;
    if (name === 'cv') {
      newState = { ...applyState, cv: files[0] };
    } else {
      newState = { ...applyState, [name]: value };
    }
    
    setApplyState(newState);

    // Check eligibility in real-time when CGPA or backlog changes
    if (selectedJob && (name === 'cgpa' || name === 'backlog')) {
      const eligibility = checkEligibility(selectedJob, newState.cgpa, newState.backlog);
      setEligibilityError(eligibility.error);
    }
  }

  const handleJobDescriptionFile = async (job) => {
    if (!job.jobDescriptionFileUrl) {
      setModal({ title: 'Job Description not available', text: 'No job description file available', type: 'error' });
      return;
    }

    try {
      // If it's a PDF, show preview
      const isPDF = job.jobDescriptionFileUrl.toLowerCase().endsWith('.pdf');
      
      if (isPDF) {
        setPreviewJobDesc({
          url: job.jobDescriptionFileUrl,
          name: `${job.title} - Job Description`,
          jobTitle: job.title
        });
      } else {
        // For non-PDF files, download directly
        const a = document.createElement('a');
        a.href = job.jobDescriptionFileUrl;
        a.download = `Job_Description_${job.title.replace(/\s+/g, '_')}${job.jobDescriptionFileUrl.slice(job.jobDescriptionFileUrl.lastIndexOf('.'))}`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to open job description file:', err);
      setModal({ title: 'Job Description error', text: 'Failed to open job description file. Please try again.', type: 'error' });
    }
  };

  const submitApplication = async (e) => {
    e.preventDefault();
    if (!selectedJob) return;
    setMessage(null);

    // Check eligibility first
    const eligibility = checkEligibility(selectedJob, applyState.cgpa, applyState.backlog);
    if (!eligibility.eligible) {
      setEligibilityError(eligibility.error);
      setMessage({ type: 'error', text: eligibility.error });
      return;
    }
    setEligibilityError(null);

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
    // Send CGPA (backend will validate if required)
    if (applyState.cgpa) form.append('cgpa', applyState.cgpa);
    // Always send backlog (required field)
    form.append('backlog', applyState.backlog);

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
        // Show detailed error message from backend
        const errorMsg = json.details 
          ? `${json.message}: ${json.details}`
          : json.message || 'Failed to apply';
        setMessage({ type: 'error', text: errorMsg });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Network error. Please try again.' });
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
                {/* Modal for critical job-related errors */}
                <Modal open={!!modal} title={modal?.title} message={modal?.text} type={modal?.type} onClose={() => setModal(null)} actions={[]} />
            
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <h3 className="text-xl font-semibold text-gray-900">{job.title}</h3>
                      {isApplied && applicationStatuses[job.id] && (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          applicationStatuses[job.id] === 'PASSED APTITUDE' 
                            ? 'bg-green-100 text-green-800 border border-green-200' 
                            : applicationStatuses[job.id] === 'FAILED APTITUDE'
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : applicationStatuses[job.id] === 'SHORTLISTED'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : applicationStatuses[job.id] === 'REJECTED'
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : applicationStatuses[job.id] === 'PENDING'
                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                            : applicationStatuses[job.id] === 'REVIEWING'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : applicationStatuses[job.id] === 'HIRED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-gray-100 text-gray-800 border border-gray-200'
                        }`}>
                          {applicationStatuses[job.id]}
                        </span>
                      )}
                      {isApplied && !applicationStatuses[job.id] && (
                        <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                          Applied
                        </span>
                      )}
                    </div>
                    
                    <div className="mb-4">
                      <p className="text-gray-600">{job.description}</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-start gap-2">
                        <Briefcase className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Job Type</p>
                          <p className="font-medium text-gray-900">{job.type?.replace('_', ' ') || 'Full-time'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Location</p>
                          <p className="font-medium text-gray-900">{job.location || 'Remote'}</p>
                        </div>
                      </div>
                      {job.salary && (
                        <div className="flex items-start gap-2">
                          <IndianRupee className="w-4 h-4 text-gray-400 mt-1" />
                          <div>
                            <p className="text-sm text-gray-500">Salary</p>
                            <p className="font-medium text-gray-900">{job.salary}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <GraduationCap className="w-4 h-4 text-gray-400 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Min CGPA</p>
                          <p className="font-medium text-gray-900">{job.minCgpa || 'Not specified'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Backlog Policy */}
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 mb-1">Backlog Policy</p>
                      <div className="flex items-center gap-2">
                        {job.allowBacklog ? (
                          <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                            Backlogs Allowed {job.maxBacklog ? `(Max: ${job.maxBacklog})` : '(Unlimited)'}
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full">
                            No Backlogs Allowed
                          </span>
                        )}
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

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
                      <div className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        <span>{job.company?.companyName || 'Unknown Company'}</span>
                      </div>
                      {job.company?.website && (
                        <a 
                          href={job.company.website.startsWith('http') ? job.company.website : `https://${job.company.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:underline"
                        >
                          <Globe className="w-4 h-4" />
                          <span>Visit Website</span>
                        </a>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>Posted {new Date(job.createdAt).toLocaleDateString()}</span>
                      </div>
                      {job.deadline && (
                        <div className={`flex items-center gap-1 ${new Date(job.deadline) < new Date() ? 'text-red-600 font-medium' : ''}`}>
                          <Clock className="w-4 h-4" />
                          <span>
                            Deadline: {new Date(job.deadline).toLocaleString()}
                            {new Date(job.deadline) < new Date() && ' (Passed)'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Job Description File */}
                    {job.jobDescriptionFileUrl && (
                      <div className="mb-4">
                        <button
                          onClick={() => handleJobDescriptionFile(job)}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          View Job Description File
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 md:w-48">
                    {isApplied ? (
                      <button
                        disabled
                        className="btn bg-green-100 text-green-700 disabled:opacity-60 cursor-not-allowed w-full"
                      >
                        Applied ✓
                      </button>
                    ) : job.deadline && new Date(job.deadline) < new Date() ? (
                      <button
                        disabled
                        className="btn bg-gray-100 text-gray-500 disabled:opacity-60 cursor-not-allowed w-full"
                        title={`Application deadline passed: ${new Date(job.deadline).toLocaleString()}`}
                      >
                        Deadline Passed
                      </button>
                    ) : job.status !== 'OPEN' ? (
                      <button
                        disabled
                        className="btn bg-gray-100 text-gray-500 disabled:opacity-60 cursor-not-allowed w-full"
                      >
                        Applications Closed
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
                {selectedJob.includeCgpaInShortlisting !== false && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Your CGPA <span className="text-red-500">*</span>
                      {selectedJob.minCgpa && (
                        <span className="text-xs text-gray-500 ml-2">(Required: {selectedJob.minCgpa}+)</span>
                      )}
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
                      required
                      className="input"
                    />
                  </div>
                )}
                {selectedJob.includeCgpaInShortlisting === false && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Your CGPA <span className="text-xs text-gray-500 ml-2">(Optional - not used for shortlisting)</span>
                    </label>
                    <input
                      name="cgpa"
                      type="number"
                      step="0.01"
                      min="0"
                      max="10"
                      value={applyState.cgpa}
                      onChange={handleApplyChange}
                      placeholder="Enter your CGPA (optional)"
                      className="input"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Active Backlogs <span className="text-red-500">*</span>
                    {selectedJob.allowBacklog === false && (
                      <span className="text-xs text-red-600 ml-2">(No backlogs allowed)</span>
                    )}
                    {selectedJob.allowBacklog === true && selectedJob.maxBacklog && (
                      <span className="text-xs text-gray-500 ml-2">(Max allowed: {selectedJob.maxBacklog})</span>
                    )}
                  </label>
                  <input
                    name="backlog"
                    type="number"
                    min="0"
                    value={applyState.backlog}
                    onChange={handleApplyChange}
                    placeholder="Number of active backlogs"
                    required
                    className="input"
                  />
                </div>

                {/* Eligibility Status */}
                {eligibilityError ? (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-sm text-red-700 font-medium">⚠️ Eligibility Check Failed</p>
                    <p className="text-xs text-red-600 mt-1">{eligibilityError}</p>
                  </div>
                ) : (
                  selectedJob && 
                  (selectedJob.includeCgpaInShortlisting === false || applyState.cgpa) && 
                  applyState.backlog !== '' && 
                  checkEligibility(selectedJob, applyState.cgpa || '', applyState.backlog).eligible ? (
                    <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                      <p className="text-sm text-green-700 font-medium">✓ You meet the eligibility criteria</p>
                    </div>
                  ) : null
                )}

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
                    disabled={
                      eligibilityError !== null || 
                      (selectedJob?.includeCgpaInShortlisting !== false && !applyState.cgpa) || 
                      applyState.backlog === ''
                    }
                    className={`px-4 py-2 text-sm font-medium rounded-lg ${
                      eligibilityError !== null || 
                      (selectedJob?.includeCgpaInShortlisting !== false && !applyState.cgpa) || 
                      applyState.backlog === ''
                        ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                        : 'bg-red-600 text-white hover:bg-red-700'
                    }`}
                    title={
                      eligibilityError || 
                      ((selectedJob?.includeCgpaInShortlisting !== false && !applyState.cgpa) || applyState.backlog === '' 
                        ? 'Please fill in all required fields' 
                        : '')
                    }
                  >
                    Submit Application
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {/* Job Description File Preview Modal */}
      {previewJobDesc && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">{previewJobDesc.name}</h3>
              <div className="space-x-2">
                <a
                  href={previewJobDesc.url}
                  download={`Job_Description_${previewJobDesc.jobTitle.replace(/\s+/g, '_')}.pdf`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
                <button
                  onClick={() => setPreviewJobDesc(null)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-gray-100 rounded-lg relative overflow-hidden">
              <iframe
                src={previewJobDesc.url}
                className="w-full h-full rounded-lg"
                title="Job Description Preview"
                onError={(e) => {
                  console.error('Failed to load PDF preview:', e);
                  // Fallback to download if preview fails
                  const a = document.createElement('a');
                  a.href = previewJobDesc.url;
                  a.download = `Job_Description_${previewJobDesc.jobTitle.replace(/\s+/g, '_')}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setPreviewJobDesc(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      <Modal open={!!modal} title={modal?.title} message={modal?.text} type={modal?.type} onClose={() => setModal(null)} actions={[]} />
    </div>
  );
};

export default JobList;
