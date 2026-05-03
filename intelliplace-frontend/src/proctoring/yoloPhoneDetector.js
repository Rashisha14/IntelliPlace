import { PROCTORING_SERVICE_URL } from '../config.js';

/**
 * Sends a single JPEG snapshot to the local YOLOv8n service (COCO "cell phone").
 * @param {Blob | null} jpegBlob
 * @returns {Promise<{ violated: boolean, maxConfidence: number, error?: boolean }>}
 */
export async function detectPhoneInJpeg(jpegBlob) {
  if (!jpegBlob) return { violated: false, maxConfidence: 0 };
  const fd = new FormData();
  fd.append('file', jpegBlob, 'frame.jpg');
  try {
    const res = await fetch(
      `${PROCTORING_SERVICE_URL.replace(/\/$/, '')}/phone-detect?min_confidence=0.6`,
      {
        method: 'POST',
        body: fd,
      }
    );
    if (!res.ok) {
      return { violated: false, maxConfidence: 0, error: true };
    }
    const j = await res.json().catch(() => ({}));
    return {
      violated: !!j.phone_detected,
      maxConfidence: typeof j.max_confidence === 'number' ? j.max_confidence : 0,
    };
  } catch {
    return { violated: false, maxConfidence: 0, error: true };
  }
}
