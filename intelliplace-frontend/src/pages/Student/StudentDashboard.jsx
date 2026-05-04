import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileText, Briefcase, TrendingUp, Bell, ArrowRight, Zap, BookOpen, Star
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { getCurrentUser } from '../../utils/auth';
import JobList from '../../components/JobList';
import { API_BASE_URL } from '../../config';

/* ─── Stat card definition ───────────────────────────────────── */
const STAT_DEFS = [
  { key: 'applicationsSent', label: 'Applications Sent', icon: FileText,   bg: 'bg-indigo-50', fg: 'text-indigo-600' },
  { key: 'interviews',       label: 'Interviews',         icon: Briefcase, bg: 'bg-teal-50',   fg: 'text-teal-600'   },
  { key: 'offers',           label: 'Offers Received',    icon: TrendingUp,bg: 'bg-emerald-50', fg: 'text-emerald-600'},
  { key: 'notifications',    label: 'Notifications',      icon: Bell,      bg: 'bg-amber-50',  fg: 'text-amber-600'  },
];

/* ─── Fade-up animation variants ────────────────────────────── */
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: 'easeOut' },
});

/* ═══════════════════════════════════════════════════════════════ */
const StudentDashboard = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [statData, setStatData] = useState({
    applicationsSent: '–', interviews: '–', offers: '–', notifications: '–',
  });

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.userType !== 'student') {
      navigate('/student/login');
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/dashboard/student/stats/${currentUser.id}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        );
        if (!res.ok) return;
        const { data } = await res.json();
        setStatData({
          applicationsSent: data.applicationsSent ?? 0,
          interviews:       data.interviews       ?? 0,
          offers:           data.offers           ?? 0,
          notifications:    data.notifications    ?? 0,
        });
      } catch { /* silently ignore */ }
    })();
  }, [navigate]);

  if (!user || user.userType !== 'student') return null;

  /* ── Quick actions ────────────────────────────────────────── */
  const quickActions = [
    {
      label: 'Browse Jobs',
      desc: 'Find your next opportunity',
      icon: BookOpen,
      color: 'indigo',
      onClick: () => document.getElementById('jobs-section')?.scrollIntoView({ behavior: 'smooth' }),
    },
    {
      label: 'My Applications',
      desc: 'Track your application pipeline',
      icon: Briefcase,
      color: 'teal',
      onClick: () => navigate('/student/applications'),
    },
    {
      label: 'Notifications',
      desc: 'See latest updates from companies',
      icon: Bell,
      color: 'amber',
      onClick: () => navigate('/student/notifications'),
    },
  ];

  const colorMap = {
    indigo: { ring: 'ring-indigo-200', text: 'text-indigo-600', bg: 'bg-indigo-50', hover: 'hover:ring-indigo-400' },
    teal:   { ring: 'ring-teal-200',   text: 'text-teal-600',   bg: 'bg-teal-50',   hover: 'hover:ring-teal-400'   },
    amber:  { ring: 'ring-amber-200',  text: 'text-amber-600',  bg: 'bg-amber-50',  hover: 'hover:ring-amber-400'  },
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Page header ─────────────────────────────────────── */}
        <motion.div {...fadeUp(0)} className="page-header">
          <div>
            <h1 className="page-title">
              Good {getGreeting()}, {user.name?.split(' ')[0] || user.username}! 👋
            </h1>
            <p className="page-subtitle">Here's your placement journey at a glance.</p>
          </div>
          <div className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-sm text-sm font-medium">
            <Zap className="w-4 h-4" />
            <span>Student Portal</span>
          </div>
        </motion.div>

        {/* ── KPI Stats ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_DEFS.map((def, i) => (
            <motion.div key={def.key} {...fadeUp(i * 0.07)} className="stat-card">
              <div className="flex items-center justify-between">
                <div className={`stat-icon ${def.bg}`}>
                  <def.icon className={`w-5 h-5 ${def.fg}`} />
                </div>
                <Star className="w-3.5 h-3.5 text-slate-200" />
              </div>
              <div>
                <p className="stat-value">{statData[def.key]}</p>
                <p className="stat-label mt-0.5">{def.label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Quick Actions ────────────────────────────────────── */}
        <motion.div {...fadeUp(0.28)}>
          <h2 className="section-title">Quick Actions</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {quickActions.map((action) => {
              const c = colorMap[action.color];
              return (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className={`text-left p-5 bg-white rounded-xl ring-1 ${c.ring} ${c.hover} hover:shadow-md transition-all duration-200 group`}
                >
                  <div className={`w-10 h-10 ${c.bg} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <action.icon className={`w-5 h-5 ${c.text}`} />
                  </div>
                  <p className="font-semibold text-slate-900 mb-0.5">{action.label}</p>
                  <p className="text-xs text-slate-500">{action.desc}</p>
                  <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${c.text} opacity-0 group-hover:opacity-100 transition-opacity`}>
                    <span>Go there</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* ── Available Jobs ───────────────────────────────────── */}
        <motion.div {...fadeUp(0.35)} id="jobs-section">
          <div className="flex items-center justify-between mb-5">
            <h2 className="section-title mb-0">Available Jobs</h2>
            <span className="text-xs text-slate-400 font-medium">Updated in real-time</span>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="p-6">
              <JobList />
            </div>
          </div>
        </motion.div>

      </div>
    </DashboardLayout>
  );
};

/* ─── Utility ────────────────────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export default StudentDashboard;
