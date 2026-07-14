import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TrigonGame, rotateCell60, flipCellHorizontal, generateHexagonalBoard } from '../TrigonGame';

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
    expect(screen.getByText('Place or Eliminated!')).toBeInTheDocument();
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
    expect(screen.queryByText('Place or Eliminated!')).not.toBeInTheDocument();
  });
});
