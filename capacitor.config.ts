import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.clipcut.editor',
  appName: 'Apna Editor',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    // Android 15+ draws apps under the status and navigation bars; this keeps the editor between them
    adjustMarginsForEdgeToEdge: 'auto',
  },
}

export default config
