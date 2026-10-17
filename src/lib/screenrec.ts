import { fetchFile } from '@ffmpeg/util'
import { getFFmpeg, runFFmpeg } from './ffmpeg'

/** Screen capture needs getDisplayMedia: desktop browsers and the Windows app, not Android. */
export const canRecordScreen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia

export type Surface = 'monitor' | 'window' | 'browser'

/** Asks the user to share a screen, window or tab, optionally with the computer's sound. */
export async function captureScreen(surface: Surface, systemAudio: boolean) {
  return navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: surface, frameRate: { ideal: 30, max: 60 } },
    audio: systemAudio,
    // Chromium-only hints; other browsers ignore them
    selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: systemAudio ? 'include' : 'exclude',
    monitorTypeSurfaces: 'include',
  } as DisplayMediaStreamOptions)
}

export function recorderMime() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  return types.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

/**
 * One stream with the screen picture plus the computer sound and/or microphone mixed together.
 * Call the returned stop() to release the microphone and the mixer.
 */
export function mixStreams(screen: MediaStream, mic: MediaStream | null) {
  const audio = [...screen.getAudioTracks(), ...(mic?.getAudioTracks() ?? [])]
  if (audio.length <= 1) {
    return { stream: new MediaStream([...screen.getVideoTracks(), ...audio]), stop: () => mic?.getTracks().forEach((t) => t.stop()) }
  }
  const ac = new AudioContext()
  const dest = ac.createMediaStreamDestination()
  for (const s of [screen, mic!]) {
    if (s.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(dest)
  }
  return {
    stream: new MediaStream([...screen.getVideoTracks(), ...dest.stream.getAudioTracks()]),
    stop: () => { mic?.getTracks().forEach((t) => t.stop()); ac.close().catch(() => {}) },
  }
}

/**
 * Browser recordings have no duration or seek index, which makes them slow to scrub and export.
 * A stream copy through ffmpeg adds both without re-encoding. Falls back to the original file.
 */
export async function finishRecording(blob: Blob): Promise<Blob> {
  if (!blob.type.includes('webm') || blob.size > 400 * 1048576) return blob
  try {
    const ff = await getFFmpeg()
    await ff.writeFile('rec.webm', await fetchFile(blob))
    try {
      const { code } = await runFFmpeg(['-i', 'rec.webm', '-map', '0', '-c', 'copy', 'rec-fixed.webm'])
      if (code !== 0) return blob
      const data = (await ff.readFile('rec-fixed.webm')) as Uint8Array
      return data.length ? new Blob([data.slice().buffer], { type: 'video/webm' }) : blob
    } finally {
      await ff.deleteFile('rec.webm').catch(() => {})
      await ff.deleteFile('rec-fixed.webm').catch(() => {})
    }
  } catch {
    return blob
  }
}
