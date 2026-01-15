import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ClipboardList,
  Code,
  Play,
  Square,
  Edit,
  Eye,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Video,
} from 'lucide-react';
import Navbar from '../../components/Navbar';
import { getCurrentUser } from '../../utils/auth';
import CompanyCreateTest from '../../components/CompanyCreateTest';
import CompanyCreateCodingTest from '../../components/CompanyCreateCodingTest';
import CompanyViewTest from '../../components/CompanyViewTest';
import CompanyStartInterview from '../../components/CompanyStartInterview';
import Modal from '../../components/Modal';

const RecruitmentProcess = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const user = getCurrentUser();
  const [activeTab, setActiveTab] = useState('aptitude'); // 'aptitude', 'coding', or 'interview'
  const [job, setJob] = useState(null);
  const [aptitudeTest, setAptitudeTest] = useState(null);
  const [codingTest, setCodingTest] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [shortlistedApplications, setShortlistedApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  
  // Interview modal state
  const [isInterviewOpen, setIsInterviewOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  
  // Modals
  const [isCreateAptitudeOpen, setIsCreateAptitudeOpen] = useState(false);
  const [isCreateCodingOpen, setIsCreateCodingOpen] = useState(false);
  const [isEditCodingOpen, setIsEditCodingOpen] = useState(false);
  const [isViewTestOpen, setIsViewTestOpen] = useState(false);
  const [isStartConfirmOpen, setIsStartConfirmOpen] = useState(false);
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);
  const [testToStart, setTestToStart] = useState(null); // { type: 'aptitude' | 'coding' }

  const fetchJobAndTests = useCallback(async (showLoading = true) => {
    if (!jobId) {
      if (showLoading) setLoading(false);
      return;
    }

    // Prevent multiple simultaneous calls
    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    if (showLoading) {
      setLoading(true);
    }

    try {
      // Fetch job details from jobs list (since there's no single job endpoint)
      try {
        const jobsRes = await fetch(`http://localhost:5000/api/jobs?limit=100`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          const allJobs = jobsData.data?.jobs || [];
          const foundJob = allJobs.find(j => j.id === parseInt(jobId));
          if (foundJob) {
            setJob(foundJob);
          }
        }
      } catch (err) {
        console.error('Error fetching job:', err);
      }

      // Fetch aptitude test
      try {
        const aptitudeRes = await fetch(
          `http://localhost:5000/api/jobs/${jobId}/aptitude-test`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          }
        );
        if (aptitudeRes.ok) {
          const aptitudeData = await aptitudeRes.json();
          setAptitudeTest(aptitudeData.data?.test || aptitudeData.data);
        } else if (aptitudeRes.status === 404) {
          // 404 means no test exists - this is normal, not an error
          setAptitudeTest(null);
        } else {
          // Other error statuses - only log if not 404
          setAptitudeTest(null);
        }
      } catch (err) {
        // Network errors or other exceptions - only log real errors
        if (err.name !== 'TypeError' || !err.message.includes('404')) {
          console.error('Error fetching aptitude test:', err);
        }
        setAptitudeTest(null);
      }

      // Fetch coding test
      try {
        const codingRes = await fetch(
          `http://localhost:5000/api/jobs/${jobId}/coding-test`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          }
        );
        if (codingRes.ok) {
          const codingData = await codingRes.json();
          setCodingTest(codingData.data);
        } else if (codingRes.status === 404) {
          // 404 means no test exists - this is normal, not an error
          setCodingTest(null);
        } else {
          // Other error statuses - only log if not 404
          setCodingTest(null);
        }
      } catch (err) {
        // Network errors or other exceptions - only log real errors
        if (err.name !== 'TypeError' || !err.message.includes('404')) {
          console.error('Error fetching coding test:', err);
        }
        setCodingTest(null);
      }

      // Fetch interviews
      try {
        const interviewsRes = await fetch(
          `http://localhost:5000/api/jobs/${jobId}/interviews`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          }
        );
        if (interviewsRes.ok) {
          const interviewsData = await interviewsRes.json();
          setInterviews(interviewsData.data?.interviews || interviewsData.data || []);
        } else if (interviewsRes.status === 404) {
          // 404 means no interviews exist - this is normal, not an error
          setInterviews([]);
        } else {
          // Other error statuses - only log if not 404
          setInterviews([]);
        }
      } catch (err) {
        // Network errors or other exceptions - only log real errors
        if (err.name !== 'TypeError' || !err.message.includes('404')) {
          console.error('Error fetching interviews:', err);
        }
        setInterviews([]);
      }

      // Fetch shortlisted applications
      try {
        const applicationsRes = await fetch(
          `http://localhost:5000/api/jobs/${jobId}/applicants`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          }
        );
        if (applicationsRes.ok) {
          const applicationsData = await applicationsRes.json();
          const allApplications = applicationsData.data?.applications || [];
          // Filter only shortlisted applications
          const shortlisted = allApplications.filter(
            (app) => app.status === 'SHORTLISTED'
          );
          setShortlistedApplications(shortlisted);
        } else {
          setShortlistedApplications([]);
        }
      } catch (err) {
        console.error('Error fetching applications:', err);
        setShortlistedApplications([]);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      isFetchingRef.current = false;
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [jobId]);

  useEffect(() => {
    // Check authentication
    if (!user || user.userType !== 'company') {
      navigate('/company/login');
      return;
    }
    
    // Check jobId
    if (!jobId) {
      setLoading(false);
      return;
    }

    // Only fetch if not already fetching
    if (!isFetchingRef.current) {
      fetchJobAndTests(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const handleStartTest = async () => {
    if (!testToStart) return;
    setStartLoading(true);
    try {
      const token = localStorage.getItem('token');
      const endpoint =
        testToStart.type === 'coding'
          ? `http://localhost:5000/api/jobs/${jobId}/coding-test/start`
          : `http://localhost:5000/api/jobs/${jobId}/aptitude-test/start`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.message || 'Failed to start test');
      } else {
        if (testToStart.type === 'coding') {
          setCodingTest(d.data);
        } else {
          setAptitudeTest(d.data.test);
        }
        alert(
          `Test started${testToStart.type !== 'coding' ? ` — ${d.data.invited || 0} shortlisted students notified` : ''}`
        );
        setIsStartConfirmOpen(false);
        setTestToStart(null);
        await fetchJobAndTests(false);
      }
    } catch (err) {
      console.error('Failed to start test:', err);
      alert('Failed to start test');
    } finally {
      setStartLoading(false);
    }
  };

  const handleStopTest = async () => {
    if (!testToStart) return;
    setStopLoading(true);
    try {
      const token = localStorage.getItem('token');
      const endpoint =
        testToStart.type === 'coding'
          ? `http://localhost:5000/api/jobs/${jobId}/coding-test/stop`
          : `http://localhost:5000/api/jobs/${jobId}/aptitude-test/stop`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.message || 'Failed to stop test');
      } else {
        if (testToStart.type === 'coding') {
          setCodingTest(d.data);
        } else {
          setAptitudeTest(d.data.test);
        }
        alert('Test stopped successfully');
        setIsStopConfirmOpen(false);
        setTestToStart(null);
        await fetchJobAndTests(false);
      }
    } catch (err) {
      console.error('Failed to stop test:', err);
      alert('Failed to stop test');
    } finally {
      setStopLoading(false);
    }
  };

  // Show loading or redirect
  if (!user || user.userType !== 'company') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center py-12">
            <p className="text-gray-600">Redirecting...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading recruitment process...</p>
            <p className="text-sm text-gray-500 mt-2">Job ID: {jobId}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <button
            onClick={() => navigate('/company/dashboard')}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              Recruitment Process
            </h1>
            {job && (
              <p className="text-gray-600 mt-2">
                {job.title} • {job.location || 'Remote'}
              </p>
            )}
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl shadow-lg border border-gray-200 mb-6"
        >
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('aptitude')}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                activeTab === 'aptitude'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <ClipboardList className="w-5 h-5" />
                Aptitude Test
              </div>
            </button>
            <button
              onClick={() => setActiveTab('coding')}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                activeTab === 'coding'
                  ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Code className="w-5 h-5" />
                Coding Test
              </div>
            </button>
            <button
              onClick={() => setActiveTab('interview')}
              className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                activeTab === 'interview'
                  ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Video className="w-5 h-5" />
                Interview
              </div>
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'aptitude' ? (
              <AptitudeTestContent
                test={aptitudeTest}
                onCreate={() => setIsCreateAptitudeOpen(true)}
                onStart={() => {
                  setTestToStart({ type: 'aptitude' });
                  setIsStartConfirmOpen(true);
                }}
                onStop={() => {
                  setTestToStart({ type: 'aptitude' });
                  setIsStopConfirmOpen(true);
                }}
                onView={() => setIsViewTestOpen(true)}
              />
            ) : activeTab === 'coding' ? (
              <CodingTestContent
                test={codingTest}
                onCreate={() => setIsCreateCodingOpen(true)}
                onEdit={() => setIsEditCodingOpen(true)}
                onStart={() => {
                  setTestToStart({ type: 'coding' });
                  setIsStartConfirmOpen(true);
                }}
                onStop={() => {
                  setTestToStart({ type: 'coding' });
                  setIsStopConfirmOpen(true);
                }}
                onRestart={() => {
                  setTestToStart({ type: 'coding' });
                  setIsStartConfirmOpen(true);
                }}
              />
            ) : (
              <InterviewContent
                interviews={interviews}
                applications={shortlistedApplications}
                job={job}
                jobId={jobId}
                onStartInterview={(application) => {
                  setSelectedApplication(application);
                  setIsInterviewOpen(true);
                }}
                onRefresh={() => fetchJobAndTests(false)}
              />
            )}
          </div>
        </motion.div>
      </div>

      {/* Modals */}
      <CompanyCreateTest
        isOpen={isCreateAptitudeOpen}
        onClose={() => setIsCreateAptitudeOpen(false)}
        jobId={parseInt(jobId)}
        onCreated={async () => {
          setIsCreateAptitudeOpen(false);
          await fetchJobAndTests(false);
        }}
      />

      <CompanyCreateCodingTest
        isOpen={isCreateCodingOpen}
        onClose={() => setIsCreateCodingOpen(false)}
        jobId={parseInt(jobId)}
        onCreated={async () => {
          setIsCreateCodingOpen(false);
          await fetchJobAndTests(false);
        }}
      />
      
      <CompanyCreateCodingTest
        isOpen={isEditCodingOpen}
        onClose={() => setIsEditCodingOpen(false)}
        jobId={parseInt(jobId)}
        editingTest={true}
        onCreated={async () => {
          setIsEditCodingOpen(false);
          await fetchJobAndTests(false);
        }}
      />

      <CompanyViewTest
        isOpen={isViewTestOpen}
        onClose={() => setIsViewTestOpen(false)}
        jobId={parseInt(jobId)}
        test={aptitudeTest}
      />

      <Modal
        open={isStartConfirmOpen}
        title={`Start ${testToStart?.type === 'coding' ? 'Coding' : 'Aptitude'} Test`}
        message={
          testToStart?.type === 'coding'
            ? `Starting the coding test will allow students to take the test. Continue?`
            : `Starting the test will close applications for this job and notify all shortlisted students. Continue?`
        }
        type="warning"
        onClose={() => setIsStartConfirmOpen(false)}
        actions={[
          { label: 'Cancel', onClick: () => setIsStartConfirmOpen(false) },
          {
            label: startLoading ? 'Starting...' : 'Start Test',
            onClick: handleStartTest,
            autoClose: false,
          },
        ]}
      />

      <Modal
        open={isStopConfirmOpen}
        title={`Stop ${testToStart?.type === 'coding' ? 'Coding' : 'Aptitude'} Test`}
        message={`Stopping the test will prevent students from taking the test. Students who have already submitted will keep their results. Continue?`}
        type="warning"
        onClose={() => setIsStopConfirmOpen(false)}
        actions={[
          { label: 'Cancel', onClick: () => setIsStopConfirmOpen(false) },
          {
            label: stopLoading ? 'Stopping...' : 'Stop Test',
            onClick: handleStopTest,
            autoClose: false,
          },
        ]}
      />

      {isInterviewOpen && selectedApplication && (
        <CompanyStartInterview
          isOpen={isInterviewOpen}
          onClose={() => {
            setIsInterviewOpen(false);
            setSelectedApplication(null);
            fetchJobAndTests(false);
          }}
          jobId={parseInt(jobId)}
          applicationId={selectedApplication.id}
          application={selectedApplication}
          job={job}
        />
      )}
    </div>
  );
};

