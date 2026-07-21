import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RotateCcw, Sparkles, Check, Info } from 'lucide-react';
import { getTheme, getPlayerColors } from '../shared/colorUtils';
import { triggerConfetti } from '../shared/confettiUtils';

interface GameProps {
  cachedState: any;
  onSaveCache: (state: any) => void;
  onClose: () => void;
}

// -------------------------------------------------------------
// Isometric Coordinate and Vector Helpers
// -------------------------------------------------------------
export interface CellKey {
  q: number;
  r: number;
  up: number; // 1 = up triangle, 0 = down triangle
}

export interface Point2D {
  x: number;
  y: number;
}

// Check if two cells are equal
export function isSameCell(a: CellKey, b: CellKey): boolean {
  return a.q === b.q && a.r === b.r && a.up === b.up;
}

// Get the three vertex keys of a triangle cell
export function getTriangleVertices(q: number, r: number, up: number): string[] {
  if (up === 1) {
    return [`${q},${r}`, `${q + 1},${r}`, `${q},${r + 1}`];
  } else {
    return [`${q + 1},${r}`, `${q},${r + 1}`, `${q + 1},${r + 1}`];
  }
}

// Returns the 2D Cartesian vertices of a cell for rendering
export function getCellPoints(q: number, r: number, up: number, L: number): Point2D[] {
  const H = L * (Math.sqrt(3) / 2);
  const getV = (i: number, j: number): Point2D => {
    return {
      x: i * L + j * (L / 2),
      y: j * H,
    };
  };

  if (up === 1) {
    return [getV(q, r), getV(q + 1, r), getV(q, r + 1)];
  } else {
    return [getV(q + 1, r), getV(q, r + 1), getV(q + 1, r + 1)];
  }
}

// Returns the centroid of a cell
export function getCellCentroid(q: number, r: number, up: number, L: number): Point2D {
  const H = L * (Math.sqrt(3) / 2);
  if (up === 1) {
    return {
      x: (q + 2 / 3) * L + (r + 1 / 3) * (L / 2),
      y: (r + 1 / 3) * H,
    };
  } else {
    return {
      x: (q + 2 / 3) * L + (r + 2 / 3) * (L / 2),
      y: (r + 2 / 3) * H,
    };
  }
}

// Get the 3 edge-adjacent neighbors of a cell
export function getEdgeNeighbors(q: number, r: number, up: number): CellKey[] {
  if (up === 1) {
    return [
      { q, r, up: 0 },
      { q: q - 1, r, up: 0 },
      { q, r: r - 1, up: 0 },
    ];
  } else {
    return [
      { q, r, up: 1 },
      { q: q + 1, r, up: 1 },
      { q, r: r + 1, up: 1 },
    ];
  }
}

// Integer 60-degree counter-clockwise rotation of a cell around local origin
export function rotateCell60(q: number, r: number, up: number): CellKey {
  if (up === 1) {
    return { q: -r - 1, r: q + r, up: 0 };
  } else {
    return { q: -r - 1, r: q + r + 1, up: 1 };
  }
}

// Integer horizontal reflection of a cell
export function flipCellHorizontal(q: number, r: number, up: number): CellKey {
  if (up === 1) {
    return { q: -q - r - 1, r, up: 1 };
  } else {
    return { q: -q - r - 2, r, up: 0 };
  }
}

// -------------------------------------------------------------
// BFS Hexagonal Board Generator
// -------------------------------------------------------------
export function generateHexagonalBoard(sideLength: number): CellKey[] {
  const seeds: CellKey[] = [
    { q: 0, r: 0, up: 1 },
    { q: -1, r: 0, up: 0 },
    { q: -1, r: 0, up: 1 },
    { q: -1, r: -1, up: 0 },
    { q: 0, r: -1, up: 1 },
    { q: 0, r: -1, up: 0 },
  ];

  const visited = new Set<string>();
  const board: CellKey[] = [];
  const queue: { cell: CellKey; dist: number }[] = [];

  seeds.forEach((c) => {
    const key = `${c.q},${c.r},${c.up}`;
    visited.add(key);
    board.push(c);
    queue.push({ cell: c, dist: 0 });
  });

  while (queue.length > 0) {
    const { cell, dist } = queue.shift()!;
    if (dist >= 2 * (sideLength - 1)) continue;

    const neighbors = getEdgeNeighbors(cell.q, cell.r, cell.up);
    for (const n of neighbors) {
      const nKey = `${n.q},${n.r},${n.up}`;
      if (!visited.has(nKey)) {
        visited.add(nKey);
        board.push(n);
        queue.push({ cell: n, dist: dist + 1 });
      }
    }
  }

  return board;
}

// -------------------------------------------------------------
// Procedural Polyiamond Generator
// -------------------------------------------------------------
export interface PolyShape {
  id: string;
  cells: CellKey[];
}

export function canonicalizeShape(cells: CellKey[]): string {
  // Try all 6 rotations x 2 reflections
  let bestKey = '';

  const transform = (c: CellKey, rot: number, flip: boolean): CellKey => {
    let curr = { ...c };
    if (flip) {
      curr = flipCellHorizontal(curr.q, curr.r, curr.up);
    }
    for (let i = 0; i < rot; i++) {
      curr = rotateCell60(curr.q, curr.r, curr.up);
    }
    return curr;
  };

  for (let rot = 0; rot < 6; rot++) {
    for (const flip of [false, true]) {
      const transformed = cells.map((c) => transform(c, rot, flip));
      // Sort and translate
      transformed.sort((a, b) => a.q - b.q || a.r - b.r || a.up - b.up);
      const anchor = transformed[0];

      const normalized = transformed.map((c) => {
        // Shift relative to anchor
        let nq = c.q - anchor.q;
        let nr = c.r - anchor.r;
        let nup = c.up;
        if (anchor.up === 0) {
          // Flip parity so anchor is always up
          nq = -nq;
          nr = -nr;
          nup = 1 - nup;
        }
        return { q: nq, r: nr, up: nup };
      });

      // Sort normalized
      normalized.sort((a, b) => a.q - b.q || a.r - b.r || a.up - b.up);
      const key = normalized.map((c) => `${c.q},${c.r},${c.up}`).join(';');
      if (!bestKey || key < bestKey) {
        bestKey = key;
      }
    }
  }

  return bestKey;
}

