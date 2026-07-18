import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  powerSaveBlocker,
  protocol,
  session,
  shell,
  systemPreferences,
  Tray,
} from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_SCHEME = 'visionguard';
const APP_HOST = 'app';
const APP_URL = `${APP_SCHEME}://${APP_HOST}/`;
const SET_MONITORING_ACTIVE_CHANNEL = 'desktop:set-monitoring-active';
const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

const electronDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(app.getAppPath(), 'dist');
const distIndexPath = path.join(distDirectory, 'index.html');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let monitoringPowerBlockerId = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function isPathInside(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== '..' &&
      !path.isAbsolute(relativePath))
  );
}

function resolveDistResource(requestUrl) {
  try {
    const parsedUrl = new URL(requestUrl);
    if (parsedUrl.protocol !== `${APP_SCHEME}:` || parsedUrl.hostname !== APP_HOST) {
      return null;
    }
    if (parsedUrl.username || parsedUrl.password || parsedUrl.port) return null;

    const decodedPath = decodeURIComponent(parsedUrl.pathname);
    const relativePath = decodedPath.replace(/^[/\\]+/, '') || 'index.html';
    const candidatePath = path.resolve(distDirectory, relativePath);
    return isPathInside(distDirectory, candidatePath) ? candidatePath : null;
  } catch {
    return null;
  }
}

function isTrustedAppUrl(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);
    return parsedUrl.protocol === `${APP_SCHEME}:` && parsedUrl.hostname === APP_HOST;
  } catch {
    return false;
  }
}

function isTrustedMainPageUrl(rawUrl) {
  if (!isTrustedAppUrl(rawUrl)) return false;
  const resolvedPath = resolveDistResource(rawUrl);
  return resolvedPath === distIndexPath;
}

function isTrustedRenderer(webContents) {
  return Boolean(
    mainWindow &&
      !mainWindow.isDestroyed() &&
      webContents &&
      webContents.id === mainWindow.webContents.id &&
      isTrustedMainPageUrl(webContents.getURL()),
  );
}

function stopMonitoringPowerBlocker() {
  if (monitoringPowerBlockerId === null) return;
  if (powerSaveBlocker.isStarted(monitoringPowerBlockerId)) {
    powerSaveBlocker.stop(monitoringPowerBlockerId);
  }
  monitoringPowerBlockerId = null;
}

function setMonitoringActive(active) {
  if (active) {
    if (
      monitoringPowerBlockerId === null ||
      !powerSaveBlocker.isStarted(monitoringPowerBlockerId)
    ) {
      monitoringPowerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    }
    return;
  }
  stopMonitoringPowerBlocker();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  updateTrayMenu();
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  updateTrayMenu();
}

function quitApplication() {
  isQuitting = true;
  stopMonitoringPowerBlocker();
  app.quit();
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const windowVisible = Boolean(
    mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible(),
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open VisionGuard AI', click: showMainWindow },
      { label: 'Hide window', enabled: windowVisible, click: hideMainWindow },
      { type: 'separator' },
      { label: 'Quit VisionGuard AI', click: quitApplication },
    ]),
  );
}

async function createTray() {
  const trayAssetPath = path.join(electronDirectory, 'assets', 'tray-icon.svg');
  let trayImage = nativeImage.createFromPath(trayAssetPath);
  if (trayImage.isEmpty()) {
    trayImage = await app.getFileIcon(process.execPath, { size: 'small' });
  }
  trayImage = trayImage.resize({ width: process.platform === 'darwin' ? 18 : 16 });
  if (process.platform === 'darwin') trayImage.setTemplateImage(true);

  tray = new Tray(trayImage);
  tray.setToolTip('VisionGuard AI');
  tray.on('double-click', showMainWindow);
  if (process.platform !== 'darwin') tray.on('click', showMainWindow);
  updateTrayMenu();
}

function openExternalUrl(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);
    if (!EXTERNAL_PROTOCOLS.has(parsedUrl.protocol)) return;
    void shell.openExternal(parsedUrl.toString()).catch(() => {});
  } catch {
    // Ignore malformed or unsupported external links.
  }
}

function secureWindowNavigation(window) {
  const preventUnexpectedNavigation = (event, navigationUrl) => {
    if (isTrustedMainPageUrl(navigationUrl)) return;
    event.preventDefault();
    openExternalUrl(navigationUrl);
  };

  window.webContents.on('will-navigate', preventUnexpectedNavigation);
  window.webContents.on('will-redirect', preventUnexpectedNavigation);
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });
}

