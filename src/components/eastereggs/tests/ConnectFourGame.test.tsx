import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConnectFourGame } from '../ConnectFourGame';

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('ConnectFourGame Component', () => {
  const defaultProps = {
    cachedState: null,
    onSaveCache: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders standard setup board initially', () => {
    render(<ConnectFourGame {...defaultProps} />);

    // Default 7x6 title is Connect 4
    expect(screen.getByText('Connect 4')).toBeInTheDocument();
    expect(document.querySelector('.cursor-col-resize')).toBeInTheDocument();

    // Verify first player's turn is displayed
    expect(screen.getByText('Player 1')).toBeInTheDocument();
  });

  it('initializes from cachedState if provided', () => {
    const cachedState = {
      cols: 5,
      rows: 5,
      board: [
        [null, null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null],
        [1, 2, null, null, null]
      ],
      currentPlayer: 2,
      winner: null,
      winningLine: null,
      isGameStarted: true
    };

    render(<ConnectFourGame {...defaultProps} cachedState={cachedState} />);

    // 5x5 board maxDim <= 6 -> Connect 3
    expect(screen.getByText('Connect 3')).toBeInTheDocument();
    expect(screen.getByText('Player 2')).toBeInTheDocument();
    expect(document.querySelector('.cursor-col-resize')).toBeNull();
  });

  it('allows dropping a piece in a column and switching turns', () => {
    render(<ConnectFourGame {...defaultProps} />);

    // Get all cells. For a 7x6 board, there are 42 cells.
    const cells = document.querySelectorAll('.cursor-pointer');
    expect(cells.length).toBe(42);

    // Click the first column (cIdx = 0, which corresponds to indices 0, 7, 14, 21, 28, 35 in the row-major grid map)
    fireEvent.click(cells[0]);

    // Check that turn toggled to Player 2
    expect(screen.getByText('Player 2')).toBeInTheDocument();
    expect(defaultProps.onSaveCache).toHaveBeenCalled();
  });

  it('detects a vertical win condition', () => {
    render(<ConnectFourGame {...defaultProps} />);

    // Simulate vertical win for Player 1:
    // Drop in Col 0 (P1), Col 1 (P2), Col 0 (P1), Col 1 (P2), Col 0 (P1), Col 1 (P2), Col 0 (P1) -> P1 wins
    const cells = document.querySelectorAll('.cursor-pointer');

    // Click sequences
    fireEvent.click(cells[0]); // P1 Col 0 (Row 5)
    fireEvent.click(cells[1]); // P2 Col 1 (Row 5)
    fireEvent.click(cells[0]); // P1 Col 0 (Row 4)
    fireEvent.click(cells[1]); // P2 Col 1 (Row 4)
    fireEvent.click(cells[0]); // P1 Col 0 (Row 3)
    fireEvent.click(cells[1]); // P2 Col 1 (Row 3)
    fireEvent.click(cells[0]); // P1 Col 0 (Row 2) -> P1 wins!

    expect(screen.getByText('Player 1 Wins!')).toBeInTheDocument();
    expect(screen.getByText('Play Again')).toBeInTheDocument();
  });

  it('detects a horizontal win condition', () => {
    render(<ConnectFourGame {...defaultProps} />);

    // Simulate horizontal win for Player 1 (Col 0, 1, 2, 3)
    // Alternate drops to not trigger vertical wins first
    // P1: 0, P2: 0 (Col 0 has 2 pieces)
    // P1: 1, P2: 1 (Col 1 has 2 pieces)
    // P1: 2, P2: 2 (Col 2 has 2 pieces)
    // P1: 3 -> Win!
    const cells = document.querySelectorAll('.cursor-pointer');

    fireEvent.click(cells[0]); // P1 Col 0 (Row 5)
    fireEvent.click(cells[0]); // P2 Col 0 (Row 4)
    fireEvent.click(cells[1]); // P1 Col 1 (Row 5)
    fireEvent.click(cells[1]); // P2 Col 1 (Row 4)
    fireEvent.click(cells[2]); // P1 Col 2 (Row 5)
    fireEvent.click(cells[2]); // P2 Col 2 (Row 4)
    fireEvent.click(cells[3]); // P1 Col 3 (Row 5) -> P1 wins!

    expect(screen.getByText('Player 1 Wins!')).toBeInTheDocument();
  });

  it('detects a diagonal win condition (positive slope)', () => {
    render(<ConnectFourGame {...defaultProps} />);

    // Connect 4 (bottom-left to top-right diagonal)
    // P1: Col 0
    // P2: Col 1
    // P1: Col 1 (Row 4)
    // P2: Col 2
    // P1: Col 2 (Row 4)
    // P2: Col 2 (Row 3)
    // P1: Col 3 (Row 5)
    // P2: Col 3 (Row 4)
    // P1: Col 3 (Row 3)
    // P2: Col 4
    // P1: Col 3 (Row 2) - diagonal cell
    const cells = document.querySelectorAll('.cursor-pointer');

    fireEvent.click(cells[0]); // P1 Col 0 (Row 5) - base
    fireEvent.click(cells[1]); // P2 Col 1 (Row 5)
    fireEvent.click(cells[1]); // P1 Col 1 (Row 4) - diagonal
    fireEvent.click(cells[2]); // P2 Col 2 (Row 5)
    fireEvent.click(cells[2]); // P1 Col 2 (Row 4)
    fireEvent.click(cells[3]); // P2 Col 3 (Row 5)
    fireEvent.click(cells[2]); // P1 Col 2 (Row 3) - diagonal
    fireEvent.click(cells[3]); // P2 Col 3 (Row 4)
    fireEvent.click(cells[3]); // P1 Col 3 (Row 3)
    fireEvent.click(cells[5]); // P2 Col 5 (Row 5) - prevents horizontal P2 win in row 5
    fireEvent.click(cells[3]); // P1 Col 3 (Row 2) - diagonal win!

    expect(screen.getByText('Player 1 Wins!')).toBeInTheDocument();
  });

  it('clears board and unlocks resizing when Play Again is clicked', () => {
    render(<ConnectFourGame {...defaultProps} />);

    const cells = document.querySelectorAll('.cursor-pointer');
    fireEvent.click(cells[0]); // P1 Col 0 - Game starts, resizing handles hide

    // Drop pieces to win vertically
    fireEvent.click(cells[1]); // P2 Col 1
    fireEvent.click(cells[0]); // P1 Col 0
    fireEvent.click(cells[1]); // P2 Col 1
    fireEvent.click(cells[0]); // P1 Col 0
    fireEvent.click(cells[1]); // P2 Col 1
    fireEvent.click(cells[0]); // P1 Col 0 (Win)

    expect(screen.getByText('Player 1 Wins!')).toBeInTheDocument();

    const playAgainBtn = screen.getByText('Play Again');
    fireEvent.click(playAgainBtn);

    // Resizing description should be back
    expect(document.querySelector('.cursor-col-resize')).toBeInTheDocument();
  });
});
