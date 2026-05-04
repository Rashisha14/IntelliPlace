import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield, Users, Building2, GraduationCap, FileText, Settings, BarChart3,
  CheckCircle, XCircle, Clock, Briefcase,
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { getCurrentUser } from '../../utils/auth';
import { API_BASE_URL } from '../../config';
import UsersTable from './UsersTable';

// Chart.js
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import { Bar, Pie, Doughnut } from 'react-chartjs-2';
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

/* ─── Shared chart options ───────────────────────────────────── */
const baseOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } } } };
const barOpts  = { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } };

/* ─── Palette ────────────────────────────────────────────────── */
const PALETTE = ['#6366f1', '#14b8a6', '#f59e0b', '#f43f5e', '#8b5cf6', '#0ea5e9'];

/* ═══════════════════════════════════════════════════════════════ */
const AdminDashboard = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [activeTab, setActiveTab]     = useState('students');
  const [tableData, setTableData]     = useState(null);
  const [loading, setLoading]         = useState(false);
  const [stats, setStats]             = useState([
    { label: 'Total Students',   value: '–', icon: GraduationCap, bg: 'bg-indigo-50', fg: 'text-indigo-600' },
    { label: 'Total Companies',  value: '–', icon: Building2,     bg: 'bg-teal-50',   fg: 'text-teal-600'   },
    { label: 'Job Postings',     value: '–', icon: FileText,      bg: 'bg-violet-50', fg: 'text-violet-600' },
    { label: 'Applications',     value: '–', icon: BarChart3,     bg: 'bg-amber-50',  fg: 'text-amber-600'  },
  ]);
  const [analytics, setAnalytics] = useState({
    jobsByStatus: [], applicationsByStatus: [], companiesByIndustry: [], studentsStats: null,
  });
  const [pendingJobs, setPendingJobs]     = useState([]);
  const [approvalLoading, setApprovalLoading] = useState({});

  /* ── Fetch table data ───────────────────────────────────────── */
  const fetchData = async (query = '', page = 1) => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/dashboard/admin/${activeTab}?search=${query}&page=${page}&limit=10`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      const json = await res.json();
      if (res.ok) setTableData(json);
    } catch { /* noop */ }
    finally { setLoading(false); }
  };

  const fetchPendingJobs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/admin/pending`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      if (res.ok) setPendingJobs(json.data?.jobs || []);
    } catch { /* noop */ }
  };

  const handleApprove = async (jobId, approved) => {
    setApprovalLoading(prev => ({ ...prev, [jobId]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/admin-approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ approved }),
      });
      if (res.ok) {
        fetchPendingJobs();
        return;
      }
      const raw = await res.text();
      let msg = `Request failed (${res.status})`;
      try {
        const errJson = JSON.parse(raw);
        if (errJson?.message) msg = errJson.message;
      } catch {
        const trimmed = raw?.trim() || '';
        if (trimmed.startsWith('<') || trimmed.includes('<!DOCTYPE')) {
          msg = `Server returned an error (${res.status}). If you use a separate API host, ensure CORS allows PATCH.`;
        } else if (trimmed) msg = trimmed.slice(0, 200);
      }
      alert(msg);
    } catch (error) {
      console.error('Error updating job approval:', error);
      alert(error?.message || 'An error occurred while communicating with the server.');
    } finally {
      setApprovalLoading(prev => ({ ...prev, [jobId]: false }));
    }
  };

  /* ── Init ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user || user.userType !== 'admin') { navigate('/'); return; }

    // Stats
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/dashboard/admin/stats`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        if (!res.ok) return;
        const { data } = await res.json();
        setStats([
          { label: 'Total Students',  value: data.totalStudents.toString(),   icon: GraduationCap, bg: 'bg-indigo-50', fg: 'text-indigo-600' },
          { label: 'Total Companies', value: data.totalCompanies.toString(),   icon: Building2,     bg: 'bg-teal-50',   fg: 'text-teal-600'   },
          { label: 'Job Postings',    value: data.totalJobs.toString(),        icon: FileText,      bg: 'bg-violet-50', fg: 'text-violet-600' },
          { label: 'Applications',    value: data.totalApplications.toString(),icon: BarChart3,     bg: 'bg-amber-50',  fg: 'text-amber-600'  },
        ]);
      } catch { /* noop */ }
    })();

    // Analytics
    (async () => {
      try {
        const [jr, ar, ir, sr] = await Promise.all([
          fetch(`${API_BASE_URL}/dashboard/admin/analytics/jobs-by-status`,          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
          fetch(`${API_BASE_URL}/dashboard/admin/analytics/applications-by-status`,  { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
          fetch(`${API_BASE_URL}/dashboard/admin/analytics/companies-by-industry`,   { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
          fetch(`${API_BASE_URL}/dashboard/admin/analytics/students-stats`,          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        ]);
        const [jd, ad, id_, sd] = await Promise.all([jr.json(), ar.json(), ir.json(), sr.json()]);
        setAnalytics({
          jobsByStatus:         jd.data?.jobsByStatus         || [],
          applicationsByStatus: ad.data?.applicationsByStatus || [],
          companiesByIndustry:  id_.data?.companiesByIndustry  || [],
          studentsStats:        sd.data || null,
        });
      } catch { /* noop */ }
    })();

    fetchPendingJobs();
  }, [user, navigate]);

  useEffect(() => { fetchData(); }, [activeTab]);

  if (!user || user.userType !== 'admin') return null;

  /* ─── Chart data ─────────────────────────────────────────────── */
  const overviewChart = {
    labels: stats.map(s => s.label),
    datasets: [{ label: 'Count', data: stats.map(s => parseInt(s.value, 10) || 0), backgroundColor: PALETTE, borderRadius: 6 }],
  };
  const jobsChart = {
    labels: analytics.jobsByStatus.map(i => i.status),
    datasets: [{ data: analytics.jobsByStatus.map(i => i.count), backgroundColor: PALETTE, borderColor: '#fff', borderWidth: 2 }],
  };
  const appsChart = {
    labels: analytics.applicationsByStatus.map(i => i.status),
    datasets: [{ data: analytics.applicationsByStatus.map(i => i.count), backgroundColor: PALETTE, borderColor: '#fff', borderWidth: 2 }],
  };
  const industriesChart = {
    labels: analytics.companiesByIndustry.map(i => i.industry),
    datasets: [{ label: 'Companies', data: analytics.companiesByIndustry.map(i => i.count), backgroundColor: '#6366f1', borderRadius: 4 }],
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Page header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div>
            <h1 className="page-title">Admin Dashboard</h1>
            <p className="page-subtitle">Platform overview — Welcome, {user.name || user.username}!</p>
          </div>
          <div className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg shadow-sm text-sm font-medium">
            <Shield className="w-4 h-4" />
            <span>Admin Portal</span>
          </div>
        </motion.div>

        {/* KPI stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="stat-card">
              <div className={`stat-icon ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.fg}`} />
              </div>
              <div>
                <p className="stat-value">{s.value}</p>
                <p className="stat-label mt-0.5">{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Overview bar */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card">
            <p className="section-title">Platform Overview</p>
            <div className="h-52">
              <Bar data={overviewChart} options={{ ...barOpts, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }} />
            </div>
          </motion.div>

          {/* Jobs by status */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="card">
            <p className="section-title">Jobs by Status</p>
            <div className="h-52 flex items-center justify-center">
              {analytics.jobsByStatus.length > 0
                ? <Pie data={jobsChart} options={baseOpts} />
                : <p className="text-sm text-slate-400">No data</p>}
            </div>
          </motion.div>

          {/* Applications by status */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="card">
            <p className="section-title">Applications by Status</p>
            <div className="h-52 flex items-center justify-center">
              {analytics.applicationsByStatus.length > 0
                ? <Doughnut data={appsChart} options={baseOpts} />
                : <p className="text-sm text-slate-400">No data</p>}
            </div>
          </motion.div>

          {/* Top industries */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="card">
            <p className="section-title">Top Industries</p>
            <div className="h-52">
              {analytics.companiesByIndustry.length > 0
                ? <Bar data={industriesChart} options={{ ...baseOpts, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#f1f5f9' } }, y: { grid: { display: false } } } }} />
                : <div className="flex items-center justify-center h-full"><p className="text-sm text-slate-400">No data</p></div>}
            </div>
          </motion.div>

          {/* Student stats */}
          {analytics.studentsStats && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="card lg:col-span-2">
              <p className="section-title">Student Application Distribution</p>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { label: 'No Applications',  value: analytics.studentsStats.studentsWith0Apps,    color: 'text-amber-600',   bg: 'bg-amber-50'   },
                  { label: '1–5 Applications', value: analytics.studentsStats.studentsWith1to5Apps, color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
                  { label: '5+ Applications',  value: analytics.studentsStats.studentsWith5plusApps,color: 'text-emerald-600', bg: 'bg-emerald-50' },
                ].map(row => (
                  <div key={row.label} className={`${row.bg} rounded-xl p-4 flex flex-col gap-1`}>
                    <span className={`text-3xl font-bold ${row.color}`}>{row.value}</span>
                    <span className="text-sm text-slate-500 font-medium">{row.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Users table / Job Approvals */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="card">
          <div className="flex items-center justify-between mb-6">
            <p className="section-title mb-0">Management</p>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {['students', 'companies'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {tab}
                </button>
              ))}
              <button
                onClick={() => setActiveTab('job-approvals')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all relative ${activeTab === 'job-approvals' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Job Approvals
                {pendingJobs.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {pendingJobs.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {activeTab === 'job-approvals' ? (
            <div>
              {pendingJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CheckCircle className="w-12 h-12 text-emerald-300 mb-3" />
                  <p className="text-slate-500 font-medium">No jobs pending approval</p>
                  <p className="text-xs text-slate-400 mt-1">All job postings have been reviewed.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingJobs.map(job => (
                    <div key={job.id} className="flex items-start gap-4 p-4 border border-amber-200 bg-amber-50 rounded-xl">
                      <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                        <Briefcase className="w-5 h-5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">{job.title}</span>
                          <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">{job.company?.companyName} &bull; {job.type}</p>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{job.description}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          {job.location && <span>📍 {job.location}</span>}
                          {job.salary && <span>💰 {job.salary}</span>}
                          {job.minCgpa && <span>🎓 Min CGPA: {job.minCgpa}</span>}
                          <span>Posted: {new Date(job.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleApprove(job.id, true)}
                          disabled={approvalLoading[job.id]}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {approvalLoading[job.id] ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleApprove(job.id, false)}
                          disabled={approvalLoading[job.id]}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-50 text-rose-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <UsersTable type={activeTab} data={tableData} onSearch={fetchData} loading={loading} />
          )}
        </motion.div>

      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
