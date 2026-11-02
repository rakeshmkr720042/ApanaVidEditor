import { useEffect, useRef, useState } from 'react'
import { Home } from './components/Home'
import { Editor } from './components/Editor'
import { AdminScreen } from './components/AdminScreen'
import { AuthScreen, BlockedScreen, LoadingScreen, VerifyScreen } from './components/AuthScreen'
import { useAccount } from './lib/account'
import { requestPersistence } from './lib/db'
import { hasPendingFiles, listenForOpenedFiles } from './lib/desktop'
import { createProject } from './lib/newProject'

/** Nothing of the app shows until someone is signed in with a confirmed email. */
export default function App() {
  const account = useAccount()
  const [langKey, setLangKey] = useState(0)
  const onLang = () => setLangKey((k) => k + 1)
  if (account.status === 'loading') return <LoadingScreen />
  if (account.status === 'out') return <AuthScreen key={langKey} onLang={onLang} />
  if (account.status === 'unverified') return <VerifyScreen key={langKey} email={account.user.email ?? ''} onLang={onLang} />
  if (account.status === 'blocked') return <BlockedScreen key={langKey} onLang={onLang} />
  return <Workspace key={account.user.uid} />
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
  return projectId
    ? <Editor key={projectId + langKey} projectId={projectId} onBack={back} />
    : <Home key={langKey} onOpen={open} onLang={() => setLangKey((k) => k + 1)} />
}