export function generateAllPolyiamonds(): PolyShape[] {
  // BFS shape building
  const uniqueShapes: Record<number, Record<string, CellKey[]>> = {
    1: { '0,0,1': [{ q: 0, r: 0, up: 1 }] },
  };

  for (let size = 2; size <= 6; size++) {
    uniqueShapes[size] = {};
    const prevShapes = Object.values(uniqueShapes[size - 1]);

    for (const shape of prevShapes) {
      // Find all adjacent cells we can append
      const candidates = new Set<string>();
      for (const cell of shape) {
        const neighbors = getEdgeNeighbors(cell.q, cell.r, cell.up);
        neighbors.forEach((n) => {
          if (!shape.some((sc) => isSameCell(sc, n))) {
            candidates.add(`${n.q},${n.r},${n.up}`);
          }
        });
      }

      for (const candStr of candidates) {
        const [cq, cr, cup] = candStr.split(',').map(Number);
        const newShape = [...shape, { q: cq, r: cr, up: cup }];
        const key = canonicalizeShape(newShape);
        if (!uniqueShapes[size][key]) {
          uniqueShapes[size][key] = newShape;
        }
      }
    }
  }

  // Flatten into sorted list by size
  const allShapes: PolyShape[] = [];
  let idCounter = 1;
  for (let size = 1; size <= 6; size++) {
    const list = Object.entries(uniqueShapes[size]).map(([_, cells]) => {
      // Shift canonicalized shape to start at (0, 0, 1)
      cells.sort((a, b) => a.q - b.q || a.r - b.r || a.up - b.up);
      const anchor = cells[0];
      const normalized = cells.map((c) => {
        let nq = c.q - anchor.q;
        let nr = c.r - anchor.r;
        let nup = c.up;
        if (anchor.up === 0) {
          nq = -nq;
          nr = -nr;
          nup = 1 - nup;
        }
        return { q: nq, r: nr, up: nup };
      });
      normalized.sort((a, b) => a.q - b.q || a.r - b.r || a.up - b.up);

      return {
        id: `shape_${size}_${idCounter++}`,
        cells: normalized,
      };
    });
    allShapes.push(...list);
  }

  return allShapes;
}

// -------------------------------------------------------------
// Slider sub-component
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// Component Implementation
// -------------------------------------------------------------
const allShapes = generateAllPolyiamonds();

const getShapeName = (id: string): string => {
  const parts = id.split('_');
  if (parts.length >= 2) {
    return `Size ${parts[1]} Piece`;
  }
  return 'Extra Piece';
};

