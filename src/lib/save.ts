import { Capacitor } from '@capacitor/core'
import { error, info } from './blackbox'

export const isNative = Capacitor.isNativePlatform()

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Bytes per write. Each piece crosses to Android as base64 text, so it must stay small. */
const PIECE = 3 << 20

/**
 * On Android, writes the video to Documents/Apna Editor and opens the share sheet.
 * Big files go over in 3 MB pieces: sending a whole 300 MB video as one base64 string needed
 * about 1 GB of memory at once (text in the page, then again in Java), which closed the app.
 */
export async function saveNative(blob: Blob, name: string, share: boolean) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const path = `Apna Editor/${name}`
  const pieces = Math.max(1, Math.ceil(blob.size / PIECE))
  info(`Saving file ${name}`, `${(blob.size / 1048576).toFixed(1)} MB in ${pieces} piece(s)`)
  let uri = ''
  try {
    for (let i = 0; i < pieces; i++) {
      const data = await toBase64(blob.slice(i * PIECE, (i + 1) * PIECE))
      if (i === 0) uri = (await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true })).uri
      else await Filesystem.appendFile({ path, data, directory: Directory.Documents })
    }
  } catch (e) {
    error(`Could not save ${name}`, e)
    throw e
  }
  if (share) {
    const { Share } = await import('@capacitor/share')
    await Share.share({ title: name, files: [uri] })
  }
  return uri
}

/** On Android, writes a text file to Documents/Apna Editor (no share sheet). */
export async function saveTextNative(name: string, text: string) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const { uri } = await Filesystem.writeFile({ path: `Apna Editor/${name}`, data: text, encoding: Encoding.UTF8, directory: Directory.Documents, recursive: true })
  return uri
}

/**
 * Saves small text files such as subtitles. On Android they go to
 * Documents/Apna Editor and the share sheet opens; elsewhere the browser downloads them.
 */
export async function saveTextFiles(files: { name: string; text: string }[], type = 'application/x-subrip') {
  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const uris: string[] = []
    for (const f of files) {
      const { uri } = await Filesystem.writeFile({
        path: `Apna Editor/${f.name}`, data: f.text, encoding: Encoding.UTF8, directory: Directory.Documents, recursive: true,
      })
      uris.push(uri)
    }
    const { Share } = await import('@capacitor/share')
    await Share.share({ title: files.length === 1 ? files[0].name : 'Files', files: uris }).catch(() => {})
    return
  }
  for (const [i, f] of files.entries()) {
    // a short gap so the browser does not drop downloads that start together
    if (i) await new Promise((r) => setTimeout(r, 400))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([f.text], { type: `${type};charset=utf-8` }))
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
}

/** A file-name-safe version of a project name. */
export const fileBase = (name: string) => name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'subtitles'
