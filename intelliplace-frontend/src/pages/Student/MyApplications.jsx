import { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../../utils/auth';

const MyApplications = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.userType !== 'student') {
      navigate('/student/login');
      return;
    }

    const fetchApplications = async () => {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:5000/api/jobs/my-applications', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const json = await res.json();
        if (res.ok) setApplications(json.data.applications || []);
      } catch (err) {
        console.error(err);
      } finally { setLoading(false); }
    };

    fetchApplications();
  }, [navigate]);

  const viewCV = async (cvUrl) => {
    if (!cvUrl) return;
    // cvUrl is like /uploads/cvs/filename -> extract filename
    const parts = cvUrl.split('/');
    const filename = parts[parts.length - 1];

    try {
      const res = await fetch(`http://localhost:5000/api/jobs/cv/${filename}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.message || 'Failed to fetch CV');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error fetching CV', err);
      alert('Failed to open CV');
    }
  };

  if (!user || user.userType !== 'student') return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold mb-4">My Applications</h1>

        {loading ? (
          <div className="py-8 text-center">Loading...</div>
        ) : (
          <div className="space-y-4">
            {applications.length === 0 && (
              <div className="p-6 bg-white rounded-lg shadow border">You haven't applied to any jobs yet.</div>
            )}

            {applications.map(app => (
              <div key={app.id} className="p-4 bg-white rounded-lg border flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-900">{app.job?.title}</div>
                  <div className="text-sm text-gray-600">{app.job?.company?.companyName}</div>
                  <div className="mt-2 text-sm text-gray-700">Status: <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-sm font-medium ${
                    app.status && app.status.toLowerCase().includes('reject') ? 'bg-red-100 text-red-800 border border-red-200' :
                    app.status && (app.status.toLowerCase().includes('shortlist') || app.status.toLowerCase().includes('hire') || app.status.toLowerCase().includes('accept')) ? 'bg-green-100 text-green-800 border border-green-200' :
                    'bg-gray-100 text-gray-800'
                  }`}>{app.status}</span></div>
                  {app.decisionReason && (
                    <div className="mt-1 text-sm text-gray-600 italic">Reason: {app.decisionReason}</div>
                  )}
                  {app.cgpa !== null && <div className="text-sm text-gray-500">Applied CGPA: {app.cgpa}</div>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {app.cvUrl ? (
                    <button onClick={() => viewCV(app.cvUrl)} className="px-3 py-1 bg-red-600 text-white rounded-md text-sm">View CV</button>
                  ) : (
                    <div className="text-xs text-gray-500">No CV</div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/jobs/${app.jobId}`)} className="px-3 py-1 border rounded-md text-sm">Open Job</button>
                    <button onClick={() => navigate(`/student/applications/${app.id}`)} className="px-3 py-1 bg-gray-100 rounded-md text-sm">View Details</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyApplications;
