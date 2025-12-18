export function hashToHsl(input: string, s = 55, l = 78): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    // simple deterministic hash
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} ${s}% ${l}%)`;
}

export function utilizationToBg(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  // green-ish for fuller, gray-ish for empty
  const hue = 140;
  const sat = 40 + clamped * 35;
  const light = 92 - clamped * 24;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

export function readableTextOn(bgHsl: string): string {
  // Very lightweight heuristic: if lightness is high, use dark text.
  const m = /\s(\d+(?:\.\d+)?)%\)$/.exec(bgHsl);
  const light = m ? Number(m[1]) : 80;
  return light > 65 ? "#0f172a" : "#f8fafc";
}
