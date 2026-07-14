import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  TrithelloGame, 
  getHexGridCoords, 
  isCoordinateOnBoard, 
  getHexDistance, 
  getFlippedPiecesTrithello, 
  getFlippedPiecesOthello 
} from '../TrithelloGame';

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('Trithello Coordinate Helpers', () => {
  it('generates exactly 61 hex coordinates for radius 4 grid', () => {
    const coords = getHexGridCoords();
    expect(coords.length).toBe(61);
  });

  it('correctly maps coordinates within radius 4 boundary', () => {
    expect(isCoordinateOnBoard(0, 0)).toBe(true);
    expect(isCoordinateOnBoard(4, 0)).toBe(true);
    expect(isCoordinateOnBoard(0, -4)).toBe(true);
    expect(isCoordinateOnBoard(2, 2)).toBe(true);
    
    // Outside boundary
    expect(isCoordinateOnBoard(5, 0)).toBe(false);
    expect(isCoordinateOnBoard(0, -5)).toBe(false);
    expect(isCoordinateOnBoard(3, 2)).toBe(false); // s = -5
  });

  it('calculates hexagonal distances between coordinates correctly', () => {
    // Distance from center to center is 0
    expect(getHexDistance(0, 0, 0, 0)).toBe(0);
    // Neighbors are at distance 1
    expect(getHexDistance(0, 0, 1, 0)).toBe(1);
    expect(getHexDistance(0, 0, 0, 1)).toBe(1);
    expect(getHexDistance(0, 0, 1, -1)).toBe(1);
    // Opposites in Ring 1 are at distance 2
    expect(getHexDistance(1, 0, -1, 0)).toBe(2);
    // General coordinate distances
    expect(getHexDistance(2, 0, -2, 2)).toBe(4);
    expect(getHexDistance(4, -4, -4, 4)).toBe(8);
  });
});

describe('Othello and Trithello Core Game Engine Rules', () => {
  describe('Othello Flipping Rules', () => {
    it('returns empty flips list for empty or invalid moves', () => {
      const board = Array.from({ length: 8 }, () => Array(8).fill(null));
      // Standard setup
      board[3][3] = 2;
      board[3][4] = 1;
      board[4][3] = 1;
      board[4][4] = 2;

      // Clicks on center cells should return empty since they are occupied
      expect(getFlippedPiecesOthello(board, 3, 3, 1)).toEqual([]);
      // Clicks on non-adjacent cells should return empty
      expect(getFlippedPiecesOthello(board, 0, 0, 1)).toEqual([]);
    });

    it('brackets and returns flipped elements for a valid classic Othello move', () => {
      const board = Array.from({ length: 8 }, () => Array(8).fill(null));
      board[3][3] = 2;
      board[3][4] = 1;
      board[4][3] = 1;
      board[4][4] = 2;

      // Player 1 plays at row 2, col 3 (above row 3, col 3 which is P2)
      // This should bracket row 3, col 3 and flip it
      const flips = getFlippedPiecesOthello(board, 2, 3, 1);
      expect(flips).toEqual([[3, 3]]);
    });
  });

  describe('Trithello Flipping Rules', () => {
    it('returns empty flips list for empty or invalid moves', () => {
      const board: Record<string, number> = {
        '1,0': 1,
        '0,1': 2,
        '-1,1': 3,
        '-1,0': 1,
        '0,-1': 2,
        '1,-1': 3,
      };

      // Occupied coordinates return empty
      expect(getFlippedPiecesTrithello(board, 1, 0, 1)).toEqual([]);
      // Center cell coordinate returns empty (always empty/blocked)
      expect(getFlippedPiecesTrithello(board, 0, 0, 1)).toEqual([]);
      // Isolated coordinates return empty
      expect(getFlippedPiecesTrithello(board, 4, -4, 1)).toEqual([]);
    });

    it('brackets and returns flipped coordinates in multiple hex directions', () => {
      // Start configuration: P1 at (1,0) and (-1,0), P2 at (0,1) and (0,-1)
      const board: Record<string, number> = {
        '1,0': 1,
        '0,1': 2,
        '-1,1': 3,
        '-1,0': 1,
        '0,-1': 2,
        '1,-1': 3,
      };

      // If Player 1 plays at (-1, 2) which is adjacent to P3 at (-1, 1) and P2 at (0, 1)
      // Let's verify line flips for P1 at (-1, 2):
      // Direction (0, -1) from (-1, 2) goes (-1, 1) [P3], (-1, 0) [P1]. 
      // This brackets P3 at (-1, 1), so it flips it!
      const flips = getFlippedPiecesTrithello(board, -1, 2, 1);
      expect(flips).toContain('-1,1');
    });
  });
});

