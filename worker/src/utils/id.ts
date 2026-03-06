export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