// Aptitude Test Content Component
const AptitudeTestContent = ({ test, onCreate, onStart, onStop, onView }) => {
  if (!test) {
    return (
      <div className="text-center py-12">
        <ClipboardList className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-800 mb-2">
          No Aptitude Test Created
        </h3>
        <p className="text-gray-600 mb-6">
          Create an aptitude test to assess candidates' skills
        </p>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Aptitude Test
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            Aptitude Test Details
          </h3>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 text-sm font-medium rounded-full ${
                test.status === 'STARTED'
                  ? 'bg-green-100 text-green-800'
                  : test.status === 'CREATED'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              Status: {test.status}
            </span>
            {test.cutoff && (
              <span className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
                Cutoff: {test.cutoff}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Total Questions</div>
          <div className="text-2xl font-bold text-gray-800">
            {test.totalQuestions || test.questions?.length || 0}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Sections</div>
          <div className="text-2xl font-bold text-gray-800">
            {test.sections?.length || 0}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Status</div>
          <div className="text-2xl font-bold text-gray-800">{test.status}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-4 border-t">
        {test.status === 'CREATED' && (
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Play className="w-4 h-4" />
            Start Test
          </button>
        )}
        {test.status === 'STARTED' && (
          <button
            onClick={onStop}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Square className="w-4 h-4" />
            Stop Test
          </button>
        )}
        {test.status !== 'STOPPED' && (
          <button
            onClick={onView}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Eye className="w-4 h-4" />
            View Test
          </button>
        )}
      </div>
    </div>
  );
};

// Coding Test Content Component
const CodingTestContent = ({
  test,
  onCreate,
  onEdit,
  onStart,
  onStop,
  onRestart,
}) => {
  if (!test) {
    return (
      <div className="text-center py-12">
        <Code className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-800 mb-2">
          No Coding Test Created
        </h3>
        <p className="text-gray-600 mb-6">
          Create a coding test to evaluate candidates' programming skills
        </p>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Coding Test
        </button>
      </div>
    );
  }

  const allowedLanguages = test.allowedLanguages
    ? JSON.parse(test.allowedLanguages)
    : [];
  const languageNames = {
    50: 'C',
    54: 'C++',
    92: 'Java',
    71: 'Python',
  };

  return (
    <div className="space-y-6">
      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            Coding Test Details
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`px-3 py-1 text-sm font-medium rounded-full ${
                test.status === 'STARTED'
                  ? 'bg-green-100 text-green-800'
                  : test.status === 'CREATED'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              Status: {test.status}
            </span>
            {test.cutoff && (
              <span className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
                Cutoff: {test.cutoff}%
              </span>
            )}
            {test.timeLimit && (
              <span className="px-3 py-1 text-sm bg-orange-100 text-orange-800 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Time Limit: {test.timeLimit} min
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Total Questions</div>
          <div className="text-2xl font-bold text-gray-800">
            {test.questions?.length || 0}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Allowed Languages</div>
          <div className="text-lg font-semibold text-gray-800">
            {allowedLanguages
              .map((id) => languageNames[id] || `Lang ${id}`)
              .join(', ') || 'None'}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Status</div>
          <div className="text-2xl font-bold text-gray-800">{test.status}</div>
        </div>
      </div>

      {/* Test Info */}
      {test.title && (
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-sm font-semibold text-blue-900 mb-1">Title</div>
          <div className="text-gray-800">{test.title}</div>
        </div>
      )}
      {test.description && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm font-semibold text-gray-700 mb-1">
            Description
          </div>
          <div className="text-gray-600">{test.description}</div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-4 border-t">
        {test.status === 'CREATED' && (
          <>
            <button
              onClick={onStart}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Play className="w-4 h-4" />
              Start Test
            </button>
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit Test
            </button>
          </>
        )}
        {test.status === 'STARTED' && (
          <button
            onClick={onStop}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Square className="w-4 h-4" />
            Stop Test
          </button>
        )}
        {test.status === 'STOPPED' && (
          <>
            <button
              onClick={onRestart}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Play className="w-4 h-4" />
              Restart Test
            </button>
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit Test
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// Interview Content Component
const InterviewContent = ({ interviews, applications, job, jobId, onStartInterview, onRefresh }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            Interview Management
          </h3>
          <p className="text-sm text-gray-600">
            Conduct AI-powered interviews for shortlisted candidates
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Shortlisted Applications */}
      <div>
        <h4 className="text-lg font-semibold text-gray-800 mb-4">
          Shortlisted Candidates
        </h4>
        {applications && applications.length > 0 ? (
          <div className="space-y-3">
            {applications.map((application) => {
              const existingInterview = interviews?.find(
                (i) => i.applicationId === application.id
              );
              return (
                <div
                  key={application.id}
                  className="bg-white rounded-lg p-4 border border-gray-200 hover:border-green-500 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h5 className="font-semibold text-gray-800">
                          {application.student?.name || 'Unknown'}
                        </h5>
                        {application.student?.cgpa && (
                          <span className="text-sm text-gray-600">
                            CGPA: {application.student.cgpa}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        <p>Email: {application.student?.email}</p>
                        {application.student?.rollNumber && (
                          <p>Roll Number: {application.student.rollNumber}</p>
                        )}
                      </div>
                      {existingInterview && (
                        <div className="mt-2">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              existingInterview.status === 'COMPLETED'
                                ? 'bg-green-100 text-green-800'
                                : existingInterview.status === 'IN_PROGRESS'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            Interview: {existingInterview.status}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => onStartInterview(application)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Video className="w-4 h-4" />
                      {existingInterview ? 'Continue Interview' : 'Start Interview'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">
              No shortlisted candidates yet. Shortlist candidates first to conduct interviews.
            </p>
          </div>
        )}
      </div>

      {/* Interview History */}
      {interviews && interviews.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold text-gray-800 mb-4">
            Interview History
          </h4>
          <div className="space-y-3">
            {interviews.map((interview) => (
              <div
                key={interview.id}
                className="bg-gray-50 rounded-lg p-4 border border-gray-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`px-3 py-1 text-sm font-medium rounded-full ${
                          interview.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-800'
                            : interview.status === 'IN_PROGRESS'
                            ? 'bg-blue-100 text-blue-800'
                            : interview.status === 'SCHEDULED'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {interview.status}
                      </span>
                      <span className="px-3 py-1 text-sm bg-purple-100 text-purple-800 rounded-full">
                        {interview.type}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>
                        <strong>Date:</strong>{' '}
                        {new Date(interview.date).toLocaleString()}
                      </p>
                      {interview.application?.student && (
                        <p>
                          <strong>Candidate:</strong>{' '}
                          {interview.application.student.name}
                        </p>
                      )}
                      {interview.sessions && interview.sessions.length > 0 && (
                        <p>
                          <strong>Sessions:</strong> {interview.sessions.length}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecruitmentProcess;
