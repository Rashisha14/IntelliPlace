import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getCurrentUser } from '../utils/auth';
import {
  LayoutDashboard,
  Briefcase,
  Bell,
  LogOut,
  Menu,
  X,
  GraduationCap,
  Building2,
  Shield,
  ChevronRight,
  Users,
  BarChart3,
} from 'lucide-react';
import ProfileModal from './ProfileModal';

/* ─── Per-role navigation config ──────────────────────────────── */
const NAV_CONFIG = {
  student: [
    { name: 'Dashboard',       path: '/student/dashboard',    icon: LayoutDashboard },
    { name: 'My Applications', path: '/student/applications', icon: Briefcase },
    { name: 'Notifications',   path: '/student/notifications', icon: Bell },
  ],
  company: [
    { name: 'Dashboard',       path: '/company/dashboard',   icon: LayoutDashboard },
  ],
  admin: [
    { name: 'Dashboard',       path: '/admin/dashboard',     icon: LayoutDashboard },
  ],
};

/* ─── Role meta ──────────────────────────────────────────────── */
const ROLE_META = {
  student: { label: 'Student',  icon: GraduationCap, color: 'bg-indigo-500' },
  company: { label: 'Company',  icon: Building2,     color: 'bg-teal-500'   },
  admin:   { label: 'Admin',    icon: Shield,        color: 'bg-rose-500'   },
};

/* ─── Helper: page title from pathname ──────────────────────── */
const getPageTitle = (pathname) => {
  const map = {
    '/student/dashboard':    'Dashboard',
    '/student/applications': 'My Applications',
    '/student/notifications':'Notifications',
    '/company/dashboard':    'Dashboard',
    '/company/recruitment':  'Recruitment Process',
    '/admin/dashboard':      'Dashboard',
  };
  for (const [key, val] of Object.entries(map)) {
    if (pathname.startsWith(key)) return val;
  }
  return 'IntelliPlace';
};

/* ═══════════════════════════════════════════════════════════════ */
const DashboardLayout = ({ children }) => {
  const navigate   = useNavigate();
  const location   = useLocation();
  const user       = getCurrentUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  if (!user) { navigate('/'); return null; }

  const navItems = NAV_CONFIG[user.userType] || [];
  const roleMeta = ROLE_META[user.userType] || ROLE_META.student;
  const pageTitle = getPageTitle(location.pathname);
  const initials  = (user.name || user.username || '?')[0].toUpperCase();

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/');
  };

  /* ── Sidebar content (shared between mobile + desktop) ──────── */
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg">
            <GraduationCap className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          </div>
          <span className="text-white text-base font-bold tracking-tight">IntelliPlace</span>
        </div>
      </div>

      {/* Role badge */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/5">
          <div className={`w-7 h-7 rounded-md ${roleMeta.color} flex items-center justify-center shrink-0`}>
            <roleMeta.icon className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">{user.companyName || user.name || user.username}</p>
            <p className="text-slate-400 text-[10px]">{roleMeta.label} Portal</p>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest px-3 mb-2">Navigation</p>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.name}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-white/5">
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-left text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 flex font-[Inter,sans-serif]">

      {/* ── Mobile overlay ────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Desktop Sidebar (static) ──────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#0f172a] shrink-0 fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* ── Mobile Sidebar (slide-in) ─────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0f172a] transform transition-transform duration-200 ease-in-out lg:hidden
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="absolute top-3 right-3">
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <SidebarContent />
      </aside>

      {/* ── Main Area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">

        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center gap-3 px-4 sm:px-6 sticky top-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-400 font-medium">IntelliPlace</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-slate-700 font-semibold">{pageTitle}</span>
          </div>

          <div className="flex-1" />

          {/* Right controls */}
          <div className="flex items-center gap-3">
            {/* Notification bell (students only) */}
            {user.userType === 'student' && (
              <Link
                to="/student/notifications"
                className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
              </Link>
            )}

            <div className="w-px h-6 bg-slate-200" />

            {/* Avatar / Profile Button */}
            <button 
              onClick={() => setProfileModalOpen(true)}
              className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-indigo-100">
                {initials}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-slate-800 leading-none">{user.companyName || user.name || user.username}</p>
                <p className="text-xs text-slate-400 mt-0.5">{roleMeta.label}</p>
              </div>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Profile Modal */}
      <ProfileModal 
        isOpen={profileModalOpen} 
        onClose={() => setProfileModalOpen(false)} 
      />
    </div>
  );
};

export default DashboardLayout;
