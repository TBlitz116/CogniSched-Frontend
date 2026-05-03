export function pluralize(word: string, count: number, suffix: string = 's'): string {
  return `${count} ${word}${count === 1 ? '' : suffix}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
