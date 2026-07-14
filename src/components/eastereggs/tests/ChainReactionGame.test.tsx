import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  ChainReactionGame, 
  getCriticalMass, 
  createEmptyBoard 
} from '../ChainReactionGame';

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('Chain Reaction Game Coordinate Helpers', () => {
  it('correctly returns stability limits for corners, edges, and center cells', () => {
    // 8x8 Grid
    const N = 8;
    
    // Corners
    expect(getCriticalMass(0, 0, N)).toBe(2);
    expect(getCriticalMass(0, 7, N)).toBe(2);
    expect(getCriticalMass(7, 0, N)).toBe(2);
    expect(getCriticalMass(7, 7, N)).toBe(2);

    // Edges
    expect(getCriticalMass(0, 3, N)).toBe(3);
    expect(getCriticalMass(3, 0, N)).toBe(3);
    expect(getCriticalMass(7, 4, N)).toBe(3);
    expect(getCriticalMass(4, 7, N)).toBe(3);

    // Inland/Center
    expect(getCriticalMass(1, 1, N)).toBe(4);
    expect(getCriticalMass(3, 4, N)).toBe(4);
    expect(getCriticalMass(6, 5, N)).toBe(4);
  });

  it('correctly creates an empty board of size N', () => {
    const N = 6;
    const board = createEmptyBoard(N);
    expect(board.length).toBe(6);
    expect(board[0].length).toBe(6);
    expect(board[3][3]).toEqual({ atomCount: 0, playerOwner: null });
  });
});

describe('ChainReactionGame UI Component', () => {
  const defaultProps = {
    cachedState: null,
    onSaveCache: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the gameboard and configuration controls by default', () => {
    render(<ChainReactionGame {...defaultProps} />);
    
    expect(screen.queryAllByText('Chain Reaction').length).toBeGreaterThan(0);
    expect(screen.getByText('Number of Players')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    
    // Default board should be 8x8
    const cells = document.querySelectorAll('.grid > div');
    expect(cells.length).toBe(64);
  });

  it('hides the player count slider when the first move is made', () => {
    render(<ChainReactionGame {...defaultProps} />);
    
    // Slider is initially visible
    expect(screen.getByText('Number of Players')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();

    const cells = document.querySelectorAll('.grid > div');
    // Make the first move on cell 0
    fireEvent.click(cells[0]);

    // The slider and player selection container should now disappear
    expect(screen.queryByText('Number of Players')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('allows clicking cells, updates ownership and processes turns', () => {
    render(<ChainReactionGame {...defaultProps} />);

    // By default, board is 8x8. We should find cell containers.
    // The player colors are resolved and Player 1 is the active player.
    // Let's click on cell (0, 0).
    const cells = document.querySelectorAll('.grid > div');
    expect(cells.length).toBe(64); // 8x8 grid = 64 cells

    // Click cell at index 0 (row 0, col 0)
    fireEvent.click(cells[0]);

    // Check that player 1 has a cell now and the current turn changes to Player 2
    expect(screen.queryAllByText('Player 2').length).toBeGreaterThan(0);
    
    // Clicking on cell 0 again should block Player 2 since Player 1 owns it
    fireEvent.click(cells[0]);
    // The active turn should still be Player 2 because cell 0 was blocked
    expect(screen.queryAllByText('Player 2').length).toBeGreaterThan(0);
  });

  it('runs cascade explosion and captures neighboring cells', async () => {
    vi.useFakeTimers();
    render(<ChainReactionGame {...defaultProps} />);

    const cells = document.querySelectorAll('.grid > div');
    
    // Corner critical mass is 2.
    // Player 1 places 1st atom in (0, 0) (index 0)
    fireEvent.click(cells[0]); // Player 1's turn -> Player 2's turn
    
    // Player 2 places in (0, 1) (index 1)
    fireEvent.click(cells[1]); // Player 2's turn -> Player 3's turn
    
    // Player 3 places in (1, 0) (index 8)
    fireEvent.click(cells[8]); // Player 3's turn -> Player 1's turn
    
    // Player 1 places 2nd atom in (0, 0) (index 0). Corner capacity is 2, so it should explode!
    fireEvent.click(cells[0]);

    // The cascade loop starts asynchronously.
    // In the first tick:
    // (0, 0) explodes: count becomes 0, ownership nullified.
    // Neighbors (0, 1) and (1, 0) receive +1 atom and change ownership to Player 1.
    // Let's run pending timers for the sequential timeout pause (135ms)
    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    // If (0, 1) had 1 atom (owned by Player 2), it now has 2 atoms. Edge capacity is 3, so it does not explode yet.
    // If (1, 0) had 1 atom (owned by Player 3), it now has 2 atoms. Edge capacity is 3, so it does not explode yet.
    // Verify player 1 has captured these cells and won the game since all others are eliminated.
    expect(screen.getByText('Player 1 Wins!')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('restores state from cachedState if provided', () => {
    const N = 6;
    const board = createEmptyBoard(N);
    // Player 1 owns a cell
    board[0][0] = { atomCount: 1, playerOwner: 0 };
    
    const cachedState = {
      N,
      playerCount: 4,
      activeGame: true,
      currentPlayer: 1, // Player 2
      board,
      eliminatedPlayers: [false, false, false, false],
      turnsTaken: [1, 0, 0, 0],
      isGameOver: false,
      winner: null,
    };

    render(<ChainReactionGame {...defaultProps} cachedState={cachedState} />);
    
    expect(screen.queryAllByText('Player 2').length).toBeGreaterThan(0);
    expect(screen.getByText('6 × 6')).toBeInTheDocument();
    
    // There should be 36 cells
    const cells = document.querySelectorAll('.grid > div');
    expect(cells.length).toBe(36);
  });
});
