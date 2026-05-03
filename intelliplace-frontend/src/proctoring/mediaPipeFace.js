import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Pin WASM root to installed package version. */
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm`;

let landmarkerSingleton = null;

export async function getFaceLandmarker() {
  if (landmarkerSingleton) return landmarkerSingleton;
  const filesetResolver = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarkerSingleton = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: LANDMARKER_MODEL,
      delegate: 'GPU',
    },
    // tasks-vision@0.10.x bundle does not export RunningMode; VIDEO is correct for detectForVideo().
    runningMode: 'VIDEO',
    numFaces: 3,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.4,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
  });
  return landmarkerSingleton;
}

/** @param {import('@mediapipe/tasks-vision').FaceLandmarker} detector */
export function analyzeFaceFrame(detector, imageBitmap, timestampMs) {
  const res = detector.detectForVideo(imageBitmap, timestampMs);
  const n = res.faceLandmarks?.length ?? 0;

  let yawMetric = null;
  let suspiciousGaze = false;

  if (n === 1) {
    const lm = res.faceLandmarks[0];
    const nose = lm[1] ?? lm[4];
    const leftEyeOut = lm[263];
    const rightEyeOut = lm[33];
    if (nose && leftEyeOut && rightEyeOut) {
      const midEyeX = (leftEyeOut.x + rightEyeOut.x) / 2;
      yawMetric = Math.abs(nose.x - midEyeX);
      suspiciousGaze = yawMetric > 0.11;
    }
  }

  return {
    faceCount: n,
    yawMetric,
    suspiciousGaze,
  };
}
