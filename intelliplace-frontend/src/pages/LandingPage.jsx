import { useState } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Building2, Shield, Sparkles, ArrowRight, Users, Target, Zap, Star, CheckCircle } from 'lucide-react';
import AdminLoginModal from '../components/AdminLoginModal';
import StudentLoginModal from '../components/StudentLoginModal';
import CompanyLoginModal from '../components/CompanyLoginModal';

const LandingPage = () => {
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const cardVariants = {
    hidden: { 
      opacity: 0, 
      y: 40,
      scale: 0.95
    },
    visible: { 
      opacity: 1, 
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 120,
        damping: 20
      }
    },
    hover: { 
      scale: 1.03, 
      y: -8,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 25
      }
    }
  };

  const features = [
    { icon: Target, text: "AI-Powered Job Matching", desc: "Smart algorithms match students with perfect opportunities" },
    { icon: Users, text: "Seamless Collaboration", desc: "Easy communication between students and companies" },
    { icon: Zap, text: "Real-time Updates", desc: "Instant notifications for applications and status" },
    { icon: Sparkles, text: "Advanced Analytics", desc: "Detailed insights for better placement decisions" }
  ];

  const stats = [
    { number: "95%", label: "Placement Rate" },
    { number: "500+", label: "Companies" },
    { number: "10K+", label: "Students Placed" },
    { number: "24/7", label: "Support" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900 relative overflow-hidden">
      {/* Enhanced Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl"></div>
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,black,transparent)]"></div>
      </div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8">
        
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12 max-w-4xl mx-auto"
        >
          {/* Logo */}
          <motion.div
            animate={{ 
              rotate: [0, 3, -3, 0],
              scale: [1, 1.05, 1]
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity, 
              repeatDelay: 4 
            }}
            className="inline-flex items-center justify-center mb-6"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl blur-md opacity-60"></div>
              <div className="relative bg-gradient-to-br from-blue-600 to-cyan-600 p-4 rounded-2xl shadow-2xl border border-blue-400/30">
                <GraduationCap className="w-8 h-8 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.h1 
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className="bg-gradient-to-r from-white via-blue-100 to-cyan-200 bg-clip-text text-transparent">
              IntelliPlace
            </span>
          </motion.h1>

          <motion.p 
            className="text-xl md:text-2xl text-blue-100 mb-4 font-light"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            Smart Campus Placement Platform
          </motion.p>

          <motion.p 
            className="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            Connect talented students with top companies through our intelligent, AI-driven placement ecosystem designed for modern career development.
          </motion.p>

          {/* Stats */}
          <motion.div 
            className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-white mb-1">{stat.number}</div>
                <div className="text-sm text-gray-400">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Login Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid md:grid-cols-3 gap-6 max-w-5xl w-full mb-16"
        >
          {/* Student Card - Blue Theme */}
          <motion.div
            variants={cardVariants}
            whileHover="hover"
            onHoverStart={() => setHoveredCard('student')}
            onHoverEnd={() => setHoveredCard(null)}
            className="relative group cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-3xl blur-lg opacity-60 group-hover:opacity-80 transition-opacity"></div>
            <div className="relative bg-gray-800/60 backdrop-blur-xl rounded-3xl p-8 border border-blue-500/20 shadow-2xl h-full flex flex-col">
              <div className={`mb-6 transition-transform duration-300 ${hoveredCard === 'student' ? 'scale-110' : ''}`}>
                <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-4 rounded-2xl w-16 h-16 flex items-center justify-center shadow-lg">
                  <GraduationCap className="w-8 h-8 text-white" />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-white mb-3">Student</h3>
              <p className="text-gray-300 mb-6 leading-relaxed flex-grow">
                Access personalized job recommendations, track applications, and connect with top companies through our intelligent matching system.
              </p>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStudentModalOpen(true)}
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-3"
              >
                <span>Student Login</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>

          {/* Company Card - Emerald Theme */}
          <motion.div
            variants={cardVariants}
            whileHover="hover"
            onHoverStart={() => setHoveredCard('company')}
            onHoverEnd={() => setHoveredCard(null)}
            className="relative group cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-green-500/20 rounded-3xl blur-lg opacity-60 group-hover:opacity-80 transition-opacity"></div>
            <div className="relative bg-gray-800/60 backdrop-blur-xl rounded-3xl p-8 border border-emerald-500/20 shadow-2xl h-full flex flex-col">
              <div className={`mb-6 transition-transform duration-300 ${hoveredCard === 'company' ? 'scale-110' : ''}`}>
                <div className="bg-gradient-to-br from-emerald-500 to-green-500 p-4 rounded-2xl w-16 h-16 flex items-center justify-center shadow-lg">
                  <Building2 className="w-8 h-8 text-white" />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-white mb-3">Company</h3>
              <p className="text-gray-300 mb-6 leading-relaxed flex-grow">
                Post job opportunities, manage applications, and discover perfect candidates with our advanced talent matching platform.
              </p>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setCompanyModalOpen(true)}
                className="w-full bg-gradient-to-r from-emerald-500 to-green-500 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 flex items-center justify-center gap-3"
              >
                <span>Company Login</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>

          {/* Admin Card - Violet Theme */}
          <motion.div
            variants={cardVariants}
            whileHover="hover"
            onHoverStart={() => setHoveredCard('admin')}
            onHoverEnd={() => setHoveredCard(null)}
            className="relative group cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 to-purple-500/20 rounded-3xl blur-lg opacity-60 group-hover:opacity-80 transition-opacity"></div>
            <div className="relative bg-gray-800/60 backdrop-blur-xl rounded-3xl p-8 border border-violet-500/20 shadow-2xl h-full flex flex-col">
              <div className={`mb-6 transition-transform duration-300 ${hoveredCard === 'admin' ? 'scale-110' : ''}`}>
                <div className="bg-gradient-to-br from-violet-500 to-purple-500 p-4 rounded-2xl w-16 h-16 flex items-center justify-center shadow-lg">
                  <Shield className="w-8 h-8 text-white" />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-white mb-3">Admin</h3>
              <p className="text-gray-300 mb-6 leading-relaxed flex-grow">
                Manage platform operations, oversee placement activities, and ensure smooth coordination between all stakeholders.
              </p>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setAdminModalOpen(true)}
                className="w-full bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-violet-500/25 transition-all duration-300 flex items-center justify-center gap-3"
              >
                <span>Admin Login</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>

        {/* Features Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="max-w-4xl mx-auto text-center"
        >
          <h2 className="text-3xl font-bold text-white mb-12">Why Choose IntelliPlace?</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + index * 0.1 }}
                  className="bg-gray-800/40 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50 hover:border-blue-500/30 transition-all duration-300"
                >
                  <div className="bg-blue-500/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4 mx-auto">
                    <Icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.text}</h3>
                  <p className="text-gray-400 text-sm">{feature.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center mt-16 pt-8 border-t border-gray-800/50 max-w-2xl mx-auto"
        >
          <p className="text-gray-500 text-sm">
            © 2024 IntelliPlace. All rights reserved. | Secure • Reliable • Modern
          </p>
        </motion.div>
      </div>

      {/* Modals */}
      <AdminLoginModal
        isOpen={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
      />
      <StudentLoginModal
        isOpen={studentModalOpen}
        onClose={() => setStudentModalOpen(false)}
      />
      <CompanyLoginModal
        isOpen={companyModalOpen}
        onClose={() => setCompanyModalOpen(false)}
      />
    </div>
  );
};

export default LandingPage;