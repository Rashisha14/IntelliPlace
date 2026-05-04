import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Briefcase, FileCheck, Users, TrendingUp, Plus, ClipboardList,
  MapPin, Calendar, ChevronRight, Layers
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { getCurrentUser } from '../../utils/auth';
import { API_BASE_URL } from '../../config';
import ApplicationsList from '../../components/ApplicationsList';
import CompanyPostJob from '../../components/CompanyPostJob';
import CompanyCreateTest from '../../components/CompanyCreateTest';
import CompanyCreateCodingTest from '../../components/CompanyCreateCodingTest';
import CompanyViewTest from '../../components/CompanyViewTest';
import Modal from '../../components/Modal';

/* ─── Status chip helper ───────────────────────────────────────── */
const JobStatusChip = ({ status }) => {
  const cls = status === 'OPEN'    ? 'badge-green'
            : status === 'CLOSED'  ? 'badge-gray'
            : 'badge-yellow';
  return <span className={`badge ${cls}`}>{status}</span>;
};

const TestChip = ({ label, status }) => {
  const cls = status === 'STARTED' ? 'badge-blue'
            : status === 'CREATED' ? 'badge-yellow'
            : status === 'STOPPED' ? 'badge-gray'
            : 'badge-gray';
  return <span className={`badge ${cls} text-[10px]`}>{label}: {status}</span>;
};

