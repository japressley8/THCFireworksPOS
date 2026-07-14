import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, RotateCcw, Tent } from 'lucide-react';
import { triggerConfetti } from '../shared/confettiUtils';
import {
  genContinentColors,
  getPlayerColors,
  getTheme,
  parseColorToRgb,
} from '../shared/colorUtils';
import {
  HEX_DIR,
  hk,
  hexToPixel,
  pixelToHex,
  hexPts,
  hexNeighbors,
  hexDist,
  screenToWorld,
  worldToScreen,
  type HexCoord,
} from '../shared/hexUtils';

// ============================================================
// GameProps (matches existing Easter Egg architecture)
// ============================================================
interface GameProps {
  cachedState: any;
  onSaveCache: (state: any) => void;
  onClose: () => void;
}

// ============================================================
// Type Definitions
// ============================================================
type Phase = 'LOBBY' | 'DRAFT' | 'REINFORCE' | 'ATTACK' | 'FORTIFY' | 'GAMEOVER';
type SetupMode = 'auto' | 'draft';
type AutoMode = 'random' | 'clumped';
type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export interface HexCell {
  id: string;
  q: number; r: number; s: number;
  continentId: number | null;
  owner: number | null;
  troops: number;
  isCapital: boolean;
}

export interface ContinentData {
  id: number;
  hexIds: string[];
  fillColor: string;
  borderColor: string;
}

interface PlayerState {
  id: number;
  suit: Suit;
  color: string;
}

export interface LobbyConfig {
  playerCount: number;
  continentCount: number;
  continentSize: number;
  setupMode: SetupMode;
  autoMode: AutoMode;
}

interface GameState {
  phase: Phase;
  lobbyConfig: LobbyConfig;
  players: PlayerState[];
  currentPlayerIdx: number;
  cells: Record<string, HexCell>;
  continents: ContinentData[];
  totalHexes: number;
  turn: number;
  reinforcementsLeft: number;
  winner: number | null;
  eliminatedPlayers: number[];
  draftOrder: number[];
  draftStep: number;
}

interface CombatResult {
  atkDice: number[];
  defDice: number[];
  atkLoss: number;
  defLoss: number;
}

interface TroopUnit {
  id: string;
  status: 'alive' | 'dying';
  x?: number;
  y?: number;
}

interface DiceAnimState {
  active: boolean;
  atkDice: number[];
  defDice: number[];
  displayAtkDice: number[];
  displayDefDice: number[];
  atkLoss: number;
  defLoss: number;
  animPhase: 'marching' | 'rolling' | 'settling' | 'comparing' | 'summary' | 'dying' | 'choice' | 'conquered';
  attackHexId: string;
  defendHexId: string;
  conquered: boolean;
  attackerTroops: number;
  defenderTroops: number;
  attackerUnits: TroopUnit[];
  defenderUnits: TroopUnit[];
}

// ============================================================
// Constants
// ============================================================
const HEX_SIZE = 32;

const PLAYER_SUIT_MAP: Record<number, Suit> = { 1: 'spades', 2: 'hearts', 3: 'diamonds', 4: 'clubs' };

function getCellBorderPaths(cx: number, cy: number, size: number, offset: number, borderEdges: boolean[]) {
  const paths: string[] = [];
  const visited = new Array(6).fill(false);

  // If all 6 edges are borders, draw a complete closed hexagon loop
  if (borderEdges.every(b => b)) {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + (Math.PI / 3) * i;
      const x = cx + (size - offset) * Math.cos(a);
      const y = cy + (size - offset) * Math.sin(a);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return [`M ${pts.join(' L ')} Z`];
  }

  // Find contiguous segments of border edges
  for (let start = 0; start < 6; start++) {
    if (borderEdges[start] && !visited[start]) {
      // Trace backwards to find the true start of this contiguous segment
      let currStart = start;
      while (borderEdges[(currStart + 5) % 6]) {
        currStart = (currStart + 5) % 6;
        if (currStart === start) break;
      }

      // Trace forward to gather the contiguous segment of edges
      const segment: number[] = [];
      let curr = currStart;
      while (borderEdges[curr] && !visited[curr]) {
        visited[curr] = true;
        segment.push(curr);
        curr = (curr + 1) % 6;
      }

      if (segment.length > 0) {
        // A segment of edges [e_1, e_2, ...] spans vertices e_1, e_1+1, ... up to e_last + 1
        const dParts: string[] = [];
        for (let i = 0; i <= segment.length; i++) {
          const vIdx = (segment[0] + i) % 6;
          const a = Math.PI / 6 + (Math.PI / 3) * vIdx;
          const x = cx + (size - offset) * Math.cos(a);
          const y = cy + (size - offset) * Math.sin(a);
          dParts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
        }
        paths.push(dParts.join(' '));
      }
    }
  }
  return paths;
}


// ============================================================
// Color Utilities
// ============================================================

// ============================================================
// Map Generation
// ============================================================
// Compact hex-ring seed placement — blobs grow naturally adjacent
/*
function _seedPositions(n: number, contSize: number): HexCoord[] {
  if (n === 0) return [];
  const blobR = Math.ceil(Math.sqrt(contSize / Math.PI)) + 1;
  // spacing = blobR ensures adjacent ring seeds are close enough for BFS blobs to border
  const spacing = Math.max(2, blobR);
  // Hex ring traversal directions (axial, pointy-top)
  const ringDirs = [{ q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 }];
  const positions: HexCoord[] = [];
  let ring = 1;
  while (positions.length < n) {
    let q = ring, r = 0;
    for (let side = 0; side < 6 && positions.length < n; side++) {
      for (let step = 0; step < ring && positions.length < n; step++) {
        const sq = q * spacing, sr = r * spacing;
        positions.push({ q: sq, r: sr, s: -sq - sr });
        q += ringDirs[side].q; r += ringDirs[side].r;
      }
    }
    ring++;
  }
  return positions;
}
*/

function bfsExpand(seed: HexCoord, size: number, claimed: Set<string>): HexCoord[] {
  // Find unclaimed start near seed
  let start = seed;
  if (claimed.has(hk(seed.q, seed.r))) {
    const vis = new Set([hk(seed.q, seed.r)]);
    const q: HexCoord[] = [seed];
    let found = false;
    while (q.length && !found) {
      const cur = q.shift()!;
      for (const n of hexNeighbors(cur.q, cur.r)) {
        const k = hk(n.q, n.r);
        if (!vis.has(k)) { vis.add(k); if (!claimed.has(k)) { start = n; found = true; break; } q.push(n); }
      }
    }
    if (!found) return [];
  }
  const result: HexCoord[] = [];
  const vis = new Set([hk(start.q, start.r)]);
  const frontier: HexCoord[] = [start];
  while (frontier.length && result.length < size) {
    const idx = Math.floor(Math.pow(Math.random(), 1.5) * frontier.length);
    const hex = frontier.splice(idx, 1)[0];
    if (!claimed.has(hk(hex.q, hex.r))) {
      result.push(hex);
      for (const n of hexNeighbors(hex.q, hex.r)) {
        const k = hk(n.q, n.r);
        if (!vis.has(k) && !claimed.has(k)) { vis.add(k); frontier.push(n); }
      }
    }
  }
  return result;
}

export function generateMap(cfg: LobbyConfig, colors: { fill: string; border: string }[]) {
  let attempts = 0;
  const maxAttempts = 200;

  while (attempts < maxAttempts) {
    attempts++;
    const claimed = new Set<string>(['0,0']);
    const continents: ContinentData[] = [];
    const cells: Record<string, HexCell> = {
      '0,0': { id: '0,0', q: 0, r: 0, s: 0, continentId: null, owner: null, troops: 5, isCapital: true }
    };

    let success = true;

    for (let i = 0; i < cfg.continentCount; i++) {
      let seed: HexCoord | null = null;

      if (i === 0) {
        // First continent seed is a random neighbor of 0,0
        const nbs = hexNeighbors(0, 0);
        const eligible = nbs.filter(n => !claimed.has(hk(n.q, n.r)));
        if (eligible.length > 0) {
          seed = eligible[Math.floor(Math.random() * eligible.length)];
        }
      } else if (i === 1) {
        // Second continent seed is another neighbor of 0,0 if possible
        const nbs = hexNeighbors(0, 0);
        const eligible = nbs.filter(n => !claimed.has(hk(n.q, n.r)));
        if (eligible.length > 0) {
          seed = eligible[Math.floor(Math.random() * eligible.length)];
        }
      }

      // Fallback/standard case for i >= 2 or if no neighbor of 0,0 is available
      if (!seed) {
        const candidates: string[] = [];
        for (const key of claimed) {
          const [q, r] = key.split(',').map(Number);
          for (const nb of hexNeighbors(q, r)) {
            const nk = hk(nb.q, nb.r);
            if (!claimed.has(nk)) {
              candidates.push(nk);
            }
          }
        }
        if (candidates.length > 0) {
          const chosenKey = candidates[Math.floor(Math.random() * candidates.length)];
          const [q, r] = chosenKey.split(',').map(Number);
          seed = { q, r, s: -q - r };
        }
      }

      if (!seed) {
        success = false;
        break;
      }

      const hexes = bfsExpand(seed, cfg.continentSize, claimed);
      if (hexes.length !== cfg.continentSize) {
        success = false;
        break;
      }

      hexes.forEach(h => claimed.add(hk(h.q, h.r)));
      const { fill, border } = colors[i] || { fill: 'rgba(59,130,246,0.2)', border: 'rgba(59,130,246,0.9)' };
      continents.push({ id: i, hexIds: hexes.map(h => hk(h.q, h.r)), fillColor: fill, borderColor: border });
    }

    if (!success) continue;

    // Populate cells record
    for (const cont of continents) {
      for (const id of cont.hexIds) {
        const [q, r] = id.split(',').map(Number);
        cells[id] = { id, q, r, s: -q - r, continentId: cont.id, owner: null, troops: 0, isCapital: false };
      }
    }

    // Validate connectivity rules
    // 1. King Space (0,0) must touch >= 2 separate continents
    const kingNeighbors = hexNeighbors(0, 0).map(n => hk(n.q, n.r));
    const kingTouchingContinents = new Set<number>();
    for (const nk of kingNeighbors) {
      const cell = cells[nk];
      if (cell && cell.continentId !== null) {
        kingTouchingContinents.add(cell.continentId);
      }
    }
    if (kingTouchingContinents.size < 2) continue;

    // 2. Every continent must touch at least 2 separate entities (other continents or king)
    let allContinentsValid = true;
    for (const cont of continents) {
      const seenNeighbors = new Set<string | number>();
      for (const hexId of cont.hexIds) {
        const [q, r] = hexId.split(',').map(Number);
        for (const nb of hexNeighbors(q, r)) {
          const nk = hk(nb.q, nb.r);
          if (nk === '0,0') {
            seenNeighbors.add('king');
          } else {
            const cell = cells[nk];
            if (cell && cell.continentId !== null && cell.continentId !== cont.id) {
              seenNeighbors.add(cell.continentId);
            }
          }
        }
      }
      if (seenNeighbors.size < 2) {
        allContinentsValid = false;
        break;
      }
    }

    if (allContinentsValid) {
      return { cells, continents, totalHexes: Object.keys(cells).length };
    }
  }

  throw new Error("Failed to generate a valid map after maximum attempts. Please try again.");
}

// ============================================================
// Territory Distribution
// ============================================================
function distributeRandom(cells: Record<string, HexCell>, n: number) {
  const nc = { ...cells };
  const ids = Object.keys(cells).filter(id => !cells[id].isCapital).sort(() => Math.random() - 0.5);
  ids.forEach((id, i) => { nc[id] = { ...nc[id], owner: (i % n) + 1, troops: 1 }; });
  return nc;
}

export function distributeClumped(cells: Record<string, HexCell>, n: number) {
  const nc = { ...cells };
  const ids = Object.keys(cells).filter(id => !cells[id].isCapital);
  const idSet = new Set(ids);
  const shuffled = [...ids].sort(() => Math.random() - 0.5);

  // Pick n maximally-spread seeds
  const seeds: string[] = [shuffled[0]];
  for (let p = 1; p < n; p++) {
    let best = shuffled[0], bestD = -1;
    for (const c of shuffled) {
      if (seeds.includes(c)) continue;
      const [cq, cr] = c.split(',').map(Number);
      const d = seeds.reduce((mn, s) => { const [sq, sr] = s.split(',').map(Number); return Math.min(mn, hexDist(cq, cr, sq, sr)); }, Infinity);
      if (d > bestD) { bestD = d; best = c; }
    }
    seeds.push(best);
  }

  const assigned = new Set<string>();
  const queues = seeds.map(s => [s]);
  const assignedCount = Array(n).fill(0);
  const total = ids.length;
  const targets = Array.from({ length: n }, (_, p) => Math.floor(total / n) + (p < total % n ? 1 : 0));

  // Initialize seeds
  for (let p = 0; p < n; p++) {
    assigned.add(seeds[p]);
    nc[seeds[p]] = { ...nc[seeds[p]], owner: p + 1, troops: 1 };
    assignedCount[p] = 1;
  }

  let iters = 0;
  while (assigned.size < ids.length && iters < 200000) {
    iters++;
    let progress = false;
    for (let p = 0; p < n; p++) {
      if (assignedCount[p] >= targets[p]) continue;

      let hexAssigned = false;
      while (queues[p].length > 0 && !hexAssigned) {
        const currentId = queues[p].shift()!;
        const [q, r] = currentId.split(',').map(Number);

        // Look for unclaimed neighbor
        for (const nb of hexNeighbors(q, r)) {
          const nk = hk(nb.q, nb.r);
          if (idSet.has(nk) && !assigned.has(nk)) {
            assigned.add(nk);
            nc[nk] = { ...nc[nk], owner: p + 1, troops: 1 };
            assignedCount[p]++;
            queues[p].push(nk);
            // Put currentId back since it might have other unassigned neighbors
            queues[p].unshift(currentId);
            hexAssigned = true;
            progress = true;
            break;
          }
        }
      }
    }

    if (!progress) {
      const leftovers = ids.filter(id => !assigned.has(id));
      for (const id of leftovers) {
        const [lq, lr] = id.split(',').map(Number);
        let bestP = -1;
        let bestDist = Infinity;
        for (let p = 0; p < n; p++) {
          if (assignedCount[p] >= targets[p]) continue;
          const [sq, sr] = seeds[p].split(',').map(Number);
          const d = hexDist(lq, lr, sq, sr);
          if (d < bestDist) {
            bestDist = d;
            bestP = p;
          }
        }
        if (bestP !== -1) {
          assigned.add(id);
          nc[id] = { ...nc[id], owner: bestP + 1, troops: 1 };
          assignedCount[bestP]++;
        }
      }
      break;
    }
  }

  return nc;
}

