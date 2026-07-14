import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, RotateCcw, Clock } from 'lucide-react';
import { getPlayerColors } from '../shared/colorUtils';
import { triggerConfetti } from '../shared/confettiUtils';

interface GameProps {
  cachedState: any;
  onSaveCache: (state: any) => void;
  onClose: () => void;
}

// -------------------------------------------------------------
// Coordinate Helpers & Math
// -------------------------------------------------------------
interface HexCoord {
  q: number;
  r: number;
  s: number;
}

// Generates cubic coordinates for pointy-topped grid of radius 4 (side length 5, total 61 cells)
export function getHexGridCoords(radius: number = 4): HexCoord[] {
  const coords: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rStart = Math.max(-radius, -q - radius);
    const rEnd = Math.min(radius, -q + radius);
    for (let r = rStart; r <= rEnd; r++) {
      coords.push({ q, r, s: -q - r });
    }
  }
  return coords;
}

export function isCoordinateOnBoard(q: number, r: number, radius: number = 4): boolean {
  const s = -q - r;
  return Math.abs(q) <= radius && Math.abs(r) <= radius && Math.abs(s) <= radius;
}

export function getHexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const s1 = -q1 - r1;
  const s2 = -q2 - r2;
  return Math.round((Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(s1 - s2)) / 2);
}

// -------------------------------------------------------------
// Trithello Game Logic Helpers
// -------------------------------------------------------------
export function getFlippedPiecesTrithello(
  board: Record<string, number>,
  q: number,
  r: number,
  player: number,
  radius: number = 4
): string[] {
  const key = `${q},${r}`;
  // Cannot play on occupied cells or the center cell
  if (board[key] !== undefined || (q === 0 && r === 0)) return [];

  const flipped: string[] = [];
  const directions = [
    { dq: 1, dr: -1 },
    { dq: 1, dr: 0 },
    { dq: 0, dr: 1 },
    { dq: -1, dr: 1 },
    { dq: -1, dr: 0 },
    { dq: 0, dr: -1 },
  ];

  for (const { dq, dr } of directions) {
    let currQ = q + dq;
    let currR = r + dr;
    const line: string[] = [];

    while (true) {
      if (!isCoordinateOnBoard(currQ, currR, radius)) break;

      // The absolute center tile behaves as blocked if empty
      if (currQ === 0 && currR === 0 && board['0,0'] === undefined) break;

      const currKey = `${currQ},${currR}`;
      const occupant = board[currKey];

      if (occupant === undefined) {
        // Empty tile breaks the sandwich bracket
        break;
      }

      if (occupant === player) {
        // Found matching player color at end of line. If line contains opponent pieces, they are bracketed!
        if (line.length > 0) {
          flipped.push(...line);
        }
        break;
      } else {
        // Opponent piece (either of the other two players)
        line.push(currKey);
      }

      currQ += dq;
      currR += dr;
    }
  }

  return flipped;
}

// -------------------------------------------------------------
// Othello (Classic 2P) Game Logic Helpers
// -------------------------------------------------------------
export function getFlippedPiecesOthello(
  board: (number | null)[][],
  row: number,
  col: number,
  player: number
): [number, number][] {
  if (board[row][col] !== null) return [];

  const flipped: [number, number][] = [];
  const directions = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: 0 },
    { dr: -1, dc: 1 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
    { dr: 1, dc: -1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
  ];

  for (const { dr, dc } of directions) {
    let r = row + dr;
    let c = col + dc;
    const line: [number, number][] = [];

    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const occupant = board[r][c];
      if (occupant === null) break;
      if (occupant === player) {
        if (line.length > 0) {
          flipped.push(...line);
        }
        break;
      } else {
        line.push([r, c]);
      }
      r += dr;
      c += dc;
    }
  }

  return flipped;
}

