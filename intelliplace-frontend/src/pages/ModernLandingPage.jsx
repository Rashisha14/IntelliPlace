import { useState, useRef } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
    Sparkles,
    Rocket,
    ShieldCheck,
    Users,
    BrainCircuit,
    LayoutDashboard,
    ArrowRight,
    GraduationCap,
    Building2,
    Lock,
    ChevronRight,
    Github,
    Linkedin,
    Mail,
    Phone,
    Video
} from "lucide-react";

import AdminLoginModal from "../components/AdminLoginModal";
import StudentLoginModal from "../components/StudentLoginModal";
import CompanyLoginModal from "../components/CompanyLoginModal";

const ModernLandingPage = () => {
    const [adminOpen, setAdminOpen] = useState(false);
    const [studentOpen, setStudentOpen] = useState(false);
    const [companyOpen, setCompanyOpen] = useState(false);
    const [signupOpen, setSignupOpen] = useState(false); // Modal state

    const navigate = useNavigate();

    const containerRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"],
    });

    const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);

    return (
        <div ref={containerRef} className="min-h-screen bg-[#030712] text-white overflow-x-hidden selection:bg-indigo-500/30">

            {/* Background Gradients */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px] animate-blob" />
                <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px] animate-blob animation-delay-2000" />
                <div className="absolute bottom-[-10%] left-[20%] w-[30%] h-[30%] bg-violet-900/20 rounded-full blur-[100px] animate-blob animation-delay-4000" />
            </div>

            {/* Navbar */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#030712]/60 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-lg tracking-tight">IntelliPlace</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
                        <a href="#features" className="hover:text-white transition-colors">Features</a>
                        <a href="#solutions" className="hover:text-white transition-colors">Solutions</a>
                        <a href="#contact" className="hover:text-white transition-colors">Contact</a>
                    </div>

                    <button
                        onClick={() => setSignupOpen(true)}
                        className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-lg shadow-indigo-500/20"
                    >
                        Sign Up
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative z-10 pt-32 pb-20 px-6">
                <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-6">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                            </span>
                            AI-Powered Campus Recruitment
                        </div>

                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
                            The Future of <br />
                            <span className="text-gradient">Campus Hiring</span>
                        </h1>

                        <p className="text-lg text-gray-400 mb-8 max-w-lg leading-relaxed">
                            Streamline your entire recruitment lifecycle with AI-driven screening,
                            automated assessments, and seamless interview management.
                        </p>

                        <div className="flex flex-wrap gap-4">
                            <button
                                onClick={() => setCompanyOpen(true)}
                                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2"
                            >
                                Hire Talent <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setStudentOpen(true)}
                                className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-semibold transition-all backdrop-blur-sm"
                            >
                                Find Jobs
                            </button>
                        </div>
                    </motion.div>

                    <motion.div
                        style={{ y }}
                        className="relative hidden lg:block"
                    >
                        <div className="relative z-10 grid grid-cols-2 gap-4">
                            <StatCard icon={Users} label="Active Students" value="10k+" delay={0} />
                            <StatCard icon={Building2} label="Partner Companies" value="500+" delay={0.1} />
                            <StatCard icon={BrainCircuit} label="AI Assessments" value="50k+" delay={0.2} />
                            <StatCard icon={ShieldCheck} label="Placement Rate" value="94%" delay={0.3} />
                        </div>
                        {/* Decorative elements behind cards */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-indigo-500/10 to-transparent rounded-full blur-3xl -z-10" />
                    </motion.div>
                </div>
            </section>

            {/* Role Selection (Login) */}
            <section className="relative z-10 py-24 px-6 border-y border-white/5 bg-[#030712]/50">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">Choose Your Portal</h2>
                        <p className="text-gray-400">Access tailored tools for every stakeholder in the recruitment ecosystem.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        <RoleCard
                            title="Student"
                            desc="Build your profile, take assessments, and land your dream job."
                            icon={GraduationCap}
                            color="text-emerald-400"
                            bg="group-hover:bg-emerald-500/10"
                            onClick={() => setStudentOpen(true)}
                        />
                        <RoleCard
                            title="Company"
                            desc="Post jobs, screen candidates with AI, and manage interviews."
                            icon={Building2}
                            color="text-blue-400"
                            bg="group-hover:bg-blue-500/10"
                            onClick={() => setCompanyOpen(true)}
                        />
                        <RoleCard
                            title="Administrator"
                            desc="Oversee the entire placement process with detailed analytics."
                            icon={Lock}
                            color="text-purple-400"
                            bg="group-hover:bg-purple-500/10"
                            onClick={() => setAdminOpen(true)}
                        />
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section id="features" className="relative z-10 py-24 px-6">
                <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl font-bold mb-12">Why IntelliPlace?</h2>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <FeatureCard
                            icon={BrainCircuit}
                            title="AI Screening"
                            desc="Smart algorithms match the best candidates to the right roles instantly."
                        />
                        <FeatureCard
                            icon={Video}
                            title="Virtual GDs"
                            desc="Conduct group discussions remotely with automated behavioral analysis."
                        />
                        <FeatureCard
                            icon={LayoutDashboard}
                            title="Real-time Analytics"
                            desc="Track placement metrics and student performance with detailed dashboards."
                        />
                        <FeatureCard
                            icon={Rocket}
                            title="Instant Onboarding"
                            desc="Seamless registration and profile setup for all users."
                        />
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer id="contact" className="relative z-10 border-t border-white/5 bg-[#02050e] pt-16 pb-8 px-6">
                <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12 mb-12">
                    <div className="col-span-1 md:col-span-2">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-bold text-xl">IntelliPlace</span>
                        </div>
                        <p className="text-gray-400 max-w-sm mb-6">
                            Empowering institutions and companies to build the future workforce through intelligent technology.
                        </p>
                        <div className="flex gap-4">
                            <SocialLink href="https://github.com/Rashisha14/IntelliPlace" icon={Github} />
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-4 text-white">Contact</h4>
                        <div className="flex flex-col gap-3 text-sm text-gray-400">
                            <a href="mailto:intelliplacecsb@gmail.com" className="hover:text-white transition flex items-center gap-2">
                                <Mail size={14} /> intelliplacecsb@gmail.com
                            </a>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-4 text-white">Platform</h4>
                        <div className="flex flex-col gap-3 text-sm text-gray-400">
                            <a href="#" className="hover:text-white transition">Student Portal</a>
                            <a href="#" className="hover:text-white transition">Recruiter Dashboard</a>
                            <a href="#" className="hover:text-white transition">Admin Console</a>
                        </div>
                    </div>
                </div>
                <div className="text-center text-sm text-gray-600 border-t border-white/5 pt-8">
                    © {new Date().getFullYear()} IntelliPlace. All rights reserved.
                </div>
            </footer>

            {/* Modals */}
            <AdminLoginModal isOpen={adminOpen} onClose={() => setAdminOpen(false)} />
            <StudentLoginModal isOpen={studentOpen} onClose={() => setStudentOpen(false)} />
            <CompanyLoginModal isOpen={companyOpen} onClose={() => setCompanyOpen(false)} />

            <RoleSelectionModal isOpen={signupOpen} onClose={() => setSignupOpen(false)} />
        </div>
    );
};

const RoleSelectionModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm p-6 rounded-2xl bg-[#0f172a] border border-white/10 shadow-2xl relative"
            >
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    ✕
                </button>
                <h3 className="text-xl font-bold mb-6 text-center">Join IntelliPlace</h3>

                <div className="space-y-3">
                    <button
                        onClick={() => navigate('/student/register')}
                        className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-between group transition-all"
                    >
                        <span className="font-medium text-gray-200">Student</span>
                        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                    </button>

                    <button
                        onClick={() => navigate('/company/register')}
                        className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-between group transition-all"
                    >
                        <span className="font-medium text-gray-200">Recruiter</span>
                        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                    </button>

                    <button
                        onClick={() => { onClose(); }}
                        className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-between group transition-all"
                    >
                        <span className="font-medium text-gray-200">Admin</span>
                        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

// Sub-components
const StatCard = ({ icon: Icon, label, value, delay }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay, duration: 0.5 }}
        className="glass-panel p-6 rounded-2xl"
    >
        <div className="flex items-start justify-between mb-2">
            <div className="p-2 rounded-lg bg-white/5">
                <Icon className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                {value}
            </span>
        </div>
        <p className="text-sm text-gray-400">{label}</p>
    </motion.div>
);

const RoleCard = ({ title, desc, icon: Icon, color, bg, onClick }) => (
    <div
        onClick={onClick}
        className="group relative p-8 rounded-2xl glass-panel cursor-pointer transition-all hover:translate-y-[-4px]"
    >
        <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 transition-colors ${bg}`}>
            <Icon className={`w-6 h-6 transition-colors ${color}`} />
        </div>
        <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
            {title}
            <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-gray-500" />
        </h3>
        <p className="text-sm text-gray-400 leading-relaxed">
            {desc}
        </p>
    </div>
);

const FeatureCard = ({ icon: Icon, title, desc }) => (
    <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
        <Icon className="w-6 h-6 text-indigo-400 mb-4" />
        <h4 className="font-semibold mb-2">{title}</h4>
        <p className="text-sm text-gray-400">{desc}</p>
    </div>
);

const SocialLink = ({ href, icon: Icon }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
    >
        <Icon size={18} />
    </a>
);

export default ModernLandingPage;
