import { useEffect, useRef, useState } from 'react'
import { Home } from './components/Home'
import { Editor } from './components/Editor'
import { AdminScreen } from './components/AdminScreen'
import { BlockedScreen, DesktopSignIn, desktopSignInRequest, LoadingScreen } from './components/AuthScreen'
import { PayPage, payPageRequest } from './components/PayPage'
import { AccountContext, useAccount } from './lib/account'
import './lib/razorpay'
import { requestPersistence } from './lib/db'
import { hasPendingFiles, listenForOpenedFiles } from './lib/desktop'
import { createProject } from './lib/newProject'
import { HelpHost } from './help/HelpHost'
import { AISetupHost } from './components/AISetupHost'

/** Set when the Windows app opened the website to sign in with Google (read once, before anything else). */
const desktopSignIn = desktopSignInRequest()
/** Set when the Windows app opened the website to pay for Pro. */
const payRequest = payPageRequest()

export default function App() {
  const [langKey, setLangKey] = useState(0)
  const onLang = () => setLangKey((k) => k + 1)
  if (desktopSignIn) return <DesktopSignIn key={langKey} {...desktopSignIn} onLang={onLang} />
  if (payRequest) return <PayPage key={langKey} {...payRequest} onLang={onLang} />
  return <Gate langKey={langKey} onLang={onLang} />
}

/**
 * The app works without an account (Free, with ads). An account is needed only to buy or restore Pro;
 * signing in happens from the Account button or the Pro screen. A suspended account sees only its notice
 * (signing out there goes back to free use).
 */
function Gate({ langKey, onLang }: { langKey: number; onLang: () => void }) {
  const account = useAccount()
  if (account.status === 'loading') return <LoadingScreen />
  if (account.status === 'blocked') return <BlockedScreen key={langKey} onLang={onLang} />
  return <AccountContext.Provider value={account}><Workspace /></AccountContext.Provider>
}

/** Two screens: the project list and the editor. The open project is kept in the URL hash. */
function Workspace() {
  const [projectId, setProjectId] = useState<string | null>(() => location.hash.match(/^#p=(\w+)/)?.[1] ?? null)
  const [admin, setAdmin] = useState(() => location.hash === '#admin')
  const [langKey, setLangKey] = useState(0)

  useEffect(() => { requestPersistence() }, [])

  // Desktop app: files opened from the File menu or Explorer go into the open project, or a new one.
  const projectRef = useRef(projectId)
  useEffect(() => { projectRef.current = projectId }, [projectId])
  useEffect(() => listenForOpenedFiles(() => {
    if (!projectRef.current && hasPendingFiles()) createProject().then((id) => { location.hash = `p=${id}` })
  }), [])
  useEffect(() => {
    const onHash = () => { setProjectId(location.hash.match(/^#p=(\w+)/)?.[1] ?? null); setAdmin(location.hash === '#admin') }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const open = (id: string) => { location.hash = `p=${id}` }
  const back = () => { history.length > 1 && location.hash ? history.back() : (location.hash = '') }

  if (admin) return <AdminScreen onBack={back} />
  return (
    <>
      {projectId
        ? <Editor key={projectId + langKey} projectId={projectId} onBack={back} />
        : <Home key={langKey} onOpen={open} onLang={() => setLangKey((k) => k + 1)} />}
      <HelpHost />
      <AISetupHost />
    </>
  )
}