/* ═══════════════════════════════════════════════════════════════ */
const CompanyDashboard = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();

  /* ── Stats ──────────────────────────────────────────────────── */
  const [stats, setStats] = useState([
    { key: 'jobsPosted',        label: 'Jobs Posted',    icon: Briefcase,  bg: 'bg-indigo-50', fg: 'text-indigo-600' },
    { key: 'totalApplications', label: 'Applications',   icon: FileCheck,  bg: 'bg-teal-50',   fg: 'text-teal-600'   },
    { key: 'totalInterviews',   label: 'Interviews',     icon: Users,      bg: 'bg-violet-50', fg: 'text-violet-600' },
    { key: 'totalHired',        label: 'Hired',          icon: TrendingUp, bg: 'bg-emerald-50',fg: 'text-emerald-600'},
  ]);
  const [statValues, setStatValues] = useState({ jobsPosted: '–', totalApplications: '–', totalInterviews: '–', totalHired: '–' });

  /* ── Jobs ───────────────────────────────────────────────────── */
  const [jobs, setJobs]                       = useState([]);
  const [jobsLoading, setJobsLoading]         = useState(false);
  const [testsMap, setTestsMap]               = useState({});
  const [codingTestsMap, setCodingTestsMap]   = useState({});
  const [lastFetch, setLastFetch]             = useState(0);

  /* ── Modal state ────────────────────────────────────────────── */
  const [selectedJobId, setSelectedJobId]           = useState(null);
  const [selectedJobStatus, setSelectedJobStatus]   = useState(null);
  const [isPostJobOpen, setIsPostJobOpen]           = useState(false);
  const [isCreateTestOpen, setIsCreateTestOpen]     = useState(false);
  const [isCreateCodingTestOpen, setIsCreateCodingTestOpen] = useState(false);
  const [isEditCodingTestOpen, setIsEditCodingTestOpen]     = useState(false);
  const [editingCodingTestJobId, setEditingCodingTestJobId] = useState(null);
  const [testJobId, setTestJobId]                   = useState(null);
  const [isViewTestOpen, setIsViewTestOpen]         = useState(false);
  const [viewTestJobId, setViewTestJobId]           = useState(null);
  const [isStartConfirmOpen, setIsStartConfirmOpen] = useState(false);
  const [startingJob, setStartingJob]               = useState(null);
  const [startLoading, setStartLoading]             = useState(false);
  const [isStopConfirmOpen, setIsStopConfirmOpen]   = useState(false);
  const [stoppingJob, setStoppingJob]               = useState(null);
  const [stopLoading, setStopLoading]               = useState(false);

  /* ── Fetch stats ────────────────────────────────────────────── */
  useEffect(() => {
    if (!user || user.userType !== 'company') { navigate('/company/login'); return; }
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/dashboard/company/stats/${user.id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (!res.ok) return;
        const { data } = await res.json();
        setStatValues({ jobsPosted: data.jobsPosted ?? 0, totalApplications: data.totalApplications ?? 0, totalInterviews: data.totalInterviews ?? 0, totalHired: data.totalHired ?? 0 });
      } catch { /* noop */ }
    })();
  }, [user, navigate]);

  /* ── Fetch jobs ─────────────────────────────────────────────── */
  const fetchJobs = async (userId) => {
    if (!userId) return;
    setJobsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/my-jobs`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const json = await res.json();
      if (res.ok && Array.isArray(json.data?.jobs)) {
        setJobs(json.data.jobs);
        const apt = {}, cod = {};
        await Promise.all(json.data.jobs.map(async job => {
          try {
            const [ar, cr] = await Promise.all([
              fetch(`${API_BASE_URL}/jobs/${job.id}/aptitude-test`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
              fetch(`${API_BASE_URL}/jobs/${job.id}/coding-test`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
            ]);
            if (ar.ok) { const d = await ar.json(); if (d.data?.test || d.data) apt[job.id] = d.data?.test || d.data; }
            if (cr.ok) { const d = await cr.json(); if (d.data) cod[job.id] = d.data; }
          } catch { /* noop */ }
        }));
        setTestsMap(apt);
        setCodingTestsMap(cod);
      }
    } catch { /* noop */ }
    finally { setJobsLoading(false); setLastFetch(Date.now()); }
  };

  useEffect(() => {
    if (!user?.id || Date.now() - lastFetch < 1000) return;
    fetchJobs(user.id);
  }, [user?.id, lastFetch]);

  /* ── Test control handlers ──────────────────────────────────── */
  const handleConfirmStart = async () => {
    if (!startingJob) return;
    setStartLoading(true);
    try {
      const ep = startingJob.isCoding
        ? `${API_BASE_URL}/jobs/${startingJob.id}/coding-test/start`
        : `${API_BASE_URL}/jobs/${startingJob.id}/aptitude-test/start`;
      const res = await fetch(ep, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const d = await res.json();
      if (!res.ok) { alert(d.message || 'Failed to start test'); return; }
      alert(`Test started${!startingJob.isCoding ? ` — ${d.data.invited || 0} students notified` : ''}`);
      setIsStartConfirmOpen(false); setStartingJob(null);
      if (user) fetchJobs(user.id);
    } catch { alert('Failed to start test'); }
    finally { setStartLoading(false); }
  };

  const handleConfirmStop = async () => {
    if (!stoppingJob) return;
    setStopLoading(true);
    try {
      const ep = stoppingJob.isCoding
        ? `${API_BASE_URL}/jobs/${stoppingJob.id}/coding-test/stop`
        : `${API_BASE_URL}/jobs/${stoppingJob.id}/aptitude-test/stop`;
      const res = await fetch(ep, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const d = await res.json();
      if (!res.ok) { alert(d.message || 'Failed to stop test'); return; }
      alert('Test stopped successfully');
      setIsStopConfirmOpen(false); setStoppingJob(null);
      if (user) fetchJobs(user.id);
    } catch { alert('Failed to stop test'); }
    finally { setStopLoading(false); }
  };

  if (!user || user.userType !== 'company') return null;

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Page header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div>
            <h1 className="page-title">Welcome, {user.companyName || user.name || user.username}!</h1>
            <p className="page-subtitle">Manage your jobs and recruitment pipeline.</p>
          </div>
          <button onClick={() => setIsPostJobOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Post New Job
          </button>
        </motion.div>

        {/* KPI stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <motion.div key={s.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="stat-card">
              <div className={`stat-icon ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.fg}`} />
              </div>
              <div>
                <p className="stat-value">{statValues[s.key]}</p>
                <p className="stat-label mt-0.5">{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Job postings */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="section-title mb-0">Job Postings</h2>
            <span className="text-xs text-slate-400">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
          </div>

          {jobsLoading ? (
            <div className="card flex items-center justify-center py-16">
              <div className="spinner w-8 h-8" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <Briefcase className="w-12 h-12 text-slate-300 mb-3" />
              <h3 className="text-lg font-semibold text-slate-700">No jobs posted yet</h3>
              <p className="text-sm text-slate-400 mt-1">Post your first job to start hiring!</p>
              <button onClick={() => setIsPostJobOpen(true)} className="btn-primary mt-5">
                <Plus className="w-4 h-4" /> Post a Job
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {jobs.map((job, i) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="card-hover flex flex-col"
                >
                  {/* Job header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
                      <Briefcase className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 truncate">{job.title}</h3>
                        <JobStatusChip status={job.status} />
                        {!job.adminApproved && (
                          <span className="badge badge-yellow text-[10px]">⏳ Pending Approval</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        {job.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location}</span>}
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(job.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-slate-500 line-clamp-2 mb-3">{job.description}</p>

                  {/* Skills */}
                  {job.requiredSkills && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(typeof job.requiredSkills === 'string' ? job.requiredSkills.split(',') : job.requiredSkills)
                        .slice(0, 4).map((sk, idx) => (
                          <span key={idx} className="tag">{sk.trim()}</span>
                        ))}
                    </div>
                  )}

                  {/* Test badges */}
                  {(testsMap[job.id] || codingTestsMap[job.id]) && (
                    <div className="flex gap-1.5 mb-3 flex-wrap">
                      {testsMap[job.id] && <TestChip label="Aptitude" status={testsMap[job.id].status} />}
                      {codingTestsMap[job.id] && <TestChip label="Coding" status={codingTestsMap[job.id].status} />}
                    </div>
                  )}

                  {/* Footer actions */}
                  <div className="mt-auto pt-4 border-t border-slate-100 flex items-center gap-2">
                    <Link
                      to={`/company/recruitment/${job.id}`}
                      className="btn btn-primary btn-sm flex-1 justify-center"
                    >
                      <Layers className="w-3.5 h-3.5" /> Recruitment Process
                    </Link>
                    <button
                      onClick={() => { setSelectedJobId(job.id); setSelectedJobStatus(job.status); }}
                      className="btn btn-ghost btn-sm flex-1"
                    >
                      <Users className="w-3.5 h-3.5" /> Applications
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────── */}
      <CompanyPostJob
        isOpen={isPostJobOpen}
        onClose={() => setIsPostJobOpen(false)}
        onCreated={() => { setIsPostJobOpen(false); if (user) fetchJobs(user.id); }}
      />
      <CompanyCreateTest
        isOpen={isCreateTestOpen}
        onClose={() => { setIsCreateTestOpen(false); setTestJobId(null); }}
        jobId={testJobId}
        onCreated={async () => {
          setIsCreateTestOpen(false);
          try {
            const r = await fetch(`${API_BASE_URL}/jobs/${testJobId}/aptitude-test`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            if (r.ok) { const d = await r.json(); setTestsMap(prev => ({ ...prev, [testJobId]: d.data.test })); }
          } catch { /* noop */ }
          setTestJobId(null);
        }}
      />
      <CompanyCreateCodingTest
        isOpen={isCreateCodingTestOpen}
        onClose={() => { setIsCreateCodingTestOpen(false); setTestJobId(null); }}
        jobId={testJobId}
        onCreated={async () => {
          setIsCreateCodingTestOpen(false);
          try {
            const r = await fetch(`${API_BASE_URL}/jobs/${testJobId}/coding-test`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            if (r.ok) { const d = await r.json(); setCodingTestsMap(prev => ({ ...prev, [testJobId]: d.data })); }
          } catch { /* noop */ }
          setTestJobId(null);
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
          const eid = editingCodingTestJobId;
          setEditingCodingTestJobId(null);
          try {
            const r = await fetch(`${API_BASE_URL}/jobs/${eid}/coding-test`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            if (r.ok) { const d = await r.json(); setCodingTestsMap(prev => ({ ...prev, [eid]: d.data })); }
          } catch { /* noop */ }
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
        title={`Start ${startingJob?.isCoding ? 'Coding' : 'Aptitude'} Test — ${startingJob?.title || ''}`}
        message={
          startingJob?.status !== 'CLOSED'
            ? 'Close applications for this job before starting any tests.'
            : `Starting will notify shortlisted students. Continue?`
        }
        type={startingJob?.status !== 'CLOSED' ? 'error' : 'warning'}
        onClose={() => setIsStartConfirmOpen(false)}
        actions={
          startingJob?.status !== 'CLOSED'
            ? [{ label: 'OK', onClick: () => setIsStartConfirmOpen(false) }]
            : [
                { label: 'Cancel', onClick: () => setIsStartConfirmOpen(false) },
                { label: startLoading ? 'Starting…' : 'Start Test', onClick: handleConfirmStart, autoClose: false },
              ]
        }
      />
      <Modal
        open={isStopConfirmOpen}
        title={`Stop test — ${stoppingJob?.title || ''}`}
        message="Stopping will prevent new submissions. Students who submitted keep their results. Continue?"
        type="warning"
        onClose={() => setIsStopConfirmOpen(false)}
        actions={[
          { label: 'Cancel', onClick: () => setIsStopConfirmOpen(false) },
          { label: stopLoading ? 'Stopping…' : 'Stop Test', onClick: handleConfirmStop, autoClose: false },
        ]}
      />
      {selectedJobId && (
        <ApplicationsList
          jobId={selectedJobId}
          initialJobStatus={selectedJobStatus}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </DashboardLayout>
  );
};

export default CompanyDashboard;
