import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield,
  Users,
  Building2,
  GraduationCap,
  FileText,
  Settings,
  BarChart3,
} from 'lucide-react';
import Navbar from '../../components/Navbar';
import { getCurrentUser } from '../../utils/auth';
import UsersTable from './UsersTable';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [activeTab, setActiveTab] = useState('students');
  const [tableData, setTableData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState([
    { label: 'Total Students', value: '0', icon: GraduationCap, color: 'from-red-500 to-red-600' },
    { label: 'Total Companies', value: '0', icon: Building2, color: 'from-red-600 to-red-700' },
    { label: 'Job Postings', value: '0', icon: FileText, color: 'from-green-500 to-green-600' },
    { label: 'Applications', value: '0', icon: BarChart3, color: 'from-orange-500 to-orange-600' }
  ]);

  const fetchData = async (query = '', page = 1) => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/dashboard/admin/${activeTab}?search=${query}&page=${page}&limit=10`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const jsonData = await response.json();
      if (response.ok) {
        console.log('Received data:', jsonData); // Debug log
        setTableData(jsonData);
      } else {
        console.error('Error fetching data:', jsonData.message);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch initial stats and check auth
  useEffect(() => {
    if (!user || user.userType !== 'admin') {
      navigate('/');
      return;
    }

    const fetchStats = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/dashboard/admin/stats', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (!response.ok) throw new Error('Failed to fetch stats');

        const data = await response.json();

        setStats([
          { label: 'Total Students', value: data.data.totalStudents.toString(), icon: GraduationCap, color: 'from-red-500 to-red-600' },
          { label: 'Total Companies', value: data.data.totalCompanies.toString(), icon: Building2, color: 'from-red-600 to-red-700' },
          { label: 'Job Postings', value: data.data.totalJobs.toString(), icon: FileText, color: 'from-green-500 to-green-600' },
          { label: 'Applications', value: data.data.totalApplications.toString(), icon: BarChart3, color: 'from-orange-500 to-orange-600' }
        ]);
      } catch (error) {
        console.error('Failed to fetch admin stats:', error);
      }
    };

    fetchStats();
  }, [user, navigate]);

  // Fetch table data when tab changes
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  if (!user || user.userType !== 'admin') {
    return null;
  }

  const quickActions = [
    { label: 'Manage Students', icon: GraduationCap, color: 'from-red-500 to-red-600' },
    { label: 'Manage Companies', icon: Building2, color: 'from-red-600 to-red-700' },
    { label: 'View Reports', icon: BarChart3, color: 'from-green-500 to-green-600' },
    { label: 'Settings', icon: Settings, color: 'from-gray-500 to-gray-600' },
  ];

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
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                Admin Dashboard
              </h1>
              <p className="text-gray-600">Welcome back, {user.name || user.username}!</p>
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
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                className="p-6 border-2 border-gray-200 rounded-xl hover:border-red-500 hover:bg-red-50 transition-all text-left group"
              >
                <div className={`w-12 h-12 bg-gradient-to-br ${action.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-800">{action.label}</h3>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Users Table Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-xl shadow-lg p-8 border border-gray-200 mt-6"
        >
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={(e) => { e.preventDefault(); setActiveTab('students'); }}
              type="button"
              className={`py-4 px-6 text-sm font-medium ${activeTab === 'students'
                  ? 'text-red-600 border-b-2 border-red-600'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              Students
            </button>
            <button
              onClick={(e) => { e.preventDefault(); setActiveTab('companies'); }}
              type="button"
              className={`py-4 px-6 text-sm font-medium ${activeTab === 'companies'
                  ? 'text-red-600 border-b-2 border-red-600'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              Companies
            </button>
          </div>

          <UsersTable
            type={activeTab}
            data={tableData}
            onSearch={fetchData}
            loading={loading}
          />
        </motion.div>
      </div>
    </div>
  );
};

export default AdminDashboard;

