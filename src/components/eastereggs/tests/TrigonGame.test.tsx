import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TrigonGame, rotateCell60, flipCellHorizontal, generateHexagonalBoard, getCellCentroid, getTriangleVertices } from '../TrigonGame';

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('Trigon Math and Utilities', () => {
  it('correctly rotates cell 60 degrees', () => {
    // Up cell (0, 0, 1) rotated 60 degrees should be Down cell (-1, 0, 0)
    const r1 = rotateCell60(0, 0, 1);
    expect(r1).toEqual({ q: -1, r: 0, up: 0 });

    // Down cell (-1, 0, 0) rotated 60 degrees should be Up cell (-1, 0, 1)
    const r2 = rotateCell60(-1, 0, 0);
    expect(r2).toEqual({ q: -1, r: 0, up: 1 });
  });

  it('correctly flips cell horizontally', () => {
    // Up cell (0, 0, 1) flipped horizontal: q = -q-r-1 = -1
    const f1 = flipCellHorizontal(0, 0, 1);
    expect(f1).toEqual({ q: -1, r: 0, up: 1 });

    // Down cell (0, 0, 0) flipped horizontal: q = -q-r-2 = -2
    const f2 = flipCellHorizontal(0, 0, 0);
    expect(f2).toEqual({ q: -2, r: 0, up: 0 });
  });

  it('generates the correct cell count for a given side length', () => {
    // Side length 2: 6 * 2^2 = 24 cells
    const b2 = generateHexagonalBoard(2);
    expect(b2.length).toBe(24);

    // Side length 3: 6 * 3^2 = 54 cells
    const b3 = generateHexagonalBoard(3);
    expect(b3.length).toBe(54);
  });
});

