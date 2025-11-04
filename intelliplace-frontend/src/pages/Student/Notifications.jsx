import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { getCurrentUser } from '../../utils/auth';

const Notifications = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reasons, setReasons] = useState({});

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.userType !== 'student') {
      navigate('/student/login');
      return;
    }

    const fetchNotifications = async () => {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:5000/api/notifications', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const json = await res.json();
        if (res.ok) setNotifications(json.data.notifications || []);
      } catch (err) {
        console.error(err);
      } finally { setLoading(false); }
    };

    fetchNotifications();
  }, [navigate]);

  const markReadAndOpen = async (notif) => {
    try {
      const res = await fetch(`http://localhost:5000/api/notifications/${notif.id}/open`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to open notification');

      // Update UI: mark as read
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));

      const payload = json.data || {};
      if (payload.application) {
        navigate(`/student/applications/${payload.application.id}`);
        return;
      }
      if (payload.job) {
        navigate(`/jobs/${payload.job.id}`);
        return;
      }

      // Fallback
      navigate('/student/applications');
    } catch (err) {
      console.error('Failed to open notification', err);
      // fallback behavior
      try { setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n)); } catch(e){}
      if (notif.applicationId) navigate(`/student/applications/${notif.applicationId}`);
      else if (notif.jobId) navigate(`/jobs/${notif.jobId}`);
      else navigate('/student/applications');
    }
  };

  if (!user || user.userType !== 'student') return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Notifications</h1>
          <div>
            <button
              onClick={async () => {
                if (!notifications || notifications.length === 0) return;
                const hasUnread = notifications.some(n => !n.read);
                if (!hasUnread) return;
                try {
                  setLoading(true);
                  const res = await fetch('http://localhost:5000/api/notifications/mark-all-read', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.message || 'Failed to mark all read');
                  setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                } catch (err) {
                  console.error('Failed to mark all read', err);
                } finally {
                  setLoading(false);
                }
              }}
              className="px-3 py-1 text-sm rounded-md bg-gray-100 border hover:bg-gray-200"
            >
              Mark all read
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center">Loading...</div>
        ) : (
          <div className="space-y-3">
            {notifications.length === 0 && (
              <div className="p-6 bg-white rounded-lg shadow border">No notifications</div>
            )}

            {notifications.map(n => (
              <div key={n.id} className={`p-4 rounded-lg border bg-white flex items-start justify-between ${n.read ? 'opacity-70' : ''}`}>
                <div>
                  <div className="font-semibold text-gray-800">{n.title}</div>
                  <div className="text-sm text-gray-600 mt-1">{n.message}</div>
                  {/* show decision reason when available */}
                  { (n.decisionReason || reasons[n.id]) && (
                    <div className={`mt-2 text-sm italic ${((n.decisionReason || reasons[n.id])||'').toLowerCase().includes('reject') ? 'text-red-700' : 'text-gray-700'}`}>Reason: {n.decisionReason || reasons[n.id]}</div>
                  ) }
                  { !n.decisionReason && n.applicationId && !reasons[n.id] && (
                    <div className="mt-2">
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`http://localhost:5000/api/applications/${n.applicationId}`, {
                              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                            });
                            const json = await res.json();
                            if (!res.ok) throw new Error(json.message || 'Failed to fetch application');
                            const app = json.data.application;
                            setReasons(prev => ({ ...prev, [n.id]: app?.decisionReason || 'No reason provided' }));
                          } catch (err) {
                            console.error('Failed to fetch application reason', err);
                            setReasons(prev => ({ ...prev, [n.id]: 'Failed to load reason' }));
                          }
                        }}
                        className="text-sm text-blue-600 underline"
                      >
                        Show reason
                      </button>
                    </div>
                  ) }
                  <div className="text-xs text-gray-400 mt-2">{new Date(n.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex flex-col items-end ml-4">
                  <button
                    onClick={() => markReadAndOpen(n)}
                    className="px-3 py-1 bg-red-600 text-white rounded-md text-sm"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
