import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';

const Navbar = () => {
  const navigate = useNavigate();
  let user = null;
  try {
    const stored = localStorage.getItem('user');
    user = stored ? JSON.parse(stored) : null;
  } catch {
    user = null;
  }

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <nav className="glass-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2 group">
            <motion.div
              whileHover={{ rotate: 360 }}
              transition={{ duration: 0.6 }}
              className="bg-gradient-to-br from-red-500 to-red-700 p-2 rounded-lg"
            >
              <GraduationCap className="w-6 h-6 text-white" />
            </motion.div>
            <span className="text-xl font-bold text-gray-800 group-hover:text-red-600 transition-colors">
              IntelliPlace
            </span>
          </Link>

          <div className="flex items-center space-x-6">
            {user ? (
              <>
                <div className="flex items-center space-x-3 bg-white/50 px-4 py-2 rounded-full border border-gray-200/50 backdrop-blur-sm">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                    {user.name ? user.name.charAt(0).toUpperCase() : user.username?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-gray-700 text-sm font-semibold tracking-wide">
                    {user.name || user.username}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-5 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl transition-all duration-300 font-medium shadow-[0_4px_14px_0_rgba(239,68,68,0.39)] hover:shadow-[0_6px_20px_rgba(239,68,68,0.23)] hover:-translate-y-0.5 active:translate-y-0"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/"
                className="px-5 py-2 bg-white/50 backdrop-blur-sm border border-gray-200 hover:bg-white text-gray-800 rounded-xl transition-all font-medium hover:shadow-sm"
              >
                Home
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

