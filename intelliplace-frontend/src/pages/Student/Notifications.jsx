import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, RefreshCw, CheckCheck, Circle, ExternalLink } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import CvPreviewModal from '../../components/CvPreviewModal';
import Modal from '../../components/Modal';
import { getCurrentUser } from '../../utils/auth';
import { API_BASE_URL } from '../../config';

const Notifications = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reasons, setReasons] = useState({});
  const [preview, setPreview] = useState(null);
  const [modal, setModal] = useState(null);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      if (res.ok) setNotifications(json.data.notifications || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!user || user.userType !== 'student') { navigate('/student/login'); return; }
    fetchNotifications();
    const t = setInterval(fetchNotifications, 30000);
    return () => clearInterval(t);
  }, [navigate]);

  const markAllRead = async () => {
    if (!notifications.some(n => !n.read)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/mark-all-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch { /* noop */ }
    finally { setLoading(false); }
  };

  const markReadAndOpen = async (notif) => {
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/${notif.id}/open`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      const payload = json.data || {};
      const titleL = (notif.title || '').toLowerCase();
      const msgL = (notif.message || '').toLowerCase();
      const isCoding = titleL.includes('coding test') || msgL.includes('coding test');
      const isIv = titleL.includes('interview') || msgL.includes('interview');
      if (payload.application) {
        if (isCoding && payload.application.jobId) sessionStorage.setItem('openCodingTest', payload.application.jobId.toString());
        if (isIv && payload.application.jobId != null && payload.application.id != null)
          sessionStorage.setItem('openInterview', JSON.stringify({ jobId: payload.application.jobId, applicationId: payload.application.id }));
        navigate('/student/applications'); return;
      }
      if (payload.job) {
        if (isCoding && payload.job.id) { sessionStorage.setItem('openCodingTest', payload.job.id.toString()); navigate('/student/applications'); }
        else navigate(`/jobs/${payload.job.id}`);
        return;
      }
      navigate('/student/applications');
    } catch {
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      navigate('/student/applications');
    }
  };

  const viewCV = async (cvUrl) => {
    const filename = cvUrl.split('/').pop();
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/cv/${filename}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) { setModal({ title: 'Error', text: 'Failed to fetch CV', type: 'error' }); return; }
      const blob = await res.blob();
      setPreview({ url: window.URL.createObjectURL(blob), name: filename });
    } catch { setModal({ title: 'Error', text: 'Failed to open CV', type: 'error' }); }
  };

  if (!user || user.userType !== 'student') return null;

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Notifications</h1>
            <p className="page-subtitle">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={markAllRead} disabled={loading || unreadCount === 0} className="btn-ghost disabled:opacity-40">
              <CheckCheck className="w-4 h-4" /> Mark all read
            </button>
            <button onClick={fetchNotifications} disabled={loading} className="btn-ghost">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && notifications.length === 0 && (
          <div className="card flex items-center justify-center py-16">
            <div className="spinner w-8 h-8" />
          </div>
        )}

        {/* Empty state */}
        {!loading && notifications.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <Bell className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-700">No notifications yet</h3>
            <p className="text-sm text-slate-400 mt-1">You'll be notified about test invites, interview schedules, and results.</p>
          </div>
        )}

        {/* Notification list */}
        <div className="space-y-2">
          {notifications.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.03 }}
              className={`bg-white border rounded-xl px-4 py-4 flex items-start gap-3 transition-all hover:shadow-sm ${n.read ? 'border-slate-200 opacity-75' : 'border-indigo-200 ring-1 ring-indigo-100'}`}
            >
              {/* Unread dot */}
              <div className="mt-1 shrink-0">
                {n.read
                  ? <Circle className="w-2 h-2 text-slate-300 fill-slate-300" />
                  : <Circle className="w-2 h-2 text-indigo-500 fill-indigo-500" />
                }
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${n.read ? 'text-slate-600' : 'text-slate-900'}`}>{n.title}</p>
                <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                {(n.decisionReason || reasons[n.id]) && (
                  <p className="text-xs mt-1.5 text-slate-500 italic">
                    <span className="font-semibold text-slate-700">Reason:</span> {n.decisionReason || reasons[n.id]}
                  </p>
                )}
                {!n.decisionReason && n.applicationId && !reasons[n.id] && (
                  <button
                    className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 underline"
                    onClick={async () => {
                      try {
                        const res = await fetch(`${API_BASE_URL}/applications/${n.applicationId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.message);
                        setReasons(prev => ({ ...prev, [n.id]: json.data.application?.decisionReason || 'No reason provided' }));
                      } catch { setReasons(prev => ({ ...prev, [n.id]: 'Failed to load reason' })); }
                    }}
                  >Show reason</button>
                )}
                <p className="text-[11px] text-slate-400 mt-2">{new Date(n.createdAt).toLocaleString()}</p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5 shrink-0">
                {n.application && (n.application.cvUrl || n.application.student?.cvUrl) && (
                  <button onClick={() => viewCV(n.application.cvUrl || n.application.student?.cvUrl)} className="btn btn-ghost btn-sm text-xs">
                    CV
                  </button>
                )}
                <button onClick={() => markReadAndOpen(n)} className="btn btn-primary btn-sm text-xs">
                  <ExternalLink className="w-3 h-3" /> Open
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <CvPreviewModal preview={preview} onClose={() => setPreview(null)} />
      <Modal open={!!modal} title={modal?.title} message={modal?.text} type={modal?.type} onClose={() => setModal(null)} actions={[]} />
    </DashboardLayout>
  );
};

export default Notifications;
