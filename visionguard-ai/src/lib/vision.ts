import type { FaceMeasurement, NormalizedPoint } from '../types';
import { clamp, distance2d } from './geometry';

const RIGHT_EYE = [33, 160, 158, 133, 153, 144] as const;
const LEFT_EYE = [362, 385, 387, 263, 373, 380] as const;
const LEFT_OUTER_CORNER = 33;
const RIGHT_OUTER_CORNER = 263;
const NOSE_TIP = 1;

function eyeAspectRatio(
  landmarks: NormalizedPoint[],
  indices: readonly [number, number, number, number, number, number],
  width: number,
  height: number,
): number {
  const [p1, p2, p3, p4, p5, p6] = indices.map((index) => landmarks[index]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;
  const horizontal = distance2d(p1, p4, width, height);
  if (horizontal <= 0) return 0;
  const verticalA = distance2d(p2, p6, width, height);
  const verticalB = distance2d(p3, p5, width, height);
  return (verticalA + verticalB) / (2 * horizontal);
}

export function calculateEyeAspectRatio(
  landmarks: NormalizedPoint[],
  width: number,
  height: number,
): number {
  const right = eyeAspectRatio(landmarks, RIGHT_EYE, width, height);
  const left = eyeAspectRatio(landmarks, LEFT_EYE, width, height);
  return (right + left) / 2;
}

export function estimateDistanceCm(
  referenceEyePx: number,
  referenceDistanceCm: number,
  currentEyePx: number,
): number | null {
  if (referenceEyePx <= 0 || referenceDistanceCm <= 0 || currentEyePx <= 0) return null;
  return (referenceEyePx * referenceDistanceCm) / currentEyePx;
}

export function extractFaceMeasurement(
  landmarks: NormalizedPoint[],
  width: number,
  height: number,
): FaceMeasurement | null {
  const leftEye = landmarks[LEFT_OUTER_CORNER];
  const rightEye = landmarks[RIGHT_OUTER_CORNER];
  const nose = landmarks[NOSE_TIP];
  if (!leftEye || !rightEye || !nose || width <= 0 || height <= 0) return null;

  const eyePixelDistance = distance2d(leftEye, rightEye, width, height);
  if (eyePixelDistance < 4) return null;

  const eyeAspectRatioValue = calculateEyeAspectRatio(landmarks, width, height);
  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const eyeCenterY = (leftEye.y + rightEye.y) / 2;
  const centered = eyeCenterX > 0.2 && eyeCenterX < 0.8 && eyeCenterY > 0.12 && eyeCenterY < 0.72;

  const verticalDifferencePx = Math.abs((leftEye.y - rightEye.y) * height);
  const level = verticalDifferencePx / eyePixelDistance < 0.14;

  const noseToLeft = distance2d(nose, leftEye, width, height);
  const noseToRight = distance2d(nose, rightEye, width, height);
  const yawSymmetry = Math.min(noseToLeft, noseToRight) / Math.max(noseToLeft, noseToRight);
  const facingForward = clamp(yawSymmetry, 0, 1) > 0.52;

  return {
    eyePixelDistance,
    eyeAspectRatio: eyeAspectRatioValue,
    poseOk: centered && level && facingForward,
    centered,
    level,
  };
}
