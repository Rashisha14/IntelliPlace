import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Code, RefreshCw, Video, Users, FileText, ChevronDown } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { API_BASE_URL } from '../../config.js';
import CvPreviewModal from '../../components/CvPreviewModal';
import Modal from '../../components/Modal';
import StudentTakeTest from '../../components/StudentTakeTest';
import StudentTakeCodingTest from '../../components/StudentTakeCodingTest';
import StudentInterview from '../../components/StudentInterview';
import StudentGroupDiscussion from '../../components/StudentGroupDiscussion';
import { getCurrentUser } from '../../utils/auth';

const ELIGIBLE_STATUSES = [
  'SHORTLISTED', 'APP PASS', 'PASSED APTITUDE', 'APTITUDE_PASSED',
  'CODE PASS', 'PASSED CODING', 'CODE_PASSED', 'CODING_PASSED',
];

/* ─── Status badge helper ──────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const s = (status || '').toUpperCase();
  let cls = 'badge-gray';
  if (['PENDING'].includes(s)) cls = 'badge-yellow';
  else if (['REVIEWING'].includes(s)) cls = 'badge-blue';
  else if (['SHORTLISTED', 'APP PASS', 'PASSED APTITUDE', 'APTITUDE_PASSED',
            'CODE PASS', 'PASSED CODING', 'CODING_PASSED', 'SELECTED', 'HIRED', 'OFFERED'].includes(s)) cls = 'badge-green';
  else if (['APP FAIL', 'FAILED APTITUDE', 'APTITUDE_FAILED', 'CODE FAIL',
            'FAILED CODING', 'CODING_FAILED', 'INTERVIEW FAIL', 'FAILED INTERVIEW', 'INTERVIEW_FAILED', 'REJECTED'].includes(s)) cls = 'badge-red';
  else if (['GD_PASSED', 'GD_FAILED', 'INTERVIEW_SCHEDULED'].includes(s)) cls = 'badge-purple';
  return <span className={`badge ${cls} font-semibold`}>{status}</span>;
};

/* ─── Pipeline stage indicator ─────────────────────────────────── */
const STAGES = ['Applied', 'Shortlisted', 'Aptitude', 'Coding', 'GD', 'Interview', 'Offer'];

const getStageIndex = (status) => {
  const s = (status || '').toUpperCase();
  if (['SELECTED','HIRED','OFFERED'].includes(s)) return 6;
  if (['INTERVIEW_SCHEDULED','INTERVIEW FAIL','FAILED INTERVIEW','INTERVIEW_FAILED'].includes(s)) return 5;
  if (['GD_PASSED','GD_FAILED'].includes(s)) return 5;
  if (['CODE PASS','PASSED CODING','CODING_PASSED','CODING_STARTED','CODE FAIL','FAILED CODING','CODING_FAILED'].includes(s)) return 3;
  if (['SHORTLISTED','APP PASS','PASSED APTITUDE','APTITUDE_PASSED','FAILED APTITUDE','APTITUDE_FAILED','APTITUDE_STARTED'].includes(s)) return 2;
  if (['REVIEWING'].includes(s)) return 1;
  if (['REJECTED','APP FAIL'].includes(s)) return -1;
  return 0;
};

