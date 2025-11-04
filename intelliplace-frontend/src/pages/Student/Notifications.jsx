import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { getCurrentUser } from '../../utils/auth';

const Notifications = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.userType !== 'student') {
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
  }, [user, navigate]);

  const markReadAndOpen = async (notif) => {
    try {
      // Mark as read
      await fetch(`http://localhost:5000/api/notifications/${notif.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // Optimistically update UI
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    } catch (err) {
      console.error('Failed to mark read', err);
    }

    // If notification has a jobId or applicationId, navigate directly
    if (notif.jobId) {
      navigate(`/jobs/${notif.jobId}`);
      return;
    }
    if (notif.applicationId) {
      // Navigate to My Applications for now; enhancement: open specific application detail
      navigate('/student/applications');
      return;
    }

    // Default fallback
    navigate('/student/applications');
  };

  if (!user || user.userType !== 'student') return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold mb-4">Notifications</h1>

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
