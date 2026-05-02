import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  Users,
} from 'lucide-react';
import Navbar from '../../components/Navbar';
import DashboardLayout from '../../components/DashboardLayout';
import { getCurrentUser } from '../../utils/auth';
import { API_BASE_URL } from '../../config.js';
import CompanyCreateTest from '../../components/CompanyCreateTest';
import CompanyCreateCodingTest from '../../components/CompanyCreateCodingTest';
import CompanyViewTest from '../../components/CompanyViewTest';
import CompanyStartInterview from '../../components/CompanyStartInterview';
import ApplicationsList from '../../components/ApplicationsList';
import Modal from '../../components/Modal';
import CompanyGDManager from '../../components/CompanyGDManager';

const ELIGIBILITY_OPTIONS = [
  { value: 'ALL_APPLICANTS', label: 'All applicants' },
  { value: 'SHORTLISTED_ONLY', label: 'Shortlisted candidates' },
  { value: 'APTITUDE_PASSED', label: 'Aptitude passed' },
  { value: 'CODING_PASSED', label: 'Coding passed' },
  { value: 'GD_PASSED', label: 'GD passed' },
];

const ELIGIBILITY_STATUS_MAP = {
  ALL_APPLICANTS: null,
  SHORTLISTED_ONLY: ['SHORTLISTED'],
  APTITUDE_PASSED: ['APTITUDE_PASSED', 'PASSED APTITUDE', 'APP PASS'],
  CODING_PASSED: ['CODING_PASSED', 'PASSED CODING', 'CODE PASS'],
  GD_PASSED: ['GD_PASSED'],
};

