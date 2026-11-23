import type { MediaSource, Project } from '../types'
import type { Selection } from '../model/useEditor'
import type { S } from './schema'

/** What the agent knows about the editor right now (never the media itself). */
export interface AgentCtx {
  sources: Record<string, MediaSource>
  sel: Selection
  /** Playhead, timeline seconds. */
  playhead: number
  lang: 'en' | 'hi'
}

/** What a tool may ask the editor to do after the edit: open a tool's panel, select something. */
export interface After { open?: string; select?: Selection }

/** One action of a plan: a tool name and its arguments, as the AI or the quick parser wrote them. */
export interface Step { tool: string; args: Record<string, unknown> }

/** A feature the request needs that the editor does not have yet. */
export interface Missing { need: string; why?: string }

export interface Plan {
  /** The request in the agent's words (shown first on the plan card). */
  understood: string
  steps: Step[]
  missing: Missing[]
  /** Questions back to the user when the request is not clear. */
  questions: string[]
  /** 'quick': understood without AI; 'ai': written by the AI model. */
  by: 'quick' | 'ai'
}

/** Text in both app languages. */
export interface Both { en: string; hi: string }

export type ToolGroup = 'edit' | 'add' | 'text' | 'look' | 'audio' | 'project' | 'open' | 'meta'

export interface AgentTool {
  name: string
  group: ToolGroup
  /** One line about what it does, shown to the AI. */
  say: string
  /** Words (English, Hinglish, Hindi) that suggest this tool; used to pick which tools the AI sees. */
  words: string[]
  params: Extract<S, { type: 'object' }>
  /** The toolbar labels this tool covers (for the coverage test). */
  covers?: string[]
  /** Pure: returns the changed project (never changes `p`). Throws AgentError when it can't. */
  run(p: Project, args: Record<string, unknown>, ctx: AgentCtx, after: After): Project
  /** One line for the plan card. */
  describe(args: Record<string, unknown>, ctx: AgentCtx): Both
}

/** A step that can't be done, with the reason in both languages. */
export class AgentError extends Error {
  hi: string
  constructor(en: string, hi?: string) { super(en); this.hi = hi ?? en }
}