export const TrigonGame: React.FC<GameProps> = ({
  cachedState,
  onSaveCache,
}) => {
  const theme = getTheme();
  // 1. Lobby and Config States
  const [playerCount, setPlayerCount] = useState<number>(() => cachedState?.playerCount ?? 4);
  const [boardSize, setBoardSize] = useState<number>(() => cachedState?.boardSize ?? 9);
  const [isGameStarted] = useState<boolean>(true); // Forced to true to show gameboard directly

  // 2. Play States
  const [currentPlayer, setCurrentPlayer] = useState<number>(() => cachedState?.currentPlayer ?? 0);
  const [boardOwners, setBoardOwners] = useState<Record<string, number>>(() => cachedState?.boardOwners ?? {});
  const [playerInventories, setPlayerInventories] = useState<Record<number, string[]>>(() => {
    if (cachedState?.playerInventories) {
      return cachedState.playerInventories;
    }
    // Initialize standard inventories for playerCount
    const initialInventories: Record<number, string[]> = {};
    const shapesList = allShapes.map((s) => s.id);
    for (let p = 0; p < (cachedState?.playerCount ?? 4); p++) {
      initialInventories[p] = [...shapesList];
    }
    return initialInventories;
  });
  const [skippedPlayers, setSkippedPlayers] = useState<number[]>(() => cachedState?.skippedPlayers ?? []);
  const [winner, setWinner] = useState<number[] | null>(() => cachedState?.winner ?? null);
  const [extraPiecesMode, setExtraPiecesMode] = useState<boolean>(() => cachedState?.extraPiecesMode ?? false);
  const [extraPieceForRound, setExtraPieceForRound] = useState<string | null>(() => cachedState?.extraPieceForRound ?? null);

  // 3. Piece Selection & Manipulation States
  const [heldPieceIdx, setHeldPieceIdx] = useState<number | null>(null);
  const [heldRotation, setHeldRotation] = useState<number>(0);
  const [heldFlipped, setHeldFlipped] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  // 4. Cursor Tracking & Turn Change Animation States
  const [svgMousePos, setSvgMousePos] = useState<Point2D>({ x: 0, y: 0 });
  const [turnPillStage, setTurnPillStage] = useState<'normal' | 'centering' | 'centered' | 'shrinking'>('normal');
  const [turnPillPlayer, setTurnPillPlayer] = useState<number | null>(null);
  const lastPlayerIdxRef = useRef<number | null>(null);

  // Ref container for window tracking
  const containerRef = useRef<HTMLDivElement>(null);
  const announcementTimeoutRef = useRef<any>(null);

  // Theme-aware colors
  const playerColors = getPlayerColors(playerCount);

  // Build the board cells (memoized based on boardSize)
  const boardCells = useMemo(() => generateHexagonalBoard(boardSize), [boardSize]);
  const cellKeys = useMemo(() => boardCells.map((c) => `${c.q},${c.r},${c.up}`), [boardCells]);
  const cellKeysSet = useMemo(() => new Set(cellKeys), [cellKeys]);
  const L = useMemo(() => Math.max(16, Math.min(26, 210 / boardSize)), [boardSize]);

  // Precompute vertex string key -> sharing cells mapping
  const vertexToCellsMap = useMemo(() => {
    const map: Record<string, CellKey[]> = {};
    boardCells.forEach((c) => {
      const verts = getTriangleVertices(c.q, c.r, c.up);
      verts.forEach((v) => {
        if (!map[v]) {
          map[v] = [];
        }
        map[v].push(c);
      });
    });
    return map;
  }, [boardCells]);

  // Convert vertex key "q,r" to 2D Cartesian coordinate
  const getVertexCartesian = useCallback((vKey: string): Point2D => {
    const [q, r] = vKey.split(',').map(Number);
    const H = L * (Math.sqrt(3) / 2);
    return {
      x: q * L + r * (L / 2),
      y: r * H,
    };
  }, [L]);

  const firstMoveMade = useMemo(() => Object.keys(boardOwners).length > 0, [boardOwners]);

  // Auto-save state
  const saveCacheRef = useRef(onSaveCache);
  useEffect(() => {
    saveCacheRef.current = onSaveCache;
  }, [onSaveCache]);

  useEffect(() => {
    saveCacheRef.current({
      playerCount,
      boardSize,
      isGameStarted: true,
      currentPlayer,
      boardOwners,
      playerInventories,
      skippedPlayers,
      winner,
      extraPiecesMode,
      extraPieceForRound,
    });
  }, [
    playerCount,
    boardSize,
    currentPlayer,
    boardOwners,
    playerInventories,
    skippedPlayers,
    winner,
    extraPiecesMode,
    extraPieceForRound,
  ]);



  // Turn Change Transition Pill Animation
  useEffect(() => {
    if (!isGameStarted || winner !== null) {
      lastPlayerIdxRef.current = null;
      setTurnPillStage('normal');
      setTurnPillPlayer(null);
      return () => { };
    }

    const curIdx = currentPlayer;

    // Initial load: don't animate but initialize player details
    if (lastPlayerIdxRef.current === null) {
      lastPlayerIdxRef.current = curIdx;
      setTurnPillPlayer(curIdx);
      return () => { };
    }

    // Player changed!
    if (lastPlayerIdxRef.current !== curIdx) {
      const prevPlayer = lastPlayerIdxRef.current;
      lastPlayerIdxRef.current = curIdx;

      // Start transition
      setTurnPillPlayer(prevPlayer);
      setTurnPillStage('centering');

      const t1 = window.setTimeout(() => {
        setTurnPillPlayer(curIdx);
        setTurnPillStage('centered');
      }, 500);

      const t2 = window.setTimeout(() => {
        setTurnPillStage('shrinking');
      }, 1500);

      const t3 = window.setTimeout(() => {
        setTurnPillStage('normal');
        setTurnPillPlayer(null);
      }, 2000);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
    return () => { };
  }, [currentPlayer, isGameStarted, winner]);

  // Compute bounding box and centroid data for centering the floating piece on cursor
  const heldPieceShapeId = heldPieceIdx !== null ? playerInventories[currentPlayer]?.[heldPieceIdx] : null;
  const heldPieceShape = heldPieceShapeId ? allShapes.find((s) => s.id === heldPieceShapeId) : null;

  const floatingPieceData = useMemo(() => {
    if (!heldPieceShape) return null;
    const cells = heldPieceShape.cells;
    const centroids = cells.map((c) => getCellCentroid(c.q, c.r, c.up, L));
    const avgX = centroids.reduce((sum, p) => sum + p.x, 0) / centroids.length;
    const avgY = centroids.reduce((sum, p) => sum + p.y, 0) / centroids.length;

    // Bounding box of centered points
    const pointsList = cells.map((c) => getCellPoints(c.q, c.r, c.up, L));
    const flatPoints = pointsList.flat();
    const minX = Math.min(...flatPoints.map((p) => p.x - avgX)) - 4;
    const maxX = Math.max(...flatPoints.map((p) => p.x - avgX)) + 4;
    const minY = Math.min(...flatPoints.map((p) => p.y - avgY)) - 4;
    const maxY = Math.max(...flatPoints.map((p) => p.y - avgY)) + 4;
    const w = maxX - minX;
    const h = maxY - minY;

    return {
      cells,
      avgX,
      avgY,
      minX,
      minY,
      w,
      h,
    };
  }, [heldPieceShape, L]);

  // Toast notifications
  const showAnnouncement = (msg: string) => {
    if (announcementTimeoutRef.current) {
      clearTimeout(announcementTimeoutRef.current);
    }
    setAnnouncement(msg);
    announcementTimeoutRef.current = setTimeout(() => {
      setAnnouncement(null);
    }, 4000);
  };

  // Symmetrical Starting Corner calculations
  const getStartingCorners = useCallback((): CellKey[] => {
    // We map vertices of the hexagon to outer coordinates
    // Corners can be approximated by finding the cells that have the largest Cartesian distance from center along the 6 cardinal directions
    const corners: CellKey[] = [];
    const angles = [0, 60, 120, 180, 240, 300];

    angles.forEach((deg) => {
      const rad = (deg * Math.PI) / 180;
      // Search board cells for one closest to (S*1.2*cos, S*1.2*sin)
      const targetX = boardSize * 30 * Math.cos(rad);
      const targetY = boardSize * 30 * Math.sin(rad);

      let bestCell: CellKey | null = null;
      let minDist = Infinity;

      boardCells.forEach((c) => {
        const centroid = getCellCentroid(c.q, c.r, c.up, 20);
        const dist = Math.pow(centroid.x - targetX, 2) + Math.pow(centroid.y - targetY, 2);
        if (dist < minDist) {
          minDist = dist;
          bestCell = c;
        }
      });

      if (bestCell) corners.push(bestCell);
    });

    return corners;
  }, [boardSize, boardCells]);

  const startingCorners = getStartingCorners();

  // Active starting corners based on current setup player indices
  const getPlayerStartCell = (pIdx: number): CellKey => {
    const corners = startingCorners;
    if (playerCount === 2) {
      return pIdx === 0 ? corners[0] : corners[3];
    } else if (playerCount === 3) {
      return pIdx === 0 ? corners[0] : pIdx === 1 ? corners[2] : corners[4];
    } else if (playerCount === 4) {
      return corners[pIdx === 3 ? 4 : pIdx];
    } else {
      return corners[pIdx % corners.length];
    }
  };

  // Get the starting point (outermost vertex/corner of the player's start corner cell)
  const getPlayerStartPoint = useCallback((pIdx: number): Point2D => {
    const startCell = getPlayerStartCell(pIdx);
    const pts = getCellPoints(startCell.q, startCell.r, startCell.up, L);
    let bestPt = pts[0];
    let maxDist = 0;
    pts.forEach((pt) => {
      const distSq = pt.x * pt.x + pt.y * pt.y;
      if (distSq > maxDist) {
        maxDist = distSq;
        bestPt = pt;
      }
    });
    return bestPt;
  }, [getPlayerStartCell, L]);

  // Helper to precalculate a full edge & corner adjacency list for board cells
  const adjacencyRef = useRef<{
    edgeAdjacency: Record<string, string[]>;
    cornerAdjacency: Record<string, string[]>;
  } | null>(null);

  const getAdjacencies = useCallback(() => {
    if (adjacencyRef.current) return adjacencyRef.current;

    const edgeAdjacency: Record<string, string[]> = {};
    const cornerAdjacency: Record<string, string[]> = {};

    const cellVerts: Record<string, string[]> = {};
    boardCells.forEach((c) => {
      const key = `${c.q},${c.r},${c.up}`;
      cellVerts[key] = getTriangleVertices(c.q, c.r, c.up);
    });

    boardCells.forEach((c1) => {
      const k1 = `${c1.q},${c1.r},${c1.up}`;
      edgeAdjacency[k1] = [];
      cornerAdjacency[k1] = [];

      const v1 = cellVerts[k1];

      boardCells.forEach((c2) => {
        const k2 = `${c2.q},${c2.r},${c2.up}`;
        if (k1 === k2) return;

        const v2 = cellVerts[k2];
        const shared = v1.filter((v) => v2.includes(v)).length;

        if (shared === 2) {
          edgeAdjacency[k1].push(k2);
        } else if (shared === 1) {
          cornerAdjacency[k1].push(k2);
        }
      });
    });

    const result = { edgeAdjacency, cornerAdjacency };
    adjacencyRef.current = result;
    return result;
  }, [boardCells]);

  // Reset precomputed adjacency when board size changes
  useEffect(() => {
    adjacencyRef.current = null;
  }, [boardSize]);



  // Translate relative coordinates of a held piece to a target hover cell
  const getHeldPiecePlacementCells = (
    shape: CellKey[],
    hq: number,
    hr: number,
    hup: number,
    rot: number,
    flip: boolean
  ): CellKey[] => {
    // 1. Transform shape cells (rotations & flips) relative to the piece's anchor (first cell)
    const transformed = shape.map((c) => {
      let curr = { ...c };
      if (flip) {
        curr = flipCellHorizontal(curr.q, curr.r, curr.up);
      }
      for (let i = 0; i < rot; i++) {
        curr = rotateCell60(curr.q, curr.r, curr.up);
      }
      return curr;
    });

    // Sort to determine new anchor
    transformed.sort((a, b) => a.q - b.q || a.r - b.r || a.up - b.up);
    const tAnchor = transformed[0];

    // 2. Translate relative to target hover cell (preserving parity exactly!)
    const dq = hq - tAnchor.q;
    const dr = hr - tAnchor.r;

    if (hup !== tAnchor.up) {
      return []; // invalid match
    }

    return transformed.map((c) => {
      return {
        q: c.q + dq,
        r: c.r + dr,
        up: c.up,
      };
    });
  };

  // Validate if a list of board cells satisfies placement rules
  const validatePlacement = (
    cells: CellKey[],
    pIdx: number,
    currentBoard: Record<string, number>,
    isFirstMove?: boolean
  ): { valid: boolean; reason?: string } => {
    if (cells.length === 0) {
      return { valid: false, reason: 'Invalid rotation/reflection matching.' };
    }

    // Verify all cells lie on the board and are unoccupied
    const cellKeysArray = cells.map((c) => `${c.q},${c.r},${c.up}`);
    const onBoard = cellKeysArray.every((k) => cellKeysSet.has(k));
    if (!onBoard) {
      return { valid: false, reason: 'Piece extends outside the board bounds.' };
    }

    const unoccupied = cellKeysArray.every((k) => currentBoard[k] === undefined);
    if (!unoccupied) {
      return { valid: false, reason: 'Target cells are already occupied.' };
    }

    // Check if this is the player's first move
    const firstMove = isFirstMove !== undefined
      ? isFirstMove
      : !Object.values(currentBoard).some((owner) => owner === pIdx);

    if (firstMove) {
      // Must touch the starting point (outermost vertex of starting corner cell)
      const startPoint = getPlayerStartPoint(pIdx);
      let touchesStart = false;

      for (const c of cells) {
        const pts = getCellPoints(c.q, c.r, c.up, L);
        for (const pt of pts) {
          const distSq = Math.pow(pt.x - startPoint.x, 2) + Math.pow(pt.y - startPoint.y, 2);
          if (distSq < 1.0) {
            touchesStart = true;
            break;
          }
        }
        if (touchesStart) break;
      }

      if (!touchesStart) {
        return { valid: false, reason: 'First piece must touch your starting corner point.' };
      }
      return { valid: true };
    }

    // Must share a corner (vertex) with own pieces
    const adj = getAdjacencies();
    let hasCornerShare = false;

    for (const key of cellKeysArray) {
      // Check edge block (no edge sharing with own pieces)
      const edgeNeighbors = adj.edgeAdjacency[key] || [];
      const sharesEdgeWithSelf = edgeNeighbors.some((ek) => currentBoard[ek] === pIdx);
      if (sharesEdgeWithSelf) {
        return { valid: false, reason: 'Piece cannot share an edge with your existing pieces.' };
      }

      // Check corner connection
      if (!hasCornerShare) {
        const cornerNeighbors = adj.cornerAdjacency[key] || [];
        if (cornerNeighbors.some((ck) => currentBoard[ck] === pIdx)) {
          hasCornerShare = true;
        }
      }
    }

    if (!hasCornerShare) {
      return { valid: false, reason: 'Piece must touch at least one corner of your existing pieces.' };
    }

    return { valid: true };
  };

  // Check if a vertex key (e.g. "q,r") is playable (there exists at least one legal placement touching it)
  const isVertexKeyPlayable = useCallback((vKey: string): boolean => {
    const sharingCells = vertexToCellsMap[vKey] || [];
    if (sharingCells.length === 0) return false;

    // Only test the currently held shape!
    const heldShapeId = heldPieceIdx !== null ? playerInventories[currentPlayer]?.[heldPieceIdx] : null;
    if (!heldShapeId) return false;

    const shapeObj = allShapes.find((s) => s.id === heldShapeId);
    if (!shapeObj) return false;

    for (let rot = 0; rot < 6; rot++) {
      for (const flip of [false, true]) {
        // Transform shape cells
        const transformed = shapeObj.cells.map((c) => {
          let curr = { ...c };
          if (flip) {
            curr = flipCellHorizontal(curr.q, curr.r, curr.up);
          }
          for (let i = 0; i < rot; i++) {
            curr = rotateCell60(curr.q, curr.r, curr.up);
          }
          return curr;
        });

        transformed.sort((a, b) => a.q - b.q || a.r - b.r || a.up - b.up);
        const tAnchor = transformed[0];

        // For each cell in the transformed shape, align it with each sharing cell
        for (const tc of transformed) {
          for (const sc of sharingCells) {
            if (tc.up !== sc.up) continue;

            const dq = tc.q - tAnchor.q;
            const dr = tc.r - tAnchor.r;

            const hq = sc.q - dq;
            const hr = sc.r - dr;
            const hup = tAnchor.up;

            const placement = getHeldPiecePlacementCells(shapeObj.cells, hq, hr, hup, rot, flip);
            if (validatePlacement(placement, currentPlayer, boardOwners).valid) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }, [vertexToCellsMap, playerInventories, currentPlayer, allShapes, heldPieceIdx, getHeldPiecePlacementCells, validatePlacement, boardOwners]);

  // Memoize the eligible vertices list so it is only computed when the game state changes, NOT on every cursor move/render!
  const eligibleVertices = useMemo((): Point2D[] => {
    if (heldPieceIdx === null) return [];

    const ownedCells = boardCells.filter((c) => {
      const key = `${c.q},${c.r},${c.up}`;
      return boardOwners[key] === currentPlayer;
    });

    if (ownedCells.length === 0) {
      // First turn: highlight ONLY the player's starting point
      return [getPlayerStartPoint(currentPlayer)];
    }

    const seenVertKeys = new Set<string>();
    ownedCells.forEach((c) => {
      getTriangleVertices(c.q, c.r, c.up).forEach((vk) => {
        seenVertKeys.add(vk);
      });
    });

    const playableVertKeys = Array.from(seenVertKeys).filter(isVertexKeyPlayable);
    return playableVertKeys.map(getVertexCartesian);
  }, [currentPlayer, boardOwners, boardCells, isVertexKeyPlayable, getPlayerStartPoint, heldPieceIdx, getVertexCartesian]);

  // Find if a player has any legal moves remaining on the board with their inventory
  const hasAnyLegalMoves = (
    pIdx: number,
    currentBoard: Record<string, number>,
    customInv?: string[]
  ): boolean => {
    const inv = customInv !== undefined ? customInv : (playerInventories[pIdx] || []);
    if (inv.length === 0) return false;

    const isFirstMove = !Object.values(currentBoard).some((owner) => owner === pIdx);
    const adj = getAdjacencies();

    let touchTargets: CellKey[] = [];

    if (isFirstMove) {
      // First move: must touch the player's start point
      const startCell = getPlayerStartCell(pIdx);
      const startVerts = getTriangleVertices(startCell.q, startCell.r, startCell.up);
      const startPoint = getPlayerStartPoint(pIdx);
      const startVKey = startVerts.find((vk) => {
        const pt = getVertexCartesian(vk);
        const distSq = Math.pow(pt.x - startPoint.x, 2) + Math.pow(pt.y - startPoint.y, 2);
        return distSq < 1.0;
      });

      if (startVKey) {
        const sharing = vertexToCellsMap[startVKey] || [];
        touchTargets = sharing.filter(
          (c) => currentBoard[`${c.q},${c.r},${c.up}`] === undefined
        );
      }
    } else {
      // Subsequent moves: must share a corner with player's own pieces
      const ownedCells = boardCells.filter((c) => {
        const key = `${c.q},${c.r},${c.up}`;
        return currentBoard[key] === pIdx;
      });

      const cornerSet = new Set<string>();
      ownedCells.forEach((c) => {
        const key = `${c.q},${c.r},${c.up}`;
        const corners = adj.cornerAdjacency[key] || [];
        corners.forEach((ck) => {
          if (currentBoard[ck] === undefined) {
            cornerSet.add(ck);
          }
        });
      });

      touchTargets = Array.from(cornerSet).map((k) => {
        const [q, r, up] = k.split(',').map(Number);
        return { q, r, up };
      });
    }

    if (touchTargets.length === 0) return false;

    // Iterate through all remaining pieces, all rotations, flips, and align them with touchTargets
    for (const shapeId of inv) {
      const shapeObj = allShapes.find((s) => s.id === shapeId);
      if (!shapeObj) continue;

      for (let rot = 0; rot < 6; rot++) {
        for (const flip of [false, true]) {
          // Transform shape cells
          const transformed = shapeObj.cells.map((c) => {
            let curr = { ...c };
            if (flip) {
              curr = flipCellHorizontal(curr.q, curr.r, curr.up);
            }
            for (let i = 0; i < rot; i++) {
              curr = rotateCell60(curr.q, curr.r, curr.up);
            }
            return curr;
          });

          transformed.sort((a, b) => a.q - b.q || a.r - b.r || a.up - b.up);
          const tAnchor = transformed[0];

          // For each cell in the transformed shape, align it with each touch target cell
          for (const tc of transformed) {
            for (const targetCell of touchTargets) {
              if (tc.up !== targetCell.up) continue;

              const dq = targetCell.q - tc.q;
              const dr = targetCell.r - tc.r;

              const hq = tAnchor.q + dq;
              const hr = tAnchor.r + dr;
              const hup = tAnchor.up;

              const placement = getHeldPiecePlacementCells(shapeObj.cells, hq, hr, hup, rot, flip);
              if (validatePlacement(placement, pIdx, currentBoard, isFirstMove).valid) {
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  };

  // Config change handlers
  const handlePlayerCountChange = (newCount: number) => {
    setPlayerCount(newCount);
    const initialInventories: Record<number, string[]> = {};
    const shapesList = allShapes.map((s) => s.id);
    for (let p = 0; p < newCount; p++) {
      initialInventories[p] = [...shapesList];
    }
    setPlayerInventories(initialInventories);
    setSkippedPlayers([]);
    setCurrentPlayer(0);
    setHeldPieceIdx(null);
    setExtraPiecesMode(false);
    setExtraPieceForRound(null);
  };

  const handleBoardSizeChange = (newSize: number) => {
    setBoardSize(newSize);
    setHeldPieceIdx(null);
  };

  // Full reset (restarts match with current size and playerCount)
  const resetGame = () => {
    const initialInventories: Record<number, string[]> = {};
    const shapesList = allShapes.map((s) => s.id);
    for (let p = 0; p < playerCount; p++) {
      initialInventories[p] = [...shapesList];
    }

    setPlayerInventories(initialInventories);
    setBoardOwners({});
    setSkippedPlayers([]);
    setWinner(null);
    setCurrentPlayer(0);
    setHeldPieceIdx(null);
    setExtraPiecesMode(false);
    setExtraPieceForRound(null);

    // Reset turn pill states
    lastPlayerIdxRef.current = 0;
    setTurnPillPlayer(0);
    setTurnPillStage('normal');

    showAnnouncement('Trigon game reset! Symmetrical corners highlighted.');
  };

  // Place the currently held piece on the board
  const placeHeldPiece = (hq: number, hr: number, hup: number) => {
    if (heldPieceIdx === null || winner) return;

    const shapeObj = allShapes.find((s) => s.id === playerInventories[currentPlayer][heldPieceIdx]);
    if (!shapeObj) return;

    const placement = getHeldPiecePlacementCells(shapeObj.cells, hq, hr, hup, heldRotation, heldFlipped);

    const validation = validatePlacement(placement, currentPlayer, boardOwners);

    if (!validation.valid) {
      showAnnouncement(validation.reason || 'Invalid placement!');
      return;
    }

    // Place piece
    const nextOwners = { ...boardOwners };
    placement.forEach((c) => {
      nextOwners[`${c.q},${c.r},${c.up}`] = currentPlayer;
    });

    const updatedInventory = playerInventories[currentPlayer].filter(
      (_, idx) => idx !== heldPieceIdx
    );

    const nextInventories = {
      ...playerInventories,
      [currentPlayer]: updatedInventory,
    };

    setBoardOwners(nextOwners);
    setPlayerInventories(nextInventories);
    setHeldPieceIdx(null);

    // Turn transition checks
    let nextPlayer = currentPlayer;
    let nextSkipped = [...skippedPlayers];

    let isExtraMode = extraPiecesMode;
    let nextPieceForRound = extraPieceForRound;
    let justActivated = false;

    // Check if we need to transition into Extra Pieces Mode
    if (!isExtraMode) {
      const allEmpty = Object.values(nextInventories).every((inv) => inv.length === 0);
      if (allEmpty) {
        isExtraMode = true;
        justActivated = true;
        setExtraPiecesMode(true);
        nextSkipped = [];
        setSkippedPlayers([]);

        // Generate the first piece for the round
        const firstShapeId = allShapes[Math.floor(Math.random() * allShapes.length)].id;
        nextPieceForRound = firstShapeId;
        setExtraPieceForRound(firstShapeId);
        showAnnouncement(`All players placed all pieces! Extra Pieces Mode! Round Piece: ${getShapeName(firstShapeId)}`);
      }
    }

    if (isExtraMode) {
      let steps = 0;
      let foundPlayer = false;
      let tempPieceForRound = nextPieceForRound;
      let lastCheckedPlayer = currentPlayer;
      let isFirstStep = true;

      while (steps < playerCount) {
        nextPlayer = (nextPlayer + 1) % playerCount;
        steps++;

        if (nextSkipped.includes(nextPlayer)) {
          lastCheckedPlayer = nextPlayer;
          isFirstStep = false;
          continue;
        }

        // Check for wrap-around to start a new round
        // A new round starts if we wrap around, EXCEPT if we just activated the mode on this turn
        if (!justActivated && (nextPlayer <= lastCheckedPlayer || (isFirstStep && nextPlayer <= currentPlayer))) {
          // New round! Generate a new random piece
          tempPieceForRound = allShapes[Math.floor(Math.random() * allShapes.length)].id;
          showAnnouncement(`New Round! Round Piece: ${getShapeName(tempPieceForRound)}`);
        }

        // Once we perform any check or skip, we are no longer just activated or at the very first step
        justActivated = false;
        isFirstStep = false;

        // Test if nextPlayer can play tempPieceForRound
        if (!hasAnyLegalMoves(nextPlayer, nextOwners, [tempPieceForRound!])) {
          // Player cannot play the round piece -> skipped!
          nextSkipped.push(nextPlayer);
          showAnnouncement(`Player ${nextPlayer + 1} cannot play the piece and is skipped!`);
          lastCheckedPlayer = nextPlayer;
        } else {
          // Player can play! They become the next player.
          foundPlayer = true;
          nextPieceForRound = tempPieceForRound;
          break;
        }
      }

      if (foundPlayer) {
        const finalInventories: Record<number, string[]> = {};
        for (let p = 0; p < playerCount; p++) {
          finalInventories[p] = p === nextPlayer ? [nextPieceForRound!] : [];
        }
        setPlayerInventories(finalInventories);
        // Do not permanently save skipped players since they can play in future rounds with different pieces
        setExtraPieceForRound(nextPieceForRound);
        setCurrentPlayer(nextPlayer);
        return;
      } else {
        // Game Over! All players eliminated
        const finalInventories: Record<number, string[]> = {};
        for (let p = 0; p < playerCount; p++) {
          finalInventories[p] = [];
        }
        setPlayerInventories(finalInventories);
        setSkippedPlayers(nextSkipped);
        setExtraPieceForRound(null);

        // Game Over: calculate scores (count of total cells placed)
        const scores = Array.from({ length: playerCount }, (_, pIdx) => {
          const count = Object.values(nextOwners).filter((owner) => owner === pIdx).length;
          return { pIdx, count };
        });

        const maxScore = Math.max(...scores.map((s) => s.count));
        const winnersList = scores.filter((s) => s.count === maxScore).map((s) => s.pIdx);

        setWinner(winnersList);
        triggerConfetti();
        showAnnouncement(
          winnersList.length === 1
            ? `Game Over! Player ${winnersList[0] + 1} wins with ${maxScore} cells!`
            : `Game Over! Tie between players: ${winnersList.map((w) => w + 1).join(', ')}!`
        );
        return;
      }
    } else {
      // Normal turn transition checks
      // Check if the current player finished their pieces
      if (updatedInventory.length === 0) {
        if (!nextSkipped.includes(currentPlayer)) {
          nextSkipped.push(currentPlayer);
          setSkippedPlayers(nextSkipped);
        }
      }

      // Find next active player who has legal moves
      let steps = 0;
      while (steps < playerCount) {
        nextPlayer = (nextPlayer + 1) % playerCount;
        steps++;

        if (nextSkipped.includes(nextPlayer)) continue;

        // Check if next player is completely blocked
        if (!hasAnyLegalMoves(nextPlayer, nextOwners, nextInventories[nextPlayer])) {
          nextSkipped.push(nextPlayer);
          showAnnouncement(`Player ${nextPlayer + 1} has no moves and is skipped!`);
        } else {
          // Valid player found
          setCurrentPlayer(nextPlayer);
          return;
        }
      }

      // If game cycles back and nobody can move, calculate the winner
      if (nextSkipped.length >= playerCount) {
        // Game Over: calculate scores (count of total cells placed)
        const scores = Array.from({ length: playerCount }, (_, pIdx) => {
          const count = Object.values(nextOwners).filter((owner) => owner === pIdx).length;
          return { pIdx, count };
        });

        const maxScore = Math.max(...scores.map((s) => s.count));
        const winnersList = scores.filter((s) => s.count === maxScore).map((s) => s.pIdx);

        setWinner(winnersList);
        triggerConfetti();
        showAnnouncement(
          winnersList.length === 1
            ? `Game Over! Player ${winnersList[0] + 1} wins with ${maxScore} cells!`
            : `Game Over! Tie between players: ${winnersList.map((w) => w + 1).join(', ')}!`
        );
      }
    }
  };



  // Discrete Mouse Wheel rotation and Right-Click horizontal flipping
  useEffect(() => {
    if (heldPieceIdx === null) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Scroll up -> CCW, Scroll down -> CW
      const dir = e.deltaY > 0 ? 1 : 5;
      setHeldRotation((prev) => (prev + dir) % 6);
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setHeldFlipped((prev) => !prev);
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [heldPieceIdx]);

  // Score metrics (memoized)
  const scores = useMemo(() => {
    const counts = Array(playerCount).fill(0);
    Object.values(boardOwners).forEach((owner) => {
      if (owner >= 0 && owner < playerCount) {
        counts[owner]++;
      }
    });
    return counts;
  }, [boardOwners, playerCount]);

  const totalOccupied = useMemo(() => scores.reduce((a, b) => a + b, 0), [scores]);

  // Render SVG polygon coordinates for a cell
  const getPolygonPointsStr = (c: CellKey, L: number): string => {
    const pts = getCellPoints(c.q, c.r, c.up, L);
    return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  };

  // Layout geometry dimensions
  const viewH = boardSize * L * Math.sqrt(3) * 1.05;
  const viewW = boardSize * L * 2.3;
  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col min-h-0 select-none relative overflow-hidden"
      style={{ backgroundColor: theme.bg }}
    >
      <style>{`
        .trigon-hint-glow {
          fill-opacity: 0.9;
          stroke-opacity: 0.95;
          stroke-width: 1.5px;
        }
      `}</style>

      {/* Toast Announcement Overlay */}
      {announcement && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 border rounded-xl px-5 py-2.5 z-40 shadow-2xl flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-top-4 duration-300"
          style={{
            backgroundColor: `${theme.header}e6`,
            borderColor: `${theme.accent}66`,
          }}
        >
          <Info className="h-4.5 w-4.5 animate-pulse shrink-0" style={{ color: theme.accent }} />
          <span className="text-xs font-bold tracking-wide uppercase" style={{ color: theme.text }}>
            {announcement}
          </span>
        </div>
      )}

      {/* Top Header decoration */}
      <div
        className="absolute top-0 left-0 w-full h-[3px] z-30"
        style={{
          background: `linear-gradient(to right, ${theme.primary}, ${theme.accent}, ${playerColors[currentPlayer] || theme.primary})`
        }}
      />

      {/* Internal Game Header */}
      <div
        className="border-b px-6 py-4 flex items-center justify-between shrink-0 z-20"
        style={{
          backgroundColor: theme.header,
          borderBottomColor: theme.border,
        }}
      >
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-black tracking-wide uppercase flex items-center gap-2" style={{ color: theme.text }}>
            <Sparkles className="h-5 w-5 animate-pulse" style={{ color: theme.accent }} />
            <span>Trigon</span>
          </h2>
          {isGameStarted && (
            <div
              className="flex border rounded-lg p-0.5 shadow-inner gap-1"
              style={{
                backgroundColor: theme.input,
                borderColor: `${theme.border}99`,
              }}
            >
              <span className="px-2.5 py-1 text-[10px] font-extrabold uppercase" style={{ color: theme.muted }}>
                Side: {boardSize}
              </span>
              <span
                className="px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-md"
                style={{
                  backgroundColor: `${theme.primary}1a`,
                  color: theme.primary,
                }}
              >
                {playerCount} Players
              </span>
              {extraPiecesMode && (
                <span
                  className="px-2.5 py-1 text-[10px] font-black uppercase rounded-md animate-pulse border"
                  style={{
                    backgroundColor: `${theme.accent}1a`,
                    borderColor: `${theme.accent}55`,
                    color: theme.accent,
                  }}
                >
                  Extra Pieces
                </span>
              )}
            </div>
          )}
        </div>

        <button
          onClick={resetGame}
          className="px-4 py-1.5 hover:opacity-85 text-[10px] font-extrabold uppercase rounded-lg border transition-all flex items-center gap-1.5"
          style={{
            backgroundColor: theme.input,
            borderColor: theme.border,
            color: theme.muted,
          }}
          title="Reset Game"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Score Progress Bar */}
      <div
        className="w-full h-1.5 flex overflow-hidden shrink-0 z-20"
        style={{
          backgroundColor: theme.input,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        {playerColors.map((color, idx) => {
          const score = scores[idx] || 0;
          const pct = (score / boardCells.length) * 100;
          return (
            <div
              key={idx}
              className="h-full transition-all duration-500 ease-out"
              style={{
                width: `${pct}%`,
                backgroundColor: color,
                boxShadow: `inset 0 1px 2px rgba(255,255,255,0.1), 0 0 4px ${color}60`,
              }}
            />
          );
        })}
        {/* Empty cells segment */}
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${((boardCells.length - totalOccupied) / boardCells.length) * 100}%`,
            backgroundColor: `${theme.input}66`,
          }}
        />
      </div>

      {/* Active Game Arena */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Main Area: Board Rendering */}
        <div className="flex-1 flex flex-col p-6 min-h-0 overflow-hidden select-none relative">
          {/* Player Count Slider - Hidden once the first move is made */}
          {!firstMoveMade && (
            <div className="w-full max-w-md mx-auto mb-4 p-4 border rounded-2xl shadow-xs shrink-0 transition-all duration-300"
              style={{ backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}>
              <Slider
                label="Number of Players"
                value={playerCount}
                min={2}
                max={6}
                display={`${playerCount} Players`}
                accent={theme.primary}
                muted={theme.muted}
                onChange={(v) => handlePlayerCountChange(v)}
              />
            </div>
          )}
          {/* Interactive Hexagonal SVG Grid container */}
          <div className="flex-1 flex items-center justify-center relative min-h-0">
            <svg
              viewBox={`-${viewW / 2} -${viewH / 2} ${viewW} ${viewH}`}
              className="w-full h-full max-h-[620px] select-none outline-none"
              onMouseMove={(e) => {
                if (heldPieceIdx === null) return;
                const svg = e.currentTarget;
                const point = svg.createSVGPoint();
                point.x = e.clientX;
                point.y = e.clientY;
                const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());
                if (svgPoint) {
                  setSvgMousePos({ x: svgPoint.x, y: svgPoint.y });
                }
              }}
              onClick={(e) => {
                if (heldPieceIdx === null) return;
                const svg = e.currentTarget;
                const point = svg.createSVGPoint();
                point.x = e.clientX;
                point.y = e.clientY;
                const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());
                if (!svgPoint) return;

                const mouseX = svgPoint.x;
                const mouseY = svgPoint.y;

                // 1. Calculate offset of the held piece's centroid from its anchor cell centroid
                let dx = 0;
                let dy = 0;
                let anchorUp = 1;
                const shapeObj = allShapes.find((s) => s.id === playerInventories[currentPlayer][heldPieceIdx]);
                if (shapeObj) {
                  const transformed = shapeObj.cells.map((c) => {
                    let curr = { ...c };
                    if (heldFlipped) {
                      curr = flipCellHorizontal(curr.q, curr.r, curr.up);
                    }
                    for (let i = 0; i < heldRotation; i++) {
                      curr = rotateCell60(curr.q, curr.r, curr.up);
                    }
                    return curr;
                  });
                  transformed.sort((a, b) => a.q - b.q || a.r - b.r || a.up - b.up);
                  const tAnchor = transformed[0];
                  anchorUp = tAnchor.up;

                  const cCentroids = transformed.map((c) => getCellCentroid(c.q, c.r, c.up, L));
                  const avgX = cCentroids.reduce((sum, p) => sum + p.x, 0) / cCentroids.length;
                  const avgY = cCentroids.reduce((sum, p) => sum + p.y, 0) / cCentroids.length;

                  const anchorCentroid = getCellCentroid(tAnchor.q, tAnchor.r, tAnchor.up, L);
                  dx = anchorCentroid.x - avgX;
                  dy = anchorCentroid.y - avgY;
                }

                const targetAnchorX = mouseX + dx;
                const targetAnchorY = mouseY + dy;

                // 2. Find closest cell under adjusted coordinates of the SAME parity as the piece anchor
                let bestCell: CellKey | null = null;
                let minDist = Infinity;

                for (const c of boardCells) {
                  if (c.up !== anchorUp) continue;

                  const centroid = getCellCentroid(c.q, c.r, c.up, L);
                  const dist = Math.sqrt(
                    Math.pow(centroid.x - targetAnchorX, 2) + Math.pow(centroid.y - targetAnchorY, 2)
                  );
                  if (dist < minDist) {
                    minDist = dist;
                    bestCell = c;
                  }
                }

                if (bestCell) {
                  placeHeldPiece(bestCell.q, bestCell.r, bestCell.up);
                }
              }}
            >
              {/* Board Cell Polygons */}
              {boardCells.map((c) => {
                const key = `${c.q},${c.r},${c.up}`;
                const owner = boardOwners[key];
                const pointsStr = getPolygonPointsStr(c, L);

                let fillColor = 'var(--color-header)';
                let strokeColor = 'var(--color-border)';
                let strokeWidth = '1.8';

                if (owner !== undefined) {
                  fillColor = playerColors[owner];
                  strokeColor = 'var(--color-border)';
                }

                return (
                  <polygon
                    key={key}
                    points={pointsStr}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    className="transition-all duration-300"
                  />
                );
              })}

              {/* Available Corner Points Hints */}
              {heldPieceIdx !== null && eligibleVertices.map((pt, idx) => {
                const key = `hint-vertex-${idx}`;
                return (
                  <g key={key} style={{ pointerEvents: 'none' }}>
                    {/* Outer Glow Halo Ring */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="8.5"
                      fill={playerColors[currentPlayer]}
                      fillOpacity="0.25"
                    />
                    {/* Inner Solid Core */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="3.5"
                      fill={playerColors[currentPlayer]}
                      stroke="#ffffff"
                      strokeWidth="1.2"
                    />
                  </g>
                );
              })}

              {/* Floating Piece Preview */}
              {heldPieceIdx !== null && floatingPieceData && (
                <g
                  transform={`translate(${svgMousePos.x}, ${svgMousePos.y}) rotate(${heldRotation * 60}) scale(${heldFlipped ? -1 : 1}, 1)`}
                  style={{ pointerEvents: 'none' }}
                >
                  {floatingPieceData.cells.map((c, cellIdx) => {
                    const pointsStr = getCellPoints(c.q, c.r, c.up, L)
                      .map((p) => `${(p.x - floatingPieceData.avgX).toFixed(2)},${(p.y - floatingPieceData.avgY).toFixed(2)}`)
                      .join(' ');
                    return (
                      <polygon
                        key={cellIdx}
                        points={pointsStr}
                        fill={playerColors[currentPlayer]}
                        stroke="rgba(255,255,255,0.6)"
                        strokeWidth="1.5"
                      />
                    );
                  })}
                </g>
              )}
            </svg>
          </div>

          {/* Board Size Slider - Hidden once the first move is made */}
          {!firstMoveMade && (
            <div className="w-full max-w-md mx-auto mt-4 p-4 border rounded-2xl shadow-xs shrink-0 transition-all duration-300"
              style={{ backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}>
              <Slider
                label="Board Side Length"
                value={boardSize}
                min={6}
                max={12}
                display={`Side ${boardSize}`}
                accent={theme.primary}
                muted={theme.muted}
                onChange={(v) => handleBoardSizeChange(v)}
              />
            </div>
          )}

          {/* Left Helper Pill: Rotate */}
          {heldPieceIdx !== null && (
            <div
              className="absolute left-6 bottom-6 border px-4 py-2 rounded-full backdrop-blur-md shadow-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 z-30 animate-in slide-in-from-bottom-2 duration-300"
              style={{
                backgroundColor: theme.card,
                borderColor: theme.border,
                color: theme.text,
              }}
            >
              <Info className="h-3.5 w-3.5" style={{ color: theme.accent }} />
              <span>Scroll to Rotate</span>
            </div>
          )}

          {/* Right Helper Pill: Flip */}
          {heldPieceIdx !== null && (
            <div
              className="absolute right-6 bottom-6 border px-4 py-2 rounded-full backdrop-blur-md shadow-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 z-30 animate-in slide-in-from-bottom-2 duration-300"
              style={{
                backgroundColor: theme.card,
                borderColor: theme.border,
                color: theme.text,
              }}
            >
              <Info className="h-3.5 w-3.5" style={{ color: theme.accent }} />
              <span>Right-Click to Flip</span>
            </div>
          )}

          {/* Turn transition screen freeze backdrop */}
          {turnPillStage !== 'normal' && (
            <div className="absolute inset-0 bg-black/15 backdrop-blur-[2px] z-[175] pointer-events-auto" />
          )}

          {/* Center Bottom Turn Indicator Pill */}
          {(() => {
            const displayPlayerIdx = turnPillPlayer !== null ? turnPillPlayer : currentPlayer;
            const isCentered = turnPillStage !== 'normal';
            const displayColor = playerColors[displayPlayerIdx];

            return (
              <div
                id="trigon-turn-indicator"
                className="absolute transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-center gap-2 px-4 py-1.5 border-2 rounded-full shadow-lg pointer-events-none select-none"
                style={{
                  bottom: isCentered ? '50%' : '24px',
                  left: '50%',
                  transform: isCentered ? 'translate(-50%, 50%) scale(1.5)' : 'translateX(-50%) scale(1)',
                  borderColor: displayColor,
                  backgroundColor: theme.card,
                  boxShadow: isCentered
                    ? `0 12px 48px rgba(0, 0, 0, 0.6), 0 0 24px ${displayColor}50`
                    : `0 8px 32px rgba(0, 0, 0, 0.4), 0 0 16px ${displayColor}25`,
                  zIndex: isCentered ? 180 : 40,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div
                  className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${displayColor}22`,
                    borderColor: displayColor,
                  }}
                />
                <span
                  className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: displayColor }}
                >
                  Player {displayPlayerIdx + 1}'s Turn
                </span>
              </div>
            );
          })()}
        </div>

        {/* Right Sidebar: Active Player inventories */}
        <div
          className="w-[140px] border-l backdrop-blur-md flex flex-col shrink-0 min-h-0"
          style={{
            backgroundColor: `${theme.header}b3`,
            borderLeftColor: theme.border,
          }}
        >
          {/* Simple thin sidebar header */}
          <div
            className="py-3 px-2 border-b shrink-0 text-center flex flex-col gap-0.5"
            style={{
              backgroundColor: `${theme.header}80`,
              borderBottomColor: theme.border,
            }}
          >
            <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: theme.text }}>
              Player {currentPlayer + 1}
            </span>
            {extraPiecesMode ? (
              <span className="text-[8px] font-black text-rose-400 uppercase tracking-wider animate-pulse">
                Place or Skipped!
              </span>
            ) : (
              <span className="text-[8px] font-extrabold uppercase" style={{ color: theme.muted }}>
                {playerInventories[currentPlayer]?.length ?? 0} shapes
              </span>
            )}
          </div>

          {/* Shapes list Scroll Container */}
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2.5 items-center">
            {playerInventories[currentPlayer]?.map((shapeId, idx) => {
              const shapeObj = allShapes.find((s) => s.id === shapeId);
              if (!shapeObj) return null;

              const cells = shapeObj.cells;
              const isHeld = heldPieceIdx === idx;

              // Find bounding box for sidebar visual scale sizing
              let minQ = Infinity, maxQ = -Infinity;
              let minR = Infinity, maxR = -Infinity;
              cells.forEach((c) => {
                if (c.q < minQ) minQ = c.q;
                if (c.q > maxQ) maxQ = c.q;
                if (c.r < minR) minR = c.r;
                if (c.r > maxR) maxR = c.r;
              });

              // Custom small cell drawing
              const sidebarL = 10;
              const cCentroids = cells.map((c) => getCellCentroid(c.q, c.r, c.up, sidebarL));
              const minX = Math.min(...cCentroids.map((c) => c.x)) - sidebarL;
              const maxX = Math.max(...cCentroids.map((c) => c.x)) + sidebarL;
              const minY = Math.min(...cCentroids.map((c) => c.y)) - sidebarL;
              const maxY = Math.max(...cCentroids.map((c) => c.y)) + sidebarL;
              const w = maxX - minX;
              const h = maxY - minY;

              return (
                <div
                  key={shapeId}
                  onClick={() => {
                    if (winner) return;
                    if (isHeld) {
                      setHeldPieceIdx(null);
                    } else {
                      setHeldPieceIdx(idx);
                      setHeldRotation(0);
                      setHeldFlipped(false);
                    }
                  }}
                  className="relative cursor-pointer transition-all duration-200 hover:scale-110 active:scale-95 flex items-center justify-center py-1 select-none"
                >
                  <svg
                    width={90}
                    height={50}
                    viewBox={`${minX} ${minY} ${w} ${h}`}
                    className="transition-all duration-200"
                    style={{
                      filter: isHeld
                        ? `drop-shadow(0 0 6px ${playerColors[currentPlayer]}) drop-shadow(0 0 2px ${playerColors[currentPlayer]})`
                        : 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))'
                    }}
                  >
                    {cells.map((c, cellIdx) => {
                      const pointsStr = getCellPoints(c.q, c.r, c.up, sidebarL)
                        .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
                        .join(' ');
                      return (
                        <polygon
                          key={cellIdx}
                          points={pointsStr}
                          fill={playerColors[currentPlayer]}
                          stroke="rgba(255,255,255,0.15)"
                          strokeWidth="0.8"
                        />
                      );
                    })}
                    <defs>
                      <linearGradient id="held-accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d97706" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {isHeld && (
                    <div className="absolute top-0 right-0 bg-custom-accent text-white p-0.5 rounded-full shadow-md animate-scale-in scale-75">
                      <Check className="h-2.5 w-2.5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

