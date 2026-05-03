let apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

if (typeof window !== 'undefined') {
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    apiBaseUrl = apiBaseUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
  }
}

export const API_BASE_URL = apiBaseUrl;

const proctorDefault =
  import.meta.env?.VITE_PROCTORING_SERVICE_URL || 'http://localhost:8002';

/** YOLOv8n snapshot service — local JPEG uploads only (no streaming). */
export const PROCTORING_SERVICE_URL =
  typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
    ? proctorDefault
        .replace('localhost', window.location.hostname)
        .replace('127.0.0.1', window.location.hostname)
    : proctorDefault;
