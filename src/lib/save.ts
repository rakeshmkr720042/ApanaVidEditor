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

/** On Android, writes the video to Documents/ClipCut and opens the share sheet. */
export async function saveNative(blob: Blob, name: string, share: boolean) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { uri } = await Filesystem.writeFile({
    path: `ClipCut/${name}`,
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