const PipelineBar = ({ status }) => {
  const idx = getStageIndex(status);
  if (idx < 0) return (
    <p className="text-xs text-rose-500 font-medium mt-2">Application not progressed further</p>
  );
  return (
    <div className="flex items-center gap-0.5 mt-3">
      {STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-0.5 flex-1 min-w-0">
          <div className={`h-1.5 rounded-full w-full transition-all ${i <= idx ? 'bg-indigo-500' : 'bg-slate-200'}`} />
        </div>
      ))}
      <span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">
        {STAGES[Math.min(idx, STAGES.length - 1)]}
      </span>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
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
  const [interviewData, setInterviewData] = useState(null);
  const [testStatuses, setTestStatuses] = useState({});
  const [codingTestStatuses, setCodingTestStatuses] = useState({});
  const [interviewSessionsByAppId, setInterviewSessionsByAppId] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/my-applications`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      if (res.ok) {
        const apps = json.data.applications || [];
        setApplications(apps);
        const shortlistedJobs = apps
          .filter(a => ELIGIBLE_STATUSES.includes(a.status?.toUpperCase()))
          .map(a => a.jobId);
        const tsMap = {}, csMap = {};
        for (const jid of shortlistedJobs) {
          try {
            const tr = await fetch(`${API_BASE_URL}/jobs/${jid}/aptitude-test/status`, {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            if (tr.ok) { const tj = await tr.json(); if (tj.data?.test?.status) tsMap[jid] = tj.data.test.status; }
            const cr = await fetch(`${API_BASE_URL}/jobs/${jid}/coding-test/status`, {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            if (cr.ok) { const cj = await cr.json(); if (cj.data?.exists && cj.data?.status) csMap[jid] = cj.data.status; }
          } catch { /* noop */ }
        }
        setTestStatuses(tsMap);
        setCodingTestStatuses(csMap);
        const ivMap = {};
        for (const app of apps) {
          try {
            const ir = await fetch(`${API_BASE_URL}/jobs/${app.jobId}/interviews/${app.id}/student-session`, {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            if (ir.ok) { const ij = await ir.json(); if (ij.data?.session) ivMap[app.id] = ij.data; }
          } catch { /* noop */ }
        }
        setInterviewSessionsByAppId(ivMap);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!user || user.userType !== 'student') { navigate('/student/login'); return; }
    fetchApplications();
    const t = setInterval(fetchApplications, 30000);
    return () => clearInterval(t);
  }, [navigate]);

  /* deep-link: open coding test or interview from notification */
  useEffect(() => {
    const openCoding = sessionStorage.getItem('openCodingTest');
    if (openCoding && applications.length > 0) {
      sessionStorage.removeItem('openCodingTest');
      const jid = parseInt(openCoding, 10);
      if (applications.find(a => Number(a.jobId) === jid && ELIGIBLE_STATUSES.includes(a.status?.toUpperCase()))) {
        setTimeout(() => { setTestJobId(jid); setIsCodingTestOpen(true); }, 500);
      }
    }
    const openIv = sessionStorage.getItem('openInterview');
    if (openIv && applications.length > 0) {
      sessionStorage.removeItem('openInterview');
      try {
        const { jobId, applicationId } = JSON.parse(openIv);
        const app = applications.find(a => Number(a.jobId) === Number(jobId) && Number(a.id) === Number(applicationId));
        if (!app) return;
        setTimeout(async () => {
          const ir = await fetch(`${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/student-session`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          });
          if (ir.ok) {
            const ij = await ir.json();
            if (ij.data?.session) {
              setInterviewData({ jobId, applicationId, question: null, questionIndex: -1, session: ij.data.session, candidateDisplayName: getCurrentUser()?.name ?? '' });
              setIsInterviewOpen(true);
            }
          }
        }, 300);
      } catch { /* noop */ }
    }
  }, [applications]);

  const handleStartInterview = async (jobId, applicationId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/student-session`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.session) {
          setInterviewData({ jobId, applicationId, question: null, questionIndex: -1, session: data.data.session, candidateDisplayName: getCurrentUser()?.name ?? '' });
          setIsInterviewOpen(true);
          setNotice(null);
        } else {
          setNotice({ type: 'error', text: 'No active interview session yet. Try again after the company starts your interview.' });
        }
      }
    } catch (err) {
      setNotice({ type: 'error', text: 'Could not load the interview. Check your connection and try again.' });
    }
  };

  const viewCV = async (cvUrl) => {
    if (!cvUrl) return;
    const filename = cvUrl.split('/').pop();
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/cv/${filename}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) { setModal({ title: 'Error', text: 'Failed to fetch CV', type: 'error' }); return; }
      const blob = await res.blob();
      setPreview({ url: window.URL.createObjectURL(blob), name: filename });
    } catch { setModal({ title: 'Error', text: 'Failed to open CV', type: 'error' }); }
  };

  if (!user || user.userType !== 'student') return null;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">My Applications</h1>
            <p className="page-subtitle">{applications.length} application{applications.length !== 1 ? 's' : ''} tracked</p>
          </div>
          <button onClick={fetchApplications} disabled={loading} className="btn-ghost">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Notice banner */}
        {notice && (
          <div className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="text-inherit opacity-60 hover:opacity-100 text-xs font-medium ml-4">Dismiss</button>
          </div>
        )}

        {/* Loading */}
        {loading && applications.length === 0 && (
          <div className="card flex items-center justify-center py-16">
            <div className="spinner w-8 h-8" />
          </div>
        )}

        {/* Empty state */}
        {!loading && applications.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-700">No applications yet</h3>
            <p className="text-sm text-slate-400 mt-1">Browse jobs on the dashboard and start applying!</p>
            <button onClick={() => navigate('/student/dashboard')} className="btn-primary mt-5">Browse Jobs</button>
          </div>
        )}

        {/* Application cards */}
        {applications.map((app, i) => {
          const isExpanded = expandedId === app.id;
          const hasAptitude = ['SHORTLISTED','APP PASS','PASSED APTITUDE','APTITUDE_PASSED'].includes(app.status?.toUpperCase()) && testStatuses[app.jobId] === 'STARTED' && !['APTITUDE_PASSED', 'APTITUDE_FAILED'].includes(app.status);
          const hasCoding = ['SHORTLISTED','APP PASS','PASSED APTITUDE','APTITUDE_PASSED','CODE PASS','PASSED CODING'].includes(app.status?.toUpperCase()) && codingTestStatuses[app.jobId] && !['CODING_PASSED', 'CODING_FAILED'].includes(app.status);
          const hasGD = ['CODE PASS','PASSED CODING','CODING_PASSED','GD_FAILED'].includes(app.status?.toUpperCase());
          const hasInterview = !!interviewSessionsByAppId[app.id];

          return (
            <motion.div
              key={app.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="card-hover"
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-slate-900 truncate">{app.job?.title}</h3>
                    <StatusBadge status={app.status} />
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{app.job?.company?.companyName}</p>
                  <PipelineBar status={app.status} />
                </div>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : app.id)}
                  className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 shrink-0 transition-colors"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Expandable details */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 animate-fade-up">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-600">
                    <div><span className="font-semibold text-slate-800 block">Applied</span>{new Date(app.createdAt).toLocaleDateString()}</div>
                    {app.cgpa != null && <div><span className="font-semibold text-slate-800 block">CGPA Applied</span>{app.cgpa}</div>}
                    {app.decisionReason && <div className="col-span-2 sm:col-span-1"><span className="font-semibold text-slate-800 block">Decision Reason</span>{app.decisionReason}</div>}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {app.cvUrl && (
                      <button onClick={() => viewCV(app.cvUrl)} className="btn btn-ghost btn-sm">
                        <FileText className="w-3.5 h-3.5" /> View CV
                      </button>
                    )}
                    {hasAptitude && (
                      <button onClick={() => { setTestJobId(app.jobId); setIsTestOpen(true); }} className="btn btn-primary btn-sm">
                        <Play className="w-3.5 h-3.5" /> Take Aptitude Test
                      </button>
                    )}
                    {hasCoding && (
                      codingTestStatuses[app.jobId] === 'STARTED'
                        ? <button onClick={() => { setTestJobId(Number(app.jobId)); setIsCodingTestOpen(true); }} className="btn btn-sm bg-violet-600 text-white hover:bg-violet-700">
                            <Code className="w-3.5 h-3.5" /> Take Coding Test
                          </button>
                        : <span className="btn btn-ghost btn-sm opacity-60 cursor-default">Coding: {codingTestStatuses[app.jobId]}</span>
                    )}
                    {hasGD && (
                      <button onClick={() => { setTestJobId(Number(app.jobId)); setIsGDOpen(true); }} className="btn btn-warning btn-sm">
                        <Users className="w-3.5 h-3.5" /> Join Group Discussion
                      </button>
                    )}
                    {hasInterview && (
                      <button onClick={() => handleStartInterview(app.jobId, app.id)} className="btn btn-success btn-sm">
                        <Video className="w-3.5 h-3.5" /> Join Interview
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Modals */}
      <CvPreviewModal preview={preview} onClose={() => { if (preview?.url) window.URL.revokeObjectURL(preview.url); setPreview(null); }} />
      <Modal open={!!modal} title={modal?.title} message={modal?.text} type={modal?.type} onClose={() => setModal(null)} actions={[]} />
      <StudentTakeTest isOpen={isTestOpen} onClose={() => { setIsTestOpen(false); setTestJobId(null); }} jobId={testJobId}
        onSubmitted={async () => {
          try { const r = await fetch(`${API_BASE_URL}/jobs/my-applications`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); const j = await r.json(); if (r.ok) setApplications(j.data.applications || []); setNotice({ type: 'success', text: 'Test submitted! Status updated.' }); } catch { /* noop */ }
        }} />
      <StudentTakeCodingTest isOpen={isCodingTestOpen && !!testJobId} onClose={() => { setIsCodingTestOpen(false); setTestJobId(null); }} jobId={testJobId}
        onSubmitted={async () => {
          try { const r = await fetch(`${API_BASE_URL}/jobs/my-applications`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); const j = await r.json(); if (r.ok) setApplications(j.data.applications || []); setNotice({ type: 'success', text: 'Coding test submitted!' }); } catch { /* noop */ }
        }} />
      {isGDOpen &&
        !!testJobId &&
        createPortal(
          <StudentGroupDiscussion
            isOpen
            onClose={() => {
              setIsGDOpen(false);
              setTestJobId(null);
              fetchApplications();
            }}
            jobId={testJobId}
            applicationId={applications.find((a) => a.jobId === testJobId)?.id}
          />,
          document.body
        )}
      {interviewData && (
        <StudentInterview isOpen={isInterviewOpen} onClose={() => { setIsInterviewOpen(false); setInterviewData(null); fetchApplications(); }}
          jobId={interviewData.jobId} applicationId={interviewData.applicationId} session={interviewData.session} candidateDisplayName={interviewData.candidateDisplayName}
          onAnswerSubmitted={() => fetchApplications()} />
      )}
    </DashboardLayout>
  );
};

export default MyApplications;
