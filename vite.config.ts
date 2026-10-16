import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative base so the same build works on a web host and inside Capacitor.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // registered in main.tsx, skipped in the desktop app (service workers don't run on app://)
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'ApanaVidEditor',
        short_name: 'ApanaVidEditor',
        description: 'Lightweight offline video editor',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell is precached; the 32 MB ffmpeg core and the fonts are cached on first use.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['ffmpeg/**', 'fonts/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/ffmpeg/') || url.pathname.includes('/fonts/'),
            handler: 'CacheFirst',
            options: { cacheName: 'clipcut-assets', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
})