describe('TrigonGame Component', () => {
  const defaultProps = {
    cachedState: null,
    onSaveCache: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders gameboard by default', () => {
    render(<TrigonGame {...defaultProps} />);
    expect(screen.getByText('Trigon')).toBeInTheDocument();
    expect(screen.getByText('Number of Players')).toBeInTheDocument();
    expect(screen.getByText('Board Side Length')).toBeInTheDocument();
  });

  it('hides the player count and board size sliders when the first move is made', () => {
    const { unmount } = render(<TrigonGame {...defaultProps} />);

    // Sliders are visible
    expect(screen.getByText('Number of Players')).toBeInTheDocument();
    expect(screen.getByText('Board Side Length')).toBeInTheDocument();
    unmount();

    // Load cached state with first move made (boardOwners is not empty)
    const cachedState = {
      playerCount: 4,
      boardSize: 9,
      isGameStarted: true,
      currentPlayer: 0,
      boardOwners: { '0,0,1': 0 },
      playerInventories: { 0: ['shape_1_1'], 1: ['shape_1_1'], 2: ['shape_1_1'], 3: ['shape_1_1'] },
      skippedPlayers: [],
      winner: null,
    };
    render(<TrigonGame {...defaultProps} cachedState={cachedState} />);

    // Sliders should now disappear
    expect(screen.queryByText('Number of Players')).not.toBeInTheDocument();
    expect(screen.queryByText('Board Side Length')).not.toBeInTheDocument();
  });

  it('loads game state from cache', () => {
    const cachedState = {
      playerCount: 3,
      boardSize: 8,
      isGameStarted: true,
      currentPlayer: 1,
      boardOwners: { '0,0,1': 0 },
      playerInventories: { 0: [], 1: ['shape_1_1'], 2: [] },
      skippedPlayers: [],
      winner: null,
    };

    render(<TrigonGame {...defaultProps} cachedState={cachedState} />);
    expect(screen.getByText('Player 2')).toBeInTheDocument(); // Current turn index 1 (Player 2)
    expect(screen.getByText('Side: 8')).toBeInTheDocument();
  });

  it('displays Extra Pieces Mode badges when extraPiecesMode is active', () => {
    const cachedState = {
      playerCount: 2,
      boardSize: 6,
      isGameStarted: true,
      currentPlayer: 0,
      boardOwners: {},
      playerInventories: {
        0: ['shape_1_1'],
        1: []
      },
      skippedPlayers: [],
      winner: null,
      extraPiecesMode: true,
      extraPieceForRound: 'shape_1_1',
    };

    render(<TrigonGame {...defaultProps} cachedState={cachedState} />);
    expect(screen.getByText('Extra Pieces')).toBeInTheDocument();
    expect(screen.getByText('Place or Skipped!')).toBeInTheDocument();
  });

  it('resets extraPiecesMode on game reset', () => {
    const cachedState = {
      playerCount: 2,
      boardSize: 6,
      isGameStarted: true,
      currentPlayer: 0,
      boardOwners: {},
      playerInventories: {
        0: ['shape_1_1'],
        1: []
      },
      skippedPlayers: [],
      winner: null,
      extraPiecesMode: true,
      extraPieceForRound: 'shape_1_1',
    };

    render(<TrigonGame {...defaultProps} cachedState={cachedState} />);
    expect(screen.getByText('Extra Pieces')).toBeInTheDocument();

    const resetButton = screen.getByTitle('Reset Game');
    fireEvent.click(resetButton);

    expect(screen.queryByText('Extra Pieces')).not.toBeInTheDocument();
    expect(screen.queryByText('Place or Skipped!')).not.toBeInTheDocument();
  });

  it('correctly skips blocked players and ends the game when all players have no moves', () => {
    const boardCells = generateHexagonalBoard(6);
    const cellKeys = boardCells.map((c) => `${c.q},${c.r},${c.up}`);

    // Calculate corners matching the component
    const corners: string[] = [];
    const angles = [0, 60, 120, 180, 240, 300];

    angles.forEach((deg) => {
      const rad = (deg * Math.PI) / 180;
      const targetX = 6 * 30 * Math.cos(rad);
      const targetY = 6 * 30 * Math.sin(rad);
      let bestCell = '';
      let minDist = Infinity;
      cellKeys.forEach((k) => {
        const [q, r, up] = k.split(',').map(Number);
        const centroid = getCellCentroid(q, r, up, 20);
        const dist = Math.pow(centroid.x - targetX, 2) + Math.pow(centroid.y - targetY, 2);
        if (dist < minDist) {
          minDist = dist;
          bestCell = k;
        }
      });
      corners.push(bestCell);
    });

    const startCell0 = corners[0];
    const startCell1 = corners[3];

    // Helper to check if two cells share a corner (vertex) but not an edge
    const shareCornerOnly = (k1: string, k2: string): boolean => {
      const [q1, r1, up1] = k1.split(',').map(Number);
      const [q2, r2, up2] = k2.split(',').map(Number);
      const v1 = getTriangleVertices(q1, r1, up1);
      const v2 = getTriangleVertices(q2, r2, up2);
      const sharedCount = v1.filter((vk) => v2.includes(vk)).length;
      return sharedCount === 1; // exactly 1 shared vertex means corner sharing only
    };

    // Find an empty cell that has up === 1 (matching the piece anchor up parity),
    // doesn't conflict with the start corners, and shares only a corner with Player 0's start cell
    const emptyCellKey = cellKeys.find((k) => 
      k.endsWith(',1') && 
      k !== startCell0 && 
      k !== startCell1 && 
      k !== '-6,0,1' &&
      shareCornerOnly(k, startCell0)
    )!;

    // Player 0 owns their start cell, and also owns Player 1's starting cells (blocking Player 1 completely)
    const boardOwners: Record<string, number> = {
      [startCell0]: 0,
      [startCell1]: 0,
      '-6,0,1': 0,
    };

    const cachedState = {
      playerCount: 2,
      boardSize: 6,
      isGameStarted: true,
      currentPlayer: 0,
      boardOwners,
      playerInventories: {
        0: ['shape_1_1'],
        1: ['shape_1_1'],
      },
      skippedPlayers: [],
      winner: null,
    };

    // Calculate centroid of the empty cell to point the mock mouse click
    const [eq, er, eup] = emptyCellKey.split(',').map(Number);
    const targetCentroid = getCellCentroid(eq, er, eup, 26);

    // Mock SVGSVGElement properties
    SVGSVGElement.prototype.getScreenCTM = () => ({
      inverse: () => ({}),
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0
    } as any);
    SVGSVGElement.prototype.createSVGPoint = () => ({
      x: targetCentroid.x,
      y: targetCentroid.y,
      matrixTransform: function(_matrix: any) {
        return { x: this.x, y: this.y };
      }
    } as any);

    render(<TrigonGame {...defaultProps} cachedState={cachedState} />);

    // Click on Player 0's shape in the sidebar to hold it
    const shapesContainer = screen.getByText(/1 shapes/i).parentElement?.nextSibling;
    const shapeItem = shapesContainer?.firstChild;
    expect(shapeItem).toBeInTheDocument();
    
    act(() => {
      fireEvent.click(shapeItem!);
    });

    // Click on the board (the SVG element) to place the shape
    const svgBoard = document.querySelector('svg.w-full.h-full');
    expect(svgBoard).toBeInTheDocument();
    
    act(() => {
      fireEvent.click(svgBoard!, {
        clientX: targetCentroid.x,
        clientY: targetCentroid.y,
      });
    });

    // Player 1 has no moves, and Player 0 is out of pieces, so game over should trigger
    // Player 0 should be the winner because they placed all cells
    expect(screen.getByText(/wins with/i)).toBeInTheDocument();
  });
});
