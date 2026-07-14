export interface HexCoord {
  q: number;
  r: number;
  s: number;
}

export const HEX_DIR: HexCoord[] = [
  { q: 1, r: -1, s: 0 },
  { q: 1, r: 0, s: -1 },
  { q: 0, r: 1, s: -1 },
  { q: -1, r: 1, s: 0 },
  { q: -1, r: 0, s: 1 },
  { q: 0, r: -1, s: 1 },
];

export const hk = (q: number, r: number) => `${q},${r}`;

export const hexToPixel = (q: number, r: number, size: number) => ({
  x: size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r),
  y: size * (1.5 * r),
});

export const pixelToHex = (px: number, py: number, size: number) => {
  const q0 = (Math.sqrt(3) / 3 * px - py / 3) / size;
  const r0 = ((2 / 3) * py) / size;
  let rq = Math.round(q0);
  let rr = Math.round(r0);
  let rs = Math.round(-q0 - r0);
  const dq = Math.abs(rq - q0);
  const dr = Math.abs(rr - r0);
  const ds = Math.abs(rs - (-q0 - r0));

  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;

  return { q: rq, r: rr };
};

export const hexPts = (cx: number, cy: number, size: number, inset = 0) => {
  const s = size - inset;
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (Math.PI / 3) * i;
    return `${cx + s * Math.cos(a)},${cy + s * Math.sin(a)}`;
  }).join(',');
};

export const hexNeighbors = (q: number, r: number) =>
  HEX_DIR.map((d) => ({ q: q + d.q, r: r + d.r, s: -q - d.q - r - d.r }));

export const hexDist = (q1: number, r1: number, q2: number, r2: number) =>
  Math.round((Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2);

export const screenToWorld = (
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  scale: number,
  sw: number,
  sh: number
) => ({ x: (sx - cx - sw / 2) / scale, y: (sy - cy - sh / 2) / scale });

export const worldToScreen = (
  wx: number,
  wy: number,
  cx: number,
  cy: number,
  scale: number,
  sw: number,
  sh: number
) => ({ x: wx * scale + cx + sw / 2, y: wy * scale + cy + sh / 2 });