function buildDraftOrder(n: number, total: number) {
  const order: number[] = [];
  let round = 0;
  while (order.length < total) {
    const seq = round % 2 === 0 ? Array.from({ length: n }, (_, i) => i + 1) : Array.from({ length: n }, (_, i) => n - i);
    for (const p of seq) { if (order.length < total) order.push(p); }
    round++;
  }
  return order;
}

// ============================================================
// Combat Engine
// ============================================================
function rollDice(n: number) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a);
}

function resolveCombat(atk: number, def: number): CombatResult {
  const ac = Math.min(3, atk - 1), dc = Math.min(2, def);
  const ad = rollDice(ac), dd = rollDice(dc);
  let al = 0, dl = 0;
  for (let i = 0; i < Math.min(ac, dc); i++) { if (ad[i] > dd[i]) dl++; else al++; }
  return { atkDice: ad, defDice: dd, atkLoss: al, defLoss: dl };
}

// ============================================================
// Win / Reinforcement Logic
// ============================================================
function requiredHexes(players: number, total: number) {
  if (players === 2) return total;
  if (players === 3) return Math.ceil(total * 0.9);
  return Math.ceil(total * 0.8);
}

function ownedCount(cells: Record<string, HexCell>, pid: number) {
  return Object.values(cells).filter(c => c.owner === pid).length;
}

function calcBaseReinforcements(totalHexes: number, hexesOwned: number) {
  const scalingFactor = 0.5;
  const dynamicDenominator = 3 * Math.pow(totalHexes / 42, scalingFactor);
  const calculatedTroops = Math.floor(hexesOwned / dynamicDenominator);
  return Math.max(3, calculatedTroops);
}

function calcReinforcements(cells: Record<string, HexCell>, pid: number, continents: ContinentData[]) {
  let bonus = 0;
  if (continents) {
    for (const cont of continents) {
      if (cont.hexIds.every(hexId => cells[hexId]?.owner === pid)) {
        bonus += 1;
      }
    }
  }
  const totalHexes = Object.keys(cells).length;
  const baseCount = calcBaseReinforcements(totalHexes, ownedCount(cells, pid));
  return baseCount + (cells['0,0']?.owner === pid ? 1 : 0) + bonus;
}

function checkWin(cells: Record<string, HexCell>, players: PlayerState[], elim: number[], total: number) {
  const active = players.filter(p => !elim.includes(p.id));
  if (active.length === 1) return active[0].id;
  const req = requiredHexes(players.length, total);
  for (const p of active) { if (ownedCount(cells, p.id) >= req) return p.id; }
  return null;
}

function nextActiveIdx(cur: number, players: PlayerState[], elim: number[]) {
  let idx = (cur + 1) % players.length, c = 0;
  while (elim.includes(players[idx].id) && c < players.length) { idx = (idx + 1) % players.length; c++; }
  return idx;
}

// ============================================================
// SVG Icons — paths match 2026 Solitaire Easter Egg style
// ============================================================
const SUIT_PATHS: Record<Suit, string> = {
  hearts: `m 7.4370106,12.777199 c -0.0491,-0.2454 -0.50182,-0.7919 -0.65606,-0.7919 -0.16603,0 -0.10478,-0.1004 0.1326,-0.2174 0.14606,-0.072 0.28991,-0.2351 0.40391,-0.4578 l 0.17706,-0.346 0.17555,0.3458 c 0.11372,0.224 0.25562,0.3853 0.40286,0.4578 0.23463,0.1156 0.29964,0.2176 0.13867,0.2176 -0.15194,0 -0.53165,0.4417 -0.6341,0.7376 l -0.0959,0.2771 -0.0446,-0.2228 z m -4.37087,-0.6543 c -0.0764,-0.3821 -0.45266,-0.8414 -0.83409,-1.0181 l -0.3499,-0.1621 0.22682,-0.05 c 0.3316,-0.073 0.82213,-0.5935 0.92636,-0.9831005 0.0469,-0.1756 0.10389,-0.3191 0.12656,-0.3191 0.0227,0 0.0796,0.1435 0.12657,0.3191 0.10422,0.3896005 0.59476,0.9102005 0.92635,0.9831005 l 0.22682,0.05 -0.35394,0.164 c -0.39887,0.1848 -0.75508,0.6126 -0.82636,0.9926 -0.0555,0.296 -0.13869,0.3061 -0.19519,0.024 z m 4.6099,-3.1770005 c -0.0514,-0.116 -0.16681,-0.2444 -0.25654,-0.2853 l -0.16314,-0.074 0.24181,-0.2281 c 0.13299,-0.1254 0.24193,-0.2877 0.24207,-0.3606 2.3e-4,-0.099 0.0341,-0.077 0.13483,0.088 0.074,0.1213 0.20772,0.2719 0.29714,0.3345 l 0.16257,0.1139 -0.16257,0.1138 c -0.0894,0.063 -0.21662,0.2028 -0.28268,0.3114 l -0.1201,0.1975 -0.0934,-0.211 z m 3.3584894,-0.7349 c -0.021,-0.035 -0.0616,-0.1751 -0.0903,-0.3107 -0.0759,-0.3586 -0.35521,-0.8801 -0.64051,-1.1959 -0.25709,-0.2845 -0.8626294,-0.6318 -1.1161094,-0.6401 -0.0796,0 -0.0123,-0.046 0.14946,-0.097 0.39996,-0.1251 0.7436094,-0.3468 1.0129494,-0.6536 0.25977,-0.2958 0.62969,-1.0394 0.62977,-1.2658 5e-5,-0.2776 0.12223,-0.2373 0.1691,0.056 0.0601,0.3759 0.33823,0.9164 0.64795,1.2592 0.25708,0.2846 0.86262,0.6319 1.11611,0.6401 -0.0796,0 0.0123,0.046 -0.14947,0.097 -0.78941,0.2468 -1.364,0.898 -1.59747,1.8102 -0.0514,0.2007 -0.11053,0.3361 -0.13149,0.3008 z m -5.8536194,-1.3451 c -0.0703,-0.4396 -0.44248,-0.9354 -0.86813,-1.1565 -0.35578,-0.1848 -0.35922,-0.1896 -0.16424,-0.2286 0.41813,-0.084 1.0397,-0.8739 1.06076,-1.3486 0.003,-0.078 0.0715,0.047 0.15128,0.2757 0.17302,0.4969 0.62133,0.985 0.97882,1.0657 l 0.23845,0.054 -0.24651,0.1006 c -0.47043,0.192 -0.84307,0.6466 -1.02199,1.2468 l -0.0827,0.2773 -0.0458,-0.2861 z m -2.39566,-1.7666 c -0.0533,-0.3328 -0.33021,-0.8898 -0.6117,-1.2302 -0.13182,-0.1594 -0.41707,-0.3602 -0.7239,-0.5095 -0.2785,-0.1355 -0.44984994,-0.2469 -0.38077,-0.2475 0.23203,0 0.79664,-0.3399 1.06509,-0.637 0.29341,-0.3248 0.67562,-1.0707 0.67571,-1.3187 1.1e-4,-0.25429996 0.11859,-0.18249996 0.16436,0.1 0.11474,0.707 0.85839,1.6053 1.48123,1.7892 l 0.31569,0.093 -0.48892,0.2365 c -0.35742,0.1729 -0.56295,0.3302 -0.7642,0.5848 -0.25532,0.323 -0.56724,0.998 -0.56724,1.2274 0,0.2231 -0.12631,0.1561 -0.16535,-0.088 z m 5.23936,-1.311 c -0.005,-0.2133 -0.27386,-0.5904 -0.4897,-0.6859 l -0.1993,-0.088 0.21979,-0.1458 c 0.12089,-0.08 0.28628,-0.2773 0.36755,-0.4379 l 0.14775,-0.2919 0.14919,0.3071 c 0.089,0.1831 0.23723,0.3526 0.36725,0.4198 l 0.21807,0.1128 -0.23328,0.155 c -0.1283,0.085 -0.30329,0.2974 -0.38885,0.4714 -0.0914,0.1857 -0.15676,0.2616 -0.15847,0.1837 z`,
  diamonds: `M 6.9999998,1 C 3.9349949,2.0640814 2.7142855,5.2857143 2.7142855,7.8571429 2.7142855,10.428571 4.2099424,12.365511 6.1428569,13 4.4285712,10.206928 4.4285712,7.8571429 6.9999998,6.1428571 c -0.4327903,1.1595583 0,3.4285719 0.8571428,4.2857139 0.3698186,-0.343506 0.8571429,-1.221194 0.8571429,-1.7142853 1.7142855,1.7142853 0.482484,3.1142233 0,4.2857143 0.9327257,-0.47923 2.5714295,-1.714286 2.5714295,-4.2857143 0,-2.5714286 -1.7142866,-3.4285714 -1.7142866,-6 C 8.3855575,3.2279227 7.8571426,4.4285714 7.8571426,5.2857143 7.0410904,4.8086632 6.1428569,2.9255077 6.9999998,1 Z`,
  clubs: `m 11.324219,3.07539 -1.21875,1.21875 0.621093,0.6211 c 0.220313,0.22031 0.220313,0.57656 0,0.79453 L 10.31875,6.11758 C 10.595313,6.7293 10.75,7.40899 10.75,8.12383 c 0,2.69297 -2.1820313,4.875 -4.875,4.875 C 3.1820313,12.99883 1,10.81914 1,8.12617 c 0,-2.69296 2.1820312,-4.875 4.875,-4.875 0.7148437,0 1.3945312,0.15469 2.00625,0.43125 L 8.2890625,3.27461 C 8.509375,3.0543 8.865625,3.0543 9.0835937,3.27461 L 9.7046875,3.8957 10.923438,2.67695 11.324219,3.07539 Z m 1.394531,-0.66797 -0.5625,0 c -0.154688,0 -0.28125,0.12657 -0.28125,0.28125 0,0.15469 0.126562,0.28125 0.28125,0.28125 l 0.5625,0 C 12.873438,2.96992 13,2.84336 13,2.68867 13,2.53399 12.873438,2.40742 12.71875,2.40742 Z M 11.3125,1.00117 c -0.154688,0 -0.28125,0.12657 -0.28125,0.28125 l 0,0.5625 c 0,0.15469 0.126562,0.28125 0.28125,0.28125 0.154688,0 0.28125,-0.12656 0.28125,-0.28125 l 0,-0.5625 c 0,-0.15468 -0.126562,-0.28125 -0.28125,-0.28125 z m 0.794531,1.28907 0.398438,-0.39844 c 0.110156,-0.11016 0.110156,-0.28828 0,-0.39844 -0.110157,-0.11016 -0.288281,-0.11016 -0.398438,0 L 11.708594,1.8918 c -0.110157,0.11015 -0.110157,0.28828 0,0.39844 0.1125,0.11015 0.290625,0.11015 0.398437,0 z m -1.589062,0 c 0.110156,0.11015 0.288281,0.11015 0.398437,0 0.110156,-0.11016 0.110156,-0.28829 0,-0.39844 L 10.517969,1.49336 c -0.110156,-0.11016 -0.288281,-0.11016 -0.398438,0 -0.110156,0.11016 -0.110156,0.28828 0,0.39844 l 0.398438,0.39844 z m 1.589062,0.79687 c -0.110156,-0.11016 -0.288281,-0.11016 -0.398437,0 -0.110157,0.11016 -0.110157,0.28828 0,0.39844 l 0.398437,0.39844 c 0.110157,0.11015 0.288281,0.11015 0.398438,0 0.110156,-0.11016 0.110156,-0.28829 0,-0.39844 L 12.107031,3.08711 Z M 3.625,7.37617 c 0,-0.82734 0.6726562,-1.5 1.5,-1.5 0.20625,0 0.375,-0.16875 0.375,-0.375 0,-0.20625 -0.16875,-0.375 -0.375,-0.375 -1.2398438,0 -2.25,1.01016 -2.25,2.25 0,0.20625 0.16875,0.375 0.375,0.375 0.20625,0 0.375,-0.16875 0.375,-0.375 z`,
  spades: `m 1.3503604,12.850876 c -0.15428,-0.1053 -0.21007,-0.302 -0.13077,-0.461 0.0212,-0.043 0.80557,-0.8455 1.74294,-1.7842 l 1.70433,-1.7066996 -0.10579,-0.1038 -0.1058,-0.1039 -0.15717,0.086 c -0.33068,0.1818 -0.66056,0.2612 -1.07628,0.2589 -0.29579,0 -0.46049,-0.033 -0.86011,-0.1615 -0.36547,-0.1179 -0.6593,-0.1649 -0.93204,-0.1492 -0.20189,0.012 -0.23079,0.01 -0.30251,-0.04 -0.11178,-0.075 -0.1582,-0.2234 -0.10494,-0.3357 0.071,-0.1496 0.1499,-0.1752 0.53386,-0.1729 0.38048,0 0.5406,0.031 0.99346,0.1782 0.49538,0.1609 0.76598,0.1773 1.15365,0.07 0.24118,-0.067 0.36631,-0.1345 0.34405,-0.186 -0.0341,-0.079 -0.0402,-0.3384 -0.0101,-0.4295 0.0306,-0.093 0.39238,-0.4951 0.44452,-0.4943 0.0345,5e-4 3.30562,1.2495 3.32611,1.27 0.008,0.01 -0.30568,0.3344 -0.69807,0.7243 -0.6539,0.6499 -0.7243,0.7125996 -0.84337,0.7515996 -0.15076,0.049 -0.29449,0.038 -0.43283,-0.034 -0.0499,-0.026 -0.21029,-0.1676996 -0.35647,-0.3149996 -0.14619,-0.1474 -0.27691,-0.268 -0.29048,-0.268 -0.0136,0 -0.78698,0.7629996 -1.71868,1.6955996 -0.9317,0.9326 -1.72341,1.7113 -1.75935,1.7304 -0.0999,0.053 -0.26479,0.044 -0.35818,-0.02 z m 5.25609,-5.3967996 -1.6533,-0.632 0.55267,-0.5527 0.55268,-0.5527 1.65473,0.6305 c 0.91011,0.3467 1.66527,0.6369 1.67813,0.6449 0.0307,0.019 -1.04757,1.0977 -1.09512,1.0956 -0.0201,-8e-4 -0.78048,-0.286 -1.68979,-0.6336 z m 1.62909,-1.5704 c -0.90512,-0.3459 -1.65359,-0.6367 -1.66327,-0.6462 -0.01,-0.01 0.3851,-0.4199 0.8773,-0.912 l 0.8949,-0.8946 1.16154,1.1613 1.1615396,1.1614 -0.38079,0.3813 c -0.20943,0.2098 -0.3863596,0.3806 -0.3931696,0.3795 -0.007,-10e-4 -0.75294,-0.2848 -1.65805,-0.6307 z m 3.5333396,0.1379 c -0.0399,-0.018 -0.88622,-0.8481 -1.8806396,-1.8444 -1.61812,-1.6211 -1.8102,-1.8215 -1.82872,-1.9082 -0.0114,-0.053 -0.013,-0.133 -0.004,-0.1774 0.019,-0.09 0.12571,-0.2152 0.21146,-0.2485 0.0838,-0.033 4.2638396,-0.7478 4.3703396,-0.7478 0.17876,0 0.32004,0.1144 0.36201,0.2933 0.0224,0.095 -0.72046,4.3846 -0.77622,4.4818 -0.0489,0.085 -0.2244,0.1866 -0.32056,0.1851 -0.0338,-5e-4 -0.0941,-0.016 -0.13402,-0.034 z`,
};

