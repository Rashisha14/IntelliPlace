import { API_BASE_URL } from '../config.js';

export const VIOLATION_TYPES = [
  'NO_FACE',
  'MULTIPLE_FACES',
  'LOOKING_AWAY',
  'PHONE_DETECTED',
  'TAB_SWITCH',
  'EXIT_FULLSCREEN',
  'COPY_PASTE',
];

const VALID = new Set(VIOLATION_TYPES);

/** Min milliseconds between same-type server posts (reduces bursts / DB noise). */
const THROTTLE_MS = {
  NO_FACE: 2500,
  MULTIPLE_FACES: 3500,
  LOOKING_AWAY: 5500,
  PHONE_DETECTED: 4000,
  TAB_SWITCH: 2000,
  EXIT_FULLSCREEN: 2500,
  COPY_PASTE: 900,
};

export function createViolationLogger({ jobId, applicationId, getToken }) {
  const lastByType = Object.create(null);

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [metadata]
   */
  async function logViolation(type, metadata = {}) {
    if (!VALID.has(type)) return;
    const now = Date.now();
    const throttle = THROTTLE_MS[type] ?? 2000;
    if (lastByType[type] != null && now - lastByType[type] < throttle) return;
    lastByType[type] = now;

    const token = getToken?.();
    if (!token) return;

    try {
      await fetch(
        `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/proctoring/violation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            type,
            clientTimestamp: now,
            metadata,
          }),
        }
      );
    } catch (e) {
      console.warn('[proctoring] logViolation', e);
    }
  }

  return { logViolation };
}

export async function finalizeProctoringScore({ jobId, applicationId, getToken }) {
  const token = getToken?.();
  if (!token) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/jobs/${jobId}/interviews/${applicationId}/proctoring/finalize`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return j.data ?? null;
  } catch {
    return null;
  }
}
