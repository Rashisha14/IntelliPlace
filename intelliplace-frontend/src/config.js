let apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

if (typeof window !== 'undefined') {
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    apiBaseUrl = apiBaseUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
  }
}

export const API_BASE_URL = apiBaseUrl;
