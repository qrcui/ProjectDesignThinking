import type { AcuityAnswer, EyeMode, VisionTestResult } from '../types';
import { roundTo } from './geometry';

const ARC_MINUTE_IN_RADIANS = Math.PI / (180 * 60);

export function optotypeSizeMm(denominator: number, distanceCm: number): number {
  const angularSizeRadians = 5 * ARC_MINUTE_IN_RADIANS * (denominator / 20);
  const distanceMm = distanceCm * 10;
  return 2 * distanceMm * Math.tan(angularSizeRadians / 2);
}

export function optotypeSizePx(
  denominator: number,
  distanceCm: number,
  pixelsPerMillimeter: number,
): number {
  return optotypeSizeMm(denominator, distanceCm) * pixelsPerMillimeter;
}

export function decimalAcuity(denominator: number): number {
  return roundTo(20 / denominator, 2);
}

export function logMar(denominator: number): number {
  return roundTo(Math.log10(denominator / 20), 2);
}

export function createVisionTestResult(options: {
  eyeMode: EyeMode;
  denominator: number | null;
  answers: AcuityAnswer[];
  screenCalibrated: boolean;
  cameraCalibrated: boolean;
  demo: boolean;
}): VisionTestResult {
  const { eyeMode, denominator, answers, screenCalibrated, cameraCalibrated, demo } = options;
  const correct = answers.filter((answer) => answer.correct).length;
  const validDistances = answers
    .map((answer) => answer.distanceCm)
    .filter((distance): distance is number => distance !== null && Number.isFinite(distance));
  const averageDistanceCm =
    validDistances.length > 0
      ? roundTo(validDistances.reduce((total, distance) => total + distance, 0) / validDistances.length, 1)
      : null;

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    completedAt: new Date().toISOString(),
    eyeMode,
    snellen: denominator === null ? '<20/200' : `20/${denominator}`,
    denominator,
    decimalAcuity: denominator === null ? null : decimalAcuity(denominator),
    logMar: denominator === null ? null : logMar(denominator),
    answers,
    accuracy: answers.length > 0 ? roundTo(correct / answers.length, 2) : 0,
    averageDistanceCm,
    screenCalibrated,
    cameraCalibrated,
    demo,
  };
}
