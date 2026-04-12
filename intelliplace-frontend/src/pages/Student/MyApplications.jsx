import { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import { API_BASE_URL } from '../../config.js';
import CvPreviewModal from '../../components/CvPreviewModal';
import Modal from '../../components/Modal';
import StudentTakeTest from '../../components/StudentTakeTest';
import StudentTakeCodingTest from '../../components/StudentTakeCodingTest';
import StudentInterview from '../../components/StudentInterview';
import StudentGroupDiscussion from '../../components/StudentGroupDiscussion';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../../utils/auth';
import { Play, Code, RefreshCw, Video, Users } from 'lucide-react';

/** Statuses where aptitude/coding/interview actions apply. Must include CODING_PASSED (set by backend after coding test). */
const ELIGIBLE_STATUSES = [
  'SHORTLISTED',
  'APP PASS',
  'PASSED APTITUDE',
  'APTITUDE_PASSED',
  'CODE PASS',
  'PASSED CODING',
  'CODE_PASSED',
  'CODING_PASSED',
];

/** After coding test — company may start an interview; show Join even if prefetch failed. */
const CAN_JOIN_INTERVIEW_STATUS = ['CODING_PASSED'];

const getStatusBadgeClasses = (status) => {
  const s = status ? status.toUpperCase() : 'UNKNOWN';
  switch (s) {
    case 'PENDING': return 'bg-yellow-100 text-yellow-800 border border-yellow-200 bg-opacity-70';
    case 'REVIEWING': return 'bg-blue-100 text-blue-800 border border-blue-200';
    case 'SHORTLISTED': return 'bg-green-100 text-green-800 border border-green-200';
    case 'APP PASS':
    case 'PASSED APTITUDE':
    case 'APTITUDE_PASSED': return 'bg-green-100 text-green-800 border border-green-200';
    case 'APP FAIL':
    case 'FAILED APTITUDE':
    case 'APTITUDE_FAILED': return 'bg-red-50 text-red-600 border border-red-200';
    case 'CODE PASS':
    case 'PASSED CODING':
    case 'CODING_PASSED': return 'bg-green-100 text-green-800 border border-green-200';
    case 'CODE FAIL':
    case 'FAILED CODING':
    case 'CODING_FAILED': return 'bg-red-100 text-red-700 border border-red-300';
    case 'INTERVIEW FAIL':
    case 'FAILED INTERVIEW': return 'bg-red-100 text-red-800 border border-red-400';
    case 'SELECTED': 
    case 'HIRED': 
    case 'OFFERED': return 'bg-green-100 text-green-800 border border-green-200';
    case 'REJECTED': return 'bg-red-100 text-red-800 border border-red-400';
    default: return 'bg-gray-100 text-gray-800 border border-gray-200';
  }
};

const MyApplications = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [isCodingTestOpen, setIsCodingTestOpen] = useState(false);
  const [isGDOpen, setIsGDOpen] = useState(false);
  const [isInterviewOpen, setIsInterviewOpen] = useState(false);
  const [testJobId, setTestJobId] = useState(null);
  const [interviewData, setInterviewData] = useState(null); // { jobId, applicationId, question, questionIndex }
  const [testStatuses, setTestStatuses] = useState({}); // jobId -> test status
  const [codingTestStatuses, setCodingTestStatuses] = useState({}); // jobId -> coding test status
  /** applicationId -> student-session API payload (interview started by company) */
  const [interviewSessionsByAppId, setInterviewSessionsByAppId] = useState({});

  // Fetch applications and test statuses
  const fetchApplications = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/jobs/my-applications`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const json = await res.json();
        if (res.ok) {
          const apps = json.data.applications || [];
          setApplications(apps);
          
          // Fetch test status for each job that has eligible applications
          const shortlistedJobs = apps
            .filter(app => ELIGIBLE_STATUSES.includes(app.status?.toUpperCase()))
            .map(app => app.jobId);
          
          const testStatusMap = {};
          const codingTestStatusMap = {};
          for (const jobId of shortlistedJobs) {
            try {
              // Fetch aptitude test status
              const testRes = await fetch(`${API_BASE_URL}/jobs/${jobId}/aptitude-test/status`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
              });
              if (testRes.ok) {
                const testJson = await testRes.json();
                if (testJson.data?.test?.status) {
                  testStatusMap[jobId] = testJson.data.test.status;
                }
              }
              
              // Fetch coding test status - use simpler status endpoint
              try {
                const codingTestRes = await fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test/status`, {
                  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                if (codingTestRes.ok) {
                  const codingTestJson = await codingTestRes.json();
                  if (codingTestJson.data?.exists && codingTestJson.data?.status) {
                    codingTestStatusMap[jobId] = codingTestJson.data.status;
                    console.log(`Coding test for job ${jobId}: status = ${codingTestJson.data.status}, available = ${codingTestJson.data.available}`);
                  }
                }
              } catch (codingErr) {
                // Test might not exist, which is fine
                console.log(`Coding test status check for job ${jobId}:`, codingErr.message);
              }
            } catch (err) {
              console.error(`Error fetching test status for job ${jobId}:`, err);
            }
          }
          setTestStatuses(testStatusMap);
          setCodingTestStatuses(codingTestStatusMap);
          
          // Debug logging
          console.log('Test statuses:', testStatusMap);
          console.log('Coding test statuses:', codingTestStatusMap);
          
          // Prefetch interview sessions (per application) so we know when one is active
          const interviewByApp = {};
          for (const app of apps.filter((a) => ELIGIBLE_STATUSES.includes(a.status?.toUpperCase()))) {
            try {
              const interviewRes = await fetch(
                `${API_BASE_URL}/jobs/${app.jobId}/interviews/${app.id}/student-session`,
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
              );
              if (interviewRes.ok) {
                const interviewJson = await interviewRes.json();
                if (interviewJson.data?.session) {
                  interviewByApp[app.id] = interviewJson.data;
                }
              }
            } catch (err) {
              // Interview might not exist yet
            }
          }
          setInterviewSessionsByAppId(interviewByApp);
        }
      } catch (err) {
        console.error(err);
      } finally { setLoading(false); }
  };
  
  const handleStartInterview = async (jobId, applicationId) => {
    try {
      // Fetch latest interview session
      const res = await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/student-session`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      if (res.ok) {
        const data = await res.json();
        if (data.data?.session) {
          setInterviewData({
            jobId,
            applicationId,
            question: null, // Will show start screen first
            questionIndex: -1,
            session: data.data.session,
            candidateDisplayName:
              data.data.candidateDisplayName ?? getCurrentUser()?.name ?? '',
          });
          setIsInterviewOpen(true);
          setNotice(null);
        } else {
          setNotice({
            type: 'error',
            text: 'No active interview session yet. The company will start the interview first — try again after you are notified.',
          });
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setNotice({
          type: 'error',
          text: errJson.message || 'No interview session available. Ask the company to start the interview or try again later.',
        });
      }
    } catch (err) {
      console.error('Error fetching interview session:', err);
      setNotice({ type: 'error', text: 'Could not load the interview. Check your connection and try again.' });
    }
  };

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.userType !== 'student') {
      navigate('/student/login');
      return;
    }

    fetchApplications();
    
    // Auto-refresh every 30 seconds to check for new tests
    const refreshInterval = setInterval(() => {
      fetchApplications();
    }, 30000);
    
    return () => clearInterval(refreshInterval);
  }, [navigate]);
  
  // Check if we need to open a coding test from notification
  useEffect(() => {
    const openCodingTestJobId = sessionStorage.getItem('openCodingTest');
    if (openCodingTestJobId && applications.length > 0) {
      // Clear the flag immediately
      sessionStorage.removeItem('openCodingTest');
      
      const jobId = parseInt(openCodingTestJobId, 10);
      
      // Check if student has an eligible application for this job
      const app = applications.find(
        (a) => Number(a.jobId) === jobId && ELIGIBLE_STATUSES.includes(a.status?.toUpperCase())
      );
      
      if (app) {
        // Check if coding test is available
        const checkAndOpen = async () => {
          try {
            const codingTestRes = await fetch(`${API_BASE_URL}/jobs/${jobId}/coding-test/status`, {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            
            if (codingTestRes.ok) {
              const codingTestJson = await codingTestRes.json();
              if (codingTestJson.data?.exists && codingTestJson.data?.status === 'STARTED' && codingTestJson.data?.available) {
                // Open the coding test modal
                setTestJobId(jobId);
                setIsCodingTestOpen(true);
              }
            }
          } catch (err) {
            console.error('Failed to check coding test availability:', err);
          }
        };
        
        // Small delay to ensure UI is ready
        setTimeout(checkAndOpen, 500);
      }
    }
  }, [applications]); // Run when applications are loaded or updated
  
  // Check if we need to open an interview from notification (deep link)
  useEffect(() => {
    const openInterviewData = sessionStorage.getItem('openInterview');
    if (!openInterviewData || applications.length === 0) return;

    let jobId;
    let applicationId;
    try {
      const parsed = JSON.parse(openInterviewData);
      jobId = parsed.jobId;
      applicationId = parsed.applicationId;
    } catch {
      sessionStorage.removeItem('openInterview');
      return;
    }

    // Match by IDs only — notification implies this application is theirs; status may be CODING_PASSED etc.
    const app = applications.find(
      (a) => Number(a.jobId) === Number(jobId) && Number(a.id) === Number(applicationId)
    );
    if (!app) return;

    sessionStorage.removeItem('openInterview');

    const checkAndOpen = async () => {
      try {
        const interviewRes = await fetch(
          `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/student-session`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        );

        if (interviewRes.ok) {
          const interviewJson = await interviewRes.json();
          if (interviewJson.data?.session) {
            setInterviewData({
              jobId,
              applicationId,
              question: null,
              questionIndex: -1,
              session: interviewJson.data.session,
              candidateDisplayName:
                interviewJson.data.candidateDisplayName ?? getCurrentUser()?.name ?? '',
            });
            setIsInterviewOpen(true);
          }
        }
      } catch (err) {
        console.error('Failed to open interview from notification:', err);
      }
    };

    setTimeout(checkAndOpen, 300);
  }, [applications]);
  
  // Manual refresh function (reuses the same logic)
  const handleRefresh = fetchApplications;

  const viewCV = async (cvUrl) => {
    if (!cvUrl) return;
    const parts = cvUrl.split('/');
    const filename = parts[parts.length - 1];

    try {
      const res = await fetch(`${API_BASE_URL}/jobs/cv/${filename}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) {
        const json = await res.json();
        setModal({ title: 'Failed to fetch CV', text: json.message || 'Failed to fetch CV', type: 'error' });
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      setPreview({ url, name: filename });
    } catch (err) {
      console.error('Error fetching CV', err);
      setModal({ title: 'Failed to open CV', text: 'Failed to open CV', type: 'error' });
    }
  };

  if (!user || user.userType !== 'student') return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">My Applications</h1>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh to check for new tests"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {notice && (
          <div className={`p-3 mb-4 rounded ${notice.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {notice.text}
            <button onClick={() => setNotice(null)} className="ml-4 underline text-sm">Dismiss</button>
          </div>
        )} 

        {loading ? (
          <div className="py-8 text-center">Loading...</div>
        ) : (
          <div className="space-y-4">
            {applications.length === 0 && (
              <div className="p-6 bg-white rounded-lg shadow border text-center text-gray-600">
                You haven't applied to any jobs yet.
              </div>
            )}

            {applications.map(app => (
              <div key={app.id} className="p-6 bg-white rounded-lg border shadow-sm">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{app.job?.title}</h2>
                    <p className="text-sm text-gray-600">{app.job?.company?.companyName}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Applied On: {new Date(app.createdAt).toLocaleString()}
                    </p>
                    {app.cgpa !== null && (
                      <p className="text-sm text-gray-500">Applied CGPA: {app.cgpa}</p>
                    )}
                  </div>

                  <div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${getStatusBadgeClasses(app.status)}`}>
                      {app.status}
                    </span>
                  </div>
                </div>

                {app.decisionReason && (
                  <div className="mt-2 text-sm italic text-gray-700">
                    <strong>Reason:</strong> {app.decisionReason}
                  </div>
                )}

                <div className="mt-4 flex gap-3 flex-wrap">
                  {app.cvUrl ? (
                    <button
                      onClick={() => viewCV(app.cvUrl)}
                      className="px-3 py-1 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                    >
                      View CV
                    </button>
                  ) : (
                    <span className="text-xs text-gray-500">No CV uploaded</span>
                  )}

                  <button
                    onClick={() => navigate(`/jobs/${app.jobId}`)}
                    className="px-3 py-1 border rounded-md text-sm hover:bg-gray-50"
                  >
                    Open Job
                  </button>

                  {['SHORTLISTED', 'APP PASS', 'PASSED APTITUDE', 'APTITUDE_PASSED'].includes(app.status?.toUpperCase()) && testStatuses[app.jobId] === 'STARTED' && (
                    <button
                      onClick={() => {
                        setTestJobId(app.jobId);
                        setIsTestOpen(true);
                      }}
                      className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                    >
                      <Play className="w-4 h-4" />
                      Start Aptitude Test
                    </button>
                  )}
                  
                  {['SHORTLISTED', 'APP PASS', 'PASSED APTITUDE', 'APTITUDE_PASSED', 'CODE PASS', 'PASSED CODING'].includes(app.status?.toUpperCase()) && codingTestStatuses[app.jobId] && (
                    <>
                      {codingTestStatuses[app.jobId] === 'STARTED' ? (
                        <button
                          onClick={() => {
                            setTestJobId(Number(app.jobId));
                            setIsCodingTestOpen(true);
                          }}
                          className="flex items-center gap-2 px-3 py-1 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700"
                        >
                          <Code className="w-4 h-4" />
                          Start Coding Test
                        </button>
                      ) : (
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-md text-sm">
                          Coding Test: {codingTestStatuses[app.jobId]}
                        </span>
                      )}
                    </>
                  )}
                  
                  {['CODE PASS', 'PASSED CODING', 'CODING_PASSED', 'GD_FAILED'].includes(app.status?.toUpperCase()) && (
                    <button
                      onClick={() => {
                        setTestJobId(Number(app.jobId));
                        setIsGDOpen(true);
                      }}
                      className="flex items-center gap-2 px-3 py-1 bg-orange-600 text-white rounded-md text-sm hover:bg-orange-700"
                    >
                      <Users className="w-4 h-4" />
                      Join Group Discussion
                    </button>
                  )}

                  {['GD_PASSED'].includes(app.status?.toUpperCase()) &&
                    (interviewSessionsByAppId[app.id] ||
                      CAN_JOIN_INTERVIEW_STATUS.includes(app.status?.toUpperCase())) && (
                    <button
                      type="button"
                      onClick={() => handleStartInterview(app.jobId, app.id)}
                      className="flex items-center gap-2 px-3 py-1 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700"
                      title={
                        interviewSessionsByAppId[app.id]
                          ? 'Open your video interview'
                          : 'Open when the company has started your interview'
                      }
                    >
                      <Video className="w-4 h-4" />
                      Join interview
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CvPreviewModal
        preview={preview}
        onClose={() => {
          if (preview?.url) window.URL.revokeObjectURL(preview.url);
          setPreview(null);
        }}
      />

      <Modal
        open={!!modal}
        title={modal?.title}
        message={modal?.text}
        type={modal?.type}
        onClose={() => setModal(null)}
        actions={[]}
      />

      {/* Student Take Test Modal */}
      <StudentTakeTest
        isOpen={isTestOpen}
        onClose={() => { setIsTestOpen(false); setTestJobId(null); }}
        jobId={testJobId}
        onSubmitted={() => {
          // Refresh applications to pick up status changes
          (async () => {
            try {
              const res = await fetch(`${API_BASE_URL}/jobs/my-applications`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
              const json = await res.json();
              if (res.ok) setApplications(json.data.applications || []);
              setNotice({ type: 'success', text: 'Test submitted. Your application status may have updated.' });
            } catch (err) {
              console.error('Failed to refresh applications after submission', err);
            }
          })();
        }}
      />

      {/* Student Take Coding Test Modal */}
      <StudentTakeCodingTest
        isOpen={isCodingTestOpen && !!testJobId}
        onClose={() => { setIsCodingTestOpen(false); setTestJobId(null); }}
        jobId={testJobId}
        onSubmitted={() => {
          // Refresh applications to pick up status changes
          (async () => {
            try {
              const res = await fetch(`${API_BASE_URL}/jobs/my-applications`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
              const json = await res.json();
              if (res.ok) setApplications(json.data.applications || []);
              setNotice({ type: 'success', text: 'Coding test submitted. Your application status may have updated.' });
            } catch (err) {
              console.error('Failed to refresh applications after submission', err);
            }
          })();
        }}
      />
      
      {/* Student Group Discussion Modal */}
      <StudentGroupDiscussion
        isOpen={isGDOpen && !!testJobId}
        onClose={() => { setIsGDOpen(false); setTestJobId(null); fetchApplications(); }}
        jobId={testJobId}
        applicationId={applications.find(a => a.jobId === testJobId)?.id}
      />
      
      {/* Student Interview Modal */}
      {interviewData && (
        <StudentInterview
          isOpen={isInterviewOpen}
          onClose={() => {
            setIsInterviewOpen(false);
            setInterviewData(null);
            fetchApplications(); // Refresh to update interview status
          }}
          jobId={interviewData.jobId}
          applicationId={interviewData.applicationId}
          question={interviewData.question}
          questionIndex={interviewData.questionIndex}
          session={interviewData.session}
          candidateDisplayName={interviewData.candidateDisplayName}
          onAnswerSubmitted={(result) => {
            console.log('Answer submitted:', result);
            fetchApplications(); // Refresh to show next question or updated status
          }}
        />
      )}
    </div>
  );
};

export default MyApplications;
