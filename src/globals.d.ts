/** App version from package.json (vite.config.ts define). */
declare const __APP_VERSION__: string

declare module '@jitsi/rnnoise-wasm/dist/rnnoise-sync.js' {
  const create: () => unknown
  export default create
}
