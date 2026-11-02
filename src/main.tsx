import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isDesktop } from './lib/desktop'
import { finishWebSignIn } from './lib/youtube'
import { listenForBack } from './lib/back'

if (import.meta.env.PROD && !isDesktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }))
  // A new version took over: load it at once, so nobody keeps an old cached app. Not while a
  // project is open in the editor (it reloads on the next launch instead).
  const hadOld = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadOld && !/[#&]p=/.test(location.hash)) location.reload()
  })
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
