import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isDesktop } from './lib/desktop'
import { finishWebSignIn } from './lib/youtube'
import { listenForBack } from './lib/back'

if (import.meta.env.PROD && !isDesktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }))
}

// the YouTube sign-in popup lands back on this page: hand the token to the app and close
if (!finishWebSignIn()) {
  listenForBack()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