const SuitIcon: React.FC<{ suit: Suit; size?: number; color?: string }> = ({ suit, size = 16, color = 'currentColor' }) => {
  const s = { width: size, height: size, display: 'inline-block' as const, flexShrink: 0 as const };
  return (
    <svg style={s} fill={color} viewBox="0 0 14 14">
      <path d={SUIT_PATHS[suit]} />
    </svg>
  );
};

function dieDots(v: number): { x: number; y: number }[] {
  const p: { [k: number]: { x: number; y: number }[] } = {
    1: [{ x: 24, y: 24 }],
    2: [{ x: 14, y: 14 }, { x: 34, y: 34 }],
    3: [{ x: 14, y: 14 }, { x: 24, y: 24 }, { x: 34, y: 34 }],
    4: [{ x: 14, y: 14 }, { x: 34, y: 14 }, { x: 14, y: 34 }, { x: 34, y: 34 }],
    5: [{ x: 14, y: 14 }, { x: 34, y: 14 }, { x: 24, y: 24 }, { x: 14, y: 34 }, { x: 34, y: 34 }],
    6: [{ x: 14, y: 10 }, { x: 34, y: 10 }, { x: 14, y: 24 }, { x: 34, y: 24 }, { x: 14, y: 38 }, { x: 34, y: 38 }],
  };
  return p[v] || [];
}

const DieFace: React.FC<{ value: number; size?: number; rolling?: boolean; highlight?: boolean; shatter?: boolean; color?: string }> =
  ({ value, size = 52, rolling = false, highlight = false, shatter = false, color = '#1e293b' }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ overflow: 'visible', flexShrink: 0 }}>
      <g style={{
        transformOrigin: 'center',
        animation: rolling ? 'hcDiceRoll 0.12s linear infinite' : shatter ? 'hcShatter 0.5s ease-out forwards' : 'none',
        filter: highlight ? 'drop-shadow(0 0 8px #fbbf24) drop-shadow(0 0 3px #fbbf24)' : 'none'
      }}>
        <rect x="2" y="2" width="44" height="44" rx="8"
          fill={color}
          stroke={highlight ? '#fbbf24' : 'rgba(255,255,255,0.25)'} strokeWidth="2" />
        {dieDots(value).map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="4.5" fill="#ffffff" />
        ))}
      </g>
    </svg>
  );

// ============================================================
// CSS Animations
// ============================================================
const GAME_CSS = `
@keyframes hcPulse { 0%,100%{opacity:0.65} 50%{opacity:1} }
@keyframes hcAttackPulse { 0%,100%{opacity:0.7} 50%{opacity:1} }
@keyframes hcSlideIn { from{transform:translateY(-8px);opacity:0} to{transform:translateY(0);opacity:1} }
@keyframes hcFadeUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
@keyframes hcWinPop { 0%{transform:scale(0.5);opacity:0} 70%{transform:scale(1.06)} 100%{transform:scale(1);opacity:1} }
@keyframes hcDiceRoll { 0%{transform:rotate(0deg)scale(0.85)} 50%{transform:rotate(180deg)scale(1.1)} 100%{transform:rotate(360deg)scale(0.85)} }
@keyframes hcShatter { 0%{transform:scale(1);opacity:1} 60%{transform:scale(1.3)rotate(20deg);opacity:0.4} 100%{transform:scale(0)rotate(45deg);opacity:0} }
@keyframes hcTroopDie {
  0% { transform: scale(1) translateY(0); opacity: 1; }
  100% { transform: scale(0) translateY(15px); opacity: 0; }
}
@keyframes hcPhaseBannerSweep {
  0% { transform: scaleY(0); opacity: 0; }
  15% { transform: scaleY(1); opacity: 1; }
  85% { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(0); opacity: 0; }
}
@keyframes hcFloaty {
  0% { transform: translateY(0); opacity: 0; }
  20% { transform: translateY(-12px); opacity: 1; }
  85% { transform: translateY(-28px); opacity: 1; }
  100% { transform: translateY(-40px); opacity: 0; }
}
@keyframes hcFireworkTravel {
  0% { stroke-dashoffset: 160; opacity: 0; }
  2% { opacity: 1; }
  18% { opacity: 1; }
  20%, 100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes hcFireworkParticle {
  0%, 19% {
    transform: translate(0, 0) scale(0);
    opacity: 0;
  }
  20% {
    transform: translate(0, 0) scale(1.5);
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), var(--dy)) scale(0.2);
    opacity: 0;
  }
}
@keyframes hcDiceEntrance {
  from { transform: translateY(15px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.hc-floaty-text {
  animation: hcFloaty 1.4s ease-out forwards;
  filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.95)) drop-shadow(0 0 1px #000);
  text-shadow: 1px 1px 1px rgba(0,0,0,0.95);
}
.hc-pulse{animation:hcPulse 1.8s ease-in-out infinite}
.hc-atk-src{filter:drop-shadow(0 0 7px rgba(239,68,68,0.95))}
.hc-atk-tgt{filter:drop-shadow(0 0 5px rgba(239,68,68,0.6));animation:hcAttackPulse 1s ease-in-out infinite}
.hc-frt-src{filter:drop-shadow(0 0 7px rgba(59,130,246,0.95))}
.hc-frt-tgt{filter:drop-shadow(0 0 5px rgba(59,130,246,0.6));animation:hcAttackPulse 1s ease-in-out infinite}
.hc-firework-trail {
  stroke-dasharray: 40 120;
  animation: hcFireworkTravel 2.5s linear infinite;
}
.hc-firework-particle {
  transform-origin: 0px 0px;
  animation: hcFireworkParticle 2.5s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
}
.hc-reinforce-pill {
  animation: hcFloaty 1.4s ease-out forwards;
}
.hc-dice-entrance {
  animation: hcDiceEntrance 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
`;

// ============================================================
// Phase colour map
// ============================================================
const PHASE_COLORS: { [k: string]: { bg: string; text: string; chip: string } } = {
  DRAFT: { bg: 'rgba(168,85,247,0.12)', text: '#a855f7', chip: 'rgba(168,85,247,0.35)' },
  REINFORCE: { bg: 'rgba(34,197,94,0.12)', text: '#22c55e', chip: 'rgba(34,197,94,0.35)' },
  ATTACK: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', chip: 'rgba(239,68,68,0.35)' },
  FORTIFY: { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', chip: 'rgba(59,130,246,0.35)' },
  GAMEOVER: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', chip: 'rgba(245,158,11,0.35)' },
};
const PHASE_LABELS: { [k: string]: string } = {
  DRAFT: 'DRAFT', REINFORCE: '⊕ REINFORCE', ATTACK: '⚔ ATTACK', FORTIFY: '🛡 FORTIFY', GAMEOVER: '🏆 VICTORY',
};

// ============================================================
// Slider sub-component
// ============================================================
const Slider: React.FC<{ label: string; value: number; min: number; max: number; display: string; accent: string; muted: string; onChange: (v: number) => void }> =
  ({ label, value, min, max, display, accent, muted, onChange }) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: muted }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: accent }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: accent, height: 4 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: muted, marginTop: 3 }}>
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );

