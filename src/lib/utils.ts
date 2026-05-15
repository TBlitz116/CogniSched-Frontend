// Tiny generic helpers used across the UI. Put new general-purpose helpers here so
// page/component files stay focused on rendering.

// Returns a "count + word" string with English pluralisation, e.g.
//   pluralize('meeting', 1) -> "1 meeting"
//   pluralize('meeting', 3) -> "3 meetings"
// Pass a custom suffix for irregular plurals: pluralize('class', 2, 'es') -> "2 classes".
export function pluralize(word: string, count: number, suffix: string = 's'): string {
  return `${count} ${word}${count === 1 ? '' : suffix}`
}

// Constrain a number to the range [min, max].
// Handy for things like progress bars or scroll positions where we don't want overflow.
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
