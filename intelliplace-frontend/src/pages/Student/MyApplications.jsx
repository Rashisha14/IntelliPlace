import { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import CvPreviewModal from '../../components/CvPreviewModal';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../../utils/auth';

const MyApplications = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

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
      setPreview({ url, name: filename });
    } catch (err) {
      console.error('Error fetching CV', err);
      alert('Failed to open CV');
    }
  };

  if (!user || user.userType !== 'student') return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold mb-4">My Applications</h1>

        {loading ? (
          <div className="py-8 text-center">Loading...</div>
        ) : (
          <div className="space-y-4">
            {applications.length === 0 && (
              <div className="p-6 bg-white rounded-lg shadow border text-center text-gray-600">
                You haven't applied to any jobs yet.
              </div>
            )}

            {applications.map(app => (
              <div key={app.id} className="p-6 bg-white rounded-lg border shadow-sm">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{app.job?.title}</h2>
                    <p className="text-sm text-gray-600">{app.job?.company?.companyName}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Applied On: {new Date(app.createdAt).toLocaleString()}
                    </p>
                    {app.cgpa !== null && (
                      <p className="text-sm text-gray-500">Applied CGPA: {app.cgpa}</p>
                    )}
                  </div>

                  <div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${
                      app.status && app.status.toLowerCase().includes('reject') ? 'bg-red-100 text-red-800 border border-red-200' :
                      app.status && (app.status.toLowerCase().includes('shortlist') || app.status.toLowerCase().includes('hire') || app.status.toLowerCase().includes('accept')) ? 'bg-green-100 text-green-800 border border-green-200' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {app.status}
                    </span>
                  </div>
                </div>

                {app.decisionReason && (
                  <div className="mt-2 text-sm italic text-gray-700">
                    <strong>Reason:</strong> {app.decisionReason}
                  </div>
                )}

                <div className="mt-4 flex gap-3 flex-wrap">
                  {app.cvUrl ? (
                    <button
                      onClick={() => viewCV(app.cvUrl)}
                      className="px-3 py-1 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                    >
                      View CV
                    </button>
                  ) : (
                    <span className="text-xs text-gray-500">No CV uploaded</span>
                  )}

                  <button
                    onClick={() => navigate(`/jobs/${app.jobId}`)}
                    className="px-3 py-1 border rounded-md text-sm hover:bg-gray-50"
                  >
                    Open Job
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CvPreviewModal
        preview={preview}
        onClose={() => {
          if (preview?.url) window.URL.revokeObjectURL(preview.url);
          setPreview(null);
        }}
      />
    </div>
  );
};

export default MyApplications;
