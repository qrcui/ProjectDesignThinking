import type { RefObject } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import type {
  EngineStatus,
  VisionEngineError,
  VisionEngineErrorCode,
  VisionMetrics,
} from '../types';

interface CameraPanelProps {
  videoRef: RefObject<HTMLVideoElement>;
  status: EngineStatus;
  error: VisionEngineError | null;
  metrics: VisionMetrics;
  onStart: () => Promise<void>;
  onPause: () => void;
  onResume: () => Promise<void>;
  onStop: () => void;
  onExit: () => void;
  onDemo: () => void;
}

const statusMessageKeys: Record<EngineStatus, MessageKey> = {
  idle: 'camera.status.idle',
  'requesting-camera': 'camera.status.requesting',
  'loading-model': 'camera.status.loading',
  running: 'camera.status.running',
  demo: 'camera.status.demo',
  paused: 'camera.status.paused',
  error: 'camera.status.error',
};

const errorMessageKeys: Record<
  VisionEngineErrorCode,
  { title: MessageKey; detail: MessageKey }
> = {
  'camera-blocked': {
    title: 'camera.error.blockedTitle',
    detail: 'camera.error.blockedDetail',
  },
  'camera-not-found': {
    title: 'camera.error.notFoundTitle',
    detail: 'camera.error.notFoundDetail',
  },
  'camera-in-use': {
    title: 'camera.error.inUseTitle',
    detail: 'camera.error.inUseDetail',
  },
  'camera-unavailable': {
    title: 'camera.error.unavailableTitle',
    detail: 'camera.error.unavailableDetail',
  },
  'model-load-failed': {
    title: 'camera.error.modelTitle',
    detail: 'camera.error.modelDetail',
  },
  'video-not-ready': {
    title: 'camera.error.videoTitle',
    detail: 'camera.error.videoDetail',
  },
  'engine-failed': {
    title: 'camera.error.genericTitle',
    detail: 'camera.error.genericDetail',
  },
};

export function CameraPanel({
  videoRef,
  status,
  error,
  metrics,
  onStart,
  onPause,
  onResume,
  onStop,
  onExit,
  onDemo,
}: CameraPanelProps) {
  const { t } = useI18n();
  const active = status === 'running' || status === 'demo';
  const loading = status === 'requesting-camera' || status === 'loading-model';
  const cameraFeedVisible = status === 'loading-model' || status === 'running';
  const stageActive = active || cameraFeedVisible;
  const sessionControllable = active || loading || status === 'paused';
  const errorMessages = error ? errorMessageKeys[error.code] : null;

  return (
    <section className="panel camera-panel" aria-labelledby="camera-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t('camera.eyebrow')}</span>
          <h2 id="camera-title">{t('camera.title')}</h2>
        </div>
        <span className={`status-pill status-${status}`} role="status" aria-live="polite">
          <span className="status-dot" />
          {t(statusMessageKeys[status])}
        </span>
      </div>

      <div className={`camera-stage ${stageActive ? 'is-active' : ''}`}>
        <video
          ref={videoRef}
          className={cameraFeedVisible ? 'camera-video' : 'camera-video is-hidden'}
          muted
          playsInline
          aria-label={t('camera.feedAria')}
        />

        {status === 'demo' && (
          <div className="demo-face" aria-label={t('camera.demoAria')}>
            <div className="demo-head">
              <span className="demo-eye left" />
              <span className="demo-eye right" />
              <span className="demo-nose" />
              <span className="demo-mouth" />
            </div>
          </div>
        )}

        {!stageActive && (
          <div className="camera-placeholder">
            <div className="camera-placeholder-icon" aria-hidden="true">
              <span />
              <span />
            </div>
            <strong>{t('camera.placeholderTitle')}</strong>
            <p>{t('camera.placeholderBody')}</p>
          </div>
        )}

        {active && (
          <>
            <div className={`face-guide ${metrics.poseOk ? 'is-ready' : ''}`} aria-hidden="true">
              <span className="guide-eye guide-eye-left" />
              <span className="guide-eye guide-eye-right" />
            </div>
            <div className="camera-overlay-top">
              <span>{t(metrics.faceDetected ? 'camera.faceLocked' : 'camera.searching')}</span>
              <span>{metrics.modelFps.toFixed(1)} FPS</span>
            </div>
            <div className="camera-overlay-bottom">
              <span className={metrics.poseOk ? 'overlay-good' : 'overlay-warn'}>
                {t(metrics.poseOk ? 'camera.headStable' : 'camera.faceScreen')}
              </span>
              <span>{t(metrics.isBlinking ? 'camera.blinking' : 'camera.eyesOpen')}</span>
            </div>
          </>
        )}
      </div>

      {error && errorMessages && (
        <div className="inline-alert" role="alert">
          <strong>{t(errorMessages.title)}</strong>
          <span>{t(errorMessages.detail, { status: error.status ?? '--' })}</span>
        </div>
      )}

      <div className="camera-actions">
        {status === 'paused' ? (
          <button className="button button-primary" type="button" onClick={() => void onResume()}>
            {t('camera.resume')}
          </button>
        ) : loading ? (
          <button className="button button-secondary" type="button" onClick={onPause}>
            {t('camera.pause')}
          </button>
        ) : !active ? (
          <button className="button button-primary" type="button" onClick={() => void onStart()}>
            {t('camera.start')}
          </button>
        ) : (
          <button className="button button-secondary" type="button" onClick={onPause}>
            {t('camera.pause')}
          </button>
        )}
        {sessionControllable && (
          <button className="button button-ghost" type="button" onClick={onStop}>
            {t('camera.stop')}
          </button>
        )}
        {sessionControllable && (
          <button className="text-button danger" type="button" onClick={onExit}>
            {t('camera.exit')}
          </button>
        )}
        {status !== 'demo' && (
          <button className="button button-ghost" type="button" onClick={onDemo} disabled={loading}>
            {t('camera.demo')}
          </button>
        )}
      </div>
    </section>
  );
}
