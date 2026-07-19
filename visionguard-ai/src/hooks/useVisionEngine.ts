import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import {
  ANALYSIS_INTERVAL_MS,
  LIGHTING_SAMPLE_INTERVAL_MS,
  MAX_ACCEPTABLE_LIGHTING_LEVEL,
  MIN_ACCEPTABLE_LIGHTING_LEVEL,
  MODEL_REMOTE_URL,
  STORAGE_KEYS,
  TARGET_DISTANCE_CM,
  TOO_CLOSE_CM,
} from '../constants';
import type {
  CalibrationMessageCode,
  DistanceCalibration,
  EngineStatus,
  VisionEngineError,
  VisionMetrics,
} from '../types';
import { calculateBlinkRate, calculateFatigueScore, fatigueBand } from '../lib/fatigue';
import { median, percentile, roundTo } from '../lib/geometry';
import {
  estimateDistanceCm,
  extractFaceMeasurement,
  isCompatibleFrameAspect,
} from '../lib/vision';

const EMPTY_METRICS: VisionMetrics = {
  faceDetected: false,
  lightingLevel: null,
  lightingOk: false,
  distanceCm: null,
  eyePixelDistance: null,
  eyeAspectRatio: null,
  eyeBaseline: null,
  isBlinking: false,
  blinkCount: 0,
  blinkRatePerMinute: null,
  sessionSeconds: 0,
  trackedSeconds: 0,
  tooCloseRatio: 0,
  fatigueScore: 0,
  fatigueBand: 'collecting',
  poseOk: false,
  modelFps: 0,
};

interface CalibrationCollector {
  activeStartedAt: number | null;
  elapsedMs: number;
  eyePixelSamples: number[];
  eyeWidthRatioSamples: number[];
  referenceFrameAspectRatio: number | null;
  referenceDistanceCm: number;
}

interface UseVisionEngineReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: EngineStatus;
  error: VisionEngineError | null;
  metrics: VisionMetrics;
  distanceCalibration: DistanceCalibration | null;
  isDistanceCalibrating: boolean;
  calibrationProgress: number;
  calibrationMessage: CalibrationMessageCode | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  enableDemo: () => void;
  pauseMonitoring: () => void;
  resumeMonitoring: () => Promise<void>;
  startDistanceCalibration: (referenceDistanceCm?: number) => void;
  resetDistanceCalibration: () => void;
  resetSession: () => void;
}

function baseAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${relativePath.replace(/^\//, '')}`;
}

async function fetchModelBytes(): Promise<Uint8Array> {
  const localUrl = baseAssetUrl('models/face_landmarker.task');
  try {
    const localResponse = await fetch(localUrl, { cache: 'force-cache' });
    if (localResponse.ok) {
      const localBuffer = await localResponse.arrayBuffer();
      if (localBuffer.byteLength > 3_000_000) return new Uint8Array(localBuffer);
    }
  } catch {
    // The official model URL below is the runtime fallback.
  }

  const remoteResponse = await fetch(MODEL_REMOTE_URL, { cache: 'force-cache' });
  if (!remoteResponse.ok) {
    throw new Error(`VISIONGUARD_MODEL_HTTP_${remoteResponse.status}`);
  }
  return new Uint8Array(await remoteResponse.arrayBuffer());
}

async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const localWasmPath = baseAssetUrl('mediapipe/wasm');
  let vision;
  try {
    vision = await FilesetResolver.forVisionTasks(localWasmPath);
  } catch {
    vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
    );
  }

  const modelBytes = await fetchModelBytes();
  const options = {
    baseOptions: {
      modelAssetBuffer: modelBytes.slice(),
      delegate: 'GPU' as const,
    },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };

  try {
    return await FaceLandmarker.createFromOptions(vision, options);
  } catch {
    return FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: {
        modelAssetBuffer: modelBytes.slice(),
        delegate: 'CPU',
      },
    });
  }
}

