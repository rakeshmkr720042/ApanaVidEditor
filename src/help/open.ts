/** Opens the User guide from anywhere: openHelp() for the contents, openHelp('speed') for one topic. */
export const HELP_EVENT = 'apna:help'

export function openHelp(topic?: string) {
  window.dispatchEvent(new CustomEvent(HELP_EVENT, { detail: topic ?? null }))
}
