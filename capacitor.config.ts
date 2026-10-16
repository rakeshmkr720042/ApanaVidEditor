import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.clipcut.editor',
  appName: 'ClipCut',
  webDir: 'dist',
  android: { allowMixedContent: false },
}

export default config
