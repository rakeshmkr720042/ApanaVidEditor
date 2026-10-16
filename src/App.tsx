import { useEffect, useState } from 'react'
import { Home } from './components/Home'
import { Editor } from './components/Editor'
import { requestPersistence } from './lib/db'

/** Two screens: the project list and the editor. The open project is kept in the URL hash. */
export default function App() {
  const [projectId, setProjectId] = useState<string | null>(() => location.hash.match(/^#p=(\w+)/)?.[1] ?? null)
  const [langKey, setLangKey] = useState(0)

  useEffect(() => { requestPersistence() }, [])
  useEffect(() => {
    const onHash = () => setProjectId(location.hash.match(/^#p=(\w+)/)?.[1] ?? null)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const open = (id: string) => { location.hash = `p=${id}` }
  const back = () => { history.length > 1 && location.hash ? history.back() : (location.hash = '') }

  return projectId
    ? <Editor key={projectId + langKey} projectId={projectId} onBack={back} />
    : <Home key={langKey} onOpen={open} onLang={() => setLangKey((k) => k + 1)} />
}
