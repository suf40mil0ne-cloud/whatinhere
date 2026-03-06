export function normalizeAddress(value?: string): string {
  if (!value) return "";
  return value
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .replace(/지번/g, "")
    .trim()
    .toLowerCase();
}

export function roadJibunSimilarity(roadA?: string, roadB?: string, jibunA?: string, jibunB?: string): number {
  const nrA = normalizeAddress(roadA);
  const nrB = normalizeAddress(roadB);
  const njA = normalizeAddress(jibunA);
  const njB = normalizeAddress(jibunB);

  if (nrA && nrB && nrA === nrB) return 1;
  if (njA && njB && njA === njB) return 1;

  const token = (value: string) => new Set(value.split(" ").filter(Boolean));
  const overlap = (a: Set<string>, b: Set<string>) => {
    let count = 0;
    a.forEach((v) => {
      if (b.has(v)) count += 1;
    });
    return a.size === 0 && b.size === 0 ? 0 : count / Math.max(a.size, b.size);
  };

  return Math.max(overlap(token(nrA), token(nrB)), overlap(token(njA), token(njB)));
}
