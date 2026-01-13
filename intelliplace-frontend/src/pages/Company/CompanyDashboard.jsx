import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Building2,
  Briefcase,
  Users,
  FileCheck,
  TrendingUp,
  Plus,
  ClipboardList,
} from 'lucide-react';
import ApplicationsList from '../../components/ApplicationsList';
import Navbar from '../../components/Navbar';
import { getCurrentUser } from '../../utils/auth';
import CompanyPostJob from '../../components/CompanyPostJob';
import CompanyCreateTest from '../../components/CompanyCreateTest';
import CompanyCreateCodingTest from '../../components/CompanyCreateCodingTest';
import CompanyViewTest from '../../components/CompanyViewTest';
import Modal from '../../components/Modal';

const CompanyDashboard = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [stats, setStats] = useState([
    { label: 'Jobs Posted', value: '0', icon: Briefcase, color: 'from-red-500 to-red-600' },
    { label: 'Applications', value: '0', icon: FileCheck, color: 'from-red-600 to-red-700' },
    { label: 'Interviews', value: '0', icon: Users, color: 'from-green-500 to-green-600' },
    { label: 'Hired', value: '0', icon: TrendingUp, color: 'from-orange-500 to-orange-600' }
  ]);

  useEffect(() => {
    if (!user || user.userType !== 'company') {
      navigate('/company/login');
      return;
    }

    const fetchStats = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/dashboard/company/stats/${user.id}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });
        
        if (!response.ok) throw new Error('Failed to fetch stats');
        
        const data = await response.json();
        
        setStats([
          { label: 'Jobs Posted', value: data.data.jobsPosted.toString(), icon: Briefcase, color: 'from-red-500 to-red-600' },
          { label: 'Applications', value: data.data.totalApplications.toString(), icon: FileCheck, color: 'from-red-600 to-red-700' },
          { label: 'Interviews', value: data.data.totalInterviews.toString(), icon: Users, color: 'from-green-500 to-green-600' },
          { label: 'Hired', value: data.data.totalHired.toString(), icon: TrendingUp, color: 'from-orange-500 to-orange-600' }
        ]);
      } catch (error) {
        console.error('Failed to fetch company stats:', error);
      }
    };

    fetchStats();
  }, [user, navigate]);

  // Fetch recent jobs posted by this company
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedJobStatus, setSelectedJobStatus] = useState(null);
  const [isPostJobOpen, setIsPostJobOpen] = useState(false);
  const [isCreateTestOpen, setIsCreateTestOpen] = useState(false);
  const [isCreateCodingTestOpen, setIsCreateCodingTestOpen] = useState(false);
  const [isEditCodingTestOpen, setIsEditCodingTestOpen] = useState(false);
  const [editingCodingTestJobId, setEditingCodingTestJobId] = useState(null);
  const [testJobId, setTestJobId] = useState(null);
  const [testsMap, setTestsMap] = useState({});
  const [codingTestsMap, setCodingTestsMap] = useState({});
  const [isViewTestOpen, setIsViewTestOpen] = useState(false);
  const [viewTestJobId, setViewTestJobId] = useState(null);
  const [isStartConfirmOpen, setIsStartConfirmOpen] = useState(false);
  const [startingJob, setStartingJob] = useState(null);
  const [startLoading, setStartLoading] = useState(false);
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);
  const [stoppingJob, setStoppingJob] = useState(null);
  const [stopLoading, setStopLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0); // Track last fetch time

  const fetchJobs = async (userId) => {
    if (!userId) return;
    setJobsLoading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/jobs?limit=10`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      if (res.ok && json.data && Array.isArray(json.data.jobs)) {
        // Filter jobs belonging to this company
        const myJobs = json.data.jobs.filter(j => j.company && j.company.id === userId);
        setJobs(myJobs);

        // fetch tests for each job
        try {
          const tokens = myJobs.map(async job => {
            try {
              // Fetch aptitude test
              const r = await fetch(`http://localhost:5000/api/jobs/${job.id}/aptitude-test`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
              });
              
              // Fetch coding test
              const codingR = await fetch(`http://localhost:5000/api/jobs/${job.id}/coding-test`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
              });
              
              let aptitudeTest = null;
              if (r.ok) {
                const aptitudeData = await r.json();
                aptitudeTest = aptitudeData.data?.test || aptitudeData.data;
              }
              
              let codingTest = null;
              if (codingR.ok) {
                const codingData = await codingR.json();
                codingTest = codingData.data;
              }
              
              return { 
                jobId: job.id, 
                aptitudeTest,
                codingTest
              };
            } catch (err) {
              return { jobId: job.id, aptitudeTest: null, codingTest: null };
            }
          });
          const results = await Promise.all(tokens);
          const aptitudeMap = {};
          const codingMap = {};
          results.forEach(r => {
            if (r && r.aptitudeTest) aptitudeMap[r.jobId] = r.aptitudeTest;
            if (r && r.codingTest) codingMap[r.jobId] = r.codingTest;
          });
          setTestsMap(aptitudeMap);
          setCodingTestsMap(codingMap);
        } catch (e) {
          console.error('Failed to fetch tests for jobs:', e);
        }

      } else {
        setJobs([]);
      }
    } catch (err) {
      console.error('Failed to fetch jobs for company:', err);
      setJobs([]);
    } finally {
      setJobsLoading(false);
      setLastFetch(Date.now()); // Update last fetch timestamp
    }
  };

  // fetch jobs when component mounts, when user changes, or when manually refreshed
  useEffect(() => {
    if (!user?.id || Date.now() - lastFetch < 1000) return; // Debounce fetches
    fetchJobs(user.id);
  }, [user?.id, lastFetch]);

  const handleConfirmStart = async () => {
    if (!startingJob) return;
    setStartLoading(true);
    try {
      const token = localStorage.getItem('token');
      const isCoding = startingJob.isCoding;
      const endpoint = isCoding
        ? `http://localhost:5000/api/jobs/${startingJob.id}/coding-test/start`
        : `http://localhost:5000/api/jobs/${startingJob.id}/aptitude-test/start`;
      
      const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) {
        alert(d.message || 'Failed to start test');
      } else {
        if (isCoding) {
          setCodingTestsMap(prev => ({ ...prev, [startingJob.id]: d.data }));
        } else {
          setTestsMap(prev => ({ ...prev, [startingJob.id]: d.data.test }));
          setJobs(prev => prev.map(j => j.id === startingJob.id ? { ...j, status: d.data.job?.status || 'CLOSED' } : j));
        }
        alert(`Test started${!isCoding ? ` — ${d.data.invited || 0} shortlisted students notified` : ''}`);
        setIsStartConfirmOpen(false);
        setStartingJob(null);
        // Refresh jobs to update test status
        if (user) fetchJobs(user.id);
      }
    } catch (err) {
      console.error('Failed to start test:', err);
      alert('Failed to start test');
    } finally {
      setStartLoading(false);
    }
  };

  const handleConfirmStop = async () => {
    if (!stoppingJob) return;
    setStopLoading(true);
    try {
      const token = localStorage.getItem('token');
      const isCoding = stoppingJob.isCoding;
      const endpoint = isCoding
        ? `http://localhost:5000/api/jobs/${stoppingJob.id}/coding-test/stop`
        : `http://localhost:5000/api/jobs/${stoppingJob.id}/aptitude-test/stop`;
      
      const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) {
        alert(d.message || 'Failed to stop test');
      } else {
        if (isCoding) {
          setCodingTestsMap(prev => ({ ...prev, [stoppingJob.id]: d.data }));
        } else {
          setTestsMap(prev => ({ ...prev, [stoppingJob.id]: d.data.test }));
        }
        alert('Test stopped successfully');
        setIsStopConfirmOpen(false);
        setStoppingJob(null);
        // Refresh jobs to update test status
        if (user) fetchJobs(user.id);
      }
    } catch (err) {
      console.error('Failed to stop test:', err);
      alert('Failed to stop test');
    } finally {
      setStopLoading(false);
    }
  };

  if (!user || user.userType !== 'company') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                Welcome, {user.companyName || user.name || user.username}!
              </h1>
              <p className="text-gray-600">Company Dashboard</p>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.05 }}
              className="card"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-gray-800 mb-1">{stat.value}</h3>
              <p className="text-gray-600 text-sm">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-lg p-8 border border-gray-200"
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Quick Actions</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <button 
              onClick={() => setIsPostJobOpen(true)}
              className="btn btn-primary text-left"
            >
              <Plus className="w-6 h-6 text-white mr-2" />
              <div className="text-left">
                <h3 className="font-semibold text-white">Post New Job</h3>
                <p className="text-sm text-white/90">Create a new job posting</p>
              </div>
            </button>
            <button 
              onClick={() => {
                const jobsSection = document.querySelector('#recent-jobs');
                if (jobsSection) jobsSection.scrollIntoView({ behavior: 'smooth' });
              }}
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-red-600 hover:bg-red-50 transition-all text-left group"
            >
              <FileCheck className="w-8 h-8 text-gray-400 group-hover:text-red-600 mb-2" />
              <h3 className="font-semibold text-gray-800">View Applications</h3>
              <p className="text-sm text-gray-600">Review candidate applications</p>
            </button>
            <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-left group">
              <Users className="w-8 h-8 text-gray-400 group-hover:text-green-500 mb-2" />
              <h3 className="font-semibold text-gray-800">Manage Interviews</h3>
              <p className="text-sm text-gray-600">Schedule and manage interviews</p>
            </button>
          </div>
        </motion.div>
        
        {/* Post Job Modal */}
        <CompanyPostJob
          isOpen={isPostJobOpen}
          onClose={() => setIsPostJobOpen(false)}
          onCreated={() => {
            setIsPostJobOpen(false);
            fetchJobs(user.id);
          }}
        />

        <CompanyCreateTest
          isOpen={isCreateTestOpen}
          onClose={() => { setIsCreateTestOpen(false); setTestJobId(null); }}
          jobId={testJobId}
          onCreated={async () => {
            setIsCreateTestOpen(false);
            setTestJobId(null);
            // Refresh tests map for that job
            try {
              const r = await fetch(`http://localhost:5000/api/jobs/${testJobId}/aptitude-test`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
              if (r.ok) {
                const d = await r.json();
                setTestsMap(prev => ({ ...prev, [testJobId]: d.data.test }));
              }
            } catch (err) {
              console.error('Failed to refresh test after creation:', err);
            }
          }}
        />

        <CompanyCreateCodingTest
          isOpen={isCreateCodingTestOpen}
          onClose={() => { setIsCreateCodingTestOpen(false); setTestJobId(null); }}
          jobId={testJobId}
          onCreated={async () => {
            setIsCreateCodingTestOpen(false);
            setTestJobId(null);
            // Refresh coding tests map for that job
            try {
              const r = await fetch(`http://localhost:5000/api/jobs/${testJobId}/coding-test`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
              if (r.ok) {
                const d = await r.json();
                setCodingTestsMap(prev => ({ ...prev, [testJobId]: d.data }));
              }
            } catch (err) {
              console.error('Failed to refresh coding test after creation:', err);
            }
            // Refresh jobs to show updated info
            if (user) fetchJobs(user.id);
          }}
        />
        
        <CompanyCreateCodingTest
          isOpen={isEditCodingTestOpen}
          onClose={() => { setIsEditCodingTestOpen(false); setEditingCodingTestJobId(null); }}
          jobId={editingCodingTestJobId}
          editingTest={true}
          onCreated={async () => {
            setIsEditCodingTestOpen(false);
            const editedJobId = editingCodingTestJobId;
            setEditingCodingTestJobId(null);
            // Refresh coding tests map for that job
            try {
              const r = await fetch(`http://localhost:5000/api/jobs/${editedJobId}/coding-test`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
              if (r.ok) {
                const d = await r.json();
                setCodingTestsMap(prev => ({ ...prev, [editedJobId]: d.data }));
              }
            } catch (err) {
              console.error('Failed to refresh coding test after edit:', err);
            }
            // Refresh jobs to show updated info
            if (user) fetchJobs(user.id);
          }}
        />

        <CompanyViewTest
          isOpen={isViewTestOpen}
          onClose={() => { setIsViewTestOpen(false); setViewTestJobId(null); }}
          jobId={viewTestJobId}
          test={viewTestJobId ? testsMap[viewTestJobId] : null}
        />

        <Modal
          open={isStartConfirmOpen}
          title={`Start ${startingJob?.isCoding ? 'Coding' : 'Aptitude'} Test for ${startingJob?.title || ''}`}
          message={startingJob?.isCoding 
            ? `Starting the coding test will allow students to take the test. Continue?`
            : `Starting the test will close applications for this job and notify all shortlisted students. Continue?`}
          type="warning"
          onClose={() => setIsStartConfirmOpen(false)}
          actions={[
            { label: 'Cancel', onClick: () => setIsStartConfirmOpen(false) },
            { label: startLoading ? 'Starting...' : 'Start Test', onClick: handleConfirmStart, autoClose: false }
          ]}
        />

        <Modal
          open={isStopConfirmOpen}
          title={`Stop test for ${stoppingJob?.title || ''}`}
          message={`Stopping the test will prevent students from taking the test. Students who have already submitted will keep their results. Continue?`}
          type="warning"
          onClose={() => setIsStopConfirmOpen(false)}
          actions={[
            { label: 'Cancel', onClick: () => setIsStopConfirmOpen(false) },
            { label: stopLoading ? 'Stopping...' : 'Stop Test', onClick: handleConfirmStop, autoClose: false }
          ]}
        />

        {/* Recent Jobs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          id="recent-jobs"
          className="bg-white rounded-xl shadow-lg p-8 border border-gray-200 mt-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Job Postings</h2>
            <button
              onClick={() => setIsPostJobOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Post New Job
            </button>
          </div>

          {jobsLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading jobs...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No job postings yet</p>
              <button 
                onClick={() => setIsPostJobOpen(true)}
                className="mt-4 inline-flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Post Your First Job
              </button>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {jobs.map(job => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="group bg-white border rounded-xl shadow-sm hover:shadow-md transition-all p-6"
                >
                  <div className="flex flex-col h-full">
                    <div className="flex-grow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-gray-800 group-hover:text-red-600 transition-colors">
                            {job.title}
                          </h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            job.status === 'OPEN' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {job.status}
                          </span>
                        </div>
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                          job.type === 'FULL_TIME' ? 'bg-green-100 text-green-800' :
                          job.type === 'PART_TIME' ? 'bg-blue-100 text-blue-800' :
                          job.type === 'CONTRACT' ? 'bg-purple-100 text-purple-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {job.type.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-gray-600 line-clamp-2">
                        {job.description}
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <span className="font-medium">Location:</span>
                          <span className="ml-2">{job.location || 'Remote'}</span>
                        </div>
                        {job.salary && (
                          <div className="flex items-center text-sm text-gray-600">
                            <span className="font-medium">Salary:</span>
                            <span className="ml-2">{job.salary}</span>
                          </div>
                        )}
                        {job.requiredSkills && (
                          <div className="flex flex-wrap gap-1">
                            {typeof job.requiredSkills === 'string' 
                              ? job.requiredSkills.split(',').map((skill, index) => (
                                <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                                  {skill.trim()}
                                </span>
                              ))
                              : job.requiredSkills.map((skill, index) => (
                                <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                                  {skill}
                                </span>
                              ))
                            }
                          </div>
                        )}
                        
                        {/* Test Status Badges */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {testsMap[job.id] && (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              testsMap[job.id].status === 'STARTED' ? 'bg-green-100 text-green-800' :
                              testsMap[job.id].status === 'CREATED' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              Aptitude: {testsMap[job.id].status}
                            </span>
                          )}
                          {codingTestsMap[job.id] && (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              codingTestsMap[job.id].status === 'STARTED' ? 'bg-green-100 text-green-800' :
                              codingTestsMap[job.id].status === 'CREATED' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              Coding: {codingTestsMap[job.id].status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t flex items-center justify-between">
                      <div className="text-xs text-gray-500">
                        Posted {new Date(job.createdAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Recruitment Process Button */}
                        <Link
                          to={`/company/recruitment/${job.id}`}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                        >
                          <ClipboardList className="w-4 h-4" />
                          Recruitment Process
                        </Link>

                        <button
                          onClick={() => { setSelectedJobId(job.id); setSelectedJobStatus(job.status); }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                        >
                          <Users className="w-4 h-4" />
                          View Applications
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          {selectedJobId && <ApplicationsList jobId={selectedJobId} initialJobStatus={selectedJobStatus} onClose={() => setSelectedJobId(null)} />}
        </motion.div>
      </div>
    </div>
  );
};

export default CompanyDashboard;

