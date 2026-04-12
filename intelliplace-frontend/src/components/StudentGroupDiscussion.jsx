import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Mic, Hand, Users, Clock, Loader2, Square } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { getCurrentUser } from '../utils/auth';
import Swal from 'sweetalert2';

export default function StudentGroupDiscussion({ isOpen, onClose, jobId, applicationId }) {
  const [gdState, setGdState] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimeoutRef = useRef(null);

  const user = getCurrentUser();

  useEffect(() => {
    if (!isOpen || !jobId) return;

    const backendUrl = API_BASE_URL.replace('/api', '');
    const newSocket = io(backendUrl, { withCredentials: true });

    newSocket.on('connect', () => {
      newSocket.emit('join_gd', { jobId, userId: user.id, role: 'student' });
    });

    newSocket.on('gd_state_update', (state) => {
      setGdState(state);
      setIsJoined(true);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      if (isSpeaking) stopRecording();
    };
  }, [isOpen, jobId]);

  // Handle Prep Countdown
  useEffect(() => {
    let timer;
    if (gdState?.status === 'PREP' && gdState.prepEndTime) {
      timer = setInterval(() => {
        const remaining = Math.max(0, Math.floor((gdState.prepEndTime - Date.now()) / 1000));
        setTimeLeft(remaining);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gdState?.status, gdState?.prepEndTime]);

  // Spacebar recording logic
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && gdState?.activeSpeaker?.studentId === user.id && !e.repeat && !isSpeaking) {
        e.preventDefault();
        startRecording();
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space' && isSpeaking) {
        e.preventDefault();
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gdState?.activeSpeaker, isSpeaking]);

  const requestToSpeak = () => {
    if (!socket) return;
    socket.emit('request_speak', { jobId, studentId: user.id, studentName: user.name });
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices) {
      Swal.fire({ icon: 'error', title: 'Microphone not supported on this browser' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = submitAudio;

      mediaRecorderRef.current.start();
      setIsSpeaking(true);

      // Safety timeout: 90 seconds
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
        }
      }, 90000);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Microphone Access Denied' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    setIsSpeaking(false);
    clearTimeout(recordingTimeoutRef.current);
  };

  const submitAudio = async () => {
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', blob, 'speech.webm');

    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/submit-speech`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Submission failed');
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Speech parsing failed', text: err.message });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-red-600 p-6 flex justify-between items-center text-white">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6" /> Group Discussion
            </h2>
            {gdState && <p className="opacity-90 mt-1">Topic: <strong>{gdState.topic}</strong></p>}
          </div>
          <button onClick={onClose} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded font-medium transition-colors">
            Exit
          </button>
        </div>

        {/* Content */}
        {!isJoined || !gdState ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
            <p className="text-gray-600 font-medium text-lg">Connecting to live group discussion...</p>
          </div>
        ) : gdState.status === 'CREATED' ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Waiting for company to start...
          </div>
        ) : gdState.status === 'PREP' ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-orange-50">
            <Clock className="w-20 h-20 text-orange-400 mb-6 animate-pulse" />
            <h3 className="text-3xl font-bold text-gray-800 mb-4">Preparation Time</h3>
            <p className="text-xl text-gray-600 mb-8">Gather your thoughts on: <strong>{gdState.topic}</strong></p>
            <div className="text-6xl font-mono text-orange-600 font-bold">
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
          </div>
        ) : gdState.status === 'ACTIVE' ? (
          <div className="flex-1 flex p-6 gap-6 bg-gray-50">
            
            {/* Main Stage */}
            <div className="flex-col flex flex-1">
              {gdState.activeSpeaker?.studentId === user.id ? (
                <div className={`flex-1 rounded-xl shadow-inner border-4 p-8 flex flex-col items-center justify-center transition-colors ${isSpeaking ? 'bg-red-50 border-red-500' : 'bg-green-50 border-green-500'}`}>
                  <h3 className="text-3xl font-bold text-gray-800 mb-2">It's Your Turn!</h3>
                  <p className="text-gray-600 mb-10 text-lg">Press and hold Spacebar, or hold the button below to speak.</p>
                  
                  <button 
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    className={`w-40 h-40 rounded-full flex flex-col items-center justify-center gap-3 transition-transform shadow-xl ${isSpeaking ? 'bg-red-600 scale-110 text-white shadow-red-200' : 'bg-green-600 hover:bg-green-700 text-white shadow-green-200 hover:scale-105'}`}
                  >
                    <Mic className={`w-16 h-16 ${isSpeaking ? 'animate-bounce' : ''}`} />
                    <span className="font-bold text-lg">{isSpeaking ? 'RECORDING' : 'HOLD TO SPEAK'}</span>
                  </button>
                  {isSpeaking && <p className="text-red-600 font-bold mt-8 animate-pulse text-xl">Speaking... max 90s</p>}
                </div>
              ) : (
                <div className="flex-1 rounded-xl bg-white shadow-sm border p-8 flex flex-col items-center justify-center">
                  {gdState.activeSpeaker ? (
                    <div className="text-center">
                      <div className="w-24 h-24 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-orange-200">
                        <span className="text-3xl font-bold">{gdState.activeSpeaker.name.charAt(0)}</span>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-800">{gdState.activeSpeaker.name}</h3>
                      <div className="mt-4 flex items-center justify-center gap-2 text-red-500 font-medium animate-pulse">
                        <Mic className="w-5 h-5" /> Speaking now
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500">
                      <MicOff className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-xl">No one is speaking</p>
                    </div>
                  )}
                  
                  {/* Request to Speak Button */}
                  <div className="mt-12 w-full pt-8 border-t border-gray-100 flex flex-col items-center">
                    <button 
                      onClick={requestToSpeak}
                      disabled={gdState.queue.some(q => q.studentId === user.id)}
                      className={`px-8 py-4 rounded-full font-bold text-lg shadow flex items-center gap-3 transition-colors ${gdState.queue.some(q => q.studentId === user.id) ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-lg'}`}
                    >
                      <Hand className="w-6 h-6" />
                      {gdState.queue.some(q => q.studentId === user.id) ? 'In Queue' : 'Request to Speak'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Queue */}
            <div className="w-64 bg-white rounded-xl shadow-sm border p-4 flex flex-col">
              <h4 className="font-bold border-b pb-3 mb-3 text-gray-700 flex items-center justify-between">
                Speaker Queue <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{gdState.queue.length}</span>
              </h4>
              <ul className="flex-1 overflow-auto space-y-2">
                {gdState.queue.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">Queue is empty</p>
                ) : gdState.queue.map((q, idx) => (
                  <li key={idx} className={`p-3 rounded-lg text-sm border flex items-center gap-3 ${q.studentId === user.id ? 'bg-blue-50 border-blue-200 text-blue-900 font-bold' : 'bg-gray-50 border-gray-100 text-gray-700'}`}>
                    <span className="opacity-50 font-mono">#{idx + 1}</span>
                    {q.name} {q.studentId === user.id && '(You)'}
                  </li>
                ))}
              </ul>
            </div>
            
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
            <Square className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-2xl font-bold text-gray-700 mb-2">Discussion Ended</h3>
            <p className="text-gray-500">The group discussion has been concluded by the company.</p>
          </div>
        )}
      </div>
    </div>
  );
}
