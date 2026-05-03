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
  FastForward,
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

/** Fixed cohort per pipeline stage (order: aptitude → coding → gd → interview). */
const PIPELINE_STAGE_COHORT = {
  aptitude: 'SHORTLISTED_ONLY',
  coding: 'APTITUDE_PASSED',
  gd: 'CODING_PASSED',
  interview: 'GD_PASSED',
};

const ELIGIBILITY_STATUS_MAP = {
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
  const [allApplications, setAllApplications] = useState([]);
  const [aptitudeEligibleApplications, setAptitudeEligibleApplications] = useState([]);
  const [codingEligibleApplications, setCodingEligibleApplications] = useState([]);
  const [gdEligibleApplications, setGdEligibleApplications] = useState([]);
  const [shortlistedApplications, setShortlistedApplications] = useState([]);
  const [markInterviewCompleteLoading, setMarkInterviewCompleteLoading] = useState(false);
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
  const [isSkipConfirmOpen, setIsSkipConfirmOpen] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [stageToSkip, setStageToSkip] = useState(null); // 'aptitude', 'coding', 'gd'

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
    setAptitudeEligibleApplications(
      filterApplicationsByEligibility(apps, PIPELINE_STAGE_COHORT.aptitude)
    );
    setCodingEligibleApplications(
      filterApplicationsByEligibility(apps, PIPELINE_STAGE_COHORT.coding)
    );
    setGdEligibleApplications(filterApplicationsByEligibility(apps, PIPELINE_STAGE_COHORT.gd));
    setShortlistedApplications(
      filterApplicationsByEligibility(apps, PIPELINE_STAGE_COHORT.interview)
    );
  }, [allApplications, filterApplicationsByEligibility]);

  const pipeline = useMemo(
    () => ({
      aptitudeDone: !!(job?.pipelineAptitudeDone || aptitudeTest?.status === 'CLOSED'),
      codingDone: !!(job?.pipelineCodingDone || codingTest?.status === 'STOPPED'),
      gdDone: !!(job?.pipelineGdDone || job?.groupDiscussion?.status === 'COMPLETED'),
      interviewDone: !!job?.pipelineInterviewDone,
    }),
    [job, aptitudeTest, codingTest]
  );

  const tabAccessible = useMemo(
    () => ({
      aptitude: true,
      coding: pipeline.aptitudeDone,
      gd: pipeline.codingDone,
      interview: pipeline.gdDone,
    }),
    [pipeline]
  );

  useEffect(() => {
    if (activeTab === 'coding' && !tabAccessible.coding) setActiveTab('aptitude');
    if (activeTab === 'gd' && !tabAccessible.gd) {
      setActiveTab(tabAccessible.coding ? 'coding' : 'aptitude');
    }
    if (activeTab === 'interview' && !tabAccessible.interview) {
      if (tabAccessible.gd) setActiveTab('gd');
      else if (tabAccessible.coding) setActiveTab('coding');
      else setActiveTab('aptitude');
    }
  }, [activeTab, tabAccessible]);

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
          ? `${API_BASE_URL}/jobs/${jobId}/coding-test/start`
          : `${API_BASE_URL}/jobs/${jobId}/aptitude-test/start`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
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

  const handleSkipStage = async () => {
    if (!stageToSkip) return;
    setSkipLoading(true);
    try {
      const token = localStorage.getItem('token');
      const endpoint = `${API_BASE_URL}/jobs/${jobId}/skip-stage`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stage: stageToSkip }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.message || 'Failed to skip stage');
      } else {
        alert(d.message);
        setIsSkipConfirmOpen(false);
        setStageToSkip(null);
        await fetchJobAndTests(false);
      }
    } catch (err) {
      console.error('Failed to skip stage:', err);
      alert('Failed to skip stage');
    } finally {
      setSkipLoading(false);
    }
  };

  const handleMarkInterviewPhaseComplete = async () => {
    setMarkInterviewCompleteLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/recruitment/mark-interview-complete`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.message || 'Could not mark interview phase complete');
      } else {
        alert(d.message || 'Interview phase marked complete.');
        await fetchJobAndTests(false);
      }
    } catch (e) {
      console.error(e);
      alert('Could not mark interview phase complete');
    } finally {
      setMarkInterviewCompleteLoading(false);
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
          <p className="px-6 pt-4 text-xs text-slate-500">
            Pipeline runs in order: aptitude → coding → GD → interview. Finish or skip each stage before the next unlocks.
          </p>
          <div className="flex border-b border-slate-200">
            {[
              { id: 'aptitude', label: 'Aptitude Test', icon: ClipboardList },
              { id: 'coding', label: 'Coding Test', icon: Code },
              { id: 'gd', label: 'Group Discussion', icon: Users },
              { id: 'interview', label: 'Interview', icon: Video },
            ].map((tab) => {
              const locked = !tabAccessible[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={
                    locked
                      ? 'Complete or skip the previous round to open this stage'
                      : undefined
                  }
                  onClick={() => {
                    if (locked) {
                      alert('Complete or skip the previous round before opening this stage.');
                      return;
                    }
                    setActiveTab(tab.id);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  } ${locked ? 'opacity-45 cursor-not-allowed' : ''}`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="p-6">
            {activeTab === 'aptitude' ? (
              <AptitudeTestContent
                test={aptitudeTest}
                applications={aptitudeEligibleApplications}
                roundComplete={pipeline.aptitudeDone}
                applicationsClosed={job?.status === 'CLOSED'}
                onCreate={() => setIsCreateAptitudeOpen(true)}
                onEdit={() => setIsEditAptitudeOpen(true)}
                onStart={() => {
                  setTestToStart({ type: 'aptitude' });
                  setIsStartConfirmOpen(true);
                }}
                onStop={() => {
                  setTestToStart({ type: 'aptitude' });
                  setIsStopConfirmOpen(true);
                }}
                onView={() => setIsViewTestOpen(true)}
                onSkip={
                  pipeline.aptitudeDone
                    ? undefined
                    : () => {
                        setStageToSkip('aptitude');
                        setIsSkipConfirmOpen(true);
                      }
                }
              />
            ) : activeTab === 'coding' ? (
              <CodingTestContent
                test={codingTest}
                jobId={jobId}
                applications={codingEligibleApplications}
                roundComplete={pipeline.codingDone}
                applicationsClosed={job?.status === 'CLOSED'}
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
                onSkip={
                  pipeline.codingDone
                    ? undefined
                    : () => {
                        setStageToSkip('coding');
                        setIsSkipConfirmOpen(true);
                      }
                }
              />
            ) : activeTab === 'gd' ? (
              <GDContent
                job={job}
                jobId={jobId}
                applications={gdEligibleApplications}
                onSkip={
                  pipeline.gdDone
                    ? undefined
                    : () => {
                        setStageToSkip('gd');
                        setIsSkipConfirmOpen(true);
                      }
                }
              />
            ) : (
              <InterviewContent
                interviews={interviews}
                applications={shortlistedApplications}
                roundComplete={pipeline.interviewDone}
                onSkip={
                  pipeline.interviewDone
                    ? undefined
                    : () => {
                        setStageToSkip('interview');
                        setIsSkipConfirmOpen(true);
                      }
                }
                onMarkInterviewPhaseComplete={
                  pipeline.interviewDone ? undefined : handleMarkInterviewPhaseComplete
                }
                markInterviewPhaseCompleteLoading={markInterviewCompleteLoading}
                onStartInterview={(application) => {
                  setSelectedApplication(application);
                  setIsInterviewOpen(true);
                }}
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
              ? `Applicants who cleared the aptitude round will be invited to take this coding test. Continue?`
              : `Shortlisted applicants will be invited to take this aptitude test. Continue?`
        }
        type={job?.status !== 'CLOSED' ? 'error' : 'warning'}
        onClose={() => setIsStartConfirmOpen(false)}
        actions={
          job?.status !== 'CLOSED'
            ? [{ label: 'OK', onClick: () => setIsStartConfirmOpen(false) }]
            : [
                { label: 'Cancel', onClick: () => setIsStartConfirmOpen(false) },
                {
                  label: startLoading ? 'Starting...' : 'Start Test',
                  onClick: handleStartTest,
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

      <Modal
        open={isSkipConfirmOpen}
        title={`Skip ${stageToSkip === 'aptitude' ? 'Aptitude Test' : stageToSkip === 'coding' ? 'Coding Test' : stageToSkip === 'gd' ? 'Group Discussion' : 'Interview'}`}
        message={
          stageToSkip === 'interview'
            ? 'This permanently marks all GD-passed candidates as selected for this job and completes the interview round. Continue?'
            : 'Eligible candidates at this pipeline stage will be marked as passed and advanced. You cannot undo this bulk action. Continue?'
        }
        type="warning"
        onClose={() => setIsSkipConfirmOpen(false)}
        actions={[
          { label: 'Cancel', onClick: () => setIsSkipConfirmOpen(false) },
          {
            label: skipLoading ? 'Skipping...' : 'Skip Round',
            onClick: handleSkipStage,
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

// Aptitude Test Content Component
const AptitudeTestContent = ({
  test,
  applications,
  roundComplete,
  applicationsClosed,
  onCreate,
  onEdit,
  onStart,
  onStop,
  onView,
  onSkip,
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
        {onSkip && (
          <button
            onClick={onSkip}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors ml-3"
          >
            <FastForward className="w-5 h-5" />
            Skip Round
          </button>
        )}
        {roundComplete && (
          <p className="mt-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-4 py-2 inline-block">
            This stage is complete. Continue in the Coding tab.
          </p>
        )}
        <div className="mt-8 text-sm text-slate-600 border-t pt-6 max-w-xl mx-auto">
          Candidates: <strong>shortlisted</strong> applicants only.
        </div>
        <EligibleStudentsList applications={applications} title="Cohort at this stage" />
      </div>
    );
  }

  const startBlocked = roundComplete || !applicationsClosed || test.status === 'STARTED';
  const restartBlocked = roundComplete || !applicationsClosed;

  return (
    <div className="space-y-6">
      {roundComplete && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Aptitude stage is closed. Coding is available when you open that tab (after this round was finished or skipped).
        </div>
      )}
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
      <p className="text-xs text-slate-500 pt-2">
        Cohort: <strong>shortlisted</strong> applicants (fixed by pipeline).
      </p>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-4 border-t">
        {test.status === 'CREATED' && (
          <>
            <button
              type="button"
              onClick={onStart}
              disabled={startBlocked}
              title={
                roundComplete
                  ? 'Round already complete'
                  : !applicationsClosed
                    ? 'Close job applications first'
                    : ''
              }
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Start Test
            </button>
            <button
              type="button"
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
            type="button"
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
              type="button"
              onClick={onStart}
              disabled={restartBlocked}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Restart Test
            </button>
            <button
              type="button"
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
            type="button"
            onClick={onView}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Eye className="w-4 h-4" />
            View Test
          </button>
        )}
        {(test.status === 'CREATED' || test.status === 'CLOSED' || test.status === 'STOPPED') && (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Are you sure you want to recreate this test? This will permanently delete the current test and all its questions.'
                )
              ) {
                onCreate();
              }
            }}
            disabled={test.status === 'STARTED'}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            title="Delete this test and start over"
          >
            <Edit className="w-4 h-4" />
            Recreate Test
          </button>
        )}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors ml-auto"
          >
            <FastForward className="w-4 h-4" />
            Skip Round
          </button>
        )}
      </div>

      <EligibleStudentsList applications={applications} title="Cohort at this stage" />
    </div>
  );
};

