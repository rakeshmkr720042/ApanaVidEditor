import { fileURLToPath } from 'node:url'
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
        // App shell is precached (the AI worker with its engine is a few MB, so the limit is
        // raised); the 32 MB ffmpeg core, the 14 MB ONNX runtime and the fonts are cached on
        // first use. AI models are kept by transformers.js in its own cache.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        globIgnores: ['ffmpeg/**', 'fonts/**', 'ort/**', 'models/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => ['/ffmpeg/', '/fonts/', '/ort/'].some((d) => url.pathname.includes(d)),
            handler: 'CacheFirst',
            options: { cacheName: 'clipcut-assets', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // transformers.js imports the WebGPU build, which embeds a 27 MB wasm we don't use: the AI
      // worker runs on the CPU build, whose runtime files are copied to public/ort.
      'onnxruntime-web/webgpu': fileURLToPath(new URL('node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url)),
    },
  },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
})
