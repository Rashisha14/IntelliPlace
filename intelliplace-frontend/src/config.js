let apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '/api' : 'http://localhost:5000/api');

const isRelativeApi = typeof apiBaseUrl === 'string' && apiBaseUrl.startsWith('/');

if (typeof window !== 'undefined' && !isRelativeApi) {
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    apiBaseUrl = apiBaseUrl
      .replace(/localhost/g, window.location.hostname)
      .replace(/127\.0\.0\.1/g, window.location.hostname);
  }
}

export const API_BASE_URL = apiBaseUrl;

/**
 * Socket.IO server origin (no /api path). In dev with Vite proxy, this is the page origin
 * so WebSocket/polling goes through :5173 → proxied to the backend (fixes LAN + firewall).
 */
export function getRealtimeBaseUrl() {
  if (typeof window === 'undefined') {
    try {
      if (isRelativeApi) return 'http://127.0.0.1:5000';
      return new URL(API_BASE_URL).origin;
    } catch {
      return 'http://127.0.0.1:5000';
    }
  }
  if (API_BASE_URL.startsWith('/')) {
    return window.location.origin;
  }
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return window.location.origin;
  }
}

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
