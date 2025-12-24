import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  FileSearch,
  Code2,
  Video,
  Users,
  ShieldCheck,
  GraduationCap,
  Building2,
  UserCog,
  ArrowRight,
  Mail,
  Phone,
  Github,
  Linkedin
} from "lucide-react";

import AdminLoginModal from "../components/AdminLoginModal";
import StudentLoginModal from "../components/StudentLoginModal";
import CompanyLoginModal from "../components/CompanyLoginModal";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 }
};

const LandingPage = () => {
  const [adminOpen, setAdminOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);

  const homeRef = useRef(null);
  const loginRef = useRef(null);

  const scrollTo = (ref) => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#080B14] text-white overflow-x-hidden">

      {/* ================= NAVBAR ================= */}
      <header className="fixed top-0 left-0 w-full z-50 bg-black/60 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1
            className="text-xl font-bold cursor-pointer"
            onClick={() => scrollTo(homeRef)}
          >
            IntelliPlace
          </h1>

          <nav className="flex gap-8 text-sm text-gray-300">
            {["Home", "Student", "Company", "Admin"].map((item) => (
              <button
                key={item}
                onClick={() => scrollTo(item === "Home" ? homeRef : loginRef)}
                className="hover:text-white transition"
              >
                {item}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section
        ref={homeRef}
        className="relative min-h-screen flex items-center px-6 pt-24 overflow-hidden"
      >
        {/* Background Image */}
        <img
          src="/image.png"
          alt="Corporate buildings"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />

        {/* Overlays */}
        <div className="absolute inset-0 bg-black/60 z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10" />

        {/* Left-aligned content */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.9 }}
          className="relative z-20 max-w-4xl mx-auto md:mx-0 md:ml-24"
        >
          <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-white/10 text-gray-200 text-sm backdrop-blur">
            Campus Recruitment Platform
          </span>

          <h1 className="text-5xl md:text-6xl font-bold leading-tight">
            Smarter Campus Hiring <br />
            <span className="text-gray-300">
              Built for Modern Institutions
            </span>
          </h1>

          <p className="mt-6 text-gray-300 text-lg max-w-xl">
            IntelliPlace automates CV screening, aptitude tests, coding rounds,
            virtual group discussions, and interviews — delivering structured,
            fair, and scalable campus recruitment.
          </p>

          <button
            onClick={() => scrollTo(loginRef)}
            className="mt-8 px-7 py-3 rounded-xl bg-white text-black font-semibold flex items-center gap-2 hover:bg-gray-200 transition"
          >
            Get Started <ArrowRight size={18} />
          </button>
        </motion.div>
      </section>

      {/* ================= PIPELINE ================= */}
      <section className="py-28 px-6 max-w-6xl mx-auto">
        <h3 className="text-3xl font-bold text-center mb-16">
          End-to-End Hiring Workflow
        </h3>

        <div className="grid md:grid-cols-5 gap-6">
          {[
            { icon: FileSearch, title: "CV Screening", desc: "Automated resume shortlisting" },
            { icon: Code2, title: "Aptitude & Coding", desc: "Online tests & evaluations" },
            { icon: Users, title: "Virtual GD", desc: "Remote group discussions" },
            { icon: Video, title: "Interviews", desc: "Structured interview rounds" },
            { icon: ShieldCheck, title: "Final Selection", desc: "Fair & transparent scoring" }
          ].map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={i}
                whileHover={{ y: -10 }}
                className="glass-card rounded-2xl p-6 text-center"
              >
                <div className="mx-auto mb-4 w-14 h-14 flex items-center justify-center rounded-xl bg-white/10">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h4 className="font-semibold mb-2">{step.title}</h4>
                <p className="text-gray-400 text-sm">{step.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ================= LOGIN SECTION ================= */}
      <section ref={loginRef} className="py-28 px-6 max-w-6xl mx-auto">
        <h3 className="text-3xl font-bold text-center mb-16">
          Login to IntelliPlace
        </h3>

        <div className="grid md:grid-cols-3 gap-8">
          <LoginCard icon={GraduationCap} title="Student" desc="Participate in tests, GDs, interviews & track progress." onClick={() => setStudentOpen(true)} />
          <LoginCard icon={Building2} title="Company" desc="Manage hiring drives & candidate insights." onClick={() => setCompanyOpen(true)} />
          <LoginCard icon={UserCog} title="Admin" desc="Control recruitment workflow & analytics." onClick={() => setAdminOpen(true)} />
        </div>
      </section>

      {/* ================= FOOTER ================= */}
{/* ================= FOOTER ================= */}
<footer className="bg-black border-t border-white/10">
  <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-4 gap-10 text-gray-400">

    {/* Brand */}
    <div>
      <h4 className="text-white font-semibold mb-3">IntelliPlace</h4>
      <p className="text-sm leading-relaxed">
        An AI-driven campus recruitment platform that automates hiring
        workflows — from CV screening to final selection.
      </p>
    </div>

    {/* Platform */}
    <div>
      <h4 className="text-white font-semibold mb-4">Platform</h4>
      <ul className="space-y-2 text-sm">
        <li>AI CV Screening</li>
        <li>Aptitude & Coding Tests</li>
        <li>Virtual Group Discussions</li>
        <li>Interview Management</li>
        <li>Candidate Analytics</li>
      </ul>
    </div>

    {/* Contact (CLICKABLE) */}
    <div>
      <h4 className="text-white font-semibold mb-4">Contact</h4>
      <ul className="space-y-3 text-sm">
        <li>
          <a
            href="mailto:intelliplacecsb@gmail.com"
            className="flex items-center gap-2 hover:text-white transition"
          >
            <Mail size={16} /> intelliplacecsb@gmail.com
          </a>
        </li>
        <li>
          <a
            href="tel:+919645256211"
            className="flex items-center gap-2 hover:text-white transition"
          >
            <Phone size={16} /> +91 96452 56211
          </a>
        </li>
      </ul>
    </div>

    {/* Connect (CLICKABLE) */}
    <div>
      <h4 className="text-white font-semibold mb-4">Connect</h4>
      <div className="flex flex-col gap-3 text-sm">
        <a
          href="https://github.com/Rashisha14/IntelliPlace"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:text-white transition"
        >
          <Github size={18} /> GitHub
        </a>
        <a
          href="https://www.linkedin.com/in/mohammed-rashidm/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:text-white transition"
        >
          <Linkedin size={18} /> LinkedIn
        </a>
      </div>
    </div>

  </div>

  {/* Bottom bar */}
  <div className="text-center text-sm text-gray-500 py-4 border-t border-white/5">
    © 2025 IntelliPlace • Secure • Scalable • Built for Institutions
  </div>
</footer>



      {/* ================= MODALS ================= */}
      <AdminLoginModal isOpen={adminOpen} onClose={() => setAdminOpen(false)} />
      <StudentLoginModal isOpen={studentOpen} onClose={() => setStudentOpen(false)} />
      <CompanyLoginModal isOpen={companyOpen} onClose={() => setCompanyOpen(false)} />

      {/* ================= EXTRA CSS ================= */}
      <style jsx>{`
        .glass-card {
          background: linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.15);
          transition: all 0.3s ease;
        }
        .glass-card:hover {
          border-color: rgba(255,255,255,0.35);
          transform: translateY(-10px);
        }
      `}</style>
    </div>
  );
};

const LoginCard = ({ icon: Icon, title, desc, onClick }) => (
  <motion.div whileHover={{ y: -10 }} className="glass-card rounded-2xl p-8 text-center">
    <div className="mx-auto mb-4 w-14 h-14 flex items-center justify-center rounded-xl bg-white/10">
      <Icon className="w-7 h-7 text-white" />
    </div>
    <h4 className="text-xl font-semibold mb-2">{title}</h4>
    <p className="text-gray-400 mb-6">{desc}</p>
    <button onClick={onClick} className="px-6 py-2.5 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 transition">
      Login
    </button>
  </motion.div>
);

export default LandingPage;
