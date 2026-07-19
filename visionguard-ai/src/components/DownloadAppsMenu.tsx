const RELEASE_TAG = 'v1.0.0-preview.2';
const RELEASE_ROOT = 'https://github.com/Inv1dx/ProjectDesignThinking/releases';
const RELEASE_DOWNLOAD_ROOT = `${RELEASE_ROOT}/download/${RELEASE_TAG}`;

export interface DownloadAppsMenuCopy {
  triggerLabel: string;
  menuAriaLabel: string;
  title: string;
  introduction: string;
  androidLabel: string;
  androidDetail: string;
  windowsLabel: string;
  windowsDetail: string;
  linuxLabel: string;
  linuxDetail: string;
  macArmLabel: string;
  macArmDetail: string;
  macIntelLabel: string;
  macIntelDetail: string;
  previewNotice: string;
  allReleasesLabel: string;
}

export interface DownloadAppsMenuProps {
  copy: DownloadAppsMenuCopy;
}

interface DownloadTarget {
  id: string;
  label: string;
  detail: string;
  href: string;
}

export function DownloadAppsMenu({ copy }: DownloadAppsMenuProps) {
  const targets: DownloadTarget[] = [
    {
      id: 'android',
      label: copy.androidLabel,
      detail: copy.androidDetail,
      href: `${RELEASE_DOWNLOAD_ROOT}/VisionGuard-AI-1.0.0-android-debug.apk`,
    },
    {
      id: 'windows',
      label: copy.windowsLabel,
      detail: copy.windowsDetail,
      href: `${RELEASE_DOWNLOAD_ROOT}/VisionGuard-AI-1.0.0-win-x64.exe`,
    },
    {
      id: 'linux',
      label: copy.linuxLabel,
      detail: copy.linuxDetail,
      href: `${RELEASE_DOWNLOAD_ROOT}/VisionGuard-AI-1.0.0-linux-x64.zip`,
    },
    {
      id: 'mac-arm',
      label: copy.macArmLabel,
      detail: copy.macArmDetail,
      href: `${RELEASE_DOWNLOAD_ROOT}/VisionGuard-AI-1.0.0-mac-arm64-unsigned.zip`,
    },
    {
      id: 'mac-intel',
      label: copy.macIntelLabel,
      detail: copy.macIntelDetail,
      href: `${RELEASE_DOWNLOAD_ROOT}/VisionGuard-AI-1.0.0-mac-x64-unsigned.zip`,
    },
  ];

  return (
    <details className="download-menu">
      <summary aria-label={copy.menuAriaLabel}>
        <span className="download-menu__icon" aria-hidden="true">↓</span>
        <span className="download-menu__trigger-label">{copy.triggerLabel}</span>
        <span className="download-menu__compact-label" aria-hidden="true">App</span>
      </summary>

      <div className="download-menu__panel" role="group" aria-label={copy.menuAriaLabel}>
        <div className="download-menu__heading">
          <strong>{copy.title}</strong>
          <p>{copy.introduction}</p>
        </div>

        <div className="download-menu__grid">
          {targets.map((target) => (
            <a
              className="download-menu__target"
              href={target.href}
              key={target.id}
              rel="noreferrer"
              target="_blank"
            >
              <span className="download-menu__platform-mark" aria-hidden="true">
                {target.id === 'android'
                  ? 'A'
                  : target.id === 'windows'
                    ? 'W'
                    : target.id === 'linux'
                      ? 'L'
                      : 'M'}
              </span>
              <span>
                <strong>{target.label}</strong>
                <small>{target.detail}</small>
              </span>
              <span className="download-menu__target-arrow" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>

        <p className="download-menu__notice">{copy.previewNotice}</p>
        <a
          className="download-menu__all-releases"
          href={`${RELEASE_ROOT}/tag/${RELEASE_TAG}`}
          rel="noreferrer"
          target="_blank"
        >
          {copy.allReleasesLabel}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </details>
  );
}
