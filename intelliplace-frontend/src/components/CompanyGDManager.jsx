import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Play, Square, Users, MessageSquare, Check, X, Clock, SkipForward } from 'lucide-react';
import { API_BASE_URL } from '../config';
import Swal from 'sweetalert2';

export default function CompanyGDManager({ jobId, initialGd, applications, token }) {
  const [gdState, setGdState] = useState(initialGd || null);
  const [socket, setSocket] = useState(null);
  const [transcripts, setTranscripts] = useState([]);
  
  // Create Form State
  const [topic, setTopic] = useState('');
  const [prepTime, setPrepTime] = useState(120); // 2 minutes

  // Countdown state
  const [timeLeft, setTimeLeft] = useState(0);

  // Evaluate State
  const [evaluations, setEvaluations] = useState({});

  useEffect(() => {
    if (!jobId || !token) return;

    // Connect socket
    const backendUrl = API_BASE_URL.replace('/api', '');
    const newSocket = io(backendUrl, {
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      newSocket.emit('join_gd', { jobId, userId: 'company', role: 'company' });
    });

    newSocket.on('gd_state_update', (state) => {
      setGdState(state);
    });

    newSocket.on('gd_speaker_transcript', (data) => {
      setTranscripts(prev => [...prev, data]);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [jobId, token]);

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

  const handleStartGD = async () => {
    if (!topic.trim()) {
      Swal.fire({ icon: 'error', title: 'Topic Required' });
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ topic, prepDuration: prepTime })
      });
      if (!res.ok) throw new Error('Failed to start GD');
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    }
  };

  const handleStopGD = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to stop GD');
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    }
  };

  const handlePauseGD = async () => {
    try {
      await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/pause`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleResumeGD = async () => {
    try {
      await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleNextSpeaker = async () => {
    try {
      await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/next-speaker`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const submitEvaluations = async () => {
    const payload = Object.entries(evaluations).map(([appId, status]) => ({
      applicationId: parseInt(appId),
      status
    }));

    if (payload.length === 0) return;

    try {
      const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/gd/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ evaluations: payload })
      });
      if (res.ok) {
        Swal.fire({ icon: 'success', title: 'Evaluations Saved' });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Evaluation failed' });
    }
  };

  if (!gdState || gdState.status === 'CREATED') {
    return (
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600"/> Setup Group Discussion</h3>
        <p className="text-gray-600 mb-4">Set a topic and prep time to initialize the live group discussion queue. Eligible students (Coding Passed) will see this once started.</p>
        
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium mb-1">Discussion Topic</label>
            <input 
              type="text" 
              className="w-full border rounded p-2" 
              placeholder="e.g., Impact of AI on Software Engineering" 
              value={topic} 
              onChange={e => setTopic(e.target.value)} 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Prep Time (Seconds)</label>
            <input 
              type="number" 
              className="w-full border rounded p-2" 
              value={prepTime} 
              onChange={e => setPrepTime(e.target.value)} 
            />
          </div>
          <button 
            onClick={handleStartGD}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            <Play className="w-4 h-4" /> Start GD Phase
          </button>
        </div>

        <div className="mt-8 border-t pt-6">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">Eligible ({applications?.length || 0})</h4>
          {applications && applications.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
               {applications.map(app => (
                  <div key={app.id} className="border p-3 rounded-lg bg-white shadow-sm flex flex-col justify-center">
                    <p className="font-semibold text-gray-800">{app.student?.name}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500 truncate mr-2">{app.student?.email}</span>
                      <span className="text-xs font-semibold px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full">{app.status}</span>
                    </div>
                  </div>
               ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm bg-gray-50 p-4 rounded text-center">No eligible candidates available at this stage.</p>
          )}
        </div>
      </div>
    );
  }

  if (gdState.status === 'PREP') {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center border border-yellow-200 bg-yellow-50">
        <h2 className="text-3xl font-bold text-yellow-800 mb-2">Preparation Phase</h2>
        <p className="text-xl text-gray-700 mb-6">Topic: <strong>{gdState.topic}</strong></p>
        <div className="text-6xl font-mono text-yellow-600 mb-6 flex justify-center items-center gap-4">
          <Clock className="w-12 h-12" />
          {mins}:{secs.toString().padStart(2, '0')}
        </div>
        <p className="text-gray-600 mb-6">Students are currently preparing. The discussion will transition to ACTIVE automatically when the timer reaches zero.</p>
        <button onClick={handleStopGD} className="inline-flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
          <Square className="w-4 h-4" /> Cancel GD
        </button>
      </div>
    );
  }

  if (gdState.status === 'ACTIVE' || gdState.status === 'PAUSED') {
    return (
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        {/* Header with big stop button */}
        <div className="flex justify-between items-center border-b pb-6 mb-6">
          <div>
            <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-3 mb-2">
              Group Discussion Phase
            </h3>
            <div className="flex items-center gap-3">
              {gdState.status === 'PAUSED' ? (
                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-bold flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-600 rounded-full"></div> PAUSED
                </span>
              ) : (
                <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-bold flex items-center gap-2 animate-pulse">
                  <div className="w-2 h-2 bg-red-600 rounded-full"></div> LIVE ACTIVE
                </span>
              )}
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                Topic: {gdState.topic}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {gdState.status === 'PAUSED' ? (
              <button 
                onClick={handleResumeGD} 
                className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-md font-bold text-lg hover:scale-105 transition-transform"
              >
                <Play className="w-5 h-5"/> Resume GD
              </button>
            ) : (
              <button 
                onClick={handlePauseGD} 
                className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 shadow-md font-bold text-lg hover:scale-105 transition-transform"
              >
                <Square className="w-5 h-5"/> Pause GD
              </button>
            )}
            <button 
              onClick={handleStopGD} 
              className="inline-flex items-center gap-2 px-8 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md font-bold text-lg hover:scale-105 transition-transform"
            >
              <Square className="w-5 h-5"/> End & Evaluate
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Active Speaker */}
          <div className="md:col-span-1 border rounded bg-indigo-50 p-4 flex flex-col justify-between">
            <div>
              <h4 className="font-semibold text-indigo-900 mb-2 border-b border-indigo-200 pb-2">Active Speaker</h4>
              {gdState.activeSpeaker ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-indigo-200 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl font-bold text-indigo-700">{gdState.activeSpeaker.name.charAt(0)}</span>
                  </div>
                  <p className="font-bold text-lg text-indigo-900">{gdState.activeSpeaker.name}</p>
                  <p className="text-sm text-indigo-600 animate-pulse mt-2">Speaking right now...</p>
                </div>
              ) : (
                <p className="text-gray-500 text-center italic py-10">Waiting for next speaker...</p>
              )}
            </div>
            {gdState.activeSpeaker && (
              <button onClick={handleNextSpeaker} className="mt-4 w-full bg-indigo-600 text-white px-3 py-2 rounded hover:bg-indigo-700 flex items-center justify-center gap-2">
                <SkipForward className="w-4 h-4" /> Next / Skip
              </button>
            )}
          </div>

          {/* Queue List */}
          <div className="md:col-span-1 border rounded p-4">
            <h4 className="font-semibold text-gray-800 mb-2 border-b pb-2">Speaker Queue</h4>
            {gdState.queue && gdState.queue.length > 0 ? (
              <ul className="space-y-2 max-h-[300px] overflow-auto">
                {gdState.queue.map((q, idx) => (
                  <li key={idx} className="flex items-center gap-3 bg-gray-50 p-2 rounded">
                    <span className="font-mono text-gray-400">#{idx + 1}</span>
                    <span className="font-medium text-gray-700">{q.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 italic text-center py-4">Queue is empty</p>
            )}
          </div>

          {/* Transcripts */}
          <div className="md:col-span-1 border rounded p-4 flex flex-col h-[350px]">
            <h4 className="font-semibold text-gray-800 mb-2 border-b pb-2">Audio Logs & Transcripts</h4>
            <div className="flex-1 overflow-auto space-y-3 pr-2">
              {transcripts.map((t, idx) => (
                 <div key={idx} className="bg-gray-50 rounded p-2 text-sm border border-gray-100">
                    <strong className="text-indigo-700 block mb-1">{t.name}</strong>
                    <p className="text-gray-700">{t.text || <em className="text-gray-400">Silent / No text transcribed</em>}</p>
                 </div>
              ))}
              {transcripts.length === 0 && <p className="text-gray-400 text-sm italic">Transcripts will appear here after each speaker releases their mic.</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gdState.status === 'COMPLETED') {
    return (
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h3 className="text-xl font-bold text-gray-800 mb-2 border-b pb-2">Group Discussion Completed</h3>
        <p className="text-gray-600 mb-6">Topic was: <strong>{gdState.topic}</strong></p>
        
        <h4 className="font-semibold mb-3">Evaluate Participants</h4>
        <p className="text-sm text-gray-500 mb-4">Mark candidates as Passed to allow them into the Interview stage.</p>
        
        <div className="space-y-3 max-h-[400px] overflow-auto mb-6">
          {applications.map(app => (
            <div key={app.id} className="flex items-center justify-between p-3 border rounded">
              <div>
                <p className="font-medium">{app.student?.name}</p>
                <p className="text-xs text-gray-500">Current Status: {app.status}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setEvaluations(prev => ({...prev, [app.id]: 'GD_PASSED'}))}
                  className={`px-3 py-1 rounded text-sm font-medium flex items-center gap-1 transition-colors ${
                    evaluations[app.id] === 'GD_PASSED' || app.status === 'GD_PASSED' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                  }`}
                >
                  <Check className="w-4 h-4" /> Pass
                </button>
                <button 
                  onClick={() => setEvaluations(prev => ({...prev, [app.id]: 'GD_FAILED'}))}
                  className={`px-3 py-1 rounded text-sm font-medium flex items-center gap-1 transition-colors ${
                    evaluations[app.id] === 'GD_FAILED' || app.status === 'GD_FAILED' 
                    ? 'bg-red-600 text-white' 
                    : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                  }`}
                >
                  <X className="w-4 h-4" /> Fail
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex gap-4">
          <button onClick={submitEvaluations} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-medium">
            Save Evaluations
          </button>
          
          <button 
            onClick={() => {
              Swal.fire({
                title: 'Restart Group Discussion?',
                text: 'This will reset the session so you can host another GD for this job.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Yes, restart'
              }).then((result) => {
                if (result.isConfirmed) {
                  setGdState(prev => ({ ...prev, status: 'CREATED' }));
                }
              });
            }} 
            className="border border-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-50 font-medium"
          >
            Restart Group Discussion
          </button>
        </div>
      </div>
    );
  }

  return null;
}
