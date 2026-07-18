import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.visionguard.mobile',
  appName: 'VisionGuard AI',
  webDir: 'dist',
  server: {
    // Keep the WebView in a secure context so getUserMedia and the locally
    // bundled MediaPipe model use the same browser APIs as the HTTPS build.
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#071c24',
    allowMixedContent: false,
  },
};

export default config;
