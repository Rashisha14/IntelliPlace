import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Mic, MicOff, Hand, Users, Clock, Loader2, Square } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { getCurrentUser } from '../utils/auth';
import Swal from 'sweetalert2';

export default function StudentGroupDiscussion({ isOpen, onClose, jobId, applicationId }) {
  const [gdState, setGdState] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [transcripts, setTranscripts] = useState([]);

  const recognitionRef = useRef(null);
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

    newSocket.on('gd_speaker_transcript', (data) => {
      setTranscripts(prev => [...prev, data]);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      if (isSpeaking) stopRecording();
    };
  }, [isOpen, jobId]);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    if (gdState?.status === 'PAUSED' || gdState?.status === 'COMPLETED') {
      if (isSpeaking) {
        stopRecording();
      }
      setIsSpeaking(false);
      clearTimeout(recordingTimeoutRef.current);
    }
  }, [gdState?.status]);

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
      if (e.code === 'Space' && gdState?.activeSpeaker?.studentId === user.id && !e.repeat && !isSpeaking && !isTranscribing) {
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
  }, [gdState?.activeSpeaker, isSpeaking, isTranscribing]);

  const requestToSpeak = () => {
    if (!socket) return;
    socket.emit('request_speak', { jobId, studentId: user.id, studentName: user.name });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'speech.webm');
          
          const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/transcribe-audio`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
          });
          
          const data = await res.json();
          if (data.success) {
            setLiveTranscript(data.text);
          } else {
            Swal.fire('Transcription Error', data.message, 'error');
          }
        } catch (err) {
          console.error(err);
          Swal.fire('Network Error', 'Could not transcribe audio', 'error');
        } finally {
          setIsTranscribing(false);
          setIsReviewing(true);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsSpeaking(true);
      setLiveTranscript('');
      setIsReviewing(false);

      // Safety timeout: 90 seconds
      recordingTimeoutRef.current = setTimeout(() => {
        if (isSpeaking) {
          stopRecording();
        }
      }, 90000);
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'warning', title: 'Mic Blocked', text: 'Browser microphone access is blocked. Switching to manual text mode.' });
      setIsReviewing(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    setIsSpeaking(false);
    clearTimeout(recordingTimeoutRef.current);
  };

  const submitSpeechText = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/submit-speech`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ text: liveTranscript }),
      });
      if (!res.ok) throw new Error('Submission failed');
      
      setIsReviewing(false);
      setLiveTranscript('');
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Speech submission failed', text: err.message });
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
        ) : gdState.status === 'PAUSED' ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-yellow-50">
            <Clock className="w-20 h-20 text-yellow-500 mb-6 animate-pulse" />
            <h3 className="text-3xl font-bold text-gray-800 mb-4">Discussion Paused</h3>
            <p className="text-xl text-gray-600">The company has temporarily paused the discussion.</p>
            <p className="text-lg text-gray-500 mt-2">Please wait for them to resume.</p>
          </div>
        ) : gdState.status === 'ACTIVE' ? (
          <div className="flex-1 flex p-6 gap-6 bg-gray-50 min-h-0 overflow-hidden">
            
            {/* Main Stage */}
            <div className="flex-col flex flex-1 min-h-0 overflow-y-auto pr-2">
              {gdState.activeSpeaker?.studentId === user.id ? (
                <div className={`flex-1 rounded-xl shadow-inner border-4 p-8 flex flex-col items-center justify-center transition-colors ${isSpeaking ? 'bg-red-50 border-red-500' : isReviewing ? 'bg-blue-50 border-blue-500' : 'bg-green-50 border-green-500'}`}>
                  {!isReviewing ? (
                    <>
                      <h3 className="text-3xl font-bold text-gray-800 mb-2">It's Your Turn!</h3>
                      <p className="text-gray-600 mb-6 text-lg">Press and hold Spacebar, or hold the button below to speak.</p>
                      
                      <div className="w-full max-w-md h-32 bg-white rounded shadow-inner p-4 overflow-auto border text-gray-700 italic mb-6">
                        {isTranscribing ? (
                          <div className="flex flex-col items-center justify-center h-full text-blue-600">
                            <Loader2 className="w-6 h-6 animate-spin mb-2" />
                            <span>Transcribing audio with Deepgram...</span>
                          </div>
                        ) : (
                          liveTranscript || (isSpeaking ? 'Recording... release to transcribe' : 'Your words will appear here...')
                        )}
                      </div>

                      <button 
                        onMouseDown={!isTranscribing ? startRecording : undefined}
                        onMouseUp={!isTranscribing ? stopRecording : undefined}
                        onTouchStart={!isTranscribing ? startRecording : undefined}
                        onTouchEnd={!isTranscribing ? stopRecording : undefined}
                        disabled={isTranscribing}
                        className={`w-32 h-32 rounded-full flex flex-col items-center justify-center gap-3 transition-transform shadow-xl ${isTranscribing ? 'bg-gray-400 cursor-not-allowed text-white' : isSpeaking ? 'bg-red-600 scale-110 text-white shadow-red-200' : 'bg-green-600 hover:bg-green-700 text-white shadow-green-200 hover:scale-105'}`}
                      >
                        <Mic className={`w-12 h-12 ${isSpeaking ? 'animate-bounce' : ''}`} />
                        <span className="font-bold text-sm">{isTranscribing ? 'WAIT' : isSpeaking ? 'RECORDING' : 'HOLD TO SPEAK'}</span>
                      </button>
                      {isSpeaking && <p className="text-red-600 font-bold mt-4 animate-pulse">Speaking... max 90s</p>}
                    </>
                  ) : (
                    <>
                       <h3 className="text-2xl font-bold text-blue-900 mb-4">Review Your Submission</h3>
                       <textarea 
                          className="w-full max-w-lg h-40 bg-white border border-blue-300 rounded p-4 mb-6 shadow-inner text-gray-800 font-medium"
                          value={liveTranscript}
                          onChange={(e) => setLiveTranscript(e.target.value)}
                       />
                       <div className="flex gap-4">
                         <button onClick={() => setIsReviewing(false)} className="px-6 py-3 bg-gray-400 text-white rounded font-bold hover:bg-gray-500">Discard & Re-Record</button>
                         <button onClick={submitSpeechText} className="px-8 py-3 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow-lg">Upload Response</button>
                       </div>
                    </>
                  )}
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

            {/* Sidebar Queue & Transcripts */}
            <div className="w-80 flex flex-col gap-4 min-h-0">
              
              {/* Queue */}
              <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col max-h-[40%] min-h-0">
                <h4 className="font-bold border-b pb-3 mb-3 text-gray-700 flex items-center justify-between">
                  Speaker Queue <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{gdState.queue.length}</span>
                </h4>
                <ul className="flex-1 overflow-y-auto min-h-0 space-y-2">
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

              {/* Transcripts */}
              <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col flex-1 min-h-0">
                <h4 className="font-bold border-b pb-3 mb-3 text-gray-700 flex items-center justify-between">
                  Discussion Transcript <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{transcripts.length} logs</span>
                </h4>
                <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-2">
                  {transcripts.map((t, idx) => (
                     <div key={idx} className="bg-gray-50 rounded p-3 text-sm border border-gray-100 shadow-sm">
                        <strong className={`block mb-1 ${t.studentId === user.id ? 'text-green-700' : 'text-indigo-700'}`}>{t.name} {t.studentId === user.id && '(You)'}</strong>
                        <p className="text-gray-700 leading-relaxed">{t.text || <em className="text-gray-400">Silent / No text transcribed</em>}</p>
                     </div>
                  ))}
                  {transcripts.length === 0 && <p className="text-gray-400 text-sm italic text-center mt-4">Transcripts will appear here as participants speak.</p>}
                </div>
              </div>

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
