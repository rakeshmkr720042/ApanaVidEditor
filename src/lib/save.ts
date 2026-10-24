import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** On Android, writes the video to Documents/ApanaVidEditor and opens the share sheet. */
export async function saveNative(blob: Blob, name: string, share: boolean) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { uri } = await Filesystem.writeFile({
    path: `ApanaVidEditor/${name}`,
    data: await toBase64(blob),
    directory: Directory.Documents,
    recursive: true,
  })
  if (share) {
    const { Share } = await import('@capacitor/share')
    await Share.share({ title: name, files: [uri] })
  }
  return uri
}

/**
 * Saves small text files such as subtitles. On Android they go to
 * Documents/ApanaVidEditor and the share sheet opens; elsewhere the browser downloads them.
 */
export async function saveTextFiles(files: { name: string; text: string }[]) {
  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const uris: string[] = []
    for (const f of files) {
      const { uri } = await Filesystem.writeFile({
        path: `ApanaVidEditor/${f.name}`, data: f.text, encoding: Encoding.UTF8, directory: Directory.Documents, recursive: true,
      })
      uris.push(uri)
    }
    const { Share } = await import('@capacitor/share')
    await Share.share({ title: files.length === 1 ? files[0].name : 'Subtitles', files: uris }).catch(() => {})
    return
  }
  for (const [i, f] of files.entries()) {
    // a short gap so the browser does not drop downloads that start together
    if (i) await new Promise((r) => setTimeout(r, 400))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([f.text], { type: 'application/x-subrip;charset=utf-8' }))
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
}

/** A file-name-safe version of a project name. */
export const fileBase = (name: string) => name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'subtitles'
