import type { IconName } from '../components/Icon'

/**
 * The User guide (Help → User guide, F1). Every feature area is one file in ./sections/ that
 * default-exports a HelpSection; files are picked up by themselves (no list to edit), so a new
 * feature only needs a new file, or a new topic in the file of its area.
 *
 * Each topic is written twice, once per language. Both are required, so a feature can never
 * ship with only one language.
 */
export type HelpLang = 'en' | 'hi'

/** Text in both languages. */
export interface Both { en: string; hi: string }

/** One topic, in one language. */
export interface TopicText {
  title: string
  /** One or two sentences: what it does and when to use it. */
  what: string
  /** Where it is in the app, e.g. "Select a clip → toolbar → Speed". */
  where?: string
  /** Numbered steps. */
  steps: string[]
  /** Good to know: tips, limits, phone vs computer. */
  tips?: string[]
}

/** What the "Show me" button points at. */
export interface HelpFind {
  /** A toolbar button, by its English label (the same label the editor's toolbar uses). */
  tool?: string
  /** Any other element, e.g. '[data-help="export"]'. */
  selector?: string
  /**
   * What must be done first for it to appear: open a project, select a clip, an overlay, a text,
   * an audio item, or select nothing (the main toolbar). Used for the hint when it is not on screen.
   */
  needs?: 'project' | 'clip' | 'item' | 'overlay' | 'text' | 'audio' | 'nothing' | 'home'
}

export type Platform = 'web' | 'android' | 'windows'

export interface HelpTopic {
  /** Unique across the whole guide; used in links: openHelp('speed'). */
  id: string
  en: TopicText
  hi: TopicText
  find?: HelpFind
  /** Leave out when it works everywhere. */
  platforms?: Platform[]
  /** A Pro feature (shows the crown). */
  pro?: boolean
  /** Extra words people may search for, any language or Hinglish (e.g. 'tez', 'slow motion'). */
  keywords?: string[]
  /** Shows "New" in the guide. Set on new features; remove after a few releases. */
  isNew?: boolean
  /** A built-in block shown under the steps (the full shortcut table). */
  extra?: 'shortcuts'
  /** Other topics to read next (ids). */
  related?: string[]
}

export interface HelpSection {
  /** Unique; also the file name. */
  id: string
  /** Position in the contents (10, 20, 30…; leave gaps so others can slot in). */
  order: number
  icon: IconName
  title: Both
  /** A line under the section title. */
  intro?: Both
  topics: HelpTopic[]
}
