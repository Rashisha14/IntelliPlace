/** Single-frame capture for proctoring (no continuous upload). */

export const PROCTOR_FRAME_W = 640;
export const PROCTOR_FRAME_H = 480;

/** @returns {Promise<Blob | null>} JPEG blob */
export async function captureVideoFrameJpeg(videoEl, quality = 0.82) {
  if (!videoEl || videoEl.readyState < 2) return null;

  let canvas = captureVideoFrameJpeg._cache;
  if (!canvas || canvas.width !== PROCTOR_FRAME_W) {
    canvas = document.createElement('canvas');
    canvas.width = PROCTOR_FRAME_W;
    canvas.height = PROCTOR_FRAME_H;
    captureVideoFrameJpeg._cache = canvas;
  }

  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, PROCTOR_FRAME_W, PROCTOR_FRAME_H);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || null), 'image/jpeg', quality);
  });
}
