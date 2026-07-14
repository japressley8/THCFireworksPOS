import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HexCommandGame, generateMap, distributeClumped, LobbyConfig } from '../HexCommandGame';

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
  triggerConfetti: vi.fn(),
}));

// Mock ResizeObserver for jsdom test environment
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver;

describe('HexCommandGame Component', () => {
  const defaultProps = {
    cachedState: null,
    onSaveCache: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    (window as any).TEST_HOOKS = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete (window as any).TEST_HOOKS;
  });

  it('renders lobby screen initially with start game controls', () => {
    render(<HexCommandGame {...defaultProps} />);
    expect(screen.getByText('Hex-Command')).toBeInTheDocument();
    
    // Check that Players, Continents, and Continent Size are rendered
    expect(screen.getAllByText(/Players/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Continents/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Continent Size/i).length).toBeGreaterThan(0);
    expect(screen.getByText('⚔️ Start Game')).toBeInTheDocument();
  });

  it('calculates reinforcements correctly including continent ownership bonus', () => {
    const cachedState = {
      phase: 'FORTIFY',
      lobbyConfig: {
        playerCount: 2,
        continentCount: 2,
        continentSize: 3,
        setupMode: 'auto',
        autoMode: 'clumped',
      },
      players: [
        { id: 1, suit: 'spades', color: '#ff0000' },
        { id: 2, suit: 'hearts', color: '#0000ff' },
      ],
      currentPlayerIdx: 0, // Player 1
      cells: {
        '0,0': { id: '0,0', q: 0, r: 0, s: 0, continentId: null, owner: 1, troops: 5, isCapital: true },
        '1,0': { id: '1,0', q: 1, r: 0, s: -1, continentId: 0, owner: 2, troops: 3, isCapital: false },
        '2,0': { id: '2,0', q: 2, r: 0, s: -2, continentId: 0, owner: 2, troops: 1, isCapital: false },
        '3,0': { id: '3,0', q: 3, r: 0, s: -3, continentId: 0, owner: 2, troops: 1, isCapital: false },
        '4,0': { id: '4,0', q: 4, r: 0, s: -4, continentId: 1, owner: 1, troops: 2, isCapital: false },
      },
      continents: [
        { id: 0, hexIds: ['1,0', '2,0', '3,0'], fillColor: 'rgba(0,0,0,0.1)', borderColor: '#000' },
        { id: 1, hexIds: ['4,0'], fillColor: 'rgba(0,0,0,0.1)', borderColor: '#000' },
      ],
      totalHexes: 5,
      turn: 4,
      reinforcementsLeft: 0,
      winner: null,
      eliminatedPlayers: [],
      draftOrder: [],
      draftStep: 0,
    };

    render(<HexCommandGame {...defaultProps} cachedState={cachedState} />);

    const endTurnBtn = screen.getByText('End Turn');
    expect(endTurnBtn).toBeInTheDocument();
    
    act(() => {
      fireEvent.click(endTurnBtn);
    });

    expect(screen.getAllByText('⊕ REINFORCE')[0]).toBeInTheDocument();
    expect(screen.getByText((content, element) => {
      return element?.tagName.toLowerCase() === 'strong' && content === '4';
    })).toBeInTheDocument();
  });

  it('triggers occupation slider when a territory is conquered and has a choice', () => {
    const cachedState = {
      phase: 'ATTACK',
      lobbyConfig: {
        playerCount: 2,
        continentCount: 1,
        continentSize: 4,
        setupMode: 'auto',
        autoMode: 'clumped',
      },
      players: [
        { id: 1, suit: 'spades', color: '#ff0000' },
        { id: 2, suit: 'hearts', color: '#0000ff' },
      ],
      currentPlayerIdx: 0, // Player 1
      cells: {
        '0,0': { id: '0,0', q: 0, r: 0, s: 0, continentId: null, owner: 1, troops: 5, isCapital: true },
        '1,0': { id: '1,0', q: 1, r: 0, s: -1, continentId: 0, owner: 1, troops: 5, isCapital: false },
        '1,-1': { id: '1,-1', q: 1, r: -1, s: 0, continentId: 0, owner: 2, troops: 1, isCapital: false },
        '2,0': { id: '2,0', q: 2, r: 0, s: -2, continentId: 0, owner: 2, troops: 1, isCapital: false },
      },
      continents: [
        { id: 0, hexIds: ['1,0', '1,-1', '2,0'], fillColor: 'rgba(0,0,0,0.1)', borderColor: '#000' },
      ],
      totalHexes: 4,
      turn: 2,
      reinforcementsLeft: 0,
      winner: null,
      eliminatedPlayers: [],
      draftOrder: [],
      draftStep: 0,
    };

    let randomCalls = 0;
    const mockMath = Object.create(globalThis.Math);
    mockMath.random = () => {
      randomCalls++;
      return randomCalls <= 3 ? 0.99 : 0.01; // first 3 rolls (attacker) are 6, next rolls (defender) are 1
    };
    globalThis.Math = mockMath;

    render(<HexCommandGame {...defaultProps} cachedState={cachedState} />);

    expect(screen.getByText('⚔ ATTACK')).toBeInTheDocument();

    // Trigger attacks directly via our exposed test hook
    act(() => {
      (window as any).TEST_HOOKS.handleHexClick('1,0'); // select attacker
    });
    act(() => {
      (window as any).TEST_HOOKS.handleHexClick('1,-1'); // attack target
    });

    act(() => {
      vi.advanceTimersByTime(4700);
    });

    expect(screen.getByText('⚔️ Occupy Territory')).toBeInTheDocument();
    expect(screen.getByText('Move 3')).toBeInTheDocument();
    expect(screen.getByText('of 4')).toBeInTheDocument();

    const confirmBtn = screen.getByText('✓');
    expect(confirmBtn).toBeInTheDocument();

    act(() => {
      fireEvent.click(confirmBtn);
    });

    expect(screen.queryByText('⚔️ Occupy Territory')).toBeNull();
  });

  it('renders progress bar, reset button, and active player glow, and reset button returns to lobby', () => {
    const cachedState = {
      phase: 'REINFORCE',
      lobbyConfig: {
        playerCount: 2,
        continentCount: 1,
        continentSize: 3,
        setupMode: 'auto',
        autoMode: 'clumped',
      },
      players: [
        { id: 1, suit: 'spades', color: '#ff0000' },
        { id: 2, suit: 'hearts', color: '#0000ff' },
      ],
      currentPlayerIdx: 0, // Player 1
      cells: {
        '0,0': { id: '0,0', q: 0, r: 0, s: 0, continentId: null, owner: 1, troops: 5, isCapital: true },
        '1,0': { id: '1,0', q: 1, r: 0, s: -1, continentId: 0, owner: 2, troops: 3, isCapital: false },
        '2,0': { id: '2,0', q: 2, r: 0, s: -2, continentId: 0, owner: null, troops: 0, isCapital: false },
        '3,0': { id: '3,0', q: 3, r: 0, s: -3, continentId: 0, owner: null, troops: 0, isCapital: false },
      },
      continents: [
        { id: 0, hexIds: ['1,0', '2,0', '3,0'], fillColor: 'rgba(0,0,0,0.1)', borderColor: '#000' },
      ],
      totalHexes: 4,
      turn: 1,
      reinforcementsLeft: 3,
      winner: null,
      eliminatedPlayers: [],
      draftOrder: [],
      draftStep: 0,
    };

    const { container } = render(<HexCommandGame {...defaultProps} cachedState={cachedState} />);

    // 1. Verify Reset button is present
    const resetBtn = screen.getByRole('button', { name: /Reset/i });
    expect(resetBtn).toBeInTheDocument();

    // 2. Verify progress bar exists and has elements
    const progressBar = container.querySelector('#hex-command-progress-bar');
    expect(progressBar).toBeInTheDocument();
    
    // Check that we have 3 segments (P1, P2, and neutral)
    const segments = progressBar?.children;
    expect(segments?.length).toBe(3);

    // Verify turn indicator pill exists and contains correct player turn text
    const turnIndicator = container.querySelector('#hex-command-turn-indicator');
    expect(turnIndicator).toBeInTheDocument();
    expect(turnIndicator).toHaveTextContent("Player 1's Turn");

    // Verify backdrop glow is no longer present in SVG
    const radialGrad = container.querySelector('radialGradient#active-player-glow');
    expect(radialGrad).toBeNull();

    // 3. Reset returning to Lobby
    act(() => {
      fireEvent.click(resetBtn);
    });

    // Check we are back in Lobby (Start Game is visible, Reset button is gone)
    expect(screen.getByText('⚔️ Start Game')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reset/i })).toBeNull();
  });

  it('generates map with exact continent sizes and correct connectivity rules', () => {
    const config: LobbyConfig = {
      playerCount: 3,
      continentCount: 5,
      continentSize: 12,
      setupMode: 'auto',
      autoMode: 'clumped',
    };
    const colors = Array.from({ length: 5 }, () => ({ fill: 'rgba(0,0,0,0.1)', border: '#000' }));
    const { cells, continents } = generateMap(config, colors);

    // Verify exactly 5 continents are generated
    expect(continents.length).toBe(5);

    // Verify each continent has exactly 12 hexes
    for (const cont of continents) {
      expect(cont.hexIds.length).toBe(12);
    }

    // Verify King Space is touching >= 2 continents
    const kingNeighbors = [
      { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 },
      { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }
    ].map(n => `${n.q},${n.r}`);
    
    const kingTouching = new Set<number>();
    for (const nk of kingNeighbors) {
      const cell = cells[nk];
      if (cell && cell.continentId !== null) {
        kingTouching.add(cell.continentId);
      }
    }
    expect(kingTouching.size).toBeGreaterThanOrEqual(2);

    // Verify every continent touches at least 2 other entities (continents or king)
    for (const cont of continents) {
      const seenNeighbors = new Set<string | number>();
      for (const hexId of cont.hexIds) {
        const [q, r] = hexId.split(',').map(Number);
        const neighbors = [
          { q: q + 1, r: r - 1 }, { q: q + 1, r: r }, { q: q, r: r + 1 },
          { q: q - 1, r: r + 1 }, { q: q - 1, r: r }, { q: q, r: r - 1 }
        ];
        for (const nb of neighbors) {
          const nk = `${nb.q},${nb.r}`;
          if (nk === '0,0') {
            seenNeighbors.add('king');
          } else {
            const cell = cells[nk];
            if (cell && cell.continentId !== null && cell.continentId !== cont.id) {
              seenNeighbors.add(cell.continentId);
            }
          }
        }
      }
      expect(seenNeighbors.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('distributes territories equally (differing by at most 1) in clumped mode', () => {
    // Generate a map
    const config: LobbyConfig = {
      playerCount: 3,
      continentCount: 4,
      continentSize: 7,
      setupMode: 'auto',
      autoMode: 'clumped',
    };
    const colors = Array.from({ length: 4 }, () => ({ fill: 'rgba(0,0,0,0.1)', border: '#000' }));
    const { cells } = generateMap(config, colors);

    // Distribute territories clumped
    const distributed = distributeClumped(cells, 3);

    // Count territories per player
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (const cell of Object.values(distributed)) {
      if (!cell.isCapital && cell.owner !== null) {
        counts[cell.owner]++;
      }
    }

    const totalNonCapital = Object.values(cells).filter(c => !c.isCapital).length; // 4 * 7 = 28
    expect(counts[1] + counts[2] + counts[3]).toBe(totalNonCapital);

    // 28 / 3 = 9 remainder 1. So player counts should be [10, 9, 9] in some order
    const minCount = Math.min(counts[1], counts[2], counts[3]);
    const maxCount = Math.max(counts[1], counts[2], counts[3]);
    expect(maxCount - minCount).toBeLessThanOrEqual(1);
    expect(maxCount).toBe(10);
    expect(minCount).toBe(9);
  });
});