const RecruitmentProcess = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const user = getCurrentUser();
  const [activeTab, setActiveTab] = useState('aptitude'); // 'aptitude', 'coding', or 'interview'
  const [job, setJob] = useState(null);
  const [aptitudeTest, setAptitudeTest] = useState(null);
  const [codingTest, setCodingTest] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [gdTest, setGdTest] = useState(null);
  const [allApplications, setAllApplications] = useState([]);
  const [aptitudeEligibleApplications, setAptitudeEligibleApplications] = useState([]);
  const [codingEligibleApplications, setCodingEligibleApplications] = useState([]);
  const [gdEligibleApplications, setGdEligibleApplications] = useState([]);
  const [shortlistedApplications, setShortlistedApplications] = useState([]);
  const [eligibilityFilters, setEligibilityFilters] = useState({
    aptitude: 'SHORTLISTED_ONLY',
    coding: 'APTITUDE_PASSED',
    gd: 'CODING_PASSED',
    interview: 'ALL_APPLICANTS',
  });
  const [proceededStages, setProceededStages] = useState({
    aptitude: false,
    coding: false,
    gd: false,
    interview: false,
  });
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  
  // Interview modal state
  const [isInterviewOpen, setIsInterviewOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  
  // Modals
  const [isCreateAptitudeOpen, setIsCreateAptitudeOpen] = useState(false);
  const [isEditAptitudeOpen, setIsEditAptitudeOpen] = useState(false);
  const [isCreateCodingOpen, setIsCreateCodingOpen] = useState(false);
  const [isEditCodingOpen, setIsEditCodingOpen] = useState(false);
  const [isViewTestOpen, setIsViewTestOpen] = useState(false);
  const [isStartConfirmOpen, setIsStartConfirmOpen] = useState(false);
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);
  const [testToStart, setTestToStart] = useState(null); // { type: 'aptitude' | 'coding' }
  const [showApplicationsList, setShowApplicationsList] = useState(false);

  const filterApplicationsByEligibility = useCallback((apps, filter) => {
    const statuses = ELIGIBILITY_STATUS_MAP[filter];
    if (!statuses) return apps;
    const allowed = new Set(statuses);
    return apps.filter(app => allowed.has(String(app.status || '').toUpperCase()));
  }, []);

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
        const jobsRes = await fetch(`${API_BASE_URL}/jobs?limit=100`, {
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
          `${API_BASE_URL}/jobs/${jobId}/aptitude-test`,
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
          `${API_BASE_URL}/jobs/${jobId}/coding-test`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          }
        );
        if (codingRes.ok) {
          const codingData = await codingRes.json();
          setCodingTest(codingData.data || codingData);
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
          `${API_BASE_URL}/jobs/${jobId}/interviews`,
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
          `${API_BASE_URL}/jobs/${jobId}/applicants`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          }
        );
        if (applicationsRes.ok) {
          const applicationsData = await applicationsRes.json();
          const allApplications = applicationsData.data?.applications || [];
          
          setAllApplications(allApplications);
        } else {
          setAllApplications([]);
        }
      } catch (err) {
        console.error('Error fetching applications:', err);
        setAllApplications([]);
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
    const apps = allApplications || [];
    setAptitudeEligibleApplications(filterApplicationsByEligibility(apps, eligibilityFilters.aptitude));
    setCodingEligibleApplications(filterApplicationsByEligibility(apps, eligibilityFilters.coding));
    setGdEligibleApplications(filterApplicationsByEligibility(apps, eligibilityFilters.gd));
    setShortlistedApplications(filterApplicationsByEligibility(apps, eligibilityFilters.interview));
  }, [allApplications, eligibilityFilters, filterApplicationsByEligibility]);

  const eligibilityLabelMap = useMemo(
    () =>
      ELIGIBILITY_OPTIONS.reduce((acc, opt) => {
        acc[opt.value] = opt.label;
        return acc;
      }, {}),
    []
  );

  const eligibilityOptionsByStage = useMemo(() => {
    return {
      aptitude: ELIGIBILITY_OPTIONS.filter((o) => o.value !== 'APTITUDE_PASSED'),
      coding: ELIGIBILITY_OPTIONS.filter((o) => o.value !== 'CODING_PASSED'),
      gd: ELIGIBILITY_OPTIONS.filter((o) => o.value !== 'GD_PASSED'),
      interview: ELIGIBILITY_OPTIONS,
    };
  }, []);

  const eligibilityCountsByStage = useMemo(() => {
    const countFor = (apps, optionValue) => {
      const statuses = ELIGIBILITY_STATUS_MAP[optionValue];
      if (!statuses) return apps.length;
      const allowed = new Set(statuses);
      return apps.filter((app) => allowed.has(String(app.status || '').toUpperCase())).length;
    };
    const apps = allApplications || [];
    return {
      aptitude: ELIGIBILITY_OPTIONS.reduce((acc, opt) => {
        acc[opt.value] = countFor(apps, opt.value);
        return acc;
      }, {}),
      coding: ELIGIBILITY_OPTIONS.reduce((acc, opt) => {
        acc[opt.value] = countFor(apps, opt.value);
        return acc;
      }, {}),
      gd: ELIGIBILITY_OPTIONS.reduce((acc, opt) => {
        acc[opt.value] = countFor(apps, opt.value);
        return acc;
      }, {}),
      interview: ELIGIBILITY_OPTIONS.reduce((acc, opt) => {
        acc[opt.value] = countFor(apps, opt.value);
        return acc;
      }, {}),
    };
  }, [allApplications]);

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
    if (testToStart.type === 'coding' && !proceededStages.coding) {
      alert('Please click "Proceed with selected list" for coding round first.');
      return;
    }
    if (testToStart.type !== 'coding' && !proceededStages.aptitude) {
      alert('Please click "Proceed with selected list" for aptitude round first.');
      return;
    }
    setStartLoading(true);
    try {
      const token = localStorage.getItem('token');
      const endpoint =
        testToStart.type === 'coding'
          ? `${API_BASE_URL}/jobs/${jobId}/coding-test/start`
          : `${API_BASE_URL}/jobs/${jobId}/aptitude-test/start`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eligibilityFilter:
            testToStart.type === 'coding'
              ? eligibilityFilters.coding
              : eligibilityFilters.aptitude,
        }),
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
          `Test started${testToStart.type !== 'coding' ? ` — ${d.notified || 0} shortlisted students notified` : ''}`
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
          ? `${API_BASE_URL}/jobs/${jobId}/coding-test/stop`
          : `${API_BASE_URL}/jobs/${jobId}/aptitude-test/stop`;

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

  // Redirect if not authenticated as company
  if (!user || user.userType !== 'company') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="spinner w-10 h-10 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Redirecting to login…</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="spinner w-10 h-10 mx-auto mb-4" />
            <p className="text-slate-500">Loading recruitment process…</p>
            <p className="text-xs text-slate-400 mt-1">Job #{jobId}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="page-header">
          <div>
            <button
              onClick={() => navigate('/company/dashboard')}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </button>
            <h1 className="page-title">Recruitment Pipeline</h1>
            {job && <p className="page-subtitle">{job.title} · {job.location || 'Remote'}</p>}
          </div>
          {jobId && (
            <button
              onClick={() => setShowApplicationsList(true)}
              className="btn-primary"
            >
              <Users className="w-4 h-4" />
              Applications &amp; Results
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="card p-0 overflow-hidden">
          <div className="flex border-b border-slate-200">
            {[
              { id: 'aptitude',  label: 'Aptitude Test',   icon: ClipboardList },
              { id: 'coding',    label: 'Coding Test',     icon: Code          },
              { id: 'gd',        label: 'Group Discussion', icon: Users         },
              { id: 'interview', label: 'Interview',       icon: Video         },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="p-6">
            {activeTab === 'aptitude' ? (
              <AptitudeTestContent
                test={aptitudeTest}
                applications={aptitudeEligibleApplications}
                eligibilityFilter={eligibilityFilters.aptitude}
                eligibilityOptions={eligibilityOptionsByStage.aptitude}
                disabledOptionValues={eligibilityOptionsByStage.aptitude
                  .filter((o) => (eligibilityCountsByStage.aptitude?.[o.value] || 0) === 0)
                  .map((o) => o.value)}
                proceeded={proceededStages.aptitude}
                onProceed={() => setProceededStages(prev => ({ ...prev, aptitude: true }))}
                onEligibilityChange={(value) => {
                  setEligibilityFilters(prev => ({ ...prev, aptitude: value }));
                  setProceededStages(prev => ({ ...prev, aptitude: false }));
                }}
                onCreate={() => setIsCreateAptitudeOpen(true)}
                onEdit={() => setIsEditAptitudeOpen(true)}
                onStart={() => { setTestToStart({ type: 'aptitude' }); setIsStartConfirmOpen(true); }}
                onStop={() => { setTestToStart({ type: 'aptitude' }); setIsStopConfirmOpen(true); }}
                onView={() => setIsViewTestOpen(true)}
              />
            ) : activeTab === 'coding' ? (
              <CodingTestContent
                test={codingTest}
                applications={codingEligibleApplications}
                eligibilityFilter={eligibilityFilters.coding}
                eligibilityOptions={eligibilityOptionsByStage.coding}
                disabledOptionValues={eligibilityOptionsByStage.coding
                  .filter((o) => (eligibilityCountsByStage.coding?.[o.value] || 0) === 0)
                  .map((o) => o.value)}
                proceeded={proceededStages.coding}
                onProceed={() => setProceededStages(prev => ({ ...prev, coding: true }))}
                onEligibilityChange={(value) => {
                  setEligibilityFilters(prev => ({ ...prev, coding: value }));
                  setProceededStages(prev => ({ ...prev, coding: false }));
                }}
                onCreate={() => setIsCreateCodingOpen(true)}
                onEdit={() => setIsEditCodingOpen(true)}
                onStart={() => { setTestToStart({ type: 'coding' }); setIsStartConfirmOpen(true); }}
                onStop={() => { setTestToStart({ type: 'coding' }); setIsStopConfirmOpen(true); }}
                onRestart={() => { setTestToStart({ type: 'coding' }); setIsStartConfirmOpen(true); }}
              />
            ) : activeTab === 'gd' ? (
              <div className="space-y-3">
                <EligibilitySelector
                  value={eligibilityFilters.gd}
                  options={eligibilityOptionsByStage.gd}
                  disabledOptionValues={eligibilityOptionsByStage.gd
                    .filter((o) => (eligibilityCountsByStage.gd?.[o.value] || 0) === 0)
                    .map((o) => o.value)}
                  onChange={(value) => {
                    setEligibilityFilters(prev => ({ ...prev, gd: value }));
                    setProceededStages(prev => ({ ...prev, gd: false }));
                  }}
                  label="GD Eligibility"
                />
                <ProceedBanner
                  count={gdEligibleApplications.length}
                  proceeded={proceededStages.gd}
                  onProceed={() => setProceededStages(prev => ({ ...prev, gd: true }))}
                />
                <CompanyGDManager
                  jobId={jobId}
                  initialGd={job?.groupDiscussion}
                  applications={gdEligibleApplications}
                  token={localStorage.getItem('token')}
                />
              </div>
            ) : (
              <InterviewContent
                interviews={interviews}
                applications={shortlistedApplications}
                eligibilityFilter={eligibilityFilters.interview}
                eligibilityOptions={eligibilityOptionsByStage.interview}
                disabledOptionValues={eligibilityOptionsByStage.interview
                  .filter((o) => (eligibilityCountsByStage.interview?.[o.value] || 0) === 0)
                  .map((o) => o.value)}
                proceeded={proceededStages.interview}
                onProceed={() => setProceededStages(prev => ({ ...prev, interview: true }))}
                onEligibilityChange={(value) => {
                  setEligibilityFilters(prev => ({ ...prev, interview: value }));
                  setProceededStages(prev => ({ ...prev, interview: false }));
                }}
                job={job}
                jobId={jobId}
                onStartInterview={(application) => { setSelectedApplication(application); setIsInterviewOpen(true); }}
                onRefresh={() => fetchJobAndTests(false)}
              />
            )}
          </div>
        </div>
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
      
      <CompanyCreateTest
        isOpen={isEditAptitudeOpen}
        onClose={() => setIsEditAptitudeOpen(false)}
        jobId={parseInt(jobId)}
        editingTest={true}
        onCreated={async () => {
          setIsEditAptitudeOpen(false);
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
          job?.status !== 'CLOSED'
            ? `You must close applications for this job before starting any tests.`
            : testToStart?.type === 'coding'
              ? `Starting the coding test will allow ${eligibilityLabelMap[eligibilityFilters.coding]?.toLowerCase() || 'eligible candidates'} to take the test. Continue?`
              : `Starting the test will allow ${eligibilityLabelMap[eligibilityFilters.aptitude]?.toLowerCase() || 'eligible candidates'} to take the test. Continue?`
        }
        type={job?.status !== 'CLOSED' ? "error" : "warning"}
        onClose={() => setIsStartConfirmOpen(false)}
        actions={
          job?.status !== 'CLOSED'
            ? [{ label: 'OK', onClick: () => setIsStartConfirmOpen(false) }]
            : [
                { label: 'Cancel', onClick: () => setIsStartConfirmOpen(false) },
                {
                  label: startLoading ? 'Starting...' : 'Start Test',
                  onClick: handleStartTest,
                  disabled:
                    (testToStart?.type === 'coding' && !proceededStages.coding) ||
                    (testToStart?.type !== 'coding' && !proceededStages.aptitude),
                  autoClose: false,
                },
              ]
        }
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

      {showApplicationsList && jobId && (
        <ApplicationsList
          jobId={parseInt(jobId)}
          initialJobStatus={job?.status}
          onClose={() => {
            setShowApplicationsList(false);
            fetchJobAndTests(false); // Refresh after closing modal to update job status
          }}
        />
      )}
    </DashboardLayout>
  );
};

// Reusable List Component
const EligibleStudentsList = ({ applications, title }) => (
  <div className="mt-8 border-t pt-6">
    <h4 className="text-lg font-semibold text-gray-800 mb-4">{title} ({applications?.length || 0})</h4>
    {applications && applications.length > 0 ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
         {applications.map(app => (
            <div key={app.id} className="border p-3 rounded-lg bg-white shadow-sm flex flex-col justify-center">
              <p className="font-semibold text-gray-800">{app.student?.name}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500 truncate mr-2">{app.student?.email}</span>
                <span className="text-xs font-semibold px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full">{app.status}</span>
              </div>
            </div>
         ))}
      </div>
    ) : (
      <p className="text-gray-500 text-sm bg-gray-50 p-4 rounded text-center">No eligible candidates available at this stage.</p>
    )}
  </div>
);

const EligibilitySelector = ({
  value,
  onChange,
  label = 'Eligibility',
  options = ELIGIBILITY_OPTIONS,
  disabledOptionValues = [],
}) => (
  <div className="flex items-center gap-3">
    <span className="text-sm font-medium text-slate-700">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
    >
      {options.map((opt) => (
        <option
          key={opt.value}
          value={opt.value}
          disabled={disabledOptionValues.includes(opt.value)}
          className={disabledOptionValues.includes(opt.value) ? 'text-slate-300' : ''}
        >
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

const ProceedBanner = ({ count, proceeded, onProceed }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
    <p className="text-sm text-slate-700">
      Selected list: <span className="font-semibold">{count}</span> candidates
      {proceeded ? ' (proceeded)' : ''}
    </p>
    {!proceeded ? (
      <button
        type="button"
        onClick={onProceed}
        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
      >
        Proceed with selected list
      </button>
    ) : (
      <span className="text-xs text-green-700 font-medium">Ready to continue</span>
    )}
  </div>
);

// Aptitude Test Content Component
const AptitudeTestContent = ({
  test,
  applications,
  eligibilityFilter,
  eligibilityOptions,
  disabledOptionValues,
  proceeded,
  onProceed,
  onEligibilityChange,
  onCreate,
  onEdit,
  onStart,
  onStop,
  onView,
}) => {
  if (!test || !test.questions || test.questions.length === 0) {
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
        <div className="mt-6 flex justify-center">
          <EligibilitySelector
            value={eligibilityFilter}
            options={eligibilityOptions}
            disabledOptionValues={disabledOptionValues}
            onChange={onEligibilityChange}
            label="Aptitude Eligibility"
          />
        </div>
        <div className="mt-4">
          <ProceedBanner count={applications?.length || 0} proceeded={proceeded} onProceed={onProceed} />
        </div>
        <EligibleStudentsList applications={applications} title="Eligible" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EligibilitySelector
        value={eligibilityFilter}
        options={eligibilityOptions}
        disabledOptionValues={disabledOptionValues}
        onChange={onEligibilityChange}
        label="Aptitude Eligibility"
      />
      <ProceedBanner count={applications?.length || 0} proceeded={proceeded} onProceed={onProceed} />
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
      </div>      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-4 border-t">
        {test.status === 'CREATED' && (
          <>
            <button
              onClick={onStart}
              disabled={!proceeded}
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
              onClick={onStart}
              disabled={!proceeded}
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
        {test.status !== 'STOPPED' && test.status !== 'STARTED' && (
          <button
            onClick={onView}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Eye className="w-4 h-4" />
            View Test
          </button>
        )}
        {(test.status === 'CREATED' || test.status === 'CLOSED' || test.status === 'STOPPED') && (
          <button
            onClick={() => {
              if(window.confirm('Are you sure you want to recreate this test? This will permanently delete the current test and all its questions.')) {
                onCreate();
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            title="Delete this test and start over"
          >
            <Edit className="w-4 h-4" />
            Recreate Test
          </button>
        )}
      </div>

      <EligibleStudentsList applications={applications} title="Eligible" />
    </div>
  );
};

// Coding Test Content Component
const CodingTestContent = ({
  test,
  applications,
  eligibilityFilter,
  eligibilityOptions,
  disabledOptionValues,
  proceeded,
  onProceed,
  onEligibilityChange,
  onCreate,
  onEdit,
  onStart,
  onStop,
  onRestart,
}) => {
  if (!test || !test.questions || test.questions.length === 0) {
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
        <div className="mt-6 flex justify-center">
          <EligibilitySelector
            value={eligibilityFilter}
            options={eligibilityOptions}
            disabledOptionValues={disabledOptionValues}
            onChange={onEligibilityChange}
            label="Coding Eligibility"
          />
        </div>
        <div className="mt-4">
          <ProceedBanner count={applications?.length || 0} proceeded={proceeded} onProceed={onProceed} />
        </div>
        <EligibleStudentsList applications={applications} title="Eligible" />
      </div>
    );
  }

  const allowedLanguages = Array.isArray(test.allowedLanguages)
    ? test.allowedLanguages
    : test.allowedLanguages
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
      <EligibilitySelector
        value={eligibilityFilter}
        options={eligibilityOptions}
        disabledOptionValues={disabledOptionValues}
        onChange={onEligibilityChange}
        label="Coding Eligibility"
      />
      <ProceedBanner count={applications?.length || 0} proceeded={proceeded} onProceed={onProceed} />
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
              disabled={!proceeded}
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
              disabled={!proceeded}
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

      <EligibleStudentsList applications={applications} title="Eligible" />
    </div>
  );
};

// Interview Content Component
const InterviewContent = ({
  interviews,
  applications,
  eligibilityFilter,
  eligibilityOptions,
  disabledOptionValues,
  proceeded,
  onProceed,
  onEligibilityChange,
  job,
  jobId,
  onStartInterview,
  onRefresh,
}) => {
  return (
    <div className="space-y-6">
      <EligibilitySelector
        value={eligibilityFilter}
        options={eligibilityOptions}
        disabledOptionValues={disabledOptionValues}
        onChange={onEligibilityChange}
        label="Interview Eligibility"
      />
      <ProceedBanner count={applications?.length || 0} proceeded={proceeded} onProceed={onProceed} />
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            Interview Management
          </h3>
          <p className="text-sm text-gray-600">
            Conduct AI-powered interviews and review candidate Q&A with Gemini evaluation
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
                      disabled={!proceeded}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Video className="w-4 h-4" />
                      {existingInterview ? 'View Q&A / Evaluate' : 'Start Interview'}
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
                <div className="flex items-center justify-between gap-4">
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
                  {interview.application && (
                    <button
                      onClick={() => onStartInterview(interview.application)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
                    >
                      <Video className="w-4 h-4" />
                      View Q&A / Evaluate
                    </button>
                  )}
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
