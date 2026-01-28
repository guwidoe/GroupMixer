export function getAttributeKeys(problemPeople: Array<{ attributes?: Record<string, string> }>): string[] {
  const keys = new Set<string>();
  for (const p of problemPeople) {
    const attrs = p.attributes || {};
    for (const k of Object.keys(attrs)) {
      if (k === "name") continue;
      keys.add(k);
    }
  }
  return Array.from(keys).sort();
}
