import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, RotateCcw, Trophy } from 'lucide-react';
import { getPlayerColors, parseColorToRgb } from '../shared/colorUtils';
import { triggerConfetti } from '../shared/confettiUtils';

interface GameProps {
  cachedState: any;
  onSaveCache: (state: any) => void;
  onClose: () => void;
}

export interface CellState {
  atomCount: number;
  playerOwner: number | null;
}

export type BoardState = CellState[][];

// Stability Limits: Corners = 2, Edges = 3, center = 4
export const getCriticalMass = (row: number, col: number, N: number): number => {
  const isRowEdge = row === 0 || row === N - 1;
  const isColEdge = col === 0 || col === N - 1;
  if (isRowEdge && isColEdge) return 2;
  if (isRowEdge || isColEdge) return 3;
  return 4;
};

export const createEmptyBoard = (N: number): BoardState => {
  return Array.from({ length: N }, () =>
    Array.from({ length: N }, () => ({
      atomCount: 0,
      playerOwner: null,
    }))
  );
};

const getTintRGBA = (colorStr: string, opacity: number): string => {
  const rgb = parseColorToRgb(colorStr);
  if (!rgb) return 'transparent';
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
};

export const ChainReactionGame: React.FC<GameProps> = ({
  cachedState,
  onSaveCache,
}) => {
  // 1. Core States
  const [N, setN] = useState<number>(() => cachedState?.N ?? 8);
  const [playerCount, setPlayerCount] = useState<number>(() => cachedState?.playerCount ?? 3);
  const [activeGame] = useState<boolean>(true);
  const [currentPlayer, setCurrentPlayer] = useState<number>(() => cachedState?.currentPlayer ?? 0);

  const [board, setBoard] = useState<BoardState>(() => {
    if (cachedState?.board && cachedState.board.length === (cachedState.N ?? 8)) {
      return cachedState.board;
    }
    return createEmptyBoard(cachedState?.N ?? 8);
  });

  const [eliminatedPlayers, setEliminatedPlayers] = useState<boolean[]>(() =>
    cachedState?.eliminatedPlayers ?? Array(cachedState?.playerCount ?? 3).fill(false)
  );

  const [turnsTaken, setTurnsTaken] = useState<number[]>(() =>
    cachedState?.turnsTaken ?? Array(cachedState?.playerCount ?? 3).fill(0)
  );

  const [isGameOver, setIsGameOver] = useState<boolean>(() => cachedState?.isGameOver ?? false);
  const [winner, setWinner] = useState<number | null>(() => cachedState?.winner ?? null);

  // 2. Animation & Interaction Freeze States
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [lastExploded, setLastExploded] = useState<Record<string, boolean>>({});
  const [lastReceived, setLastReceived] = useState<Record<string, boolean>>({});

  // 3. Resizing Drag State
  const [dragType, setDragType] = useState<'topRight' | null>(null);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    N: number;
  } | null>(null);

  // 4. Timeout Cleanups
  const timeoutsRef = useRef<number[]>([]);
  const clearAllTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  useEffect(() => {
    return () => clearAllTimeouts();
  }, []);

  // 5. Colors mapping
  const playerColors = useMemo(() => getPlayerColors(playerCount), [playerCount]);
  const activeColor = isGameOver && winner !== null ? playerColors[winner] : playerColors[currentPlayer];

  // 6. Dynamic cell sizes based on grid dimensions N
  const cellSize = 32;
  const gap = 2;
  const totalGridW = N * cellSize + (N - 1) * gap;
  const totalGridH = totalGridW; // Strictly lock 1:1 aspect ratio

  // 7. Calculate cell ownership counts
  const cellCounts = useMemo(() => {
    const counts = Array(playerCount).fill(0);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const owner = board[r]?.[c]?.playerOwner;
        if (owner !== null && owner !== undefined && owner >= 0 && owner < playerCount) {
          counts[owner]++;
        }
      }
    }
    return counts;
  }, [board, N, playerCount]);

  const totalOwned = useMemo(() => cellCounts.reduce((a, b) => a + b, 0), [cellCounts]);
  const firstMoveMade = useMemo(() => turnsTaken.some(t => t > 0), [turnsTaken]);

  // 8. Player count change adjustment before first move
  const handlePlayerCountChange = (newCount: number) => {
    setPlayerCount(newCount);
    const initialEliminated = Array(newCount).fill(false);
    const initialTurns = Array(newCount).fill(0);
    setEliminatedPlayers(initialEliminated);
    setTurnsTaken(initialTurns);

    onSaveCache({
      N,
      playerCount: newCount,
      activeGame: true,
      currentPlayer: 0,
      board,
      eliminatedPlayers: initialEliminated,
      turnsTaken: initialTurns,
      isGameOver,
      winner,
    });
  };

  // 9. Reset game entirely
  const handleReset = () => {
    clearAllTimeouts();
    setIsAnimating(false);
    setCurrentPlayer(0);
    const initialBoard = createEmptyBoard(N);
    setBoard(initialBoard);
    const initialEliminated = Array(playerCount).fill(false);
    const initialTurns = Array(playerCount).fill(0);
    setEliminatedPlayers(initialEliminated);
    setTurnsTaken(initialTurns);
    setIsGameOver(false);
    setWinner(null);
    setLastExploded({});
    setLastReceived({});

    onSaveCache({
      N,
      playerCount,
      activeGame: true,
      currentPlayer: 0,
      board: initialBoard,
      eliminatedPlayers: initialEliminated,
      turnsTaken: initialTurns,
      isGameOver: false,
      winner: null,
    });
  };

  // 10. Clicking cells & processing moves
  const handleCellClick = (row: number, col: number) => {
    if (!activeGame || isGameOver || isAnimating) return;

    const cell = board[row][col];
    // Rules: Can only click empty cell or cells owned by self
    if (cell.playerOwner !== null && cell.playerOwner !== currentPlayer) {
      return;
    }

    const nextBoard = board.map(r => r.map(c => ({ ...c })));
    nextBoard[row][col].atomCount += 1;
    nextBoard[row][col].playerOwner = currentPlayer;

    const criticalMass = getCriticalMass(row, col, N);
    if (nextBoard[row][col].atomCount >= criticalMass) {
      runCascade(nextBoard, currentPlayer);
    } else {
      finalizeTurn(nextBoard, currentPlayer);
    }
  };

  // 11. Cascade Exploding Loops
  const runCascade = (initialBoard: BoardState, activePlayerIdx: number) => {
    setIsAnimating(true);

    const step = (currentBoard: BoardState) => {
      const explodingCells: { r: number; c: number }[] = [];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = currentBoard[r][c];
          if (cell.atomCount >= getCriticalMass(r, c, N)) {
            explodingCells.push({ r, c });
          }
        }
      }

      if (explodingCells.length === 0) {
        setIsAnimating(false);
        finalizeTurn(currentBoard, activePlayerIdx);
        return;
      }

      const nextBoard = currentBoard.map(row => row.map(cell => ({ ...cell })));
      const explodedCoords: Record<string, boolean> = {};
      const receivedCoords: Record<string, boolean> = {};

      for (const { r, c } of explodingCells) {
        explodedCoords[`${r},${c}`] = true;
        nextBoard[r][c].atomCount = 0;
        nextBoard[r][c].playerOwner = null;

        const neighbors = [
          { nr: r - 1, nc: c },
          { nr: r + 1, nc: c },
          { nr: r, nc: c - 1 },
          { nr: r, nc: c + 1 },
        ];

        for (const { nr, nc } of neighbors) {
          if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
            nextBoard[nr][nc].atomCount += 1;
            nextBoard[nr][nc].playerOwner = activePlayerIdx;
            receivedCoords[`${nr},${nc}`] = true;
          }
        }
      }

      setBoard(nextBoard);
      setLastExploded(explodedCoords);
      setLastReceived(receivedCoords);

      const timer = window.setTimeout(() => {
        setLastReceived({});
        step(nextBoard);
      }, 135); // sequential delay within 120ms-150ms specification
      timeoutsRef.current.push(timer);
    };

    step(initialBoard);
  };

  // 12. Finalize moves, evaluate eliminations, checks victory
  const finalizeTurn = (finalBoard: BoardState, activePlayerIdx: number) => {
    setLastExploded({});
    setLastReceived({});

    const cellCounts = Array(playerCount).fill(0);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const owner = finalBoard[r][c].playerOwner;
        if (owner !== null && owner >= 0 && owner < playerCount) {
          cellCounts[owner]++;
        }
      }
    }

    const nextTurnsTaken = [...turnsTaken];
    while (nextTurnsTaken.length < playerCount) {
      nextTurnsTaken.push(0);
    }
    nextTurnsTaken[activePlayerIdx]++;
    setTurnsTaken(nextTurnsTaken);

    const playersActiveInMatch = Array.from({ length: playerCount }, (_, idx) => idx);
    const firstRotationComplete = playersActiveInMatch.every(pIdx => nextTurnsTaken[pIdx] >= 1);

    const nextEliminated = [...eliminatedPlayers];
    while (nextEliminated.length < playerCount) {
      nextEliminated.push(false);
    }

    if (firstRotationComplete) {
      for (let p = 0; p < playerCount; p++) {
        if (cellCounts[p] === 0) {
          nextEliminated[p] = true;
        }
      }
      setEliminatedPlayers(nextEliminated);
    }

    const activeCount = firstRotationComplete
      ? nextEliminated.filter((e, idx) => idx < playerCount && !e).length
      : playerCount;

    if (firstRotationComplete && activeCount === 1) {
      const winnerIdx = nextEliminated.findIndex((e, idx) => idx < playerCount && !e);
      setIsGameOver(true);
      setWinner(winnerIdx);
      triggerConfetti();

      const finalState = {
        N,
        playerCount,
        activeGame: true,
        currentPlayer: activePlayerIdx,
        board: finalBoard,
        eliminatedPlayers: nextEliminated,
        turnsTaken: nextTurnsTaken,
        isGameOver: true,
        winner: winnerIdx,
      };
      setBoard(finalBoard);
      onSaveCache(finalState);
      return;
    }

    // Determine the next player
    let nextPlayer = (activePlayerIdx + 1) % playerCount;
    let limit = 0;
    while (nextEliminated[nextPlayer] && limit < playerCount) {
      nextPlayer = (nextPlayer + 1) % playerCount;
      limit++;
    }

    setCurrentPlayer(nextPlayer);

    const nextState = {
      N,
      playerCount,
      activeGame: true,
      currentPlayer: nextPlayer,
      board: finalBoard,
      eliminatedPlayers: nextEliminated,
      turnsTaken: nextTurnsTaken,
      isGameOver: false,
      winner: null,
    };
    setBoard(finalBoard);
    onSaveCache(nextState);
  };

  // 13. Drag resizing handlers
  const startDrag = (e: React.PointerEvent) => {
    if (firstMoveMade) return;
    e.preventDefault();
    setDragType('topRight');
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      N,
    };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) { }
  };

  const onDrag = (e: React.PointerEvent) => {
    if (!dragType || !dragStartRef.current) return;
    e.preventDefault();
    const start = dragStartRef.current;
    const deltaX = e.clientX - start.x;
    const deltaY = e.clientY - start.y;

    const dragStep = cellSize + gap;
    // average of positive deltaX and negative deltaY for topRight dragging direction
    const delta = (deltaX - deltaY) / 2;
    const changeN = Math.round(delta / dragStep);
    const targetN = Math.max(6, Math.min(20, start.N + changeN));

    if (targetN !== N) {
      setN(targetN);
      setBoard(createEmptyBoard(targetN));
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragType) return;
    e.preventDefault();
    setDragType(null);
    dragStartRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) { }
  };

  // 14. Render dot layouts for atoms
  const renderAtoms = (count: number, ownerColor: string) => {
    if (count <= 0) return null;

    const glowStyle = {
      filter: `drop-shadow(0 0 3px ${ownerColor})`,
    };

    if (count === 1) {
      return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="10" fill={ownerColor} style={glowStyle} />
        </svg>
      );
    }
    if (count === 2) {
      return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
          <circle cx="34" cy="50" r="10" fill={ownerColor} style={glowStyle} />
          <circle cx="66" cy="50" r="10" fill={ownerColor} style={glowStyle} />
        </svg>
      );
    }
    if (count === 3) {
      return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
          <circle cx="50" cy="32" r="10" fill={ownerColor} style={glowStyle} />
          <circle cx="32" cy="65" r="10" fill={ownerColor} style={glowStyle} />
          <circle cx="68" cy="65" r="10" fill={ownerColor} style={glowStyle} />
        </svg>
      );
    }

    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
        <circle cx="50" cy="28" r="9" fill={ownerColor} style={glowStyle} />
        <circle cx="28" cy="50" r="9" fill={ownerColor} style={glowStyle} />
        <circle cx="72" cy="50" r="9" fill={ownerColor} style={glowStyle} />
        <circle cx="50" cy="72" r="9" fill={ownerColor} style={glowStyle} />
      </svg>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none bg-custom-card overflow-hidden font-sans relative">
      <div
        className="absolute inset-0 pointer-events-none transition-colors duration-500"
        style={{ backgroundColor: getTintRGBA(activeColor, 0.25) }}
      />
      <style>{`
        @keyframes cell-explode {
          0% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.15); filter: brightness(1.6); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        .animate-cell-explode {
          animation: cell-explode 0.15s ease-out;
        }

        @keyframes cell-scale {
          0% { transform: scale(1); }
          50% { transform: scale(1.12); }
          100% { transform: scale(1); }
        }
        .animate-cell-bounce {
          animation: cell-scale 0.12s ease-out;
        }

        @keyframes particle-fly {
          0% {
            transform: rotate(var(--angle)) translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: rotate(var(--angle)) translateY(30px) scale(0);
            opacity: 0;
          }
        }
        .animate-particle {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          animation: particle-fly 0.3s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
          animation-delay: var(--delay, 0ms);
        }

        @keyframes pulse-handle {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .animate-pulse-handle {
          animation: pulse-handle 2s infinite ease-in-out;
        }
      `}</style>

      {/* Top Header */}
      <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-black text-custom-text text-base flex items-center gap-3 tracking-wide uppercase select-none">
            <Sparkles className="h-5 w-5 text-custom-accent animate-pulse" />
            <span>Chain Reaction</span>
            <span className="text-xs px-2.5 py-1 bg-custom-input border border-custom-border/60 rounded-lg text-custom-accent font-black tracking-normal normal-case font-mono">
              {N} × {N}
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="px-3.5 py-1.5 bg-custom-input hover:bg-custom-primary/20 text-custom-text border border-custom-border rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
            title="Reset Game"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Progress Bar (2028 Heritage) */}
      <div className="w-full h-2 flex bg-custom-input border-b border-custom-border overflow-hidden shrink-0">
        {playerColors.map((color, pIdx) => {
          const cellsOwned = cellCounts[pIdx] || 0;
          const isEliminated = eliminatedPlayers[pIdx];
          const width = isEliminated ? 0 : (totalOwned > 0 ? (cellsOwned / totalOwned) * 100 : (100 / playerCount));

          return (
            <div
              key={pIdx}
              className="h-full transition-all duration-300 ease-out relative group"
              style={{
                width: `${width}%`,
                backgroundColor: color,
              }}
            />
          );
        })}
      </div>

      {/* Main Content Workspace Container */}
      <div className="flex-1 flex flex-col items-center justify-between p-6 overflow-hidden min-h-0 w-full relative">
        <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
          {/* Player Count Slider - Hidden once the first move is made */}
          {!firstMoveMade && (
            <div className="w-full max-w-xs flex flex-col gap-2 mb-4 bg-custom-input/40 border border-custom-border/60 p-4 rounded-2xl shadow-xs transition-all duration-300">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-extrabold uppercase text-custom-muted tracking-wider">Number of Players</span>
                <span className="text-xs font-black text-custom-accent bg-custom-card px-2.5 py-0.5 border border-custom-border/60 rounded-md">
                  {playerCount} Players
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="5"
                value={playerCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  handlePlayerCountChange(val);
                }}
                className="w-full h-1 bg-custom-border rounded-lg appearance-none cursor-pointer accent-custom-primary"
              />
            </div>
          )}

          {/* Middle Gameboard Area */}
          <div className="flex-1 w-full flex overflow-auto relative min-h-0 pt-8 pb-32">
            <div
              className="relative bg-custom-header border-2 border-custom-border rounded-3xl p-3.5 shadow-2xl flex flex-col justify-center select-none shrink-0 m-auto"
              style={{
                width: totalGridW + 32,
                height: totalGridH + 32,
                transition: dragType ? 'none' : 'all 0.15s ease-out',
              }}
            >
              {/* Sizing Preview Overlay during Resize dragging */}
              {dragType && (
                <div className="absolute inset-0 bg-custom-bg/70 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center z-30 animate-pulse border border-custom-accent/30 pointer-events-none">
                  <span className="text-2xl font-black text-custom-accent tracking-widest">{N} × {N}</span>
                  <span className="text-sm font-bold text-custom-text uppercase tracking-widest mt-1">Chain Reaction</span>
                </div>
              )}

              {/* Grid container */}
              <div
                className="grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${N}, ${cellSize}px)`,
                  gridTemplateRows: `repeat(${N}, ${cellSize}px)`,
                  gap: `${gap}px`,
                  width: `${totalGridW}px`,
                  height: `${totalGridH}px`,
                  pointerEvents: isAnimating ? 'none' : 'auto',
                }}
              >
                {board.map((row, r) =>
                  row.map((cell, c) => {
                    const isExploding = !!lastExploded[`${r},${c}`];
                    const isReceived = !!lastReceived[`${r},${c}`];
                    const animationClass = isExploding
                      ? 'animate-cell-explode'
                      : isReceived
                        ? 'animate-cell-bounce'
                        : '';

                    const canClick = !isAnimating && !isGameOver && (cell.playerOwner === null || cell.playerOwner === currentPlayer);

                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`relative flex items-center justify-center rounded-lg border-2 border-custom-border transition-all select-none duration-150 ${animationClass} ${canClick ? 'hover:border-custom-accent/60 hover:bg-custom-accent/5' : ''
                          }`}
                        style={{
                          width: `${cellSize}px`,
                          height: `${cellSize}px`,
                          backgroundColor: cell.playerOwner !== null ? getTintRGBA(playerColors[cell.playerOwner], 0.08) : 'var(--color-header)',
                          borderColor: cell.playerOwner !== null ? playerColors[cell.playerOwner] : 'var(--color-border)',
                          cursor: canClick ? 'pointer' : 'not-allowed',
                          boxShadow: cell.playerOwner !== null ? `inset 0 0 8px ${getTintRGBA(playerColors[cell.playerOwner], 0.12)}` : 'none',
                        }}
                        onClick={() => handleCellClick(r, c)}
                      >
                        {renderAtoms(cell.atomCount, cell.playerOwner !== null ? playerColors[cell.playerOwner] : '')}

                        {/* Exploding firework particle effect */}
                        {isExploding && (
                          <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible z-20">
                            {[...Array(8)].map((_, i) => {
                              const angle = (i * 360) / 8;
                              const delay = Math.random() * 40;
                              return (
                                <div
                                  key={i}
                                  className="animate-particle"
                                  style={{
                                    backgroundColor: playerColors[currentPlayer] || '#ff0055',
                                    '--angle': `${angle}deg`,
                                    '--delay': `${delay}ms`,
                                  } as any}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Sizing Drag Handle - Hidden once game starts/moves registered */}
              {!firstMoveMade && (
                <div
                  className="absolute w-9 h-9 cursor-nesw-resize flex items-center justify-center z-30 group"
                  style={{ top: '-18px', right: '-18px' }}
                  onPointerDown={startDrag}
                  onPointerMove={onDrag}
                  onPointerUp={endDrag}
                >
                  <div className="w-7 h-7 bg-custom-card border border-custom-border group-hover:border-custom-accent rounded-full shadow-md flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg animate-pulse-handle hover:animate-none">
                    <svg className="w-3.5 h-3.5 text-custom-muted group-hover:text-custom-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h12v12M4 20L20 4" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Floating Turn Indicator / Game Over Overlay */}
        {winner === null ? (
          <div
            className="absolute bg-custom-card/85 backdrop-blur-xs rounded-full border transition-all select-none z-40 flex items-center gap-2.5 px-5 py-2.5"
            style={{
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              borderColor: playerColors[currentPlayer],
              boxShadow: `0 8px 24px rgba(0, 0, 0, 0.4), 0 0 16px ${playerColors[currentPlayer]}25`,
            }}
          >
            <div
              className="w-3.5 h-3.5 rounded-full border border-white/10 animate-pulse"
              style={{
                backgroundColor: playerColors[currentPlayer],
              }}
            />
            <span
              className="text-xs font-black uppercase tracking-wider"
              style={{ color: playerColors[currentPlayer] }}
            >
              <span>Player {currentPlayer + 1}</span>'s Turn
            </span>
          </div>
        ) : (
          <div
            className="absolute inset-0 bg-custom-bg/40 backdrop-blur-xs rounded-3xl flex items-center justify-center z-50 p-6"
            style={{ pointerEvents: 'auto' }}
          >
            <div className="w-full max-w-sm flex flex-col items-center gap-3 bg-custom-card border border-custom-border/80 p-6 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="text-center">
                <h4
                  className="text-lg font-black uppercase tracking-wider flex items-center justify-center gap-2"
                  style={{ color: playerColors[winner] }}
                >
                  <Trophy className="h-5 w-5 animate-bounce" style={{ color: playerColors[winner] }} />
                  Player {winner + 1} Wins!
                </h4>
                <p className="text-xs text-custom-muted mt-1">
                  Successfully dominated the entire board!
                </p>
              </div>
              <button
                onClick={handleReset}
                className="w-full py-2.5 bg-custom-primary hover:bg-custom-primary-hover text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 select-none mt-2"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
