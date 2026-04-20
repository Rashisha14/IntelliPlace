let apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

if (typeof window !== 'undefined') {
  if (apiBaseUrl.includes('localhost') && window.location.hostname !== 'localhost') {
    apiBaseUrl = apiBaseUrl.replace('localhost', window.location.hostname);
  }
}

export const API_BASE_URL = apiBaseUrl;
