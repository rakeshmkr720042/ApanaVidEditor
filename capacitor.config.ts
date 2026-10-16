import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.clipcut.editor',
  appName: 'ApanaVidEditor',
  webDir: 'dist',
  android: { allowMixedContent: false },
}

export default config
