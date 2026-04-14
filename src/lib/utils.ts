export function pluralize(word: string, count: number, suffix: string = 's'): string {
  return `${count} ${word}${count === 1 ? '' : suffix}`
}
