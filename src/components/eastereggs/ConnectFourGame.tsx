import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Trophy, RotateCcw, HelpCircle } from 'lucide-react';
import { getPlayerColors } from '../shared/colorUtils';
import { triggerConfetti } from '../shared/confettiUtils';

interface GameProps {
  cachedState: any;
  onSaveCache: (state: any) => void;
  onClose: () => void;
}

export const ConnectFourGame: React.FC<GameProps> = ({
  cachedState,
  onSaveCache,
}) => {
  // 1. Grid Sizing State
  const [cols, setCols] = useState<number>(() => cachedState?.cols ?? 7);
  const [rows, setRows] = useState<number>(() => cachedState?.rows ?? 6);

  // 2. Game State
  const [board, setBoard] = useState<(number | null)[][]>(() =>
    cachedState?.board ?? Array.from({ length: 6 }, () => Array(7).fill(null))
  );
  const [currentPlayer, setCurrentPlayer] = useState<number>(() => cachedState?.currentPlayer ?? 1);
  const [winner, setWinner] = useState<number | 'tie' | null>(() => cachedState?.winner ?? null);
  const [winningLine, setWinningLine] = useState<[number, number][] | null>(() => cachedState?.winningLine ?? null);
  const [isGameStarted, setIsGameStarted] = useState<boolean>(() => cachedState?.isGameStarted ?? false);

  // 3. Hover & Slot Highlight State
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  // Helper to get landing row for a column
  const getTargetRow = (colIdx: number) => {
    for (let r = rows - 1; r >= 0; r--) {
      if (board[r] && board[r][colIdx] === null) {
        return r;
      }
    }
    return -1;
  };

  // 4. Resizing Drag State
  const [dragType, setDragType] = useState<'top' | 'right' | 'topRight' | null>(null);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    cols: number;
    rows: number;
    width: number;
    height: number;
    cellSize: number;
  } | null>(null);

  // 5. Layout Sizing & Constraints
  const gap = 2;
  const cellSize = 36;
  const gridW = cols * cellSize;
  const gridH = rows * cellSize;
  const totalGridW = gridW + (cols - 1) * gap;
  const totalGridH = gridH + (rows - 1) * gap;

  // 6. Custom Theme Colors
  const playerColors = getPlayerColors(2);

  // 5. Calculate Game Win Condition and Title
  const getGameDetails = (c: number, r: number) => {
    const minDim = Math.min(c, r);
    const maxDim = Math.max(c, r);

    let K = 4;
    let title = "Connect 4";

    if (maxDim <= 6) {
      K = 3;
      title = "Connect 3";
    } else if (maxDim <= 10) {
      K = 4;
      title = "Connect 4";
    } else if (maxDim <= 14) {
      K = 5;
      title = "Connect 5";
    } else if (maxDim <= 19) {
      K = 6;
      title = "Connect 6";
    } else {
      K = 7;
      title = "Connect 7";
    }

    if (K > minDim) {
      K = minDim;
      title = `Connect ${K}`;
    }

    return { K, title };
  };

  const { K, title: gameTitle } = getGameDetails(cols, rows);

  // Save state cache whenever state changes
  const saveCacheRef = useRef(onSaveCache);
  useEffect(() => {
    saveCacheRef.current = onSaveCache;
  }, [onSaveCache]);

  useEffect(() => {
    saveCacheRef.current({
      cols,
      rows,
      board,
      currentPlayer,
      winner,
      winningLine,
      isGameStarted
    });
  }, [cols, rows, board, currentPlayer, winner, winningLine, isGameStarted]);

  // Adjust board array size when dimensions update during setup
  useEffect(() => {
    if (!isGameStarted) {
      setBoard(Array.from({ length: rows }, () => Array(cols).fill(null)));
    }
  }, [cols, rows, isGameStarted]);

  // Gravity animations & move triggers
  const handleColumnClick = (colIdx: number) => {
    if (winner || dragType) return;

    // Find lowest empty slot in column
    let targetRow = -1;
    for (let r = rows - 1; r >= 0; r--) {
      if (board[r][colIdx] === null) {
        targetRow = r;
        break;
      }
    }

    if (targetRow === -1) return; // Column is full

    // Lock board sizing
    if (!isGameStarted) {
      setIsGameStarted(true);
    }

    const nextBoard = board.map(r => [...r]);
    nextBoard[targetRow][colIdx] = currentPlayer;
    setBoard(nextBoard);

    // Check for win/tie
    const winCells = getWinningCells(nextBoard, targetRow, colIdx, currentPlayer, K);
    if (winCells) {
      setWinner(currentPlayer);
      setWinningLine(winCells);
      triggerConfetti();
    } else if (checkTie(nextBoard)) {
      setWinner('tie');
    } else {
      // Toggle player
      setCurrentPlayer(currentPlayer === 1 ? 2 : 1);
    }
  };

  const getWinningCells = (grid: (number | null)[][], r: number, c: number, player: number, targetCount: number): [number, number][] | null => {
    const R = grid.length;
    const C = grid[0].length;

    const directions = [
      [0, 1],   // horizontal
      [1, 0],   // vertical
      [1, 1],   // diagonal down-right
      [1, -1],  // diagonal down-left
    ];

    for (const [dr, dc] of directions) {
      const cells: [number, number][] = [[r, c]];

      // Positive step
      let nr = r + dr;
      let nc = c + dc;
      while (nr >= 0 && nr < R && nc >= 0 && nc < C && grid[nr][nc] === player) {
        cells.push([nr, nc]);
        nr += dr;
        nc += dc;
      }

      // Negative step
      nr = r - dr;
      nc = c - dc;
      while (nr >= 0 && nr < R && nc >= 0 && nc < C && grid[nr][nc] === player) {
        cells.push([nr, nc]);
        nr -= dr;
        nc -= dc;
      }

      if (cells.length >= targetCount) {
        return cells;
      }
    }
    return null;
  };

  const checkTie = (grid: (number | null)[][]): boolean => {
    return grid[0].every(cell => cell !== null);
  };

  // 7. Resizing Mouse/Pointer Handlers
  const startDrag = (e: React.PointerEvent, type: 'top' | 'right' | 'topRight') => {
    if (isGameStarted) return;
    e.preventDefault();
    setDragType(type);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      cols,
      rows,
      width: totalGridW + 32,
      height: totalGridH + 32,
      cellSize
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDrag = (e: React.PointerEvent) => {
    if (!dragType || !dragStartRef.current) return;
    e.preventDefault();
    const start = dragStartRef.current;
    const deltaX = e.clientX - start.x;
    const deltaY = e.clientY - start.y;

    const dragStep = cellSize + gap;

    if (dragType === 'right' || dragType === 'topRight') {
      const changeCols = Math.round(deltaX / dragStep);
      const targetCols = Math.max(5, Math.min(20, start.cols + changeCols));
      setCols(targetCols);
    }
    if (dragType === 'top' || dragType === 'topRight') {
      const changeRows = Math.round(-deltaY / dragStep);
      const targetRows = Math.max(4, Math.min(27, start.rows + changeRows));
      setRows(targetRows);
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

  const handleReset = () => {
    setBoard(Array.from({ length: rows }, () => Array(cols).fill(null)));
    setCurrentPlayer(1);
    setWinner(null);
    setWinningLine(null);
    setIsGameStarted(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative select-none bg-custom-card overflow-hidden font-sans">
      <style>{`
        @keyframes connect4-drop {
          0% { transform: translateY(var(--drop-start, -500px)); }
          60% { transform: translateY(0); }
          85% { transform: translateY(-8px); }
          100% { transform: translateY(0); }
        }
        .animate-connect4-drop {
          animation: connect4-drop 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        @keyframes pulse-gold {
          0%, 100% { 
            box-shadow: 0 0 10px #fbbf24, inset 0 0 10px #fbbf24;
            transform: scale(1);
            border-color: #fbbf24;
          }
          50% { 
            box-shadow: 0 0 25px #fbbf24, inset 0 0 15px #fbbf24;
            transform: scale(1.08);
            border-color: #fbbf24;
          }
        }
        .animate-pulse-gold {
          animation: pulse-gold 1.5s infinite ease-in-out;
          z-index: 10;
        }
        @keyframes pulse-handle {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.03); }
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
            <span>{gameTitle}</span>
            <span className="text-xs px-2.5 py-1 bg-custom-input border border-custom-border/60 rounded-lg text-custom-accent font-black tracking-normal normal-case font-mono">
              {cols} × {rows}
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-3">
          {isGameStarted && (
            <button
              onClick={handleReset}
              className="px-3.5 py-1.5 bg-custom-input hover:bg-custom-primary/20 text-custom-text border border-custom-border rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
              title="Reset Game"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Content Workspace Container */}
      <div className="flex-1 flex flex-col items-center justify-between p-6 overflow-hidden min-h-0 w-full">

        {/* Middle Gameboard Area */}
        <div className="flex-1 w-full flex overflow-auto relative min-h-0 pt-16 pb-4">

          {/* Dynamic Board Container */}
          <div
            className="relative bg-custom-header border-2 border-custom-border rounded-3xl p-3.5 shadow-2xl flex flex-col justify-end select-none shrink-0 m-auto"
            style={{
              width: totalGridW + 32, // grid + padding (14px * 2) + border (2px * 2)
              height: totalGridH + 32, // grid + padding (14px * 2) + border (2px * 2)
              transition: dragType ? 'none' : 'all 0.15s ease-out'
            }}
          >
            {/* Sizing Preview Overlay during Resize dragging */}
            {dragType && (
              <div className="absolute inset-0 bg-custom-bg/70 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center z-30 animate-pulse border border-custom-accent/30 pointer-events-none">
                <span className="text-2xl font-black text-custom-accent tracking-widest">{cols} × {rows}</span>
                <span className="text-sm font-bold text-custom-text uppercase tracking-widest mt-1">Connect {K}</span>
              </div>
            )}

            {/* Slide Track for the preview piece */}
            {!winner && hoveredCol !== null && !dragType && (
              <div
                className="absolute border-b-2 border-dashed border-custom-border/40 pointer-events-none transition-all duration-150 ease-out"
                style={{
                  top: -cellSize / 2 - 10,
                  left: 14 + cellSize / 2,
                  width: totalGridW - cellSize,
                  height: 2,
                  zIndex: 5
                }}
              />
            )}

            {/* Hover Preview Piece above the board */}
            {!winner && hoveredCol !== null && !dragType && (
              <div
                className="absolute pointer-events-none transition-all duration-150 ease-out"
                style={{
                  top: -cellSize - 10,
                  left: 14 + hoveredCol * (cellSize + gap),
                  width: cellSize,
                  height: cellSize,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 30
                }}
              >
                {/* Floating Preview Piece */}
                <div
                  className="w-[82%] h-[82%] rounded-full border border-white/10 flex items-center justify-center animate-bounce"
                  style={{
                    backgroundColor: currentPlayer === 1 ? playerColors[0] : playerColors[1],
                    boxShadow: `inset 0 2px 4px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.25), 0 0 8px ${currentPlayer === 1 ? playerColors[0] : playerColors[1]}60`,
                    animationDuration: '1.5s',
                  }}
                >
                  <div className="w-[80%] h-[80%] rounded-full border border-white/5 bg-gradient-to-tr from-black/20 via-transparent to-white/10" />
                </div>
              </div>
            )}

            {/* Column Hover Highlight */}
            {hoveredCol !== null && !winner && !dragType && (
              <div
                className="absolute bg-custom-accent/5 rounded-2xl pointer-events-none transition-all duration-150 ease-out"
                style={{
                  top: 14,
                  left: 14 + hoveredCol * (cellSize + gap),
                  width: cellSize,
                  height: totalGridH,
                  zIndex: 1
                }}
              />
            )}

            {/* Connect 4 Cells Grid */}
            <div
              className="grid select-none relative animate-in fade-in zoom-in-95 duration-200"
              onMouseLeave={() => {
                setHoveredCol(null);
                setHoveredRow(null);
              }}
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                width: totalGridW,
                height: totalGridH,
                gap: `${gap}px`
              }}
            >
              {board.map((row, rIdx) =>
                row.map((val, cIdx) => {
                  const isWinning = winningLine?.some(([r, c]) => r === rIdx && c === cIdx);
                  const targetRow = getTargetRow(cIdx);
                  const isHovered = hoveredCol === cIdx && hoveredRow === rIdx;

                  return (
                    <div
                      key={`${rIdx}-${cIdx}`}
                      onClick={() => handleColumnClick(cIdx)}
                      onPointerEnter={() => {
                        setHoveredCol(cIdx);
                        setHoveredRow(rIdx);
                      }}
                      className="relative cursor-pointer flex items-center justify-center"
                      style={{ width: cellSize, height: cellSize }}
                    >
                      {/* Front Plate Cover (Simulates piece behind board) */}
                      <div
                        className="absolute -inset-[1.5px] z-20 pointer-events-none"
                        style={{
                          background: `radial-gradient(circle at center, transparent 15.5px, var(--color-header) 16px)`,
                        }}
                      />

                      {/* Front Winning Glow Overlay (Pulsing ring in front of the board) */}
                      {isWinning && (
                        <div
                          className="absolute w-[86%] h-[86%] rounded-full z-30 pointer-events-none animate-pulse-gold"
                          style={{
                            borderWidth: '2.5px',
                            borderStyle: 'solid',
                          }}
                        />
                      )}

                      {/* Background Recessed Slot Ring */}
                      <div
                        className={`absolute w-[86%] h-[86%] rounded-full bg-black/15 border border-custom-border flex items-center justify-center z-0 transition-all duration-200 ${isHovered ? 'border-custom-accent/50 bg-black/10 scale-[1.06]' : ''
                          }`}
                        style={{
                          boxShadow: isHovered
                            ? '0 0 8px rgba(251, 191, 36, 0.2), inset 0 2px 4px rgba(0,0,0,0.2)'
                            : 'inset 0 2px 4px rgba(0,0,0,0.15)'
                        }}
                      >
                        <div className="w-[35%] h-[35%] rounded-full bg-black/10" />
                      </div>

                      {/* Ghost Preview Chip */}
                      {cIdx === hoveredCol && rIdx === targetRow && val === null && !winner && !dragType && (
                        <div
                          className="absolute w-[82%] h-[82%] rounded-full opacity-40 border border-dashed border-white/40 z-10 flex items-center justify-center animate-pulse"
                          style={{
                            backgroundColor: currentPlayer === 1 ? playerColors[0] : playerColors[1],
                          }}
                        >
                          <div className="w-[80%] h-[80%] rounded-full bg-gradient-to-tr from-black/10 via-transparent to-white/5" />
                        </div>
                      )}

                      {/* Dropped Chip */}
                      {val !== null && (
                        <div
                          className={`absolute w-[82%] h-[82%] rounded-full border border-white/10 z-10 flex items-center justify-center animate-connect4-drop ${isWinning ? 'animate-pulse-gold' : ''
                            }`}
                          style={{
                            backgroundColor: val === 1 ? playerColors[0] : playerColors[1],
                            boxShadow: `inset 0 2px 4px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.25)`,
                            ['--drop-start' as any]: `${-rIdx * (cellSize + gap) - cellSize - 24}px`
                          }}
                        >
                          {/* Interior shine decoration */}
                          <div className="w-[80%] h-[80%] rounded-full border border-white/5 bg-gradient-to-tr from-black/20 via-transparent to-white/10" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Sizing Drag Handles - Hidden once game starts */}
            {!isGameStarted && (
              <>
                {/* Top resize bar */}
                <div
                  className="absolute left-10 right-10 h-7 cursor-row-resize flex items-center justify-center z-20 group"
                  style={{ top: '-18px' }}
                  onPointerDown={(e) => startDrag(e, 'top')}
                  onPointerMove={onDrag}
                  onPointerUp={endDrag}
                >
                  <div className="px-3 py-1 bg-custom-card border border-custom-border group-hover:border-custom-accent rounded-full shadow-md flex items-center justify-center gap-1 transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg animate-pulse-handle hover:animate-none">
                    <div className="w-1.5 h-1.5 rounded-full bg-custom-muted group-hover:bg-custom-accent" />
                    <div className="w-1.5 h-1.5 rounded-full bg-custom-muted group-hover:bg-custom-accent" />
                    <div className="w-1.5 h-1.5 rounded-full bg-custom-muted group-hover:bg-custom-accent" />
                  </div>
                </div>

                {/* Right resize bar */}
                <div
                  className="absolute top-10 bottom-10 w-7 cursor-col-resize flex items-center justify-center z-20 group"
                  style={{ right: '-18px' }}
                  onPointerDown={(e) => startDrag(e, 'right')}
                  onPointerMove={onDrag}
                  onPointerUp={endDrag}
                >
                  <div className="py-3 px-1 bg-custom-card border border-custom-border group-hover:border-custom-accent rounded-full shadow-md flex flex-col items-center justify-center gap-1 transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg animate-pulse-handle hover:animate-none">
                    <div className="w-1.5 h-1.5 rounded-full bg-custom-muted group-hover:bg-custom-accent" />
                    <div className="w-1.5 h-1.5 rounded-full bg-custom-muted group-hover:bg-custom-accent" />
                    <div className="w-1.5 h-1.5 rounded-full bg-custom-muted group-hover:bg-custom-accent" />
                  </div>
                </div>

                {/* Top-Right resize corner indicator */}
                <div
                  className="absolute w-9 h-9 cursor-nesw-resize flex items-center justify-center z-30 group"
                  style={{ top: '-18px', right: '-18px' }}
                  onPointerDown={(e) => startDrag(e, 'topRight')}
                  onPointerMove={onDrag}
                  onPointerUp={endDrag}
                >
                  <div className="w-7 h-7 bg-custom-card border border-custom-border group-hover:border-custom-accent rounded-full shadow-md flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg animate-pulse-handle hover:animate-none">
                    <svg className="w-3.5 h-3.5 text-custom-muted group-hover:text-custom-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h12v12M4 20L20 4" />
                    </svg>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bottom Panel Status & Messages */}
        <div className="w-full flex flex-col items-center justify-center shrink-0 mt-2 select-text">
          {winner === null ? (
            <div className="flex items-center gap-4 bg-custom-input/40 px-5 py-2.5 rounded-2xl border border-custom-border shadow-xs">
              <span className="text-xs font-extrabold uppercase text-custom-muted tracking-wider">Turn:</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-3.5 h-3.5 rounded-full shadow-inner animate-pulse"
                  style={{ backgroundColor: currentPlayer === 1 ? playerColors[0] : playerColors[1] }}
                />
                <span className="text-sm font-black text-custom-text">
                  {currentPlayer === 1 ? 'Player 1' : 'Player 2'}
                </span>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-sm flex flex-col items-center gap-3 bg-custom-primary/10 border border-custom-primary/30 p-4 rounded-2xl shadow-xl animate-in zoom-in-95 duration-200">
              {winner === 'tie' ? (
                <div className="text-center">
                  <h4 className="text-lg font-black text-custom-text uppercase tracking-wider flex items-center justify-center gap-2">
                    <HelpCircle className="h-5 w-5 text-custom-accent" /> It's a Tie!
                  </h4>
                  <p className="text-xs text-custom-muted mt-0.5">The board has filled up completely without a winner.</p>
                </div>
              ) : (
                <div className="text-center">
                  <h4
                    className="text-lg font-black uppercase tracking-wider flex items-center justify-center gap-2"
                    style={{ color: winner === 1 ? playerColors[0] : playerColors[1] }}
                  >
                    <Trophy
                      className="h-5 w-5 animate-bounce"
                      style={{ color: winner === 1 ? playerColors[0] : playerColors[1] }}
                    /> Player {winner} Wins!
                  </h4>
                  <p className="text-xs text-custom-muted mt-0.5 select-none">
                    Successfully connected {K} matching pieces!
                  </p>
                </div>
              )}

              <button
                onClick={handleReset}
                className="w-full py-2.5 bg-custom-primary hover:bg-custom-primary-hover text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 select-none"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