function createMainWindow() {
  const window = new BrowserWindow({
    title: 'VisionGuard AI',
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 640,
    show: false,
    backgroundColor: '#06151b',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(electronDirectory, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      safeDialogs: true,
      navigateOnDragDrop: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  mainWindow = window;

  secureWindowNavigation(window);

  window.once('ready-to-show', () => {
    window.show();
    updateTrayMenu();
  });
  window.on('show', updateTrayMenu);
  window.on('hide', updateTrayMenu);
  window.on('minimize', updateTrayMenu);
  window.on('restore', updateTrayMenu);
  window.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideMainWindow();
  });
  window.on('closed', () => {
    mainWindow = null;
    stopMonitoringPowerBlocker();
  });
  window.webContents.on('render-process-gone', () => {
    stopMonitoringPowerBlocker();
  });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (errorCode === -3) return;
    dialog.showErrorBox(
      'VisionGuard AI could not start',
      `${errorDescription} (${errorCode})`,
    );
  });

  void window.loadURL(APP_URL);
  return window;
}

function isTrustedPermissionOrigin(rawOrigin) {
  if (!rawOrigin) return true;
  return isTrustedAppUrl(rawOrigin);
}

function isCameraOnlyRequest(details) {
  const mediaTypes = Array.isArray(details?.mediaTypes) ? details.mediaTypes : [];
  return mediaTypes.length > 0 && mediaTypes.every((mediaType) => mediaType === 'video');
}

async function requestOperatingSystemCameraPermission() {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('camera');
  if (status === 'granted') return true;
  if (status === 'denied' || status === 'restricted') return false;
  return systemPreferences.askForMediaAccess('camera');
}

function configurePermissions() {
  const appSession = session.defaultSession;
  appSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      if (!isTrustedRenderer(webContents) || details?.isMainFrame === false) return false;
      if (
        !isTrustedPermissionOrigin(requestingOrigin) ||
        !isTrustedPermissionOrigin(details?.securityOrigin) ||
        !isTrustedPermissionOrigin(details?.requestingUrl)
      ) {
        return false;
      }
      if (permission === 'clipboard-sanitized-write') return true;
      return permission === 'media' && details?.mediaType === 'video';
    },
  );

  appSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const trustedRequest =
        isTrustedRenderer(webContents) &&
        details?.isMainFrame !== false &&
        isTrustedPermissionOrigin(details?.securityOrigin) &&
        isTrustedPermissionOrigin(details?.requestingUrl);

      if (trustedRequest && permission === 'clipboard-sanitized-write') {
        callback(true);
        return;
      }
      if (!trustedRequest || permission !== 'media' || !isCameraOnlyRequest(details)) {
        callback(false);
        return;
      }

      void requestOperatingSystemCameraPermission()
        .then((granted) => callback(granted))
        .catch(() => callback(false));
    },
  );

  // VisionGuard never needs screen capture; explicitly deny display-media requests.
  appSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
}

function configureIpc() {
  ipcMain.removeAllListeners(SET_MONITORING_ACTIVE_CHANNEL);
  ipcMain.on(SET_MONITORING_ACTIVE_CHANNEL, (event, active) => {
    if (!isTrustedRenderer(event.sender) || typeof active !== 'boolean') return;
    setMonitoringActive(active);
  });
}

async function registerLocalAppProtocol() {
  await protocol.handle(APP_SCHEME, async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    const resourcePath = resolveDistResource(request.url);
    if (!resourcePath) return new Response('Not found', { status: 404 });

    try {
      const fileResponse = await net.fetch(pathToFileURL(resourcePath).toString(), {
        method: request.method,
      });
      if (resourcePath !== distIndexPath) return fileResponse;

      const headers = new Headers(fileResponse.headers);
      headers.set('Content-Security-Policy', CSP);
      headers.set('Permissions-Policy', 'camera=(self), microphone=(), display-capture=()');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      return new Response(fileResponse.body, {
        status: fileResponse.status,
        statusText: fileResponse.statusText,
        headers,
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function configureApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { label: 'Quit VisionGuard AI', accelerator: 'Cmd+Q', click: quitApplication },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { label: 'Hide window', click: hideMainWindow },
        ],
      },
    ]),
  );
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.on('before-quit', () => {
    isQuitting = true;
    stopMonitoringPowerBlocker();
  });
  app.on('will-quit', () => {
    stopMonitoringPowerBlocker();
    ipcMain.removeAllListeners(SET_MONITORING_ACTIVE_CHANNEL);
    if (tray && !tray.isDestroyed()) tray.destroy();
  });
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
    else showMainWindow();
  });
  // Closing the window hides it, so this event is normally reached only while
  // explicitly quitting or after an unexpected renderer/window failure.
  app.on('window-all-closed', () => {});

  void app
    .whenReady()
    .then(async () => {
      if (process.platform === 'win32') app.setAppUserModelId('ai.visionguard.desktop');
      if (!existsSync(distIndexPath)) {
        dialog.showErrorBox(
          'VisionGuard AI build not found',
          'The local dist/index.html file is missing. Run npm run build before starting the desktop app.',
        );
        quitApplication();
        return;
      }

      await registerLocalAppProtocol();
      configurePermissions();
      configureIpc();
      configureApplicationMenu();
      createMainWindow();
      await createTray();
    })
    .catch((error) => {
      dialog.showErrorBox(
        'VisionGuard AI could not start',
        error instanceof Error ? error.message : String(error),
      );
      quitApplication();
    });
}