// Coding Test Content Component
const CodingTestContent = ({
  test,
  jobId,
  applications,
  roundComplete,
  applicationsClosed,
  onCreate,
  onEdit,
  onStart,
  onStop,
  onRestart,
  onSkip,
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
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Coding Test
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors ml-3"
          >
            <FastForward className="w-5 h-5" />
            Skip Round
          </button>
        )}
        {roundComplete && (
          <p className="mt-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded px-4 py-2 inline-block">
            This stage is complete. Continue in Group Discussion.
          </p>
        )}
        <div className="mt-8 text-sm text-slate-600 border-t pt-6 max-w-xl mx-auto">
          Candidates: <strong>cleared aptitude</strong> (fixed cohort).
        </div>
        <EligibleStudentsList applications={applications} title="Cohort at this stage" />
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

  const startBlocked = roundComplete || !applicationsClosed || test.status === 'STARTED';
  const restartBlocked = roundComplete || !applicationsClosed;

  return (
    <div className="space-y-6">
      {roundComplete && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Coding evaluation is closed. Group Discussion unlocks once this stage is finished or skipped.
        </div>
      )}
      <p className="text-xs text-slate-500">
        Cohort: <strong>aptitude‑passed</strong> applicants only (pipeline order).
      </p>

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
              type="button"
              onClick={onStart}
              disabled={startBlocked}
              title={
                roundComplete
                  ? 'Round already complete'
                  : !applicationsClosed
                    ? 'Close job applications first'
                    : ''
              }
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Start Test
            </button>
            <button
              type="button"
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
            type="button"
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
              type="button"
              onClick={onRestart}
              disabled={restartBlocked}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Restart Test
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit Test
            </button>
          </>
        )}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors ml-auto"
          >
            <FastForward className="w-4 h-4" />
            Skip Round
          </button>
        )}
      </div>

      <EligibleStudentsList applications={applications} title="Cohort at this stage" />
      <CodingSubmissionsSection jobId={jobId} applications={applications} />
    </div>
  );
};

