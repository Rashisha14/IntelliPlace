import { useEffect, useState } from 'react';
import { captureVideoFrameJpeg } from './cameraCapture.js';
import { getFaceLandmarker, analyzeFaceFrame } from './mediaPipeFace.js';
import { detectPhoneInJpeg } from './yoloPhoneDetector.js';
import { createViolationLogger, finalizeProctoringScore } from './violationManager.js';
import { attachBrowserBehaviorGuards, enterProctoringFullscreen } from './browserBehavior.js';

/** ~1–2s cadence between face + snapshot phone checks */
const TICK_MS = 1650;

/** LOOKING_AWAY after face turned away heuristic sustains this long */
const LOOK_AWAY_HOLD_MS = 5200;

/**
 * Live interview proctoring: webcam frames processed locally (+ optional YOLO service for phone).
 * No video upload — only JPEG snapshots to phone service and typed violation pings to IntelliPlace API.
 *
 * @param {object} p
 * @param {boolean} p.enabled Session + mic/voice engaged
 * @param {React.RefObject<HTMLVideoElement | null>} p.videoRef Preview video (same camera stream as interview UI)
 * @param {React.RefObject<HTMLElement | null>} [p.fullscreenRootRef] Request fullscreen here when proctor starts
 * @param {number | string | undefined} p.jobId
 * @param {number | string | undefined} p.applicationId
 * @param {number | string | undefined} [p.userId] Added to clipboard-related metadata client-side only
 * @param {boolean} [p.isOpen] When modal closes, local result state resets
 */
export function useInterviewProctoring({
  enabled,
  videoRef,
  fullscreenRootRef,
  jobId,
  applicationId,
  userId,
  isOpen = true,
  onViolation,
}) {
  const [proctoringResult, setProctoringResult] = useState(null);
  const [liveWarnings, setLiveWarnings] = useState([]);

  const pushLiveWarning = (type, metadata = {}) => {
    const record = { type, metadata, at: Date.now() };
    setLiveWarnings((prev) => [...prev.slice(-7), record]);
  };

  useEffect(() => {
    if (!enabled || !jobId || !applicationId) return undefined;

    let cancelled = false;
    let detachGuards = null;
    /** @type {ReturnType<setInterval> | null} */
    let intervalId = null;
    let lookingAwayAccumMs = 0;
    let finalized = false;
    const getToken = () => localStorage.getItem('token');

    async function finalizeOnStop() {
      if (finalized) return;
      finalized = true;
      try {
        const data = await finalizeProctoringScore({ jobId, applicationId, getToken });
        if (data != null && !cancelled) {
          setProctoringResult(data);
        }
      } catch (_) {
        /* ignore */
      }
    }

    const { logViolation } = createViolationLogger({ jobId, applicationId, getToken });

    const reportViolation = (type, metadata = {}) => {
      pushLiveWarning(type, metadata);
      if (typeof onViolation === 'function') {
        try {
          onViolation({ type, metadata, at: Date.now() });
        } catch {
          /* ignore callback errors */
        }
      }
      void logViolation(type, metadata);
    };

    detachGuards = attachBrowserBehaviorGuards((type, meta) => {
      reportViolation(type, {
        ...(meta || {}),
        userId,
      });
    });

    (async () => {
      let lm;
      try {
        lm = await getFaceLandmarker();
      } catch (e) {
        console.warn('[Proctoring] Face landmarker unavailable', e);
      }
      if (cancelled) return;

      if (fullscreenRootRef?.current) {
        await enterProctoringFullscreen(fullscreenRootRef.current);
      }

      intervalId = setInterval(async () => {
        const video = videoRef?.current;
        if (cancelled || !video || !lm) return;
        if (video.readyState < 2 || video.paused === undefined) return;

        const stamp = performance.now();
        let bmp;
        try {
          bmp = await createImageBitmap(video);
        } catch {
          return;
        }

        const face = analyzeFaceFrame(lm, bmp, stamp);
        try {
          bmp.close?.();
        } catch {
          /* ignore */
        }

        if (face.faceCount === 0) {
          reportViolation('NO_FACE', {});
          lookingAwayAccumMs = 0;
        } else if (face.faceCount > 1) {
          reportViolation('MULTIPLE_FACES', { count: face.faceCount });
          lookingAwayAccumMs = 0;
        } else if (face.suspiciousGaze) {
          lookingAwayAccumMs += TICK_MS;
          if (lookingAwayAccumMs >= LOOK_AWAY_HOLD_MS) {
            reportViolation('LOOKING_AWAY', {
              yawMetric: face.yawMetric,
              sustainedMsApprox: lookingAwayAccumMs,
            });
            lookingAwayAccumMs = 0;
          }
        } else {
          lookingAwayAccumMs = 0;
        }

        const jpegBlob = await captureVideoFrameJpeg(video);
        const phone = await detectPhoneInJpeg(jpegBlob);
        if (phone.error) return;
        if (phone.violated) {
          reportViolation('PHONE_DETECTED', { confidence: phone.maxConfidence });
        }
      }, TICK_MS);
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      detachGuards?.();
      detachGuards = null;

      void finalizeOnStop();
    };
  }, [enabled, jobId, applicationId, videoRef, fullscreenRootRef, userId, onViolation]);

  useEffect(() => {
    if (!isOpen) {
      setProctoringResult(null);
      setLiveWarnings([]);
    }
  }, [isOpen]);

  return { proctoringResult, liveWarnings };
}

export default useInterviewProctoring;