function cameraError(error: unknown): VisionEngineError {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return { code: 'camera-blocked' };
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return { code: 'camera-not-found' };
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return { code: 'camera-in-use' };
    }
  }

  if (error instanceof Error) {
    const modelStatus = /^VISIONGUARD_MODEL_HTTP_(\d+)$/.exec(error.message);
    if (modelStatus) return { code: 'model-load-failed', status: Number(modelStatus[1]) };
    if (error.message === 'VISIONGUARD_CAMERA_VIDEO_NOT_READY') {
      return { code: 'video-not-ready' };
    }
  }

  return { code: 'engine-failed' };
}

export function useVisionEngine(): UseVisionEngineReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const modelPromiseRef = useRef<Promise<FaceLandmarker> | null>(null);
  const runtimeGenerationRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const demoTimerRef = useRef<number | null>(null);
  const demoStartedAtRef = useRef<number | null>(null);
  const demoElapsedMsRef = useRef(0);
  const pausedModeRef = useRef<'running' | 'demo' | 'restart-camera' | null>(null);
  const lastAnalysisAtRef = useRef(0);
  const lastTrackedAtRef = useRef<number | null>(null);
  const trackedMsRef = useRef(0);
  const tooCloseMsRef = useRef(0);
  const blinkCountRef = useRef(0);
  const closedStartedAtRef = useRef<number | null>(null);
  const eyesClosedRef = useRef(false);
  const earSamplesRef = useRef<number[]>([]);
  const frameTimesRef = useRef<number[]>([]);
  const distanceSamplesRef = useRef<number[]>([]);
  const lightingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastLightingSampleAtRef = useRef(Number.NEGATIVE_INFINITY);
  const lightingLevelRef = useRef<number | null>(null);
  const lightingOkRef = useRef(false);
  const calibrationCollectorRef = useRef<CalibrationCollector | null>(null);

  const [status, setStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<VisionEngineError | null>(null);
  const [metrics, setMetrics] = useState<VisionMetrics>(EMPTY_METRICS);
  const [distanceCalibration, setDistanceCalibration] = useState<DistanceCalibration | null>(null);
  const distanceCalibrationRef = useRef<DistanceCalibration | null>(distanceCalibration);
  const [isDistanceCalibrating, setIsDistanceCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationMessage, setCalibrationMessage] = useState<CalibrationMessageCode | null>(null);

  useEffect(() => {
    distanceCalibrationRef.current = distanceCalibration;
  }, [distanceCalibration]);

  useEffect(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEYS.distanceCalibration);
    } catch {
      // The legacy persisted calibration is optional migration cleanup only.
    }
  }, []);

  const resetSession = useCallback(() => {
    const now = performance.now();
    if (demoStartedAtRef.current !== null) demoStartedAtRef.current = now;
    demoElapsedMsRef.current = 0;
    lastAnalysisAtRef.current = 0;
    lastTrackedAtRef.current = null;
    trackedMsRef.current = 0;
    tooCloseMsRef.current = 0;
    blinkCountRef.current = 0;
    closedStartedAtRef.current = null;
    eyesClosedRef.current = false;
    earSamplesRef.current = [];
    frameTimesRef.current = [];
    distanceSamplesRef.current = [];
    lastLightingSampleAtRef.current = Number.NEGATIVE_INFINITY;
    lightingLevelRef.current = null;
    lightingOkRef.current = false;
    setMetrics({ ...EMPTY_METRICS });
  }, []);

  const clearDistanceCalibration = useCallback(() => {
    distanceCalibrationRef.current = null;
    distanceSamplesRef.current = [];
    setDistanceCalibration(null);
  }, []);

  const invalidateDistanceCalibrationForFrameChange = useCallback(() => {
    if (!distanceCalibrationRef.current && !calibrationCollectorRef.current) return;
    clearDistanceCalibration();
    calibrationCollectorRef.current = null;
    setIsDistanceCalibrating(false);
    setCalibrationProgress(0);
    setCalibrationMessage('camera-frame-changed');
  }, [clearDistanceCalibration]);

  useEffect(() => {
    const handleOrientationChange = () => invalidateDistanceCalibrationForFrameChange();
    const handleVideoResize = () => {
      const calibration = distanceCalibrationRef.current;
      const video = videoRef.current;
      if (!calibration || !video || video.videoWidth <= 0 || video.videoHeight <= 0) {
        return;
      }
      const currentAspectRatio = video.videoWidth / video.videoHeight;
      if (
        !isCompatibleFrameAspect(
          calibration.referenceFrameAspectRatio,
          currentAspectRatio,
        )
      ) {
        invalidateDistanceCalibrationForFrameChange();
      }
    };

    const orientation = window.screen.orientation;
    const video = videoRef.current;
    orientation?.addEventListener('change', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    video?.addEventListener('resize', handleVideoResize);
    return () => {
      orientation?.removeEventListener('change', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
      video?.removeEventListener('resize', handleVideoResize);
    };
  }, [invalidateDistanceCalibrationForFrameChange]);

  const stopLoopsAndStream = useCallback(() => {
    runtimeGenerationRef.current += 1;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (demoTimerRef.current !== null) {
      window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    demoStartedAtRef.current = null;
    demoElapsedMsRef.current = 0;
    pausedModeRef.current = null;
    lastTrackedAtRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopLoopsAndStream();
    clearDistanceCalibration();
    calibrationCollectorRef.current = null;
    setIsDistanceCalibrating(false);
    setCalibrationProgress(0);
    setCalibrationMessage(null);
    setStatus('idle');
    setError(null);
    setMetrics({ ...EMPTY_METRICS });
  }, [clearDistanceCalibration, stopLoopsAndStream]);

  const ensureLandmarker = useCallback(async (): Promise<FaceLandmarker> => {
    if (landmarkerRef.current) return landmarkerRef.current;
    if (!modelPromiseRef.current) modelPromiseRef.current = createFaceLandmarker();
    try {
      const model = await modelPromiseRef.current;
      landmarkerRef.current = model;
      return model;
    } catch (modelError) {
      modelPromiseRef.current = null;
      throw modelError;
    }
  }, []);

  const finishCalibrationIfReady = useCallback((
    now: number,
    eyePixelDistance: number | null,
    eyeWidthRatio: number | null,
    frameAspectRatio: number | null,
    poseOk: boolean,
  ) => {
    const collector = calibrationCollectorRef.current;
    if (!collector) return;

    const elapsed =
      collector.elapsedMs +
      (collector.activeStartedAt === null ? 0 : now - collector.activeStartedAt);
    setCalibrationProgress(Math.min(100, Math.round((elapsed / 2200) * 100)));
    if (
      poseOk &&
      lightingOkRef.current &&
      eyePixelDistance !== null &&
      eyeWidthRatio !== null &&
      frameAspectRatio !== null &&
      Number.isFinite(eyePixelDistance) &&
      Number.isFinite(eyeWidthRatio)
    ) {
      if (collector.referenceFrameAspectRatio === null) {
        collector.referenceFrameAspectRatio = frameAspectRatio;
      } else if (
        !isCompatibleFrameAspect(
          collector.referenceFrameAspectRatio,
          frameAspectRatio,
        )
      ) {
        invalidateDistanceCalibrationForFrameChange();
        return;
      }
      collector.eyePixelSamples.push(eyePixelDistance);
      collector.eyeWidthRatioSamples.push(eyeWidthRatio);
    }

    if (elapsed < 2200) return;
    if (
      collector.eyeWidthRatioSamples.length >= 8 &&
      collector.referenceFrameAspectRatio !== null
    ) {
      const referenceEyePx = median(collector.eyePixelSamples);
      const referenceEyeWidthRatio = median(collector.eyeWidthRatioSamples);
      if (referenceEyePx !== null && referenceEyeWidthRatio !== null) {
        const calibration: DistanceCalibration = {
          referenceEyePx: roundTo(referenceEyePx, 2),
          referenceEyeWidthRatio: roundTo(referenceEyeWidthRatio, 6),
          referenceFrameAspectRatio: roundTo(
            collector.referenceFrameAspectRatio,
            6,
          ),
          referenceDistanceCm: collector.referenceDistanceCm,
          calibratedAt: new Date().toISOString(),
        };
        distanceCalibrationRef.current = calibration;
        setDistanceCalibration(calibration);
        setCalibrationMessage('complete');
      }
    } else {
      setCalibrationMessage('not-enough-samples');
    }

    calibrationCollectorRef.current = null;
    setIsDistanceCalibrating(false);
    setCalibrationProgress(100);
  }, [invalidateDistanceCalibrationForFrameChange]);

  const sampleLighting = useCallback((video: HTMLVideoElement, now: number) => {
    if (now - lastLightingSampleAtRef.current < LIGHTING_SAMPLE_INTERVAL_MS) return;
    lastLightingSampleAtRef.current = now;

    try {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        lightingLevelRef.current = null;
        lightingOkRef.current = false;
        return;
      }

      const canvas = lightingCanvasRef.current ?? document.createElement('canvas');
      lightingCanvasRef.current = canvas;
      canvas.width = 32;
      canvas.height = 24;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        lightingLevelRef.current = null;
        lightingOkRef.current = false;
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let luminanceSum = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        luminanceSum +=
          pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
      }

      const pixelCount = pixels.length / 4;
      const lightingLevel = Math.min(1, Math.max(0, luminanceSum / pixelCount / 255));
      lightingLevelRef.current = roundTo(lightingLevel, 3);
      lightingOkRef.current =
        lightingLevel >= MIN_ACCEPTABLE_LIGHTING_LEVEL &&
        lightingLevel <= MAX_ACCEPTABLE_LIGHTING_LEVEL;
    } catch {
      lightingLevelRef.current = null;
      lightingOkRef.current = false;
    }
  }, []);

  const updateFromLandmarks = useCallback(
    (
      landmarks: NormalizedLandmark[],
      now: number,
      width: number,
      height: number,
      modelFps: number,
    ): boolean => {
      const measurement = extractFaceMeasurement(landmarks, width, height);
      if (!measurement) return false;

      finishCalibrationIfReady(
        now,
        measurement.eyePixelDistance,
        measurement.eyeWidthRatio,
        measurement.frameAspectRatio,
        measurement.poseOk,
      );

      const calibration = distanceCalibrationRef.current;
      let estimatedDistance: number | null = null;
      if (
        calibration &&
        !isCompatibleFrameAspect(
          calibration.referenceFrameAspectRatio,
          measurement.frameAspectRatio,
        )
      ) {
        invalidateDistanceCalibrationForFrameChange();
      } else if (calibration && measurement.poseOk && lightingOkRef.current) {
        const currentDistance = estimateDistanceCm(
          calibration.referenceEyeWidthRatio,
          calibration.referenceDistanceCm,
          measurement.eyeWidthRatio,
        );
        if (currentDistance !== null) {
          distanceSamplesRef.current.push(currentDistance);
          if (distanceSamplesRef.current.length > 7) distanceSamplesRef.current.shift();
          estimatedDistance = median(distanceSamplesRef.current);
        }
      } else {
        distanceSamplesRef.current = [];
      }

      const previousTrackedAt = lastTrackedAtRef.current;
      const frameDelta = previousTrackedAt === null ? 0 : Math.min(now - previousTrackedAt, 500);
      lastTrackedAtRef.current = now;
      trackedMsRef.current += frameDelta;
      if (estimatedDistance !== null && estimatedDistance < TOO_CLOSE_CM) {
        tooCloseMsRef.current += frameDelta;
      }

      const ear = measurement.eyeAspectRatio;
      if (ear > 0.12 && !eyesClosedRef.current) {
        earSamplesRef.current.push(ear);
        if (earSamplesRef.current.length > 160) earSamplesRef.current.shift();
      }
      const baseline = percentile(earSamplesRef.current, 0.8);
      const blinkThreshold = Math.max(0.12, (baseline ?? 0.3) * 0.62);

      if (ear < blinkThreshold) {
        if (closedStartedAtRef.current === null) closedStartedAtRef.current = now;
        if (now - closedStartedAtRef.current >= 65) eyesClosedRef.current = true;
      } else {
        if (eyesClosedRef.current && closedStartedAtRef.current !== null) {
          const closedDuration = now - closedStartedAtRef.current;
          if (closedDuration >= 65 && closedDuration <= 900) blinkCountRef.current += 1;
        }
        eyesClosedRef.current = false;
        closedStartedAtRef.current = null;
      }

      const trackedSeconds = trackedMsRef.current / 1000;
      const blinkRatePerMinute = calculateBlinkRate(blinkCountRef.current, trackedSeconds);
      const tooCloseRatio = trackedMsRef.current > 0 ? tooCloseMsRef.current / trackedMsRef.current : 0;
      const fatigueScore = calculateFatigueScore({
        blinkRatePerMinute,
        tooCloseRatio,
        sessionMinutes: trackedSeconds / 60,
        trackedSeconds,
      });

      setMetrics({
        faceDetected: true,
        lightingLevel: lightingLevelRef.current,
        lightingOk: lightingOkRef.current,
        distanceCm: estimatedDistance === null ? null : roundTo(estimatedDistance, 1),
        eyePixelDistance: roundTo(measurement.eyePixelDistance, 1),
        eyeAspectRatio: roundTo(ear, 3),
        eyeBaseline: baseline === null ? null : roundTo(baseline, 3),
        isBlinking: eyesClosedRef.current,
        blinkCount: blinkCountRef.current,
        blinkRatePerMinute:
          blinkRatePerMinute === null ? null : roundTo(blinkRatePerMinute, 1),
        sessionSeconds: Math.round(trackedSeconds),
        trackedSeconds: Math.round(trackedSeconds),
        tooCloseRatio: roundTo(tooCloseRatio, 3),
        fatigueScore,
        fatigueBand: fatigueBand(fatigueScore, trackedSeconds),
        poseOk: measurement.poseOk,
        modelFps: roundTo(modelFps, 1),
      });
      return true;
    },
    [finishCalibrationIfReady, invalidateDistanceCalibrationForFrameChange],
  );

  const updateForMissingFace = useCallback(
    (now: number, modelFps: number) => {
      finishCalibrationIfReady(now, null, null, null, false);
      distanceSamplesRef.current = [];
      lastTrackedAtRef.current = null;
      closedStartedAtRef.current = null;
      eyesClosedRef.current = false;
      const trackedSeconds = trackedMsRef.current / 1000;
      setMetrics((current) => ({
        ...current,
        faceDetected: false,
        lightingLevel: lightingLevelRef.current,
        lightingOk: lightingOkRef.current,
        distanceCm: null,
        eyePixelDistance: null,
        eyeAspectRatio: null,
        isBlinking: false,
        sessionSeconds: Math.round(trackedSeconds),
        trackedSeconds: Math.round(trackedSeconds),
        poseOk: false,
        modelFps: roundTo(modelFps, 1),
      }));
    },
    [finishCalibrationIfReady],
  );

  const failRuntime = useCallback(
    (runtimeError: VisionEngineError) => {
      stopLoopsAndStream();
      clearDistanceCalibration();
      calibrationCollectorRef.current = null;
      setIsDistanceCalibrating(false);
      setCalibrationProgress(0);
      setCalibrationMessage(null);
      setMetrics((current) => ({
        ...current,
        faceDetected: false,
        lightingLevel: null,
        lightingOk: false,
        distanceCm: null,
        eyePixelDistance: null,
        eyeAspectRatio: null,
        isBlinking: false,
        poseOk: false,
        modelFps: 0,
      }));
      setStatus('error');
      setError(runtimeError);
    },
    [clearDistanceCalibration, stopLoopsAndStream],
  );

  const startAnalysisLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const tick = () => {
      animationFrameRef.current = null;
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const now = performance.now();
      const hasLiveVideoTrack = streamRef.current
        ?.getVideoTracks()
        .some((track) => track.readyState === 'live');
      if (!hasLiveVideoTrack) {
        failRuntime({ code: 'camera-unavailable' });
        return;
      }

      if (
        video &&
        landmarker &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        now - lastAnalysisAtRef.current >= ANALYSIS_INTERVAL_MS
      ) {
        lastAnalysisAtRef.current = now;
        sampleLighting(video, now);
        try {
          const result = landmarker.detectForVideo(video, now);
          frameTimesRef.current.push(now);
          frameTimesRef.current = frameTimesRef.current.filter((time) => now - time <= 2000);
          const modelFps = frameTimesRef.current.length / 2;
          const face = result.faceLandmarks[0];
          if (
            !face ||
            !updateFromLandmarks(face, now, video.videoWidth, video.videoHeight, modelFps)
          ) {
            updateForMissingFace(now, modelFps);
          }
        } catch (inferenceError) {
          failRuntime(cameraError(inferenceError));
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [failRuntime, sampleLighting, updateForMissingFace, updateFromLandmarks]);

  const startCamera = useCallback(async () => {
    stopLoopsAndStream();
    const runtimeGeneration = runtimeGenerationRef.current;
    let requestedStream: MediaStream | null = null;
    clearDistanceCalibration();
    calibrationCollectorRef.current = null;
    setIsDistanceCalibrating(false);
    setCalibrationProgress(0);
    setError(null);
    setCalibrationMessage(null);
    resetSession();

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError({ code: 'camera-unavailable' });
      return;
    }

    try {
      setStatus('requesting-camera');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      requestedStream = stream;
      if (runtimeGeneration !== runtimeGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error('VISIONGUARD_CAMERA_VIDEO_NOT_READY');
      video.srcObject = stream;
      await video.play();
      if (runtimeGeneration !== runtimeGenerationRef.current) return;

      setStatus('loading-model');
      await ensureLandmarker();
      if (runtimeGeneration !== runtimeGenerationRef.current) return;
      setStatus('running');
      startAnalysisLoop();
    } catch (startError) {
      if (runtimeGeneration !== runtimeGenerationRef.current) {
        requestedStream?.getTracks().forEach((track) => track.stop());
        return;
      }
      stopLoopsAndStream();
      clearDistanceCalibration();
      setStatus('error');
      setError(cameraError(startError));
    }
  }, [clearDistanceCalibration, ensureLandmarker, resetSession, startAnalysisLoop, stopLoopsAndStream]);

  const updateDemoMetrics = useCallback((now: number) => {
    const activeElapsedMs =
      demoStartedAtRef.current === null ? 0 : now - demoStartedAtRef.current;
    const elapsedSeconds = (demoElapsedMsRef.current + activeElapsedMs) / 1000;
    const distanceCm = TARGET_DISTANCE_CM + Math.sin(elapsedSeconds / 3) * 1.8;
    const blinkCount = Math.floor(elapsedSeconds / 4.5);
    const trackedSeconds = elapsedSeconds;
    const blinkRatePerMinute = calculateBlinkRate(blinkCount, trackedSeconds);
    const fatigueScore = calculateFatigueScore({
      blinkRatePerMinute,
      tooCloseRatio: 0,
      sessionMinutes: elapsedSeconds / 60,
      trackedSeconds,
    });
    setMetrics({
      faceDetected: true,
      lightingLevel: 0.62,
      lightingOk: true,
      distanceCm: roundTo(distanceCm, 1),
      eyePixelDistance: 120,
      eyeAspectRatio: 0.29,
      eyeBaseline: 0.3,
      isBlinking: elapsedSeconds % 4.5 > 4.25,
      blinkCount,
      blinkRatePerMinute:
        blinkRatePerMinute === null ? null : roundTo(blinkRatePerMinute, 1),
      sessionSeconds: Math.round(elapsedSeconds),
      trackedSeconds: Math.round(trackedSeconds),
      tooCloseRatio: 0,
      fatigueScore,
      fatigueBand: fatigueBand(fatigueScore, trackedSeconds),
      poseOk: true,
      modelFps: 9.1,
    });
  }, []);

  const startDemoLoop = useCallback(() => {
    if (demoTimerRef.current !== null) {
      window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    const now = performance.now();
    demoStartedAtRef.current = now;
    updateDemoMetrics(now);
    demoTimerRef.current = window.setInterval(() => {
      updateDemoMetrics(performance.now());
    }, 250);
  }, [updateDemoMetrics]);

  const enableDemo = useCallback(() => {
    stopLoopsAndStream();
    clearDistanceCalibration();
    calibrationCollectorRef.current = null;
    setIsDistanceCalibrating(false);
    setCalibrationProgress(0);
    const demoCalibration: DistanceCalibration = {
      referenceEyePx: 120,
      referenceEyeWidthRatio: 0.1875,
      referenceFrameAspectRatio: 4 / 3,
      referenceDistanceCm: TARGET_DISTANCE_CM,
      calibratedAt: 'demo',
    };
    distanceCalibrationRef.current = demoCalibration;
    setDistanceCalibration(demoCalibration);
    setError(null);
    setCalibrationMessage(null);
    resetSession();
    setStatus('demo');
    startDemoLoop();
  }, [clearDistanceCalibration, resetSession, startDemoLoop, stopLoopsAndStream]);

  const pauseMonitoring = useCallback(() => {
    if (
      status !== 'requesting-camera' &&
      status !== 'loading-model' &&
      status !== 'running' &&
      status !== 'demo'
    ) {
      return;
    }

    const now = performance.now();
    const isStartingCamera = status === 'requesting-camera' || status === 'loading-model';
    if (isStartingCamera) {
      // getUserMedia/model loading cannot be cancelled directly. Invalidating this
      // generation makes the pending startCamera call discard its eventual result;
      // stopLoopsAndStream also closes a stream that was already acquired.
      stopLoopsAndStream();
      pausedModeRef.current = 'restart-camera';
    } else {
      pausedModeRef.current = status;
    }
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (demoTimerRef.current !== null) {
      window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    if (status === 'demo' && demoStartedAtRef.current !== null) {
      demoElapsedMsRef.current += now - demoStartedAtRef.current;
      demoStartedAtRef.current = null;
    }
    if (status === 'running') {
      streamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
      videoRef.current?.pause();
    }

    const collector = calibrationCollectorRef.current;
    if (collector && collector.activeStartedAt !== null) {
      collector.elapsedMs += now - collector.activeStartedAt;
      collector.activeStartedAt = null;
    }
    lastTrackedAtRef.current = null;
    closedStartedAtRef.current = null;
    eyesClosedRef.current = false;
    frameTimesRef.current = [];
    lastLightingSampleAtRef.current = Number.NEGATIVE_INFINITY;
    lightingLevelRef.current = null;
    lightingOkRef.current = false;
    setMetrics((current) => ({
      ...current,
      faceDetected: false,
      lightingLevel: null,
      lightingOk: false,
      distanceCm: null,
      eyePixelDistance: null,
      eyeAspectRatio: null,
      isBlinking: false,
      poseOk: false,
      modelFps: 0,
    }));
    setError(null);
    setStatus('paused');
  }, [status, stopLoopsAndStream]);

  const resumeMonitoring = useCallback(async () => {
    if (status !== 'paused') return;
    const pausedMode = pausedModeRef.current;
    if (!pausedMode) return;

    setError(null);
    if (pausedMode === 'demo') {
      pausedModeRef.current = null;
      setStatus('demo');
      startDemoLoop();
      return;
    }
    if (pausedMode === 'restart-camera') {
      pausedModeRef.current = null;
      await startCamera();
      return;
    }

    const runtimeGeneration = runtimeGenerationRef.current;
    pausedModeRef.current = null;
    try {
      const stream = streamRef.current;
      const video = videoRef.current;
      const videoTracks = stream?.getVideoTracks() ?? [];
      if (!stream || !video || !videoTracks.some((track) => track.readyState === 'live')) {
        throw new Error('VISIONGUARD_CAMERA_VIDEO_NOT_READY');
      }

      videoTracks.forEach((track) => {
        if (track.readyState === 'live') track.enabled = true;
      });
      await video.play();
      if (runtimeGeneration !== runtimeGenerationRef.current) return;
      const collector = calibrationCollectorRef.current;
      if (collector && collector.activeStartedAt === null) {
        collector.activeStartedAt = performance.now();
      }
      lastAnalysisAtRef.current = 0;
      lastTrackedAtRef.current = null;
      lastLightingSampleAtRef.current = Number.NEGATIVE_INFINITY;
      setStatus('running');
      startAnalysisLoop();
    } catch (resumeError) {
      if (runtimeGeneration !== runtimeGenerationRef.current) return;
      stopLoopsAndStream();
      clearDistanceCalibration();
      calibrationCollectorRef.current = null;
      setIsDistanceCalibrating(false);
      setCalibrationProgress(0);
      setCalibrationMessage(null);
      setStatus('error');
      setError(cameraError(resumeError));
    }
  }, [
    clearDistanceCalibration,
    startAnalysisLoop,
    startCamera,
    startDemoLoop,
    status,
    stopLoopsAndStream,
  ]);

  const startDistanceCalibration = useCallback((referenceDistanceCm = TARGET_DISTANCE_CM) => {
    if (status === 'demo') {
      setCalibrationMessage('demo');
      setCalibrationProgress(100);
      return;
    }
    if (status !== 'running') {
      setCalibrationMessage('start-camera');
      return;
    }
    if (!metrics.faceDetected || !metrics.poseOk) {
      setCalibrationMessage('face-not-ready');
      return;
    }
    if (!metrics.lightingOk) {
      setCalibrationMessage('lighting-not-ready');
      return;
    }
    calibrationCollectorRef.current = {
      activeStartedAt: performance.now(),
      elapsedMs: 0,
      eyePixelSamples: [],
      eyeWidthRatioSamples: [],
      referenceFrameAspectRatio: null,
      referenceDistanceCm,
    };
    setCalibrationProgress(0);
    setCalibrationMessage('hold-still');
    setIsDistanceCalibrating(true);
  }, [metrics.faceDetected, metrics.lightingOk, metrics.poseOk, status]);

  const resetDistanceCalibration = useCallback(() => {
    clearDistanceCalibration();
    calibrationCollectorRef.current = null;
    setIsDistanceCalibrating(false);
    setCalibrationProgress(0);
    try {
      window.localStorage.removeItem(STORAGE_KEYS.distanceCalibration);
    } catch {
      // Calibration remains cleared in memory when storage is unavailable.
    }
    setCalibrationMessage('cleared');
  }, [clearDistanceCalibration]);

  useEffect(() => {
    return () => {
      stopLoopsAndStream();
      landmarkerRef.current?.close();
    };
  }, [stopLoopsAndStream]);

  return {
    videoRef,
    status,
    error,
    metrics,
    distanceCalibration,
    isDistanceCalibrating,
    calibrationProgress,
    calibrationMessage,
    startCamera,
    stopCamera,
    enableDemo,
    pauseMonitoring,
    resumeMonitoring,
    startDistanceCalibration,
    resetDistanceCalibration,
    resetSession,
  };
}