// -------------------------------------------------------------
// main React Component
// -------------------------------------------------------------
export const TrithelloGame: React.FC<GameProps> = ({
  cachedState,
  onSaveCache,
}) => {
  // 1. General Game Setup & Sizing
  const [mode, setMode] = useState<'othello' | 'trithello'>(() => cachedState?.mode ?? 'trithello');
  const [othelloIsGameStarted, setOthelloIsGameStarted] = useState<boolean>(() => cachedState?.othelloIsGameStarted ?? false);
  const [trithelloIsGameStarted, setTrithelloIsGameStarted] = useState<boolean>(() => cachedState?.trithelloIsGameStarted ?? false);

  const isGameStarted = mode === 'othello' ? othelloIsGameStarted : trithelloIsGameStarted;
  const setIsGameStarted = (val: boolean) => {
    if (mode === 'othello') {
      setOthelloIsGameStarted(val);
    } else {
      setTrithelloIsGameStarted(val);
    }
  };


  const [staggerSpeed] = useState<'normal' | 'fast' | 'instant'>(() => cachedState?.staggerSpeed ?? 'normal');

  // Animation Lock
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  // Timeouts tracker to avoid leaks
  const timeoutsRef = useRef<any[]>([]);
  const clearAllTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  useEffect(() => {
    return () => clearAllTimeouts();
  }, []);

  // 2. Othello (2P) State
  const [othelloBoard, setOthelloBoard] = useState<(number | null)[][]>(() => {
    if (cachedState?.othelloBoard) {
      return cachedState.othelloBoard;
    }
    const initial = Array.from({ length: 8 }, () => Array(8).fill(null));
    initial[3][3] = 2;
    initial[3][4] = 1;
    initial[4][3] = 1;
    initial[4][4] = 2;
    return initial;
  });
  const [othelloCurrentPlayer, setOthelloCurrentPlayer] = useState<number>(() => cachedState?.othelloCurrentPlayer ?? 1);
  const [othelloWinner, setOthelloWinner] = useState<number | 'tie' | null>(() => cachedState?.othelloWinner ?? null);

  // 3. Trithello (3P) State
  const [trithelloBoard, setTrithelloBoard] = useState<Record<string, number>>(() => {
    if (cachedState?.trithelloBoard) {
      return cachedState.trithelloBoard;
    }
    return {
      '1,0': 1,
      '0,1': 2,
      '-1,1': 3,
      '-1,0': 1,
      '0,-1': 2,
      '1,-1': 3,
    };
  });
  const [trithelloCurrentPlayer, setTrithelloCurrentPlayer] = useState<number>(() => cachedState?.trithelloCurrentPlayer ?? 1);
  const [trithelloWinner, setTrithelloWinner] = useState<number | 'tie' | null>(() => cachedState?.trithelloWinner ?? null);
  const [trithelloEliminated, setTrithelloEliminated] = useState<number[]>(() => cachedState?.trithelloEliminated ?? []);
  const [trithelloMoveCounts, setTrithelloMoveCounts] = useState<Record<number, number>>(() => {
    if (cachedState?.trithelloMoveCounts) {
      return cachedState.trithelloMoveCounts;
    }
    return { 1: 0, 2: 0, 3: 0 };
  });

  // Last eliminated animations trigger
  const [, setJustEliminated] = useState<number | null>(null);

  // Announcement Toast (e.g. for Passes, Resigns, or Eliminations)
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const announcementTimeoutRef = useRef<any | null>(null);
  const showAnnouncement = (msg: string) => {
    if (announcementTimeoutRef.current) {
      clearTimeout(announcementTimeoutRef.current);
    }
    setAnnouncement(msg);
    announcementTimeoutRef.current = setTimeout(() => {
      setAnnouncement(null);
    }, 3000);
  };

  const playerColors = getPlayerColors(3);

  // Helpers to adjust brightness for spherical radial gradient pieces
  // Cache state changes
  const saveCacheRef = useRef(onSaveCache);
  useEffect(() => {
    saveCacheRef.current = onSaveCache;
  }, [onSaveCache]);

  useEffect(() => {
    saveCacheRef.current({
      mode,
      staggerSpeed,
      othelloBoard,
      othelloCurrentPlayer,
      othelloWinner,
      othelloIsGameStarted,
      trithelloBoard,
      trithelloCurrentPlayer,
      trithelloWinner,
      trithelloEliminated,
      trithelloMoveCounts,
      trithelloIsGameStarted,
    });
  }, [
    mode,
    staggerSpeed,
    othelloBoard,
    othelloCurrentPlayer,
    othelloWinner,
    othelloIsGameStarted,
    trithelloBoard,
    trithelloCurrentPlayer,
    trithelloWinner,
    trithelloEliminated,
    trithelloMoveCounts,
    trithelloIsGameStarted,
  ]);

  // -------------------------------------------------------------
  // Trithello Engine Functions
  // -------------------------------------------------------------
  const trithelloCoords = getHexGridCoords();

  const getTrithelloPieceCounts = (board: Record<string, number>) => {
    let p1 = 0, p2 = 0, p3 = 0;
    Object.values(board).forEach((val) => {
      if (val === 1) p1++;
      if (val === 2) p2++;
      if (val === 3) p3++;
    });
    return { p1, p2, p3 };
  };

  const trithelloCounts = getTrithelloPieceCounts(trithelloBoard);

  // Calculates all valid coordinates for player in Trithello
  const getValidMovesTrithello = (board: Record<string, number>, player: number, eliminated: number[]): Record<string, string[]> => {
    const valid: Record<string, string[]> = {};
    if (eliminated.includes(player)) return valid;

    for (const coord of trithelloCoords) {
      const flips = getFlippedPiecesTrithello(board, coord.q, coord.r, player);
      if (flips.length > 0) {
        valid[`${coord.q},${coord.r}`] = flips;
      }
    }
    return valid;
  };

  const validMovesTrithello = getValidMovesTrithello(trithelloBoard, trithelloCurrentPlayer, trithelloEliminated);

  const getNextActivePlayerTrithello = (current: number, eliminated: number[]): number => {
    let next = (current % 3) + 1;
    let iterations = 0;
    while (eliminated.includes(next) && iterations < 5) {
      next = (next % 3) + 1;
      iterations++;
    }
    return next;
  };

  const handleHexClick = (q: number, r: number) => {
    if (trithelloWinner || isAnimating) return;

    const key = `${q},${r}`;
    const flips = validMovesTrithello[key];
    if (!flips || flips.length === 0) return;

    // Start Move
    setIsAnimating(true);
    if (!isGameStarted) setIsGameStarted(true);

    const speedMs = staggerSpeed === 'normal' ? 150 : staggerSpeed === 'fast' ? 75 : 0;

    // 1. Place piece immediately
    setTrithelloBoard((prev) => ({ ...prev, [key]: trithelloCurrentPlayer }));
    setTrithelloMoveCounts((prev) => ({
      ...prev,
      [trithelloCurrentPlayer]: prev[trithelloCurrentPlayer] + 1
    }));

    // 2. Compute distances and stagger flips
    const maxDist = flips.reduce((max, fKey) => {
      const [fq, fr] = fKey.split(',').map(Number);
      const d = getHexDistance(q, r, fq, fr);
      return d > max ? d : max;
    }, 0);

    clearAllTimeouts();

    for (let d = 1; d <= maxDist; d++) {
      const keysAtDist = flips.filter((fKey) => {
        const [fq, fr] = fKey.split(',').map(Number);
        return getHexDistance(q, r, fq, fr) === d;
      });

      if (keysAtDist.length > 0) {
        const t = setTimeout(() => {
          setTrithelloBoard((prev) => {
            const nextBoard = { ...prev };
            keysAtDist.forEach((k) => {
              nextBoard[k] = trithelloCurrentPlayer;
            });
            return nextBoard;
          });
        }, d * speedMs);
        timeoutsRef.current.push(t);
      }
    }

    // 3. Finalize Turn
    const finalT = setTimeout(() => {
      setTrithelloBoard((prev) => {
        // Read updated board counts
        const updatedCounts = getTrithelloPieceCounts(prev);

        // Check for new eliminations
        const newlyEliminated: number[] = [...trithelloEliminated];
        let newlyElimPlayerId: number | null = null;
        [1, 2, 3].forEach((pId) => {
          if (updatedCounts[`p${pId}` as 'p1' | 'p2' | 'p3'] === 0 && !newlyEliminated.includes(pId)) {
            // Player WOULD be eliminated.
            // If they have made 0 moves so far, and the center spot is empty, rescue them!
            if (trithelloMoveCounts[pId] === 0 && prev['0,0'] === undefined) {
              prev['0,0'] = pId;
              updatedCounts[`p${pId}` as 'p1' | 'p2' | 'p3'] = 1;
              showAnnouncement(`Player ${pId} rescued with a free piece in the center!`);
            } else {
              newlyEliminated.push(pId);
              newlyElimPlayerId = pId;
            }
          }
        });

        if (newlyElimPlayerId !== null) {
          setTrithelloEliminated(newlyEliminated);
          setJustEliminated(newlyElimPlayerId);
          showAnnouncement(`Player ${newlyElimPlayerId} has been ELIMINATED!`);
          setTimeout(() => setJustEliminated(null), 2500);
        }

        // Determine next turns
        const activeCount = 3 - newlyEliminated.length;
        if (activeCount <= 1) {
          // Game ends immediately because only one player remains active
          declareWinnerTrithello(prev, newlyEliminated);
          setIsAnimating(false);
          return prev;
        }

        let nextPlayer = getNextActivePlayerTrithello(trithelloCurrentPlayer, newlyEliminated);
        let checkedPlayersCount = 0;
        let foundMove = false;

        while (checkedPlayersCount < activeCount) {
          const nextValid = getValidMovesTrithello(prev, nextPlayer, newlyEliminated);
          if (Object.keys(nextValid).length > 0) {
            setTrithelloCurrentPlayer(nextPlayer);
            foundMove = true;
            break;
          } else {
            // Next player has no moves, pass turn
            showAnnouncement(`Player ${nextPlayer} passes!`);
            nextPlayer = getNextActivePlayerTrithello(nextPlayer, newlyEliminated);
            checkedPlayersCount++;
          }
        }

        if (!foundMove) {
          // Nobody left has moves: Game Over
          declareWinnerTrithello(prev, newlyEliminated);
        }

        setIsAnimating(false);
        return prev;
      });
    }, (maxDist * speedMs) + 250);

    timeoutsRef.current.push(finalT);
  };

  const declareWinnerTrithello = (board: Record<string, number>, eliminated: number[]) => {
    const counts = getTrithelloPieceCounts(board);

    // Players who are not eliminated
    const activePlayers = [1, 2, 3].filter(p => !eliminated.includes(p));

    let maxCount = -1;
    let winningPlayers: number[] = [];

    activePlayers.forEach((pId) => {
      const c = counts[`p${pId}` as 'p1' | 'p2' | 'p3'];
      if (c > maxCount) {
        maxCount = c;
        winningPlayers = [pId];
      } else if (c === maxCount) {
        winningPlayers.push(pId);
      }
    });

    if (winningPlayers.length === 1) {
      setTrithelloWinner(winningPlayers[0]);
      triggerConfetti();
    } else {
      setTrithelloWinner('tie');
    }
  };

  // -------------------------------------------------------------
  // Othello Engine Functions
  // -------------------------------------------------------------
  const getOthelloPieceCounts = (board: (number | null)[][]) => {
    let p1 = 0, p2 = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c] === 1) p1++;
        if (board[r][c] === 2) p2++;
      }
    }
    return { p1, p2 };
  };

  const othelloCounts = getOthelloPieceCounts(othelloBoard);

  const getValidMovesOthello = (board: (number | null)[][], player: number): Record<string, [number, number][]> => {
    const valid: Record<string, [number, number][]> = {};
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const flips = getFlippedPiecesOthello(board, r, c, player);
        if (flips.length > 0) {
          valid[`${r},${c}`] = flips;
        }
      }
    }
    return valid;
  };

  const validMovesOthello = getValidMovesOthello(othelloBoard, othelloCurrentPlayer);

  const handleSquareClick = (rowIdx: number, colIdx: number) => {
    if (othelloWinner || isAnimating) return;

    const key = `${rowIdx},${colIdx}`;
    const flips = validMovesOthello[key];
    if (!flips || flips.length === 0) return;

    // Start Move
    setIsAnimating(true);
    if (!isGameStarted) setIsGameStarted(true);

    const speedMs = staggerSpeed === 'normal' ? 150 : staggerSpeed === 'fast' ? 75 : 0;

    // 1. Place piece immediately
    setOthelloBoard((prev) => {
      const nextBoard = prev.map((r) => [...r]);
      nextBoard[rowIdx][colIdx] = othelloCurrentPlayer;
      return nextBoard;
    });

    // 2. Compute distances and stagger flips (Chebyshev Distance)
    const maxDist = flips.reduce((max, [fr, fc]) => {
      const d = Math.max(Math.abs(rowIdx - fr), Math.abs(colIdx - fc));
      return d > max ? d : max;
    }, 0);

    clearAllTimeouts();

    for (let d = 1; d <= maxDist; d++) {
      const coordsAtDist = flips.filter(([fr, fc]) => {
        return Math.max(Math.abs(rowIdx - fr), Math.abs(colIdx - fc)) === d;
      });

      if (coordsAtDist.length > 0) {
        const t = setTimeout(() => {
          setOthelloBoard((prev) => {
            const nextBoard = prev.map((r) => [...r]);
            coordsAtDist.forEach(([fr, fc]) => {
              nextBoard[fr][fc] = othelloCurrentPlayer;
            });
            return nextBoard;
          });
        }, d * speedMs);
        timeoutsRef.current.push(t);
      }
    }

    // 3. Finalize Turn
    const finalT = setTimeout(() => {
      setOthelloBoard((prev) => {
        const nextPlayer = othelloCurrentPlayer === 1 ? 2 : 1;
        const nextValid = getValidMovesOthello(prev, nextPlayer);

        if (Object.keys(nextValid).length > 0) {
          setOthelloCurrentPlayer(nextPlayer);
        } else {
          // Next player passes, check if current player still has moves
          showAnnouncement(`Player ${nextPlayer} passes!`);
          const currentStillValid = getValidMovesOthello(prev, othelloCurrentPlayer);
          if (Object.keys(currentStillValid).length === 0) {
            // Neither player has moves: Game Over
            declareWinnerOthello(prev);
          }
        }
        setIsAnimating(false);
        return prev;
      });
    }, (maxDist * speedMs) + 250);

    timeoutsRef.current.push(finalT);
  };

  const declareWinnerOthello = (board: (number | null)[][]) => {
    const counts = getOthelloPieceCounts(board);
    if (counts.p1 > counts.p2) {
      setOthelloWinner(1);
      triggerConfetti();
    } else if (counts.p2 > counts.p1) {
      setOthelloWinner(2);
      triggerConfetti();
    } else {
      setOthelloWinner('tie');
    }
  };

  // -------------------------------------------------------------
  // Reset and Setup Resetters
  // -------------------------------------------------------------
  const handleReset = () => {
    clearAllTimeouts();
    setIsAnimating(false);
    setIsGameStarted(false);

    if (mode === 'othello') {
      const initial = Array.from({ length: 8 }, () => Array(8).fill(null));
      initial[3][3] = 2;
      initial[3][4] = 1;
      initial[4][3] = 1;
      initial[4][4] = 2;
      setOthelloBoard(initial);
      setOthelloCurrentPlayer(1);
      setOthelloWinner(null);
    } else {
      setTrithelloBoard({
        '1,0': 1,
        '0,1': 2,
        '-1,1': 3,
        '-1,0': 1,
        '0,-1': 2,
        '1,-1': 3,
      });
      setTrithelloCurrentPlayer(1);
      setTrithelloWinner(null);
      setTrithelloEliminated([]);
      setTrithelloMoveCounts({ 1: 0, 2: 0, 3: 0 });
    }
    showAnnouncement("Game reset successfully!");
  };

  const handleModeToggle = (targetMode: 'othello' | 'trithello') => {
    if (targetMode === mode) return;
    clearAllTimeouts();
    setIsAnimating(false);
    setMode(targetMode);
  };

  // Determine active states for UI rendering
  const activePlayer = mode === 'othello' ? othelloCurrentPlayer : trithelloCurrentPlayer;
  const isWon = mode === 'othello' ? othelloWinner !== null : trithelloWinner !== null;
  const winner = mode === 'othello' ? othelloWinner : trithelloWinner;
  const counts = (mode === 'othello' ? othelloCounts : trithelloCounts) as any;

  const getPlayerName = (pId: number): string => {
    if (pId === 1) return 'Player 1';
    if (pId === 2) return 'Player 2';
    if (pId === 3) return 'Player 3';
    return `Player ${pId}`;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none bg-custom-card overflow-hidden font-sans relative">

      {/* CSS Animation Overrides for Piece 3D flipping */}
      <style>{`
        @keyframes flip-token-x {
          0% { transform: scale(1) rotateY(0deg); }
          50% { transform: scale(1.15, 0.9) rotateY(90deg); filter: brightness(1.3); }
          100% { transform: scale(1) rotateY(180deg); }
        }
        .animate-flip-piece {
          animation: flip-token-x 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        .ease-out-back {
          transition-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes elimination-glitch {
          0%, 100% { transform: translate(0); opacity: 1; }
          20% { transform: translate(-2px, 2px); filter: hue-rotate(90deg); }
          40% { transform: translate(-2px, -2px); opacity: 0.8; }
          60% { transform: translate(2px, 2px); filter: invert(30%); }
          80% { transform: translate(2px, -2px); }
        }
        .animate-elimination-glitch {
          animation: elimination-glitch 0.6s ease-in-out 3;
        }
      `}</style>

      {/* -------------------------------------------------------------
          Header Bar
         ------------------------------------------------------------- */}
      <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-black text-custom-text text-base flex items-center gap-3 tracking-wide uppercase select-none">
            <Sparkles className="h-5 w-5 text-custom-accent animate-pulse" />
            <span>{mode === 'othello' ? 'Othello' : 'Trithello'}</span>
          </h3>

          {/* Mode Switcher Segmented Control */}
          <div className="flex bg-custom-input border border-custom-border/60 rounded-lg p-0.5 ml-2.5">
            <button
              id="toggle-othello"
              onClick={() => handleModeToggle('othello')}
              className={`px-3 py-1 text-[10px] font-extrabold uppercase rounded-md transition-all ${mode === 'othello'
                ? 'bg-custom-primary text-white shadow-md'
                : 'text-custom-muted hover:text-custom-text'
                }`}
            >
              Othello
            </button>
            <button
              id="toggle-trithello"
              onClick={() => handleModeToggle('trithello')}
              className={`px-3 py-1 text-[10px] font-extrabold uppercase rounded-md transition-all ${mode === 'trithello'
                ? 'bg-custom-primary text-white shadow-md'
                : 'text-custom-muted hover:text-custom-text'
                }`}
            >
              Trithello
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">


          <button
            onClick={handleReset}
            className="px-3 py-1.5 bg-custom-input hover:bg-custom-primary/20 text-custom-text border border-custom-border rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
            title="Reset Match"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Announcement Overlay Banner - centered at bottom of modal */}
      {announcement && (
        <div className="bg-custom-header absolute inset-x-0 bottom-4 mx-auto z-40 max-w-[32rem] bg-custom-primary/95 border border-custom-primary/40 text-custom-text px-6 py-2.5 rounded-full font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-2 animate-bounce">
          <Clock className="h-4 w-4" />
          <span>{announcement}</span>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden p-6 justify-center items-center">

        {/* Interactive Game Board Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative min-h-[460px] overflow-hidden bg-custom-input/20 border border-custom-border rounded-3xl p-6 w-full max-w-[680px]">

          {/* Top HUD (displayed always) */}
          <div className="w-full max-w-[520px] flex flex-col gap-3 mb-6 animate-in fade-in slide-in-from-top duration-300">
            {/* Status Row */}
            <div className="flex items-center justify-between text-xs font-black text-custom-text px-1">
              <div className="flex items-center gap-2">
                {!isWon ? (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-full animate-pulse"
                      style={{ backgroundColor: playerColors[activePlayer - 1] }}
                    />
                    <span className="uppercase tracking-wider">
                      {getPlayerName(activePlayer)}'s Turn
                    </span>
                  </>
                ) : (
                  <span className="uppercase tracking-wider text-custom-accent">
                    {winner === 'tie' ? (
                      "Tie Game!"
                    ) : (
                      <span>
                        Winner: <span style={{ color: playerColors[winner as number - 1] }}>{getPlayerName(winner as number)}</span>
                      </span>
                    )}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {!isWon && (
                  <span className="text-custom-muted font-bold text-[10px] uppercase tracking-wider">
                    {mode === 'othello'
                      ? `${Object.keys(validMovesOthello).length} possible moves`
                      : `${Object.keys(validMovesTrithello).length} possible moves`
                    }
                  </span>
                )}
                {isWon && (
                  <div className="flex gap-3 text-[10px] uppercase text-custom-muted font-bold tracking-wider">
                    <span>P1: {counts.p1}</span>
                    <span>P2: {counts.p2}</span>
                    {mode === 'trithello' && <span>P3: {counts.p3}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Long Segmented Progress Bar (no text, colors only) */}
            <div className="w-full h-3 rounded-full bg-custom-border/20 overflow-hidden flex shadow-inner border border-custom-border/20">
              {mode === 'othello' ? (
                <>
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${(counts.p1 / (counts.p1 + counts.p2 || 1)) * 100}%`,
                      backgroundColor: playerColors[0]
                    }}
                  />
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${(counts.p2 / (counts.p1 + counts.p2 || 1)) * 100}%`,
                      backgroundColor: playerColors[1]
                    }}
                  />
                </>
              ) : (
                <>
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${(counts.p1 / (counts.p1 + counts.p2 + counts.p3 || 1)) * 100}%`,
                      backgroundColor: playerColors[0]
                    }}
                  />
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${(counts.p2 / (counts.p1 + counts.p2 + counts.p3 || 1)) * 100}%`,
                      backgroundColor: playerColors[1]
                    }}
                  />
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${(counts.p3 / (counts.p1 + counts.p2 + counts.p3 || 1)) * 100}%`,
                      backgroundColor: playerColors[2]
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {/* Othello Game Mode Board */}
          {mode === 'othello' && (
            <div className="flex flex-col items-center justify-center pointer-events-auto z-10 animate-in fade-in zoom-in duration-300">
              {/* Othello 8x8 Grid */}
              <div className="bg-custom-header border-2 border-custom-border rounded-3xl p-4 shadow-2xl shrink-0">
                <div className="grid grid-cols-8 grid-rows-8 gap-1.5 w-[360px] h-[360px] sm:w-[500px] sm:h-[500px] transition-all duration-300">
                  {othelloBoard.map((row, rIdx) =>
                    row.map((cell, cIdx) => {
                      const isMoveValid = !!validMovesOthello[`${rIdx},${cIdx}`];
                      return (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          id={`othello-cell-${rIdx}-${cIdx}`}
                          onClick={() => handleSquareClick(rIdx, cIdx)}
                          className={`bg-custom-header border-2 border-custom-border rounded-lg flex items-center justify-center relative transition-all ${isMoveValid && !isAnimating
                            ? 'cursor-pointer hover:bg-custom-primary/10'
                            : ''
                            }`}
                          style={isMoveValid && !isAnimating ? {
                            backgroundColor: `${playerColors[othelloCurrentPlayer - 1]}15`,
                            borderColor: `${playerColors[othelloCurrentPlayer - 1]}60`
                          } : undefined}
                        >
                          {/* Render Flat piece */}
                          {cell !== null && (
                            <div
                              key={`othello-piece-${rIdx}-${cIdx}-${cell}`}
                              className="w-[82%] h-[82%] rounded-full border border-white/10 shadow-lg animate-flip-piece flex items-center justify-center relative overflow-hidden"
                              style={{
                                backgroundColor: playerColors[cell - 1],
                                boxShadow: `inset 0 2px 4px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.25), 0 0 8px ${playerColors[cell - 1]}60`,
                                transformOrigin: 'center'
                              }}
                            >
                              <div className="w-[80%] h-[80%] rounded-full border border-white/5 bg-gradient-to-tr from-black/20 via-transparent to-white/10" />
                            </div>
                          )}

                          {/* Valid move dot indicator */}
                          {isMoveValid && cell === null && !isAnimating && (
                            <div
                              className="w-3.5 h-3.5 rounded-full opacity-60 transition-all scale-100 hover:scale-120 animate-pulse border border-black/10"
                              style={{ backgroundColor: playerColors[othelloCurrentPlayer - 1] }}
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Trithello Game Mode Board */}
          {mode === 'trithello' && (
            <div className="flex flex-col items-center justify-center pointer-events-auto z-10 animate-in fade-in zoom-in duration-300">
              {/* Trithello Hexagonal Board */}
              <div className="shrink-0">
                <svg
                  viewBox="-240 -220 480 440"
                  className="w-[380px] h-[350px] sm:w-[560px] sm:h-[510px] select-none transition-all duration-300"
                >
                  {/* Board grid hex lines */}
                  {trithelloCoords.map((coord) => {
                    const size = 26; // outer hex radius
                    const { x, y } = hexToPixel(coord.q, coord.r, size);
                    const key = `${coord.q},${coord.r}`;
                    const cell = trithelloBoard[key];
                    const isMoveValid = !!validMovesTrithello[key];
                    const isCenter = coord.q === 0 && coord.r === 0;

                    // Render points polygon coordinates
                    const pointsStr = getHexPoints(x, y, size);

                    return (
                      <g
                        key={key}
                        id={`hex-cell-${coord.q},${coord.r}`}
                        onClick={() => handleHexClick(coord.q, coord.r)}
                        className={`group select-none outline-none ${isMoveValid && !isAnimating ? 'cursor-pointer' : ''}`}
                      >
                        {/* Polygon background - neutral for empty cells */}
                        <polygon
                          points={pointsStr}
                          className={`transition-all duration-300 stroke-custom-border ${isCenter
                            ? 'fill-custom-header'
                            : 'fill-custom-header'
                            } ${isMoveValid && !isAnimating ? 'group-hover:fill-custom-primary/15' : ''}`}
                          strokeWidth="1.8"
                        />

                        {/* Locked Padlock inside Center Hex */}
                        {isCenter && cell === undefined && (
                          <g transform={`translate(${x}, ${y})`}>
                            <path
                              d="M-5,-1 L-5,6 L5,6 L5,-1 Z M-3,-1 L-3,-4 C-3,-5.5 -1,-6 0,-6 C1,-6 3,-5.5 3,-4 L3,-1"
                              fill="none"
                              stroke="rgba(255,255,255,0.25)"
                              strokeWidth="1.2"
                            />
                          </g>
                        )}

                        {/* Render flat piece with nested groups for flipping-in-place */}
                        {cell !== undefined && (
                          <g transform={`translate(${x}, ${y})`}>
                            <g
                              key={`trithello-piece-${coord.q}-${coord.r}-${cell}`}
                              className="animate-flip-piece"
                              style={{
                                transformOrigin: 'center',
                                transformBox: 'fill-box'
                              }}
                            >
                              {/* Outer flat piece body */}
                              <circle
                                cx={0}
                                cy={0}
                                r={size * 0.72}
                                fill={playerColors[cell - 1]}
                                stroke="rgba(255,255,255,0.15)"
                                strokeWidth="1"
                                style={{
                                  filter: 'drop-shadow(0px 2px 3px rgba(0,0,0,0.35))'
                                }}
                              />
                              {/* Inner accent ring gradient for flat styling */}
                              <circle
                                cx={0}
                                cy={0}
                                r={size * 0.72 * 0.8}
                                fill="url(#flat-accent-gradient)"
                                stroke="rgba(255,255,255,0.05)"
                                strokeWidth="1"
                                style={{ pointerEvents: 'none' }}
                              />
                            </g>
                          </g>
                        )}

                        {/* Valid move glowing dot */}
                        {isMoveValid && cell === undefined && !isAnimating && (
                          <circle
                            cx={x}
                            cy={y}
                            r={size * 0.28}
                            className="animate-pulse opacity-60 group-hover:opacity-90 transition-all"
                            style={{
                              fill: playerColors[trithelloCurrentPlayer - 1],
                              filter: `drop-shadow(0px 0px 3px ${playerColors[trithelloCurrentPlayer - 1]})`
                            }}
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* SVG Definitions for Flat Piece overlay */}
                  <defs>
                    <linearGradient id="flat-accent-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="white" stopOpacity="0.12" />
                      <stop offset="50%" stopColor="white" stopOpacity="0" />
                      <stop offset="100%" stopColor="black" stopOpacity="0.2" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>


    </div>
  );
};

// Generates points array string for polygon hexagons
function getHexPoints(x: number, y: number, size: number): string {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 6) + (Math.PI / 3) * i;
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    points.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }
  return points.join(' ');
}

// Cubic coordinates pixel transformation
function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * 1.5 * r;
  return { x, y };
}
