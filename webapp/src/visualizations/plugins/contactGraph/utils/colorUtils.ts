function clampByte(x: number): number {
  return Math.max(0, Math.min(255, Math.round(x)));
}

export function hslToRgb(h: number, sPct: number, lPct: number): { r: number; g: number; b: number } {
  const s = sPct / 100;
  const l = lPct / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = ((h % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: clampByte((rp + m) * 255),
    g: clampByte((gp + m) * 255),
    b: clampByte((bp + m) * 255),
  };
}

export function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hashToHex(input: string, s = 55, l = 55): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return rgbToHex(hslToRgb(h % 360, s, l));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function sessionHue(sessionIndex: number, sessionCount: number): number {
  if (sessionCount <= 1) return 210;
  return (sessionIndex / (sessionCount - 1)) * 300;
}

export function countToColor(count: number, max: number): string {
  const t = max > 0 ? Math.min(1, count / max) : 0;
  const hue = lerp(210, 10, t);
  const sat = lerp(35, 70, t);
  const light = lerp(70, 50, t);
  return rgbToHex(hslToRgb(hue, sat, light));
}