const CodingSubmissionsSection = ({ jobId, applications }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [byApp, setByApp] = useState({});

  const fetchSubmissions = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test/submissions/recruiter`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load coding submissions');
      }
      setByApp(json.data?.byApplicationId || {});
    } catch (err) {
      setError(err.message || 'Failed to load coding submissions');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const rows = (applications || [])
    .map((app) => ({
      app,
      info: byApp[app.id],
    }))
    .filter((x) => x.info?.submissions?.length > 0);

  return (
    <div className="mt-8 border-t pt-6">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-lg font-semibold text-gray-800">Coding Test Submissions</h4>
        <button
          type="button"
          onClick={fetchSubmissions}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</p>
      ) : loading && rows.length === 0 ? (
        <p className="text-sm text-gray-500">Loading coding submissions...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded text-center">
          No coding submissions available yet.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ app, info }) => {
            const submissions = info.submissions || [];
            const latest = submissions[0];
            return (
              <div key={app.id} className="border rounded-lg p-4 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">{app.student?.name || info.studentName || 'Candidate'}</p>
                    <p className="text-xs text-gray-500">
                      Total attempts: {submissions.length}
                      {latest?.createdAt ? ` • Last: ${new Date(latest.createdAt).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
                    {app.status}
                  </span>
                </div>

                {latest && (
                  <div className="mt-3 text-sm text-gray-700">
                    <p>
                      Latest submission: <strong>{latest.status || 'N/A'}</strong>
                      {latest.score != null ? ` • Score ${Number(latest.score).toFixed(1)}` : ''}
                      {latest.languageId != null ? ` • Lang ${latest.languageId}` : ''}
                    </p>
                    {latest.testCaseResults?.length ? (
                      <p className="text-xs text-gray-500 mt-1">
                        Test cases recorded: {latest.testCaseResults.length}
                      </p>
                    ) : null}
                  </div>
                )}
                {String(info?.decisionReason || '').toLowerCase().includes('policy violated') && (
                  <div className="mt-3 p-2 rounded border border-red-200 bg-red-50 text-red-800 text-xs">
                    <span className="font-semibold">Policy violation:</span> {info.decisionReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const GDContent = ({ job, jobId, applications, onSkip }) => {
  return (
    <CompanyGDManager
      jobId={jobId}
      initialGd={job?.groupDiscussion}
      applications={applications}
      token={localStorage.getItem('token')}
      onSkip={onSkip}
      eligibleList={
        <EligibleStudentsList applications={applications} title="Cohort at this stage (coding‑passed)" />
      }
      pipelineNotice={
        <p className="text-xs text-slate-500">
          Invite list is fixed to candidates who cleared coding (minimum 3 to run a GD).
        </p>
      }
    />
  );
};

// Interview Content Component
const InterviewContent = ({
  interviews,
  applications,
  roundComplete,
  onSkip,
  onMarkInterviewPhaseComplete,
  markInterviewPhaseCompleteLoading,
  onStartInterview,
  onRefresh,
}) => {
  const hasInterviews = interviews && interviews.length > 0;

  const cohortHint = (
    <p className="text-xs text-slate-600 mb-4">
      Cohort is fixed to <strong>GD‑passed</strong> candidates.&nbsp;
      <strong>Skip round</strong> marks everyone in that cohort as selected.&nbsp;
      <strong>Mark interview phase complete</strong> closes the phase without changing application statuses.
    </p>
  );

  const actionRow = (
    <div className="flex flex-wrap gap-3 items-center justify-center md:justify-end mb-6">
      <button
        type="button"
        onClick={() => {
          document.getElementById('candidates-list-section')?.scrollIntoView({ behavior: 'smooth' });
        }}
        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
      >
        <Video className="w-4 h-4" />
        Go to candidates
      </button>
      {onMarkInterviewPhaseComplete && (
        <button
          type="button"
          onClick={onMarkInterviewPhaseComplete}
          disabled={!!markInterviewPhaseCompleteLoading || !!roundComplete}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          {markInterviewPhaseCompleteLoading ? 'Saving…' : 'Mark interview phase complete'}
        </button>
      )}
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          disabled={!!roundComplete}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          <FastForward className="w-4 h-4" />
          Skip Round
        </button>
      )}
    </div>
  );

  const candidatesList = (
    <div id="candidates-list-section" className="mt-8 border-t pt-6 text-left">
      <h4 className="text-lg font-semibold text-gray-800 mb-4">
        Cohort at this stage
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
                    type="button"
                    onClick={() => onStartInterview(application)}
                    disabled={!!roundComplete}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
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
        <p className="text-gray-500 text-sm bg-gray-50 p-4 rounded text-center">
          No eligible candidates available at this stage.
        </p>
      )}
    </div>
  );

  if (!hasInterviews) {
    return (
      <div className="py-12 text-center">
        {roundComplete ? (
          <div className="mb-8 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-900 text-sm max-w-xl mx-auto">
            Interview phase is marked complete for this job.
          </div>
        ) : null}
        <Video className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Interview</h3>
        <p className="text-gray-600 mb-4">
          Conduct AI-powered interviews when ready, or skip / mark phase complete below.
        </p>
        {cohortHint}
        {actionRow}
        {candidatesList}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {roundComplete ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-900 text-sm">
          Interview phase is complete. Actions below may be unavailable.
        </div>
      ) : null}
      {cohortHint}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Interview management</h3>
          <p className="text-sm text-gray-600">
            Review sessions and Gemini evaluations here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Refresh
          </button>
          {onMarkInterviewPhaseComplete && (
            <button
              type="button"
              onClick={onMarkInterviewPhaseComplete}
              disabled={!!markInterviewPhaseCompleteLoading || !!roundComplete}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              {markInterviewPhaseCompleteLoading ? 'Saving…' : 'Mark phase complete'}
            </button>
          )}
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={!!roundComplete}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <FastForward className="w-4 h-4" />
              Skip round
            </button>
          )}
        </div>
      </div>

      {/* Shortlisted Applications */}
      {candidatesList}

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
                      type="button"
                      onClick={() => onStartInterview(interview.application)}
                      disabled={!!roundComplete}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
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