// ============================================================
// Main Component
// ============================================================
export const HexCommandGame: React.FC<GameProps> = ({ cachedState, onSaveCache }) => {

  // ── Theme ──────────────────────────────────────────────
  const theme = getTheme()

  // ── Lobby Config ───────────────────────────────────────
  const [cfg, setCfg] = useState<LobbyConfig>(() => cachedState?.lobbyConfig ?? {
    playerCount: 2, continentCount: 4, continentSize: 6, setupMode: 'auto', autoMode: 'clumped'
  });

  // ── Game State ─────────────────────────────────────────
  const [gs, setGs] = useState<GameState | null>(() => {
    if (cachedState?.phase && cachedState.phase !== 'LOBBY') return cachedState as GameState;
    return null;
  });

  // ── Camera ─────────────────────────────────────────────
  const [cam, setCam] = useState({ x: 0, y: 0, sc: 1 });
  const camRef = useRef({ x: 0, y: 0, sc: 1 });
  const rafRef = useRef<number | null>(null);
  const savedCamRef = useRef<{ x: number; y: number; sc: number } | null>(null);

  // ── SVG size ───────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSz, setSvgSz] = useState({ w: 800, h: 580 });

  // ── Animation States ──────────────────────────────────
  const lastPlayerIdxRef = useRef<number | null>(null);
  const [turnPillStage, setTurnPillStage] = useState<'normal' | 'centering' | 'centered' | 'shrinking'>('normal');
  const [turnPillPlayer, setTurnPillPlayer] = useState<PlayerState | null>(null);

  const lastPhaseRef = useRef<Phase | null>(null);
  const [phaseTransition, setPhaseTransition] = useState<{ active: boolean; phase: Phase } | null>(null);

  const [reinPanQueue, setReinPanQueue] = useState<{ cellId: string; count: number; label: string }[]>([]);
  const [reinPanIndex, setReinPanIndex] = useState<number>(-1);
  const [floatyNumbers, setFloatyNumbers] = useState<{ id: string; cellId: string; count: number; label: string }[]>([]);

  useEffect(() => {
    const upd = () => { if (containerRef.current) { const r = containerRef.current.getBoundingClientRect(); setSvgSz({ w: r.width, h: r.height }); } };
    upd();
    const obs = new ResizeObserver(upd);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Camera animation ───────────────────────────────────
  const animCamTo = useCallback((tx: number, ty: number, ts: number) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = () => {
      const dx = tx - camRef.current.x, dy = ty - camRef.current.y, ds = ts - camRef.current.sc;
      const LERP = 0.13;
      camRef.current = { x: camRef.current.x + dx * LERP, y: camRef.current.y + dy * LERP, sc: camRef.current.sc + ds * LERP };
      setCam({ ...camRef.current });
      if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4 || Math.abs(ds) > 0.001)
        rafRef.current = requestAnimationFrame(step);
      else { camRef.current = { x: tx, y: ty, sc: ts }; setCam({ x: tx, y: ty, sc: ts }); rafRef.current = null; }
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const fitCamera = useCallback((cells: Record<string, HexCell>, animate = false) => {
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    for (const c of Object.values(cells)) {
      const { x, y } = hexToPixel(c.q, c.r, HEX_SIZE);
      mnX = Math.min(mnX, x - HEX_SIZE * 1.3); mxX = Math.max(mxX, x + HEX_SIZE * 1.3);
      mnY = Math.min(mnY, y - HEX_SIZE * 1.3); mxY = Math.max(mxY, y + HEX_SIZE * 1.3);
    }
    const mw = mxX - mnX, mh = mxY - mnY;
    const { w, h } = svgSz;
    const sc = Math.min((w * 0.88) / mw, (h * 0.88) / mh, 2.2);
    const cx = -(mnX + mw / 2) * sc, cy = -(mnY + mh / 2) * sc;
    if (animate) {
      animCamTo(cx, cy, sc);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      camRef.current = { x: cx, y: cy, sc };
      setCam({ x: cx, y: cy, sc });
    }
  }, [svgSz, animCamTo]);

  // Orient camera zoom correctly on initial mount if state is already loaded
  useEffect(() => {
    if (gs) {
      if (dice?.active) {
        const aid = dice.attackHexId;
        const did = dice.defendHexId;
        const ac = gs.cells[aid];
        const dc = gs.cells[did];
        if (ac && dc) {
          const { x: ax, y: ay } = hexToPixel(ac.q, ac.r, HEX_SIZE);
          const { x: dx, y: dy } = hexToPixel(dc.q, dc.r, HEX_SIZE);
          const scaleX = (svgSz.w * 0.95) / 55;
          const scaleY = (svgSz.h * 0.95) / 34;
          const zs = Math.max(13.0, Math.min(scaleX, scaleY, 17.0));
          camRef.current = { x: -((ax + dx) / 2) * zs, y: -((ay + dy) / 2) * zs - 32, sc: zs };
          setCam(camRef.current);
          return;
        }
      }
      fitCamera(gs.cells, false);
    }
  }, []);

  // ── Pan state ──────────────────────────────────────────
  const panRef = useRef({ active: false, sx: 0, sy: 0, scx: 0, scy: 0, dist: 0 });
  const [panning, setPanning] = useState(false);

  // ── Selection / Phase UI ───────────────────────────────
  const [_selHex, setSelHex] = useState<string | null>(null);
  const [atkSrc, setAtkSrc] = useState<string | null>(null);
  const [frtSrc, setFrtSrc] = useState<string | null>(null);
  const [reinPanel, setReinPanel] = useState<{ id: string; count: number } | null>(() => cachedState?.reinPanel ?? null);
  const [frtPanel, setFrtPanel] = useState<{ src: string; dst: string; count: number } | null>(() => cachedState?.frtPanel ?? null);
  const [conqPanel, setConqPanel] = useState<{ src: string; dst: string; min: number; max: number; count: number; na: number } | null>(() => cachedState?.conqPanel ?? null);

  // ── Dice animation ─────────────────────────────────────
  const [dice, setDice] = useState<DiceAnimState | null>(() => {
    if (cachedState?.dice) {
      const d = cachedState.dice;
      if (d.active && d.animPhase !== 'choice' && d.animPhase !== 'conquered') {
        return { ...d, animPhase: 'choice' };
      }
      return d;
    }
    return null;
  });
  const diceTimers = useRef<number[]>([]);
  // Toast (reserved for future use — driven by showToast calls)
  const toast: string | null = null;


  // ── Save cache ─────────────────────────────────────────
  const saveRef = useRef(onSaveCache);
  useEffect(() => { saveRef.current = onSaveCache; }, [onSaveCache]);
  useEffect(() => {
    if (gs) {
      saveRef.current({
        ...gs,
        lobbyConfig: cfg,
        dice,
        reinPanel,
        frtPanel,
        conqPanel
      });
    } else {
      saveRef.current({ lobbyConfig: cfg, phase: 'LOBBY' });
    }
  }, [gs, cfg, dice, reinPanel, frtPanel, conqPanel]);

  // ── Reinforcement Panning Helpers ─────────────────────
  const startReinforceAnimation = useCallback((gameState: GameState) => {
    const pid = gameState.players[gameState.currentPlayerIdx].id;
    const cells = gameState.cells;
    const continents = gameState.continents;

    const totalHexes = gameState.totalHexes || Object.keys(cells).length;
    const baseCount = calcBaseReinforcements(totalHexes, ownedCount(cells, pid));
    const hasCapital = cells['0,0']?.owner === pid;
    const ownedContinents: number[] = [];
    if (continents) {
      continents.forEach(cont => {
        if (cont.hexIds.every(hexId => cells[hexId]?.owner === pid)) {
          ownedContinents.push(cont.id);
        }
      });
    }

    const items: { cellId: string; count: number; label: string }[] = [];

    // 1. Base Reinforcements
    const owned = Object.values(cells).filter(c => c.owner === pid && !c.isCapital);
    const baseCell = owned.length > 0 ? owned[0].id : (hasCapital ? '0,0' : null);
    if (baseCell && baseCount > 0) {
      items.push({ cellId: baseCell, count: baseCount, label: 'Base' });
    }

    // 2. Capital Bonus
    if (hasCapital) {
      items.push({ cellId: '0,0', count: 1, label: 'Capital' });
    }

    // 3. Continent Bonuses
    ownedContinents.forEach(contId => {
      const cont = continents[contId];
      if (cont && cont.hexIds.length > 0) {
        items.push({ cellId: cont.hexIds[0], count: 1, label: 'Continent' });
      }
    });

    if (items.length > 0) {
      setReinPanQueue(items);
      setReinPanIndex(0);
      savedCamRef.current = { ...camRef.current };
    }
  }, []);

  /*
  const _skipPanning = useCallback(() => {
    if (reinPanQueue.length > 0 && reinPanIndex >= 0) {
      setReinPanQueue([]);
      setReinPanIndex(-1);
      setFloatyNumbers([]);
      if (gs) fitCamera(gs.cells);
    }
  }, [reinPanQueue, reinPanIndex, gs, fitCamera]);
  */

  // ── Turn Change Transition Pill ───────────────────────
  useEffect(() => {
    if (!gs || gs.phase === 'LOBBY' || gs.phase === 'GAMEOVER') {
      lastPlayerIdxRef.current = null;
      setTurnPillStage('normal');
      setTurnPillPlayer(null);
      return () => { };
    }

    const curIdx = gs.currentPlayerIdx;
    const player = gs.players[curIdx];

    // Initial load: don't animate but initialize player details and start reinforce panning
    if (lastPlayerIdxRef.current === null) {
      lastPlayerIdxRef.current = curIdx;
      setTurnPillPlayer(player);
      if (gs.phase === 'REINFORCE') {
        startReinforceAnimation(gs);
      }
      return () => { };
    }

    // Player changed!
    if (lastPlayerIdxRef.current !== curIdx) {
      const prevPlayer = gs.players[lastPlayerIdxRef.current];
      lastPlayerIdxRef.current = curIdx;

      // Start transition
      setTurnPillPlayer(prevPlayer);
      setTurnPillStage('centering');

      const t1 = window.setTimeout(() => {
        setTurnPillPlayer(player);
        setTurnPillStage('centered');
      }, 500);

      const t2 = window.setTimeout(() => {
        setTurnPillStage('shrinking');
      }, 1500);

      let tReinforce: number | undefined;
      const t3 = window.setTimeout(() => {
        setTurnPillStage('normal');
        // When turn indicator completes, start the reinforcement panning sequential animation
        // Delay by 1500ms to allow the delayed phase change animation to complete first!
        if (gs.phase === 'REINFORCE') {
          tReinforce = window.setTimeout(() => {
            startReinforceAnimation(gs);
          }, 1500);
        }
      }, 2000);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        if (tReinforce) clearTimeout(tReinforce);
      };
    }
    return () => { };
  }, [gs?.currentPlayerIdx, gs?.phase, startReinforceAnimation]);

  // ── Phase Change Transition Banner ───────────────────
  useEffect(() => {
    if (!gs || gs.phase === 'LOBBY') {
      lastPhaseRef.current = null;
      setPhaseTransition(null);
      return () => { };
    }

    const curPhase = gs.phase;

    if (lastPhaseRef.current === null) {
      lastPhaseRef.current = curPhase;
      return () => { };
    }

    if (lastPhaseRef.current !== curPhase) {
      lastPhaseRef.current = curPhase;

      if (curPhase === 'GAMEOVER') return () => { };

      const delay = curPhase === 'REINFORCE' ? 2000 : 0;

      const t0 = window.setTimeout(() => {
        setPhaseTransition({ active: true, phase: curPhase });
      }, delay);

      const t1 = window.setTimeout(() => {
        setPhaseTransition(null);
      }, delay + 1500);

      return () => {
        clearTimeout(t0);
        clearTimeout(t1);
        setPhaseTransition(null);
      };
    }
    return () => { };
  }, [gs?.phase]);

  // ── Sequential Reinforcement Panning Execution ───────
  useEffect(() => {
    if (reinPanIndex < 0 || reinPanIndex >= reinPanQueue.length || !gs) return () => { };

    const item = reinPanQueue[reinPanIndex];
    const cell = gs.cells[item.cellId];

    if (cell) {
      const { x: wx, y: wy } = hexToPixel(cell.q, cell.r, HEX_SIZE);
      const zs = 2.0;
      animCamTo(-wx * zs, -wy * zs, zs);

      const fid = Math.random().toString(36).substring(2, 9);
      setFloatyNumbers(prev => [...prev, { id: fid, cellId: item.cellId, count: item.count, label: item.label }]);

      const tClean = setTimeout(() => {
        setFloatyNumbers(prev => prev.filter(f => f.id !== fid));
      }, 1200);

      const tNext = setTimeout(() => {
        setReinPanIndex(prev => prev + 1);
      }, 1200);

      return () => {
        clearTimeout(tClean);
        clearTimeout(tNext);
      };
    }
    return () => { };
  }, [reinPanIndex, reinPanQueue, gs, animCamTo]);

  // Panning sequence completed
  useEffect(() => {
    if (reinPanQueue.length > 0 && reinPanIndex >= reinPanQueue.length) {
      if (gs) fitCamera(gs.cells, true);
      setReinPanQueue([]);
      setReinPanIndex(-1);
    }
  }, [reinPanIndex, reinPanQueue, gs, fitCamera]);



  // ── Start game ─────────────────────────────────────────
  const startGame = useCallback(() => {
    const contColors = genContinentColors(theme.primary, cfg.continentCount);
    const { cells, continents, totalHexes } = generateMap(cfg, contColors);
    const pColors = getPlayerColors(cfg.playerCount);
    const players: PlayerState[] = Array.from({ length: cfg.playerCount }, (_, i) => ({
      id: i + 1, suit: PLAYER_SUIT_MAP[i + 1], color: pColors[i],
    }));
    let fc = cells, phase: Phase = 'REINFORCE', draftOrder: number[] = [], draftStep = 0;
    const draftCount = Object.keys(cells).filter(id => !cells[id].isCapital).length;
    if (cfg.setupMode === 'auto') {
      fc = cfg.autoMode === 'random' ? distributeRandom(cells, cfg.playerCount) : distributeClumped(cells, cfg.playerCount);
    } else {
      phase = 'DRAFT';
      draftOrder = buildDraftOrder(cfg.playerCount, draftCount);
    }
    const rein = phase === 'REINFORCE' ? calcReinforcements(fc, players[0].id, continents) : 0;
    const newGs: GameState = {
      phase, lobbyConfig: cfg, players, currentPlayerIdx: 0, cells: fc, continents,
      totalHexes, turn: 1, reinforcementsLeft: rein, winner: null, eliminatedPlayers: [], draftOrder, draftStep
    };
    setGs(newGs);
    setTimeout(() => fitCamera(fc), 60);
    setSelHex(null); setAtkSrc(null); setFrtSrc(null); setReinPanel(null); setFrtPanel(null); setConqPanel(null); setDice(null);
  }, [cfg, theme, fitCamera]);

  const resetLobby = useCallback(() => {
    diceTimers.current.forEach(t => clearTimeout(t));
    setDice(null); setGs(null); setSelHex(null); setAtkSrc(null); setFrtSrc(null); setReinPanel(null); setFrtPanel(null); setConqPanel(null);
  }, []);

  // ── Pan/Zoom ───────────────────────────────────────────
  const onMD = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    console.log("[DEBUG] onMD called! button:", e.button);
    if (e.button !== 0) return;
    panRef.current = { active: true, sx: e.clientX, sy: e.clientY, scx: camRef.current.x, scy: camRef.current.y, dist: 0 };
    setPanning(false);
  }, []);

  const onMM = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!panRef.current.active) return;
    const dx = e.clientX - panRef.current.sx, dy = e.clientY - panRef.current.sy;
    panRef.current.dist = Math.sqrt(dx * dx + dy * dy);
    if (panRef.current.dist > 5) {
      setPanning(true);
      camRef.current.x = panRef.current.scx + dx;
      camRef.current.y = panRef.current.scy + dy;
      setCam({ ...camRef.current });
    }
  }, []);

  // onMU is defined after all click handlers to avoid forward-reference issues
  const onMURef = useRef<(e: React.MouseEvent<SVGSVGElement>) => void>(() => { });
  const onMU = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    console.log("[DEBUG] onMU called! dist:", panRef.current.dist);
    onMURef.current(e);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const ns = Math.max(0.25, Math.min(4.5, camRef.current.sc * factor));
    const wx = (mx - camRef.current.x - svgSz.w / 2) / camRef.current.sc;
    const wy = (my - camRef.current.y - svgSz.h / 2) / camRef.current.sc;
    camRef.current = { x: mx - svgSz.w / 2 - wx * ns, y: my - svgSz.h / 2 - wy * ns, sc: ns };
    setCam({ ...camRef.current });
  }, [svgSz]);

  // handleHexClick is a stable ref-based dispatcher (avoids forward reference of sub-handlers)
  const handleHexClickRef = useRef<(id: string) => void>(() => { });
  const handleHexClick = useCallback((id: string) => handleHexClickRef.current(id), []);

  // ── Draft ──────────────────────────────────────────────
  const draftClick = useCallback((id: string) => {
    if (!gs || gs.phase !== 'DRAFT') return;
    const cell = gs.cells[id];
    if (cell.isCapital || cell.owner !== null) return;
    const pid = gs.draftOrder[gs.draftStep];
    const ns = gs.draftStep + 1;
    const done = ns >= gs.draftOrder.length;
    const nc = { ...gs.cells, [id]: { ...cell, owner: pid, troops: 1 } };
    let nextIdx = gs.currentPlayerIdx;
    let rein = 0;
    if (done) { nextIdx = 0; rein = calcReinforcements(nc, gs.players[0].id, gs.continents); }
    else { const npid = gs.draftOrder[ns]; nextIdx = gs.players.findIndex(p => p.id === npid); }
    setGs(p => p ? {
      ...p, cells: nc, draftStep: ns, phase: done ? 'REINFORCE' : 'DRAFT',
      currentPlayerIdx: nextIdx, reinforcementsLeft: rein
    } : null);
  }, [gs]);

  // ── Reinforce ──────────────────────────────────────────
  const reinClick = useCallback((id: string) => {
    if (!gs) return;
    const cell = gs.cells[id];
    const cp = gs.players[gs.currentPlayerIdx];
    if (cell.owner !== cp.id || gs.reinforcementsLeft <= 0) return;
    setSelHex(id);
    setReinPanel({ id, count: 1 });
  }, [gs]);

  const confirmRein = useCallback(() => {
    if (!reinPanel || !gs) return;
    setGs(p => p ? {
      ...p, cells: { ...p.cells, [reinPanel.id]: { ...p.cells[reinPanel.id], troops: p.cells[reinPanel.id].troops + reinPanel.count } },
      reinforcementsLeft: p.reinforcementsLeft - reinPanel.count
    } : null);
    setSelHex(null); setReinPanel(null);
  }, [reinPanel, gs]);

  // ── Attack ─────────────────────────────────────────────
  const atkClick = useCallback((id: string) => {
    if (!gs) return;
    const cell = gs.cells[id];
    const cp = gs.players[gs.currentPlayerIdx];
    if (!atkSrc) {
      if (cell.owner !== cp.id || cell.troops < 2) { setSelHex(null); return; }
      setAtkSrc(id); setSelHex(id);
    } else {
      if (id === atkSrc) { setAtkSrc(null); setSelHex(null); return; }
      const src = gs.cells[atkSrc];
      const adj = hexNeighbors(src.q, src.r).some(n => hk(n.q, n.r) === id);
      if (!adj || cell.owner === cp.id) {
        if (cell.owner === cp.id && cell.troops >= 2) { setAtkSrc(id); setSelHex(id); }
        else { setAtkSrc(null); setSelHex(null); }
        return;
      }
      launchCombat(atkSrc, id);
      setAtkSrc(null); setSelHex(null);
    }
  }, [gs, atkSrc]);

  const endAtk = useCallback(() => { setAtkSrc(null); setSelHex(null); setGs(p => p ? { ...p, phase: 'FORTIFY' } : null); }, []);

  // ── Combat calculations and positions ───────────────────
  const getCombatPositions = useCallback((aid: string, did: string, attackerUnitsCount: number, defenderUnitsCount: number) => {
    const ac = gs!.cells[aid];
    const dc = gs!.cells[did];
    const pA = hexToPixel(ac.q, ac.r, HEX_SIZE);
    const pB = hexToPixel(dc.q, dc.r, HEX_SIZE);

    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const ux = dx / dist;
    const uy = dy / dist;

    const mx = (pA.x + pB.x) / 2;
    const my = (pA.y + pB.y) / 2;

    let bx = -uy;
    let by = ux;
    if (by < 0 || (Math.abs(by) < 1e-4 && bx < 0)) {
      bx = -bx;
      by = -by;
    }

    const atkOffset = -6;
    const defOffset = 6;

    const getLinePositions = (count: number, offsetDist: number) => {
      const spacing = 4.5;
      const pts: { x: number; y: number }[] = [];
      const startOffset = -((count - 1) * spacing) / 2;
      for (let i = 0; i < count; i++) {
        const t = startOffset + i * spacing;
        pts.push({
          x: mx + offsetDist * ux + t * bx,
          y: my + offsetDist * uy + t * by
        });
      }
      return pts;
    };

    const attackerPts = getLinePositions(attackerUnitsCount, atkOffset);
    const defenderPts = getLinePositions(defenderUnitsCount, defOffset);

    const tentAtk = { x: mx - 14 * ux, y: my - 14 * uy };
    const tentDef = { x: mx + 14 * ux, y: my + 14 * uy };

    const diceAtk = { x: mx - 6 * ux, y: my - 6 * uy + 14 };
    const diceDef = { x: mx + 6 * ux, y: my + 6 * uy + 14 };

    return { attackerPts, defenderPts, tentAtk, tentDef, diceAtk, diceDef, bx, by };
  }, [gs]);

  const retreatCombat = useCallback(() => {
    setDice(null);
    if (savedCamRef.current) {
      animCamTo(savedCamRef.current.x, savedCamRef.current.y, savedCamRef.current.sc);
    }
  }, [animCamTo]);

  const performRoll = useCallback((currentDice: DiceAnimState) => {
    if (!gs) return;
    const aid = currentDice.attackHexId;
    const did = currentDice.defendHexId;
    const { attackerTroops, defenderTroops } = currentDice;

    const result = resolveCombat(attackerTroops, defenderTroops);

    diceTimers.current.forEach(t => clearTimeout(t));

    setDice({
      ...currentDice,
      atkDice: result.atkDice,
      defDice: result.defDice,
      displayAtkDice: result.atkDice.map(() => Math.ceil(Math.random() * 6)),
      displayDefDice: result.defDice.map(() => Math.ceil(Math.random() * 6)),
      atkLoss: result.atkLoss,
      defLoss: result.defLoss,
      animPhase: 'rolling'
    });

    const ri = window.setInterval(() => {
      setDice(p => {
        if (!p) return null;
        return {
          ...p,
          displayAtkDice: p.atkDice.map(() => Math.ceil(Math.random() * 6)),
          displayDefDice: p.defDice.map(() => Math.ceil(Math.random() * 6))
        };
      });
    }, 85);

    const t1 = window.setTimeout(() => {
      clearInterval(ri);
      setDice(p => p ? { ...p, animPhase: 'settling', displayAtkDice: p.atkDice, displayDefDice: p.defDice } : null);
    }, 800);

    const t2 = window.setTimeout(() => {
      setDice(p => p ? { ...p, animPhase: 'comparing' } : null);
    }, 1200);

    const t3 = window.setTimeout(() => {
      setDice(p => {
        if (!p) return null;
        const newAtkUnits = [...p.attackerUnits];
        let remainingAtkLoss = result.atkLoss;
        for (let i = newAtkUnits.length - 1; i >= 0 && remainingAtkLoss > 0; i--) {
          if (newAtkUnits[i].status === 'alive') {
            newAtkUnits[i] = { ...newAtkUnits[i], status: 'dying' };
            remainingAtkLoss--;
          }
        }

        const newDefUnits = [...p.defenderUnits];
        let remainingDefLoss = result.defLoss;
        for (let i = newDefUnits.length - 1; i >= 0 && remainingDefLoss > 0; i--) {
          if (newDefUnits[i].status === 'alive') {
            newDefUnits[i] = { ...newDefUnits[i], status: 'dying' };
            remainingDefLoss--;
          }
        }

        return {
          ...p,
          animPhase: 'dying',
          attackerUnits: newAtkUnits,
          defenderUnits: newDefUnits
        };
      });
    }, 1600);

    const t4 = window.setTimeout(() => {
      const nextAtkTroops = Math.max(1, currentDice.attackerTroops - result.atkLoss);
      const nextDefTroops = Math.max(0, currentDice.defenderTroops - result.defLoss);

      setGs(prev => {
        if (!prev) return null;
        const nc = { ...prev.cells };
        nc[aid] = { ...nc[aid], troops: nextAtkTroops };
        nc[did] = { ...nc[did], troops: nextDefTroops };

        const elim = [...prev.eliminatedPlayers];
        for (const pl of prev.players) { if (!elim.includes(pl.id) && ownedCount(nc, pl.id) === 0) elim.push(pl.id); }
        const winner = checkWin(nc, prev.players, elim, prev.totalHexes);
        if (winner !== null) {
          setTimeout(() => triggerConfetti(), 400);
        }
        return {
          ...prev,
          cells: nc,
          eliminatedPlayers: elim,
          phase: winner !== null ? 'GAMEOVER' : prev.phase,
          winner
        };
      });

      if (nextDefTroops <= 0) {
        const minMove = Math.min(result.atkDice.length, nextAtkTroops - 1);
        const maxMove = nextAtkTroops - 1;
        setConqPanel({
          src: aid,
          dst: did,
          min: 1, // Allow deploying down to only 1 troop
          max: maxMove,
          count: minMove,
          na: nextAtkTroops
        });

        setDice(p => {
          if (!p) return null;
          const filteredAtkUnits = p.attackerUnits.filter(u => u.status === 'alive');
          const filteredDefUnits = p.defenderUnits.filter(u => u.status === 'alive');
          return {
            ...p,
            attackerTroops: nextAtkTroops,
            defenderTroops: nextDefTroops,
            attackerUnits: filteredAtkUnits,
            defenderUnits: filteredDefUnits,
            animPhase: 'conquered',
            conquered: true
          };
        });
        return;
      }

      if (nextAtkTroops <= 1) {
        setTimeout(() => retreatCombat(), 500);
        setDice(p => {
          if (!p) return null;
          const filteredAtkUnits = p.attackerUnits.filter(u => u.status === 'alive');
          const filteredDefUnits = p.defenderUnits.filter(u => u.status === 'alive');
          return {
            ...p,
            attackerTroops: nextAtkTroops,
            defenderTroops: nextDefTroops,
            attackerUnits: filteredAtkUnits,
            defenderUnits: filteredDefUnits,
            animPhase: 'choice'
          };
        });
        return;
      }

      const targetAtkUnitsCount = Math.min(6, nextAtkTroops - 1);
      const targetDefUnitsCount = Math.min(6, nextDefTroops);
      const pos = getCombatPositions(aid, did, targetAtkUnitsCount, targetDefUnitsCount);

      setDice(p => {
        if (!p) return null;
        const filteredAtkUnits = p.attackerUnits.filter(u => u.status === 'alive');
        const filteredDefUnits = p.defenderUnits.filter(u => u.status === 'alive');

        const finalAtkUnits = [...filteredAtkUnits];
        while (finalAtkUnits.length < targetAtkUnitsCount) {
          finalAtkUnits.push({
            id: `atk_${aid}_refill_${finalAtkUnits.length}_${Date.now()}`,
            status: 'alive',
            x: pos.tentAtk.x,
            y: pos.tentAtk.y
          });
        }

        const finalDefUnits = [...filteredDefUnits];
        while (finalDefUnits.length < targetDefUnitsCount) {
          finalDefUnits.push({
            id: `def_${did}_refill_${finalDefUnits.length}_${Date.now()}`,
            status: 'alive',
            x: pos.tentDef.x,
            y: pos.tentDef.y
          });
        }

        setTimeout(() => {
          setDice(curr => {
            if (!curr) return null;
            return {
              ...curr,
              attackerUnits: curr.attackerUnits.map(u => ({ ...u, x: undefined, y: undefined })),
              defenderUnits: curr.defenderUnits.map(u => ({ ...u, x: undefined, y: undefined }))
            };
          });
        }, 50);

        return {
          ...p,
          attackerTroops: nextAtkTroops,
          defenderTroops: nextDefTroops,
          attackerUnits: finalAtkUnits,
          defenderUnits: finalDefUnits,
          animPhase: 'choice'
        };
      });
    }, 3100);

    diceTimers.current = [t1, t2, t3, t4];
  }, [gs, retreatCombat, getCombatPositions]);

  const handleAttackAgain = useCallback(() => {
    if (dice && dice.animPhase === 'choice') {
      performRoll(dice);
    }
  }, [dice, performRoll]);

  // ── Combat animation ───────────────────────────────────
  const launchCombat = useCallback((aid: string, did: string) => {
    if (!gs) return;
    diceTimers.current.forEach(t => clearTimeout(t));

    const ac = gs.cells[aid];
    const dc = gs.cells[did];
    const { x: ax, y: ay } = hexToPixel(ac.q, ac.r, HEX_SIZE);
    const { x: dx, y: dy } = hexToPixel(dc.q, dc.r, HEX_SIZE);

    savedCamRef.current = { ...camRef.current };

    // Zoom way in dynamically so that the two hexes consume the screen
    const scaleX = (svgSz.w * 0.95) / 55;
    const scaleY = (svgSz.h * 0.95) / 34;
    const zs = Math.max(13.0, Math.min(scaleX, scaleY, 17.0));

    // Shift camera slightly upward by 32 pixels to clear overlay UI buttons at the bottom
    animCamTo(-((ax + dx) / 2) * zs, -((ay + dy) / 2) * zs - 32, zs);

    const initAtkUnitsCount = Math.min(6, ac.troops - 1);
    const initDefUnitsCount = Math.min(6, dc.troops);

    const initAtkUnits: TroopUnit[] = Array.from({ length: initAtkUnitsCount }, (_, i) => ({
      id: `atk_${aid}_${i}`,
      status: 'alive',
      x: ax,
      y: ay
    }));

    const initDefUnits: TroopUnit[] = Array.from({ length: initDefUnitsCount }, (_, i) => ({
      id: `def_${did}_${i}`,
      status: 'alive',
      x: dx,
      y: dy
    }));

    const initialCombatState: DiceAnimState = {
      active: true,
      attackHexId: aid,
      defendHexId: did,
      atkDice: [],
      defDice: [],
      displayAtkDice: [],
      displayDefDice: [],
      atkLoss: 0,
      defLoss: 0,
      animPhase: 'marching',
      conquered: false,
      attackerTroops: ac.troops,
      defenderTroops: dc.troops,
      attackerUnits: initAtkUnits,
      defenderUnits: initDefUnits
    };

    setDice(initialCombatState);

    // Slide/march troops to their slots
    const tMarch = setTimeout(() => {
      setDice(curr => {
        if (!curr) return null;
        return {
          ...curr,
          attackerUnits: curr.attackerUnits.map(u => ({ ...u, x: undefined, y: undefined })),
          defenderUnits: curr.defenderUnits.map(u => ({ ...u, x: undefined, y: undefined }))
        };
      });
    }, 50);

    const tStart = setTimeout(() => {
      performRoll({
        ...initialCombatState,
        attackerUnits: initialCombatState.attackerUnits.map(u => ({ ...u, x: undefined, y: undefined })),
        defenderUnits: initialCombatState.defenderUnits.map(u => ({ ...u, x: undefined, y: undefined }))
      });
    }, 1400);

    diceTimers.current = [tMarch, tStart];
  }, [gs, animCamTo, performRoll, svgSz]);

  // ── Fortify ────────────────────────────────────────────
  const frtClick = useCallback((id: string) => {
    if (!gs) return;
    const cell = gs.cells[id];
    const cp = gs.players[gs.currentPlayerIdx];
    if (!frtSrc) {
      if (cell.owner !== cp.id || cell.troops <= 1) { setSelHex(null); return; }
      setFrtSrc(id); setSelHex(id);
    } else {
      if (id === frtSrc) { setFrtSrc(null); setSelHex(null); return; }
      const src = gs.cells[frtSrc];
      const adj = hexNeighbors(src.q, src.r).some(n => hk(n.q, n.r) === id);
      if (!adj || cell.owner !== cp.id) {
        if (cell.owner === cp.id && cell.troops > 1) { setFrtSrc(id); setSelHex(id); }
        else { setFrtSrc(null); setSelHex(null); }
        return;
      }
      setFrtPanel({ src: frtSrc, dst: id, count: 1 });
      setFrtSrc(null); setSelHex(null);
    }
  }, [gs, frtSrc]);

  const confirmConq = useCallback(() => {
    if (!conqPanel || !gs) return;
    const { src, dst, count, na } = conqPanel;
    setGs(p => p ? {
      ...p,
      cells: {
        ...p.cells,
        [src]: { ...p.cells[src], troops: na - count },
        [dst]: { ...p.cells[dst], owner: p.cells[src].owner, troops: count }
      }
    } : null);
    setConqPanel(null);
    setDice(null);
    if (savedCamRef.current) {
      animCamTo(savedCamRef.current.x, savedCamRef.current.y, savedCamRef.current.sc);
    }
  }, [conqPanel, gs, animCamTo]);

  const confirmFrt = useCallback(() => {
    if (!frtPanel || !gs) return;
    const { src, dst, count } = frtPanel;
    setGs(p => p ? {
      ...p, cells: {
        ...p.cells, [src]: { ...p.cells[src], troops: p.cells[src].troops - count },
        [dst]: { ...p.cells[dst], troops: p.cells[dst].troops + count }
      }
    } : null);
    setFrtPanel(null);
    endTurn();
  }, [frtPanel, gs]);

  const skipFrt = useCallback(() => { setFrtPanel(null); setFrtSrc(null); setSelHex(null); endTurn(); }, []);

  const endTurn = useCallback(() => {
    setGs(p => {
      if (!p) return null;
      const ni = nextActiveIdx(p.currentPlayerIdx, p.players, p.eliminatedPlayers);
      return {
        ...p, phase: 'REINFORCE', currentPlayerIdx: ni,
        reinforcementsLeft: calcReinforcements(p.cells, p.players[ni].id, p.continents), turn: p.turn + 1
      };
    });
    setAtkSrc(null); setFrtSrc(null); setFrtPanel(null); setSelHex(null);
  }, []);

  // Auto-progress when pool is empty (no button needed)
  useEffect(() => {
    if (gs?.phase === 'REINFORCE' && gs.reinforcementsLeft === 0) {
      setGs(p => p ? { ...p, phase: 'ATTACK' } : null);
    }
  }, [gs]);

  // ── Update stable refs after all callbacks are declared ─
  useEffect(() => {
    handleHexClickRef.current = (id: string) => {
      if (!gs || dice?.active || conqPanel) return;
      if (gs.phase === 'DRAFT') draftClick(id);
      else if (gs.phase === 'REINFORCE') reinClick(id);
      else if (gs.phase === 'ATTACK') atkClick(id);
      else if (gs.phase === 'FORTIFY') frtClick(id);
    };
    if (typeof window !== 'undefined') {
      if (!(window as any).TEST_HOOKS) (window as any).TEST_HOOKS = {};
      (window as any).TEST_HOOKS.handleHexClick = (id: string) => handleHexClickRef.current(id);
    }
  }, [gs, dice, conqPanel, draftClick, reinClick, atkClick, frtClick]);

  useEffect(() => {
    onMURef.current = (e: React.MouseEvent<SVGSVGElement>) => {
      const wasPan = panRef.current.dist > 5;
      panRef.current.active = false; setPanning(false);
      if (!wasPan && svgRef.current) {
        const r = svgRef.current.getBoundingClientRect();
        const w = screenToWorld(e.clientX - r.left, e.clientY - r.top, camRef.current.x, camRef.current.y, camRef.current.sc, svgSz.w, svgSz.h);
        const { q, r: rr } = pixelToHex(w.x, w.y, HEX_SIZE);
        const k = hk(q, rr);
        if (gs?.cells[k]) handleHexClick(k);
        else {
          if (!conqPanel) {
            setSelHex(null); setAtkSrc(null); setFrtSrc(null); setReinPanel(null); setFrtPanel(null);
          }
        }
      }
    };
  }, [gs, svgSz, conqPanel, handleHexClick]);


  const cp = gs?.players[gs.currentPlayerIdx] ?? null;

  const getDarkBannerColor = useCallback((colorStr: string | undefined) => {
    if (!colorStr) return 'rgba(15, 23, 42, 0.88)';
    const rgb = parseColorToRgb(colorStr);
    if (!rgb) return 'rgba(15, 23, 42, 0.88)';
    return `rgba(${Math.round(rgb.r * 0.15)}, ${Math.round(rgb.g * 0.15)}, ${Math.round(rgb.b * 0.15)}, 0.88)`;
  }, []);

  const atkTargets = useMemo(() => {
    if (!gs || gs.phase !== 'ATTACK' || !atkSrc) return new Set<string>();
    const src = gs.cells[atkSrc];
    const s = new Set<string>();
    hexNeighbors(src.q, src.r).forEach(n => { const k = hk(n.q, n.r); if (gs.cells[k] && gs.cells[k].owner !== cp?.id) s.add(k); });
    return s;
  }, [gs, atkSrc, cp]);

  const frtTargets = useMemo(() => {
    if (!gs || gs.phase !== 'FORTIFY' || !frtSrc) return new Set<string>();
    const src = gs.cells[frtSrc];
    const s = new Set<string>();
    hexNeighbors(src.q, src.r).forEach(n => { const k = hk(n.q, n.r); if (gs.cells[k] && gs.cells[k].owner === cp?.id) s.add(k); });
    return s;
  }, [gs, frtSrc, cp]);


  // Screen pos helper
  const hexScreenPos = useCallback((id: string) => {
    if (!gs?.cells[id]) return { x: 0, y: 0 };
    const c = gs.cells[id];
    const { x: wx, y: wy } = hexToPixel(c.q, c.r, HEX_SIZE);
    return worldToScreen(wx, wy, cam.x, cam.y, cam.sc, svgSz.w, svgSz.h);
  }, [gs, cam, svgSz]);

  // ── Render: continent borders ──────────────────────────
  const renderBorders = useCallback((conts: ContinentData[], cells: Record<string, HexCell>) =>
    conts.map(cont => {
      const set = new Set(cont.hexIds);
      const paths: string[] = [];
      for (const id of cont.hexIds) {
        const c = cells[id]; if (!c) continue;
        const { x: cx, y: cy } = hexToPixel(c.q, c.r, HEX_SIZE);
        const borderEdges = new Array(6).fill(false);
        for (let e = 0; e < 6; e++) {
          const di = (e + 2) % 6;
          const dir = HEX_DIR[di];
          if (!set.has(hk(c.q + dir.q, c.r + dir.r))) {
            borderEdges[e] = true;
          }
        }
        if (borderEdges.some(b => b)) {
          const cellPaths = getCellBorderPaths(cx, cy, HEX_SIZE, 2.5, borderEdges);
          paths.push(...cellPaths);
        }
      }
      return (
        <g key={`b${cont.id}`} style={{ opacity: dice?.active ? 0 : 1, transition: 'opacity 0.5s ease-in-out', pointerEvents: 'none' }}>
          {paths.map((d, i) => (
            <path key={i} d={d} fill="none"
              stroke={cont.borderColor} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </g>
      );
    })
    , [dice?.active]);

  // ── Render: capital golden border ───────────────────────
  const renderCapitalBorder = useCallback((cells: Record<string, HexCell>) => {
    const capitalCell = Object.values(cells).find(c => c.isCapital);
    if (!capitalCell) return null;
    const { x: cx, y: cy } = hexToPixel(capitalCell.q, capitalCell.r, HEX_SIZE);
    const borderPaths = getCellBorderPaths(cx, cy, HEX_SIZE, 2.5, [true, true, true, true, true, true]);
    return (
      <g key="capital-border" style={{ opacity: dice?.active ? 0 : 1, transition: 'opacity 0.5s ease-in-out', pointerEvents: 'none' }}>
        {borderPaths.map((d, i) => (
          <path key={i} d={d} fill="none"
            stroke="rgba(255, 215, 0, 0.95)" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </g>
    );
  }, [dice?.active]);

  // ── Render: hexes ──────────────────────────────────────
  const renderHexes = useCallback((cells: Record<string, HexCell>) => {
    if (!gs) return null;
    return Object.values(cells).map(cell => {
      const { x: cx, y: cy } = hexToPixel(cell.q, cell.r, HEX_SIZE);
      const owner = cell.owner !== null ? gs.players.find(p => p.id === cell.owner) : null;
      const cont = cell.continentId !== null ? gs.continents[cell.continentId] : null;
      const isAtkSrc = cell.id === atkSrc;
      const isAtkTgt = atkTargets.has(cell.id);
      const isFrtSrc = cell.id === frtSrc;
      const isFrtTgt = frtTargets.has(cell.id);
      const isReinTgt = gs.phase === 'REINFORCE' && cell.owner === cp?.id;
      let cls = '';
      if (isReinTgt && !reinPanel) cls = 'hc-pulse';
      if (isAtkSrc) cls = 'hc-atk-src';
      if (isAtkTgt) cls = 'hc-atk-tgt';
      if (isFrtSrc) cls = 'hc-frt-src';
      if (isFrtTgt) cls = 'hc-frt-tgt';
      // Fill
      let fill = 'transparent', fillOp = 0;
      if (cell.isCapital && !owner) { fill = 'rgba(255,215,0,0.12)'; fillOp = 1; }
      else if (owner) { fill = owner.color; fillOp = 0.28; }
      else if (cont) { fill = cont.fillColor; fillOp = 1; }
      // Stroke
      const hasCustomStroke = isAtkSrc || isFrtSrc || isAtkTgt || isFrtTgt || cell.isCapital || owner !== null;
      const stroke = hasCustomStroke ? (
        isAtkSrc || isFrtSrc ? 'rgba(255,255,255,0.9)' :
          isAtkTgt ? 'rgba(239,68,68,0.9)' : isFrtTgt ? 'rgba(59,130,246,0.9)' :
            cell.isCapital ? 'rgba(255,215,0,0.7)' : owner?.color
      ) : undefined;
      const sw = isAtkSrc || isFrtSrc ? 3 : isAtkTgt || isFrtTgt ? 2.5 : 1.5;
      return (
        <g key={cell.id} className={cls} style={{ cursor: 'pointer' }}>
          {/* Continent fill for unowned */}
          {!owner && cont && <polygon points={hexPts(cx, cy, HEX_SIZE - 1)} fill={cont.fillColor} fillOpacity={1} stroke="none" />}
          {/* Main hex */}
          <polygon points={hexPts(cx, cy, HEX_SIZE)} fill={fill} fillOpacity={fillOp}
            stroke={stroke} strokeWidth={sw}
            className={hasCustomStroke ? '' : 'stroke-custom-border'} />

          {/* Selection ring */}
          {(isAtkSrc || isFrtSrc) && <polygon points={hexPts(cx, cy, HEX_SIZE + 4)} fill="none"
            stroke={isAtkSrc ? '#ef4444' : '#3b82f6'} strokeWidth={2.5} strokeOpacity={0.9}
            style={{ pointerEvents: 'none' }} />}
          {/* Crown for unowned capital */}
          {/* Crown for unowned capital — centered SVG in hex */}
          {cell.isCapital && !owner && (
            <svg x={cx - 6} y={cy - 11} width={12} height={12} viewBox="0 0 24 24"
              fill="rgba(255,215,0,0.9)" style={{ pointerEvents: 'none' as const }}>
              <path d="M2 19h20v2H2v-2zm18-12l-4 4-4-8-4 8-4-4-2 8h20l-2-8z" />
            </svg>
          )}
          {/* Suit icon — centered SVG using SUIT_PATHS, no nested component */}
          {owner && (
            <svg x={cx - 6} y={cy - 11} width={12} height={12} viewBox="0 0 14 14"
              fill={owner.color} style={{ pointerEvents: 'none' as const }}>
              <path d={SUIT_PATHS[owner.suit]} />
            </svg>
          )}
          {/* Troop count */}
          {cell.troops > 0 && (
            <text x={cx} y={cy + (owner || cell.isCapital ? 7 : 2)} textAnchor="middle" dominantBaseline="middle"
              fill={owner ? owner.color : cell.isCapital ? 'rgba(255,215,0,0.9)' : theme.text}
              fontSize={cell.troops >= 10 ? 9 : 11} fontWeight="800"
              fontFamily="'Inter',system-ui,sans-serif"
              style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {cell.troops}
            </text>
          )}
          {/* Draft: capital locked label */}
          {gs.phase === 'DRAFT' && cell.isCapital && (
            <text x={cx} y={cy + 6} textAnchor="middle" fill="rgba(255,215,0,0.6)"
              fontSize={7} fontFamily="'Inter',system-ui,sans-serif" style={{ pointerEvents: 'none' }}>
              LOCKED
            </text>
          )}
        </g>
      );
    });
  }, [gs, atkSrc, atkTargets, frtSrc, frtTargets, cp, reinPanel, theme]);

  // ── Render: Status Bar ────────────────────────────────
  const renderBar = () => {
    if (!gs || !cp) return null;
    const { bg, text, chip } = PHASE_COLORS[gs.phase] || PHASE_COLORS.REINFORCE;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '5px 14px',
        background: bg, borderBottom: `1px solid ${chip}`, animation: 'hcSlideIn 0.3s ease',
        flexShrink: 0, flexWrap: 'wrap', minHeight: 40, color: theme.text
      }}>
        {/* Phase badge */}
        <span style={{
          fontSize: 10, fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase',
          color: text, padding: '3px 9px', background: chip, borderRadius: 6
        }}>
          {PHASE_LABELS[gs.phase] || gs.phase}
        </span>
        {/* Pool / draft step */}
        {gs.phase === 'REINFORCE' && <span style={{ fontSize: 12, color: text, fontWeight: 600 }}>
          Pool: <strong>{gs.reinforcementsLeft}</strong>
        </span>}
        {gs.phase === 'DRAFT' && <span style={{ fontSize: 12, color: text, fontWeight: 600 }}>
          {gs.draftStep + 1}/{gs.draftOrder.length}
        </span>}
        {/* Spacer + turn + action buttons on right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <span style={{ fontSize: 10, color: theme.muted, fontWeight: 600 }}>Turn {gs.turn}</span>
          {gs.phase === 'ATTACK' && <button onClick={endAtk} style={{
            padding: '5px 13px',
            fontSize: 11, fontWeight: 700, background: theme.primary, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer'
          }}>
            Fortify →
          </button>}
          {gs.phase === 'FORTIFY' && <button onClick={skipFrt} style={{
            padding: '5px 13px',
            fontSize: 11, fontWeight: 700, background: 'transparent', color: theme.muted,
            border: `1px solid ${theme.border}`, borderRadius: 7, cursor: 'pointer'
          }}>
            End Turn
          </button>}
        </div>
      </div>
    );
  };

  // ── Render: Win overlay ────────────────────────────────
  const renderWin = () => {
    if (!gs || gs.phase !== 'GAMEOVER' || gs.winner === null) return null;
    const w = gs.players.find(p => p.id === gs.winner); if (!w) return null;
    return (
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', zIndex: 200, flexDirection: 'column'
      }}>
        <div style={{
          background: 'rgba(15,23,42,0.96)', border: `2px solid ${w.color}55`,
          borderRadius: 24, padding: '40px 56px', textAlign: 'center',
          animation: 'hcWinPop 0.65s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: `0 0 80px ${w.color}35`
        }}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>🏆</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 8 }}>
            <div style={{
              width: 50, height: 50, borderRadius: '50%', background: `${w.color}22`,
              border: `3px solid ${w.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <SuitIcon suit={w.suit} size={28} color={w.color} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: w.color }}>Player {w.id} Wins!</div>
          </div>
          <div style={{ color: theme.muted, fontSize: 13, marginBottom: 28 }}>
            Conquered the realm in {gs.turn} turns
          </div>
          <button onClick={resetLobby} style={{
            padding: '12px 36px',
            background: `linear-gradient(135deg,${w.color},${theme.primary})`,
            color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer',
            boxShadow: `0 4px 22px ${w.color}45`
          }}>
            🔄 Play Again
          </button>
        </div>
      </div>
    );
  };

  // ── Render: Reinforce panel ────────────────────────────
  const renderReinPanel = () => {
    if (!reinPanel || !gs) return null;
    const sp = hexScreenPos(reinPanel.id);
    const max = gs.reinforcementsLeft;
    return (
      <div style={{
        position: 'absolute',
        left: Math.max(8, Math.min(svgSz.w - 175, sp.x - 82)),
        top: Math.max(8, sp.y - HEX_SIZE * cam.sc - 90),
        width: 165, background: theme.card,
        border: `1px solid ${theme.primary}60`, borderRadius: 12, padding: 12, zIndex: 50,
        boxShadow: '0 8px 28px rgba(0,0,0,0.6)', animation: 'hcFadeUp 0.2s ease'
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: theme.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
          Reinforce
        </div>
        <input type="range" min={1} max={max} value={reinPanel.count}
          onChange={e => setReinPanel(p => p ? { ...p, count: +e.target.value } : null)}
          style={{ width: '100%', marginBottom: 8, accentColor: theme.primary }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 10 }}>
          <span>+{reinPanel.count} troops</span>
          <span style={{ color: theme.muted }}>{max} left</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={confirmRein} style={{
            flex: 1, padding: '6px', fontSize: 11, fontWeight: 700,
            background: theme.primary, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer'
          }}>✓</button>
          <button onClick={() => { setSelHex(null); setReinPanel(null); }}
            style={{
              padding: '6px 8px', fontSize: 11, background: 'transparent', color: theme.muted,
              border: `1px solid ${theme.border}`, borderRadius: 7, cursor: 'pointer'
            }}>✕</button>
        </div>
      </div>
    );
  };

  // ── Render: Fortify panel ──────────────────────────────
  const renderFrtPanel = () => {
    if (!frtPanel || !gs) return null;
    const sp = hexScreenPos(frtPanel.dst);
    const max = gs.cells[frtPanel.src]?.troops - 1 || 1;
    return (
      <div style={{
        position: 'absolute',
        left: Math.max(8, Math.min(svgSz.w - 178, sp.x - 84)),
        top: Math.max(8, sp.y - HEX_SIZE * cam.sc - 90),
        width: 168, background: theme.card,
        border: `1px solid ${theme.primary}55`, borderRadius: 12, padding: 12, zIndex: 50,
        boxShadow: '0 8px 28px rgba(0,0,0,0.6)', animation: 'hcFadeUp 0.2s ease'
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: theme.primary, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
          🛡 Fortify
        </div>
        <input type="range" min={1} max={max} value={frtPanel.count}
          onChange={e => setFrtPanel(p => p ? { ...p, count: +e.target.value } : null)}
          style={{ width: '100%', marginBottom: 8, accentColor: theme.primary }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 10 }}>
          <span>Move {frtPanel.count}</span>
          <span style={{ color: theme.muted }}>of {max}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={confirmFrt} style={{
            flex: 1, padding: '6px', fontSize: 11, fontWeight: 700,
            background: theme.primary, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer'
          }}>✓</button>
          <button onClick={() => setFrtPanel(null)}
            style={{
              padding: '6px 8px', fontSize: 11, background: 'transparent', color: theme.muted,
              border: `1px solid ${theme.border}`, borderRadius: 7, cursor: 'pointer'
            }}>✕</button>
        </div>
      </div>
    );
  };

  // ── Render: Conquer panel ──────────────────────────────
  const renderConqPanel = () => {
    if (!conqPanel || !gs) return null;
    const sp = hexScreenPos(conqPanel.dst);
    const { min, max, count } = conqPanel;
    return (
      <div style={{
        position: 'absolute',
        left: Math.max(8, Math.min(svgSz.w - 178, sp.x - 84)),
        top: Math.max(8, sp.y - HEX_SIZE * cam.sc - 90),
        width: 168, background: theme.card,
        border: `1px solid ${theme.primary}55`, borderRadius: 12, padding: 12, zIndex: 50,
        boxShadow: '0 8px 28px rgba(0,0,0,0.6)', animation: 'hcFadeUp 0.2s ease'
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: theme.primary, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
          ⚔️ Occupy Territory
        </div>
        <input type="range" min={min} max={max} value={count}
          onChange={e => setConqPanel(p => p ? { ...p, count: +e.target.value } : null)}
          style={{ width: '100%', marginBottom: 8, accentColor: theme.primary }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 10 }}>
          <span>Move {count}</span>
          <span style={{ color: theme.muted }}>of {max}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={confirmConq} style={{
            flex: 1, padding: '6px', fontSize: 11, fontWeight: 700,
            background: theme.primary, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer'
          }}>✓</button>
        </div>
      </div>
    );
  };

  // ── Render: Lobby ──────────────────────────────────────
  const renderLobby = () => {
    const total = cfg.continentCount * cfg.continentSize + 1;
    const req = requiredHexes(cfg.playerCount, total);
    const pColors = getPlayerColors(4);
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '20px 24px', gap: 18, overflowY: 'auto', color: theme.text
      }}>
        {/* Config panel */}
        <div style={{
          background: theme.card, border: `1px solid ${theme.border}`,
          borderRadius: 16, padding: '22px 24px', width: '100%', maxWidth: 430, display: 'flex', flexDirection: 'column', gap: 16
        }}>
          <Slider label="Players" value={cfg.playerCount} min={2} max={4}
            display={`${cfg.playerCount} Players`} accent={theme.primary} muted={theme.muted}
            onChange={v => setCfg(p => ({ ...p, playerCount: v }))} />
          <Slider label="Continents" value={cfg.continentCount} min={2} max={20}
            display={`${cfg.continentCount} Continents`} accent={theme.primary} muted={theme.muted}
            onChange={v => setCfg(p => ({ ...p, continentCount: v }))} />
          <Slider label="Continent Size" value={cfg.continentSize} min={5} max={29}
            display={`${cfg.continentSize} Hexes Each`} accent={theme.primary} muted={theme.muted}
            onChange={v => setCfg(p => ({ ...p, continentSize: v }))} />
          {/* Summary */}
          <div style={{
            display: 'flex', gap: 8, fontSize: 11, color: theme.muted, padding: '7px 10px',
            background: `${theme.primary}14`, borderRadius: 8, border: `1px solid ${theme.primary}28`
          }}>
            <span>🗺️</span>
            <span><strong style={{ color: theme.text }}>{total} total hexes</strong>
              {' · '}{req} to win ({cfg.playerCount === 2 ? '100%' : cfg.playerCount === 3 ? '90%' : '80%'})</span>
          </div>
          {/* Setup mode */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 7 }}>Setup Mode</div>
            <div style={{ display: 'flex', gap: 4, background: `${theme.border}40`, borderRadius: 10, padding: 3 }}>
              {(['auto', 'draft'] as SetupMode[]).map(m => (
                <button key={m} onClick={() => setCfg(p => ({ ...p, setupMode: m }))}
                  style={{
                    flex: 1, padding: '7px', fontSize: 12, fontWeight: 700, borderRadius: 7,
                    border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                    background: cfg.setupMode === m ? theme.primary : 'transparent',
                    color: cfg.setupMode === m ? '#fff' : theme.muted
                  }}>
                  {m === 'auto' ? '⚡ Auto-Assign' : '✋ Manual Draft'}
                </button>
              ))}
            </div>
          </div>
          {/* Auto sub-toggle */}
          {cfg.setupMode === 'auto' && (
            <div style={{ animation: 'hcFadeUp 0.2s ease' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 7 }}>Distribution</div>
              <div style={{ display: 'flex', gap: 4, background: `${theme.border}40`, borderRadius: 10, padding: 3 }}>
                {(['random', 'clumped'] as AutoMode[]).map(m => (
                  <button key={m} onClick={() => setCfg(p => ({ ...p, autoMode: m }))}
                    style={{
                      flex: 1, padding: '7px', fontSize: 12, fontWeight: 700, borderRadius: 7,
                      border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                      background: cfg.autoMode === m ? theme.accent : 'transparent',
                      color: cfg.autoMode === m ? '#fff' : theme.muted
                    }}>
                    {m === 'random' ? '🎲 True Random' : '🏔️ Clumped'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Player preview */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[1, 2, 3, 4].map(pid => {
            const active = pid <= cfg.playerCount;
            const suit = PLAYER_SUIT_MAP[pid];
            const color = active ? pColors[pid - 1] : theme.muted;
            return (
              <div key={pid} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                opacity: active ? 1 : 0.3, transition: 'opacity 0.2s'
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: active ? `${color}22` : 'transparent',
                  border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <SuitIcon suit={suit} size={22} color={color} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: active ? color : theme.muted }}>P{pid}</span>
              </div>
            );
          })}
        </div>
        {/* Start button */}
        <button onClick={startGame}
          style={{
            padding: '13px 48px', background: `linear-gradient(135deg,${theme.primary},${theme.accent})`,
            color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer',
            boxShadow: `0 4px 22px ${theme.primary}50`
          }}>
          ⚔️ Start Game
        </button>
        {/* Resume */}
        {cachedState?.phase && cachedState.phase !== 'LOBBY' && (
          <button onClick={() => {
            const restoredDice = cachedState.dice;
            if (restoredDice && restoredDice.active && restoredDice.animPhase !== 'choice' && restoredDice.animPhase !== 'conquered') {
              setDice({ ...restoredDice, animPhase: 'choice' });
            } else {
              setDice(restoredDice ?? null);
            }
            setReinPanel(cachedState.reinPanel ?? null);
            setFrtPanel(cachedState.frtPanel ?? null);
            setConqPanel(cachedState.conqPanel ?? null);
            setGs(cachedState as GameState);
            setTimeout(() => {
              if (cachedState.dice?.active) {
                const aid = cachedState.dice.attackHexId;
                const did = cachedState.dice.defendHexId;
                const ac = cachedState.cells[aid];
                const dc = cachedState.cells[did];
                if (ac && dc) {
                  const { x: ax, y: ay } = hexToPixel(ac.q, ac.r, HEX_SIZE);
                  const { x: dx, y: dy } = hexToPixel(dc.q, dc.r, HEX_SIZE);
                  const scaleX = (svgSz.w * 0.95) / 55;
                  const scaleY = (svgSz.h * 0.95) / 34;
                  const zs = Math.max(13.0, Math.min(scaleX, scaleY, 17.0));
                  animCamTo(-((ax + dx) / 2) * zs, -((ay + dy) / 2) * zs - 32, zs);
                  return;
                }
              }
              fitCamera(cachedState.cells);
            }, 80);
          }}
            style={{
              padding: '7px 22px', background: 'transparent', color: theme.muted,
              border: `1px solid ${theme.border}`, borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}>
            ↩ Resume Previous Game
          </button>
        )}
      </div>
    );
  };

  // Count hexes for the progress bar
  const progressSegments = useMemo(() => {
    if (!gs) return [];
    // Count owned hexes for each player
    const playerCounts = gs.players.map(p => ({
      player: p,
      count: ownedCount(gs.cells, p.id)
    }));
    // Count unowned/neutral hexes
    const neutralCount = Object.values(gs.cells).filter(c => c.owner === null).length;
    const total = gs.totalHexes || Object.keys(gs.cells).length || 1;

    return [
      ...playerCounts.map(pc => ({
        color: pc.player.color,
        pct: (pc.count / total) * 100,
        count: pc.count,
        id: pc.player.id,
      })),
      {
        color: theme.border, // Follows theme's border color for neutral/unowned
        pct: (neutralCount / total) * 100,
        count: neutralCount,
        id: 'neutral',
      }
    ].filter(s => s.pct > 0);
  }, [gs, theme]);

  // ── Render Suit Path Helper ────────────────────────────
  const renderSuitPath = useCallback((suit: Suit, cx: number, cy: number, size: number, color: string, isDying = false) => {
    const scale = size / 14;
    return (
      <g transform={`translate(${cx - 7 * scale}, ${cy - 7 * scale}) scale(${scale})`}>
        <g style={{
          transformOrigin: '7px 7px',
          animation: isDying ? 'hcTroopDie 1.5s ease-out forwards' : 'none',
          opacity: isDying ? 0 : 1,
          transition: 'all 0.4s ease-in-out'
        }}>
          <path d={SUIT_PATHS[suit]} fill={color} />
        </g>
      </g>
    );
  }, []);

  // ── Render Combat Visuals directly inside SVG ───────────
  const renderCombatVisuals = useCallback(() => {
    if (!dice || !gs) return null;
    const { attackHexId: aid, defendHexId: did, attackerUnits, defenderUnits, animPhase } = dice;

    const attackerCell = gs.cells[aid];
    const defenderCell = gs.cells[did];
    if (!attackerCell || !defenderCell) return null;

    const attacker = gs.players.find(p => p.id === attackerCell.owner);
    if (!attacker) return null;

    const defenderId = defenderCell.owner;
    const defender = defenderId ? gs.players.find(p => p.id === defenderId) : null;
    const isUnownedCapital = defenderCell.isCapital && !defender;
    const defenderColor = defender ? defender.color : isUnownedCapital ? '#ffd700' : 'rgba(255,255,255,0.7)';
    const defenderSuit = defender ? defender.suit : null;

    const pos = getCombatPositions(aid, did, attackerUnits.length, defenderUnits.length);

    // Reserves (excess of 6 troops)
    const atkReserves = Math.max(0, dice.attackerTroops - 1 - 6);
    const defReserves = Math.max(0, dice.defenderTroops - 6);

    return (
      <g>
        {/* Reserve Tents */}
        {atkReserves > 0 && (
          <g>
            <g transform={`translate(${pos.tentAtk.x - 4}, ${pos.tentAtk.y - 4})`}>
              <Tent size={8} color={attacker.color} />
            </g>
            <g transform={`translate(${pos.tentAtk.x + 3.5}, ${pos.tentAtk.y - 2.2})`}>
              <circle r={1.6} fill={theme.card} stroke={attacker.color} strokeWidth={0.3} />
              <text textAnchor="middle" dominantBaseline="middle" fill={attacker.color} fontSize={2.2} fontWeight="900">
                {atkReserves}
              </text>
            </g>
          </g>
        )}

        {defReserves > 0 && (
          <g>
            <g transform={`translate(${pos.tentDef.x - 4}, ${pos.tentDef.y - 4})`}>
              <Tent size={8} color={defenderColor} />
            </g>
            <g transform={`translate(${pos.tentDef.x + 3.5}, ${pos.tentDef.y - 2.2})`}>
              <circle r={1.6} fill={theme.card} stroke={defenderColor} strokeWidth={0.3} />
              <text textAnchor="middle" dominantBaseline="middle" fill={defenderColor} fontSize={2.2} fontWeight="900">
                {defReserves}
              </text>
            </g>
          </g>
        )}

        {/* Attacker Units */}
        {attackerUnits.map((u, i) => {
          const slotPt = pos.attackerPts[i] || pos.tentAtk;
          const cx = u.x !== undefined ? u.x : slotPt.x;
          const cy = u.y !== undefined ? u.y : slotPt.y;
          return (
            <g key={u.id}>
              {renderSuitPath(attacker.suit, cx, cy, 3.5, attacker.color, u.status === 'dying')}
            </g>
          );
        })}

        {/* Defender Units */}
        {defenderUnits.map((u, i) => {
          const slotPt = pos.defenderPts[i] || pos.tentDef;
          const cx = u.x !== undefined ? u.x : slotPt.x;
          const cy = u.y !== undefined ? u.y : slotPt.y;
          return (
            <g key={u.id}>
              {defenderSuit ? (
                renderSuitPath(defenderSuit, cx, cy, 3.5, defenderColor, u.status === 'dying')
              ) : isUnownedCapital ? (
                <g transform={`translate(${cx - 1.75}, ${cy - 2})`}>
                  <g style={{
                    transformOrigin: '1.75px 1.75px',
                    transition: 'all 0.4s ease-in-out',
                    animation: u.status === 'dying' ? 'hcTroopDie 1.5s ease-out forwards' : 'none',
                    opacity: u.status === 'dying' ? 0 : 1,
                    pointerEvents: 'none'
                  }}>
                    <svg width={3.5} height={3.5} viewBox="0 0 24 24" fill={defenderColor}>
                      <path d="M2 19h20v2H2v-2zm18-12l-4 4-4-8-4 8-4-4-2 8h20l-2-8z" />
                    </svg>
                  </g>
                </g>
              ) : (
                <circle cx={cx} cy={cy} r={1.5} fill={defenderColor}
                  style={{
                    transformOrigin: `${cx}px ${cy}px`,
                    transition: 'all 0.4s ease-in-out',
                    animation: u.status === 'dying' ? 'hcTroopDie 1.5s ease-out forwards' : 'none',
                    opacity: u.status === 'dying' ? 0 : 1
                  }} />
              )}
            </g>
          );
        })}

        {/* Fireworks Barrage during Dice Roll */}
        {(animPhase === 'rolling' || animPhase === 'settling' || animPhase === 'comparing' || animPhase === 'dying') && Array.from({ length: Math.min(attackerUnits.length, defenderUnits.length) }).map((_, i) => {
          const uAtk = attackerUnits[i];
          const uDef = defenderUnits[i];
          if (uAtk?.status !== 'alive' || uDef?.status !== 'alive') return null;

          const pAtk = pos.attackerPts[i];
          const pDef = pos.defenderPts[i];
          if (!pAtk || !pDef) return null;

          // Alternate directions: Even indexes shoot attacker->defender, Odd indexes shoot defender->attacker
          const isAtkSource = i % 2 === 0;
          const pSrc = isAtkSource ? pAtk : pDef;
          const pTgt = isAtkSource ? pDef : pAtk;

          // Arc geometry calculation
          const dxVec = pTgt.x - pSrc.x;
          const dyVec = pTgt.y - pSrc.y;
          const mx = (pSrc.x + pTgt.x) / 2;
          const my = (pSrc.y + pTgt.y) / 2;
          const px = -dyVec;
          const py = dxVec;
          const len = Math.sqrt(px * px + py * py) || 1;
          const ux = px / len;
          const uy = py / len;

          // Alternate arch directions for variation
          const arcOffset = 8 * (i % 3 - 1);
          const cx = mx + arcOffset * ux;
          const cy = my + arcOffset * uy;

          const fColor = isAtkSource ? attacker.color : defenderColor;

          return (
            <g key={`firework_${i}`}>
              {/* Traveling trail path */}
              <path
                d={`M ${pSrc.x} ${pSrc.y} Q ${cx} ${cy} ${pTgt.x} ${pTgt.y}`}
                fill="none"
                stroke={fColor}
                strokeWidth={0.8}
                strokeLinecap="round"
                className="hc-firework-trail"
                style={{
                  animationDelay: `${i * 0.12}s`,
                  animationDuration: '2.5s'
                }}
              />
              {/* Explosion burst particles */}
              <g transform={`translate(${pTgt.x}, ${pTgt.y})`}>
                {Array.from({ length: 10 }).map((_, pIdx) => {
                  const angle = (pIdx * 360) / 10 + (Math.random() * 15 - 7.5);
                  const distance = 12 + Math.random() * 14;
                  const dx = Math.cos((angle * Math.PI) / 180) * distance;
                  const dy = Math.sin((angle * Math.PI) / 180) * distance;

                  let pColor = fColor;
                  if (pIdx % 3 === 1) pColor = '#f59e0b'; // Gold sparks
                  else if (pIdx % 3 === 2) pColor = '#ffffff'; // White sparkles

                  const radius = 0.8 + Math.random() * 0.8;

                  return (
                    <circle
                      key={pIdx}
                      cx={0}
                      cy={0}
                      r={radius}
                      fill={pColor}
                      className="hc-firework-particle"
                      style={{
                        '--dx': `${dx}px`,
                        '--dy': `${dy}px`,
                        animationDelay: `${i * 0.12}s`,
                        animationDuration: '2.5s'
                      } as React.CSSProperties}
                    />
                  );
                })}
              </g>
            </g>
          );
        })}

      </g>
    );
  }, [dice, gs, getCombatPositions, renderSuitPath, theme]);

  // ── Render Screen Space Dice at the bottom ──────────────
  const renderScreenSpaceDice = useCallback(() => {
    if (!dice || !gs) return null;
    const { attackHexId: aid, defendHexId: did, displayAtkDice, displayDefDice, animPhase } = dice;
    const attackerCell = gs.cells[aid];
    const defenderCell = gs.cells[did];
    if (!attackerCell || !defenderCell) return null;

    const attacker = gs.players.find(p => p.id === attackerCell.owner);
    if (!attacker) return null;

    const defenderId = defenderCell.owner;
    const defender = defenderId ? gs.players.find(p => p.id === defenderId) : null;
    const isUnownedCapital = defenderCell.isCapital && !defender;
    const defenderColor = defender ? defender.color : isUnownedCapital ? '#ffd700' : 'rgba(255,255,255,0.7)';

    const { x: ax } = hexToPixel(attackerCell.q, attackerCell.r, HEX_SIZE);
    const { x: dx } = hexToPixel(defenderCell.q, defenderCell.r, HEX_SIZE);
    const isAttackerLeft = ax <= dx;

    const rolling = animPhase === 'rolling';
    const comparing = animPhase === 'comparing' || animPhase === 'dying' || animPhase === 'choice' || animPhase === 'conquered';
    const pairs = Math.min(dice.atkDice.length, dice.defDice.length);
    const pairRes = Array.from({ length: pairs }, (_, i) => ({
      isTie: dice.atkDice[i] === dice.defDice[i],
      defWins: dice.defDice[i] >= dice.atkDice[i]
    }));

    const dieSize = 36;

    const renderDiceGroup = (values: number[], color: string, isAttacker: boolean) => {
      const isLeft = isAttacker ? isAttackerLeft : !isAttackerLeft;

      const style: React.CSSProperties = {
        position: 'absolute',
        bottom: '22px',
        display: 'flex',
        gap: '8px',
        pointerEvents: 'none',
        zIndex: 50,
      };

      if (isLeft) {
        style.left = 'calc(50% - 110px)';
        style.transform = 'translateX(-100%)';
      } else {
        style.left = 'calc(50% + 110px)';
      }

      return (
        <div style={style}>
          {values.map((val, i) => {
            const shatter = isAttacker
              ? (animPhase === 'dying' || animPhase === 'choice' || animPhase === 'conquered') && pairRes[i]?.defWins
              : (animPhase === 'dying' || animPhase === 'choice' || animPhase === 'conquered') && pairRes[i] && !pairRes[i].defWins;
            const highlight = !isAttacker && comparing && pairRes[i]?.isTie;

            return (
              <div key={`${isAttacker ? 'atk' : 'def'}_die_${i}`} className="hc-dice-entrance" style={{ animationDelay: `${i * 0.1}s` }}>
                <DieFace value={val} size={dieSize} rolling={rolling} highlight={highlight} shatter={shatter} color={color} />
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <>
        {displayAtkDice.length > 0 && renderDiceGroup(displayAtkDice, attacker.color, true)}
        {displayDefDice.length > 0 && renderDiceGroup(displayDefDice, defenderColor, false)}
      </>
    );
  }, [dice, gs, theme]);

  // ── Main render ────────────────────────────────────────
  const isLobby = !gs || gs.phase === 'LOBBY';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
      position: 'relative', overflow: 'hidden', fontFamily: "'Inter',system-ui,sans-serif", color: theme.text
    }}>
      <style>{GAME_CSS}</style>

      {/* Persistent Header — matches Solitaire / Trithello style */}
      <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between shrink-0">
        <h3 className="font-black text-custom-text text-base flex items-center gap-3 tracking-wide uppercase select-none">
          <Sparkles className="h-5 w-5 text-custom-accent animate-pulse" />
          <span>Hex-Command</span>
        </h3>

        <div className="flex items-center gap-3">
          {!isLobby && (
            <button
              onClick={resetLobby}
              className="px-3 py-1.5 bg-custom-input hover:bg-custom-primary/20 text-custom-text border border-custom-border rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
              title="Reset to Lobby"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Status bar (game only) */}
      {!isLobby && renderBar()}

      {/* Progress Bar (full-width, slim, 6px height, relative to total hexes) */}
      {!isLobby && progressSegments.length > 0 && (
        <div
          id="hex-command-progress-bar"
          style={{
            width: '100%',
            height: '6px',
            background: theme.input, // Follows theme input background
            display: 'flex',
            overflow: 'hidden',
            flexShrink: 0,
            borderBottom: `1px solid ${theme.border}`
          }}
        >
          {progressSegments.map((seg) => (
            <div
              key={seg.id}
              style={{
                height: '100%',
                width: `${seg.pct}%`,
                backgroundColor: seg.color,
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              title={seg.id === 'neutral' ? `Neutral: ${seg.count}` : `Player ${seg.id}: ${seg.count}`}
            />
          ))}
        </div>
      )}

      {/* Main content */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {isLobby
          ? renderLobby()
          : (
            <svg ref={svgRef} width="100%" height="100%"
              style={{ display: 'block', cursor: panning ? 'grabbing' : 'default' }}
              onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU}
              onWheel={onWheel}>
              {/* Background */}
<rect width="100%" height="100%" fill={theme.bg} />
              {/* Board content */}
              <g transform={`translate(${cam.x + svgSz.w / 2},${cam.y + svgSz.h / 2}) scale(${cam.sc})`}>
                {/* Continent fills and hexes */}
                {gs && renderHexes(gs.cells)}
                {/* Continent borders */}
                {gs && renderBorders(gs.continents, gs.cells)}
                {/* Capital golden border */}
                {gs && renderCapitalBorder(gs.cells)}

                {/* Floaty reinforcement numbers */}
                {floatyNumbers.map(f => {
                  const cell = gs?.cells[f.cellId];
                  if (!cell) return null;
                  const { x: cx, y: cy } = hexToPixel(cell.q, cell.r, HEX_SIZE);
                  const playerColor = gs?.players[gs.currentPlayerIdx]?.color || theme.primary;

                  const textStr = `+${f.count} ${f.label}`;
                  const rectW = 20 + textStr.length * 4.5;
                  const rectH = 13;

                  return (
                    <g key={f.id} className="hc-reinforce-pill">
                      {/* Pill background border */}
                      <rect
                        x={cx - rectW / 2}
                        y={cy - 16 - rectH / 2}
                        width={rectW}
                        height={rectH}
                        rx={rectH / 2}
                        ry={rectH / 2}
                        fill="rgba(15, 23, 42, 0.92)"
                        stroke={playerColor}
                        strokeWidth={1}
                      />
                      {/* Pill Text */}
                      <text
                        x={cx}
                        y={cy - 16}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#ffffff"
                        fontSize={6.5}
                        fontWeight="900"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {textStr}
                      </text>
                    </g>
                  );
                })}

                {/* Combat Visuals directly on border */}
                {dice && dice.active && renderCombatVisuals()}
              </g>
            </svg>
          )
        }

        {/* Screen space dice rendered at bottom of the screen */}
        {dice && dice.active && renderScreenSpaceDice()}

        {/* Floating Player Turn Indicator Pill */}
        {!isLobby && gs.phase !== 'GAMEOVER' && (() => {
          const showChoicePopup = dice && dice.active && dice.animPhase === 'choice';

          if (showChoicePopup) {
            const attackerCell = gs.cells[dice.attackHexId];
            const attacker = gs.players.find(p => p.id === attackerCell?.owner);
            const color = attacker?.color || theme.primary;

            return (
              <div
                id="hex-command-combat-choice-pill"
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: theme.card,
                  backdropFilter: 'blur(12px)',
                  border: `2px solid ${color}`,
                  borderRadius: '9999px',
                  padding: '6px 12px 6px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px ${color}25`,
                  zIndex: 180,
                  pointerEvents: 'auto',
                  userSelect: 'none',
                  animation: 'hcFadeUp 0.25s ease-out'
                }}
              >
                {/* Attacker Icon & Label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: `${color}22`,
                    border: `1px solid ${color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <SuitIcon suit={attacker?.suit || 'spades'} size={9} color={color} />
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: theme.text,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    whiteSpace: 'nowrap'
                  }}>
                    Battle
                  </span>
                </div>

                {/* Divider line */}
                <div style={{ width: '1px', height: '16px', background: theme.border }} />

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleAttackAgain}
                    style={{
                      padding: '6px 16px',
                      background: `linear-gradient(135deg, ${color}, ${theme.accent || color})`,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: `0 2px 8px ${color}30`,
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap'
                    }}>
                    ⚔️ Attack Again
                  </button>
                  <button onClick={retreatCombat}
                    style={{
                      padding: '6px 14px',
                      background: 'transparent',
                      color: theme.muted,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap'
                    }}>
                    🏳️ Retreat
                  </button>
                </div>
              </div>
            );
          }

          const displayPlayer = turnPillPlayer || cp;
          if (!displayPlayer) return null;
          const isCentered = turnPillStage !== 'normal';
          return (
            <div
              id="hex-command-turn-indicator"
              style={{
                position: 'absolute',
                bottom: isCentered ? '50%' : '24px',
                left: '50%',
                transform: isCentered ? 'translate(-50%, 50%) scale(1.5)' : 'translateX(-50%) scale(1)',
                background: theme.card,
                backdropFilter: 'blur(8px)',
                border: `2px solid ${displayPlayer.color}`,
                borderRadius: '9999px',
                padding: '8px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: isCentered
                  ? `0 12px 48px rgba(0, 0, 0, 0.6), 0 0 24px ${displayPlayer.color}50`
                  : `0 8px 32px rgba(0, 0, 0, 0.4), 0 0 16px ${displayPlayer.color}25`,
                zIndex: isCentered ? 180 : 40,
                pointerEvents: 'none',
                userSelect: 'none',
                transition: 'bottom 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.3s ease, box-shadow 0.5s ease',
                animation: turnPillStage === 'normal' ? 'hcFadeUp 0.3s ease-out' : 'none'
              }}
            >
              <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: `${displayPlayer.color}22`,
                border: `2px solid ${displayPlayer.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <SuitIcon suit={displayPlayer.suit} size={9} color={displayPlayer.color} />
              </div>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                color: displayPlayer.color,
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Player {displayPlayer.id}'s Turn
              </span>
            </div>
          );
        })()}

        {/* Floating panels */}
        {reinPanel && renderReinPanel()}
        {frtPanel && renderFrtPanel()}
        {conqPanel && renderConqPanel()}

        {/* Phase transition sweep overlay */}
        {phaseTransition && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(3px)',
            zIndex: 180,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'auto'
          }}>
            <div style={{
              width: '100%',
              background: getDarkBannerColor(cp?.color),
              borderTop: `2px solid ${cp?.color || theme.primary}`,
              borderBottom: `2px solid ${cp?.color || theme.primary}`,
              padding: '28px 0',
              textAlign: 'center',
              backdropFilter: 'blur(16px)',
              boxShadow: `0 0 40px ${cp?.color || theme.primary}33`,
              animation: 'hcPhaseBannerSweep 1.5s ease-in-out forwards'
            }}>
              <div style={{
                fontSize: 12, fontWeight: 900, letterSpacing: '3px',
                color: theme.muted, textTransform: 'uppercase', marginBottom: 8
              }}>
                Phase Change
              </div>
              <div style={{
                fontSize: 32, fontWeight: 900, letterSpacing: '2px',
                color: cp?.color || theme.primary, textTransform: 'uppercase'
              }}>
                {PHASE_LABELS[phaseTransition.phase] || phaseTransition.phase}
              </div>
            </div>
          </div>
        )}

        {/* Turn transition screen freeze backdrop */}
        {turnPillStage !== 'normal' && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.15)',
            backdropFilter: 'blur(2px)',
            zIndex: 175,
            pointerEvents: 'auto'
          }} />
        )}

        {/* Win overlay */}
        {gs?.phase === 'GAMEOVER' && renderWin()}

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: theme.card, border: `1px solid ${theme.border}`,
            borderRadius: 10, padding: '8px 18px', fontSize: 12, fontWeight: 600, color: theme.text,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)', animation: 'hcFadeUp 0.2s ease', zIndex: 60
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
};
