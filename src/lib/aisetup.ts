import { desktop, type ComputerInfo } from './desktop'
import { findLocalAI, localAI } from './localai'

/**
 * First-use Local AI setup for the Windows app. The first time an AI tool is opened and no Local
 * AI is set up, the app offers (once) to check this computer and install a free Gemma 4 model
 * that fits it. Nothing is downloaded until the user agrees in the dialog.
 */

export interface GemmaPlan {
  model: string
  name: string
  /** Download size in GB, from the Ollama library. */
  size: number
  /** Simple words for who it suits. */
  fits: string
  ok: (c: ComputerInfo) => boolean
}

/** From small to big. The biggest one this computer can run well is recommended. */
export const PLANS: GemmaPlan[] = [
  { model: 'gemma4:e2b-it-qat', name: 'Gemma 4 E2B', size: 4.3, fits: 'Small and quick. For 8 GB memory or less.', ok: (c) => c.ram >= 6 },
  { model: 'gemma4:e4b-it-qat', name: 'Gemma 4 E4B', size: 6.1, fits: 'Good all-rounder. For 12 GB memory or more, or a 6 GB graphics card.', ok: (c) => c.ram >= 12 || c.vram >= 6 },
  { model: 'gemma4:12b-it-qat', name: 'Gemma 4 12B', size: 7.2, fits: 'Better writing. Needs a graphics card with 10 GB or more.', ok: (c) => c.vram >= 10 },
  { model: 'gemma4:26b-a4b-it-qat', name: 'Gemma 4 26B', size: 16, fits: 'Best quality. Needs a 20 GB graphics card or 48 GB memory.', ok: (c) => c.vram >= 20 || c.ram >= 48 },
]

/** Ollama's installer, roughly; it carries the graphics card libraries. */
export const OLLAMA_SIZE = 1.2

export function recommend(c: ComputerInfo): GemmaPlan {
  return [...PLANS].reverse().find((p) => p.ok(c)) ?? PLANS[0]
}

/** GB that must be free on the disk for this plan (with some room to spare). */
export const needDisk = (p: GemmaPlan, c: ComputerInfo) => p.size + (c.ollamaInstalled ? 0 : OLLAMA_SIZE + 3) + 2

/** A Gemma 4 model that is already downloaded, if any. */
export const haveGemma = (c: ComputerInfo) => c.models.find((m) => /^gemma4/i.test(m)) ?? null

export const canSetUp = () => !!desktop?.aiCheck && desktop.platform === 'win32'

const ASKED = 'local-ai-offer'
export const AI_SETUP_EVENT = 'apna:ai-setup'

/** Opens the setup dialog (Home → Local AI → Set up automatically). */
export function openAISetup() {
  window.dispatchEvent(new CustomEvent(AI_SETUP_EVENT))
}

/**
 * Call when an AI tool opens. On the Windows app, when no Local AI is set up and the user hasn't
 * been asked before, offers the setup once. Uses Ollama quietly if it is already running.
 */
export async function offerAISetup() {
  if (!canSetUp() || localAI()) return
  try { if (localStorage.getItem(ASKED)) return } catch { return }
  if (await findLocalAI()) return
  try { localStorage.setItem(ASKED, '1') } catch { /* private mode */ }
  openAISetup()
}
