import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield, Users, Building2, GraduationCap, FileText, Settings, BarChart3,
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { getCurrentUser } from '../../utils/auth';
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

  /* ── Fetch table data ───────────────────────────────────────── */
  const fetchData = async (query = '', page = 1) => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:5000/api/dashboard/admin/${activeTab}?search=${query}&page=${page}&limit=10`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      const json = await res.json();
      if (res.ok) setTableData(json);
    } catch { /* noop */ }
    finally { setLoading(false); }
  };

  /* ── Init ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user || user.userType !== 'admin') { navigate('/'); return; }

    // Stats
    (async () => {
      try {
        const res = await fetch('http://localhost:5000/api/dashboard/admin/stats', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
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
          fetch('http://localhost:5000/api/dashboard/admin/analytics/jobs-by-status',          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
          fetch('http://localhost:5000/api/dashboard/admin/analytics/applications-by-status',  { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
          fetch('http://localhost:5000/api/dashboard/admin/analytics/companies-by-industry',   { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
          fetch('http://localhost:5000/api/dashboard/admin/analytics/students-stats',          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
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

        {/* Users table */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="card">
          <div className="flex items-center justify-between mb-6">
            <p className="section-title mb-0">User Management</p>
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
            </div>
          </div>
          <UsersTable type={activeTab} data={tableData} onSearch={fetchData} loading={loading} />
        </motion.div>

      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