describe('TrithelloGame UI Component', () => {
  const defaultProps = {
    cachedState: null,
    onSaveCache: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders Trithello mode by default and displays starting stats', () => {
    render(<TrithelloGame {...defaultProps} />);

    expect(document.querySelector('h3 span')?.textContent).toBe('Trithello');
    expect(screen.queryByText('2028 Easter Egg')).toBeNull();
    
    // Verify starting turn is displayed in the HUD
    expect(screen.getByText("Player 1's Turn")).toBeInTheDocument();
  });

  it('allows toggling between Othello and Trithello modes before gameplay starts', () => {
    render(<TrithelloGame {...defaultProps} />);

    // Swapping to Othello
    const btnOthello = document.querySelector('#toggle-othello');
    expect(btnOthello).toBeInTheDocument();
    
    fireEvent.click(btnOthello!);
    expect(document.querySelector('h3 span')?.textContent).toBe('Othello');

    // Swapping back to Trithello
    const btnTrithello = document.querySelector('#toggle-trithello');
    expect(btnTrithello).toBeInTheDocument();
    
    fireEvent.click(btnTrithello!);
    expect(document.querySelector('h3 span')?.textContent).toBe('Trithello');
  });

  it('handles moves and advances turns in Othello mode', () => {
    render(<TrithelloGame {...defaultProps} />);

    // Toggle to Othello mode
    const btnOthello = document.querySelector('#toggle-othello');
    fireEvent.click(btnOthello!);

    // Make first move at (2, 3)
    const targetCell = document.querySelector('#othello-cell-2-3');
    expect(targetCell).toBeInTheDocument();
    act(() => {
      fireEvent.click(targetCell!);
    });

    // Toggle should remain visible even during active game
    expect(document.querySelector('#toggle-othello')).toBeInTheDocument();

    // Staggered flipping runs. Advance fake timers to finish animation sequence.
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // Check that turn shifted to Player 2
    expect(defaultProps.onSaveCache).toHaveBeenCalled();
  });

  it('rescues Player 3 in center hex when they would be eliminated before making a move', () => {
    const cachedState = {
      mode: 'trithello',
      isGameStarted: true,
      staggerSpeed: 'normal',
      trithelloBoard: {
        '1,0': 1, // P1
        '0,1': 2, // P2
        '-1,1': 2, // P2
        '-1,0': 1, // P1
        '0,-1': 2, // P2
        '1,-1': 3, // P3 (Only piece left)
      },
      trithelloCurrentPlayer: 1,
      trithelloWinner: null,
      trithelloEliminated: [],
      trithelloMoveCounts: { 1: 1, 2: 1, 3: 0 } // Player 3 has not moved yet!
    };

    render(<TrithelloGame {...defaultProps} cachedState={cachedState} />);
    
    const targetCell = document.querySelector('#hex-cell-1\\,-2');
    expect(targetCell).toBeInTheDocument();

    act(() => {
      fireEvent.click(targetCell!);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Player 3 is rescued at center hex, NOT eliminated
    expect(defaultProps.onSaveCache).toHaveBeenCalledWith(
      expect.objectContaining({
        trithelloEliminated: [],
        trithelloBoard: expect.objectContaining({
          '0,0': 3
        })
      })
    );
  });

  it('eliminates Player 3 normally if they have already made a move', () => {
    const cachedState = {
      mode: 'trithello',
      isGameStarted: true,
      staggerSpeed: 'normal',
      trithelloBoard: {
        '1,0': 1, // P1
        '0,1': 2, // P2
        '-1,1': 2, // P2
        '-1,0': 1, // P1
        '0,-1': 2, // P2
        '1,-1': 3, // P3 (Only piece left)
      },
      trithelloCurrentPlayer: 1,
      trithelloWinner: null,
      trithelloEliminated: [],
      trithelloMoveCounts: { 1: 1, 2: 1, 3: 1 } // Player 3 has already moved!
    };

    render(<TrithelloGame {...defaultProps} cachedState={cachedState} />);
    
    const targetCell = document.querySelector('#hex-cell-1\\,-2');
    expect(targetCell).toBeInTheDocument();

    act(() => {
      fireEvent.click(targetCell!);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Player 3 is permanently eliminated
    expect(defaultProps.onSaveCache).toHaveBeenCalledWith(
      expect.objectContaining({
        trithelloEliminated: [3]
      })
    );
  });

  it('caches and restores both Othello and Trithello states in parallel', () => {
    const onSaveCacheMock = vi.fn();
    const { rerender } = render(<TrithelloGame {...defaultProps} onSaveCache={onSaveCacheMock} />);

    // 1. Switch to Othello and make a move
    const btnOthello = document.querySelector('#toggle-othello');
    fireEvent.click(btnOthello!);
    
    // Othello cell 2-3 click
    const othelloCell = document.querySelector('#othello-cell-2-3');
    fireEvent.click(othelloCell!);
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // Save cache callback should have been called with active Othello state
    expect(onSaveCacheMock).toHaveBeenCalled();
    const lastSavedState = onSaveCacheMock.mock.calls[onSaveCacheMock.mock.calls.length - 1][0];
    
    // The saved state must contain both othelloIsGameStarted: true and trithelloIsGameStarted: false
    expect(lastSavedState.othelloIsGameStarted).toBe(true);
    expect(lastSavedState.trithelloIsGameStarted).toBe(false);

    // 2. Switch to Trithello (which is fresh/not started yet)
    const btnTrithello = document.querySelector('#toggle-trithello');
    fireEvent.click(btnTrithello!);

    // In Trithello mode, isGameStarted should be false (since we haven't played Trithello yet)
    // and the Othello toggle should still be visible because we permit mid-game switching
    expect(document.querySelector('#toggle-othello')).toBeInTheDocument();

    // 3. Close and Reopen the game component with the last cachedState
    rerender(<TrithelloGame {...defaultProps} cachedState={lastSavedState} onSaveCache={onSaveCacheMock} />);
    
    // Toggle to Othello in reopened state to verify it is restored
    const btnOthelloReopened = document.querySelector('#toggle-othello');
    fireEvent.click(btnOthelloReopened!);
    expect(screen.getByText("Player 2's Turn")).toBeInTheDocument(); // Othello current player is now P2 (since P1 moved)
  });
});
