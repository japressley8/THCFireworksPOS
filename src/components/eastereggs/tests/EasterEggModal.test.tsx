import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EasterEggModal } from '../EasterEggModal';

// Mock the nested game components to keep the modal unit test isolated and fast
vi.mock('../SolitaireGame', () => ({
  SolitaireGame: () => <div data-testid="solitaire-game">Mocked Solitaire Game</div>
}));

vi.mock('../ConnectFourGame', () => ({
  ConnectFourGame: () => <div data-testid="connectfour-game">Mocked Connect Four Game</div>
}));

vi.mock('../TrithelloGame', () => ({
  TrithelloGame: () => <div data-testid="trithello-game">Mocked Trithello Game</div>
}));

vi.mock('../HexCommandGame', () => ({
  HexCommandGame: () => <div data-testid="hexcommand-game">Mocked Hex Command Game</div>
}));

vi.mock('../ChainReactionGame', () => ({
  ChainReactionGame: () => <div data-testid="chainreaction-game">Mocked Chain Reaction Game</div>
}));

vi.mock('../TrigonGame', () => ({
  TrigonGame: () => <div data-testid="trigon-game">Mocked Trigon Game</div>
}));

describe('EasterEggModal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    cachedStates: {},
    onSaveCache: vi.fn(),
  };

  const RealDate = globalThis.Date;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.Date = RealDate;
    vi.restoreAllMocks();
  });

  const mockYear = (year: number) => {
    const mockDate = new RealDate(`${year}-07-14T12:00:00Z`);
    // Mock the global Date constructor
    // @ts-ignore
    globalThis.Date = class extends RealDate {
      constructor() {
        super();
        return mockDate;
      }
      static now() {
        return mockDate.getTime();
      }
    };
  };

  it('renders nothing when isOpen is false', () => {
    render(<EasterEggModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('THC Game Vault')).not.toBeInTheDocument();
  });

  it('renders modal and title when isOpen is true', () => {
    mockYear(2026);
    render(<EasterEggModal {...defaultProps} />);
    expect(screen.getByText('THC Game Vault')).toBeInTheDocument();
    // Default active game for 2026 should be Solitaire
    expect(screen.getByTestId('solitaire-game')).toBeInTheDocument();
  });

  it('does not display tab buttons if only one game is available in the current year', () => {
    mockYear(2026); // only 2026 game is visible
    render(<EasterEggModal {...defaultProps} />);
    expect(screen.queryByText('2026')).not.toBeInTheDocument();
    expect(screen.queryByText('2027')).not.toBeInTheDocument();
  });

  it('displays tab buttons for all visible games up to the current year', () => {
    mockYear(2031); // 2026, 2027, 2028, 2029, 2030, 2031 are all visible
    render(<EasterEggModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: '2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2027' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2028' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2029' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2030' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2031' })).toBeInTheDocument();
  });

  it('switches active game when a year tab button is clicked', () => {
    mockYear(2031);
    render(<EasterEggModal {...defaultProps} />);

    // Default to the latest visible year (2031: Trigon)
    expect(screen.getByTestId('trigon-game')).toBeInTheDocument();

    // Click 2026 tab
    fireEvent.click(screen.getByRole('button', { name: '2026' }));
    expect(screen.getByTestId('solitaire-game')).toBeInTheDocument();
    expect(screen.queryByTestId('trigon-game')).not.toBeInTheDocument();

    // Click 2028 tab
    fireEvent.click(screen.getByRole('button', { name: '2028' }));
    expect(screen.getByTestId('trithello-game')).toBeInTheDocument();

    // Click 2029 tab
    fireEvent.click(screen.getByRole('button', { name: '2029' }));
    expect(screen.getByTestId('hexcommand-game')).toBeInTheDocument();
  });

  it('triggers onClose when close button is clicked', () => {
    mockYear(2026);
    render(<EasterEggModal {...defaultProps} />);
    const closeBtn = screen.getByTitle('Close');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onClose when Escape key is pressed', () => {
    mockYear(2026);
    render(<EasterEggModal {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
