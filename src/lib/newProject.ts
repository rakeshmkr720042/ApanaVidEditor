import { listProjects, saveProject } from './db'
import { emptyProject } from '../model/useEditor'
import { uid } from './format'
import { t } from './i18n'

/** Creates an empty project and returns its id. */
export async function createProject() {
  const id = uid()
  const n = (await listProjects().catch(() => [])).length + 1
  await saveProject({ id, name: `${t('Project')} ${n}`, updatedAt: Date.now(), data: emptyProject(), mediaIds: [], thumb: null, duration: 0 })
  return id
}
