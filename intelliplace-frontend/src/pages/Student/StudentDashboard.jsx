import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  GraduationCap,
  Briefcase,
  FileText,
  Bell,
  TrendingUp,
} from 'lucide-react';
import Navbar from '../../components/Navbar';
import { getCurrentUser } from '../../utils/auth';
import JobList from '../../components/JobList';

const StudentDashboard = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [stats, setStats] = useState([
    { label: 'Applications Sent', value: '0', icon: FileText, color: 'from-red-500 to-red-600' },
    { label: 'Interviews', value: '0', icon: Briefcase, color: 'from-red-600 to-red-700' },
    { label: 'Offers', value: '0', icon: TrendingUp, color: 'from-green-500 to-green-600' },
    { label: 'Notifications', value: '0', icon: Bell, color: 'from-orange-500 to-orange-600' }
  ]);

  useEffect(() => {
    if (!user || user.userType !== 'student') {
      navigate('/student/login');
      return;
    }

    const fetchStats = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/dashboard/student/stats/${user.id}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });
        
        if (!response.ok) throw new Error('Failed to fetch stats');
        
        const data = await response.json();
        
        setStats([
          { label: 'Applications Sent', value: data.data.applicationsSent.toString(), icon: FileText, color: 'from-red-500 to-red-600' },
          { label: 'Interviews', value: data.data.interviews.toString(), icon: Briefcase, color: 'from-red-600 to-red-700' },
          { label: 'Offers', value: data.data.offers.toString(), icon: TrendingUp, color: 'from-green-500 to-green-600' },
          { label: 'Notifications', value: data.data.notifications.toString(), icon: Bell, color: 'from-orange-500 to-orange-600' }
        ]);
      } catch (error) {
        console.error('Failed to fetch student stats:', error);
      }
    };

    fetchStats();
  }, [user, navigate]);

  if (!user || user.userType !== 'student') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                Welcome back, {user.name || user.username}!
              </h1>
              <p className="text-gray-600">Student Dashboard</p>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.05 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-gray-800 mb-1">{stat.value}</h3>
              <p className="text-gray-600 text-sm">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-lg p-8 border border-gray-200"
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Quick Actions</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <button onClick={() => navigate('/')} className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-red-500 hover:bg-red-50 transition-all text-left">
              <FileText className="w-8 h-8 text-gray-400 mb-2" />
              <h3 className="font-semibold text-gray-800">Browse Jobs</h3>
              <p className="text-sm text-gray-600">Explore available opportunities</p>
            </button>
            <button onClick={() => navigate('/student/applications')} className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-red-600 hover:bg-red-50 transition-all text-left">
              <Briefcase className="w-8 h-8 text-gray-400 mb-2" />
              <h3 className="font-semibold text-gray-800">My Applications</h3>
              <p className="text-sm text-gray-600">View and track applications</p>
            </button>
            <button onClick={() => navigate('/student/notifications')} className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-left">
              <FileText className="w-8 h-8 text-gray-400 mb-2" />
              <h3 className="font-semibold text-gray-800">Notifications</h3>
              <p className="text-sm text-gray-600">View recent messages & updates</p>
            </button>
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-xl shadow-lg p-8 border border-gray-200 mt-6"
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Browse Jobs</h2>
          <JobList />
        </motion.div>
      </div>
    </div>
  );
};

export default StudentDashboard;

