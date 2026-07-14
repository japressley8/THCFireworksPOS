import React, { useState, useEffect } from 'react';
import { X, Gamepad } from 'lucide-react';
import { SolitaireGame } from './SolitaireGame';
import { ConnectFourGame } from './ConnectFourGame';
import { TrithelloGame } from './TrithelloGame';
import { HexCommandGame } from './HexCommandGame';
import { TrigonGame } from './TrigonGame';
import { ChainReactionGame } from './ChainReactionGame';

interface GameProps {
  cachedState: any;
  onSaveCache: (state: any) => void;
  onClose: () => void;
}

interface EasterEgg {
  year: number;
  title: string;
  component: React.ComponentType<GameProps>;
}

const EASTER_EGGS: EasterEgg[] = [
  {
    year: 2026,
    title: 'Solitaire',
    component: SolitaireGame,
  },
  {
    year: 2027,
    title: 'Connect Game',
    component: ConnectFourGame,
  },
  {
    year: 2028,
    title: 'Trithello',
    component: TrithelloGame,
  },
  {
    year: 2029,
    title: 'Hex-Command',
    component: HexCommandGame,
  },
  {
    year: 2030,
    title: 'Chain Reaction',
    component: ChainReactionGame,
  },
  {
    year: 2031,
    title: 'Trigon',
    component: TrigonGame,
  },
];

interface EasterEggModalProps {
  isOpen: boolean;
  onClose: () => void;
  cachedStates: { [year: number]: any };
  onSaveCache: (year: number, state: any) => void;
}

export const EasterEggModal: React.FC<EasterEggModalProps> = ({
  isOpen,
  onClose,
  cachedStates,
  onSaveCache,
}) => {
  const currentYear = new Date().getFullYear();
  const visibleEggs = EASTER_EGGS.filter((egg) => egg.year <= currentYear);

  const [activeYear, setActiveYear] = useState<number>(() => {
    if (visibleEggs.length > 0) {
      return visibleEggs[visibleEggs.length - 1].year;
    }
    return 2026;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  const activeEgg = visibleEggs.find((egg) => egg.year === activeYear) || visibleEggs[0];
  const ActiveComponent = activeEgg ? activeEgg.component : null;

  const connectFourState = cachedStates[2027];
  const cols = connectFourState?.cols ?? 7;
  const rows = connectFourState?.rows ?? 6;

  // Hex-Command 2029: size based on lobby config
  const hexCfg = cachedStates[2029]?.lobbyConfig;
  const hexTotalHexes = hexCfg
    ? hexCfg.continentCount * hexCfg.continentSize + 1
    : 25;
  const hexModalW = Math.max(1080, Math.min(1400, 900 + hexTotalHexes * 5));
  const hexModalH = Math.max(820, Math.min(1100, 700 + hexTotalHexes * 4));

  const modalWidth = activeYear === 2027
    ? Math.max(1080, cols * 38 + 120)
    : activeYear === 2029
    ? hexModalW
    : activeYear === 2031
    ? 1200
    : 1080;
  const modalHeight = activeYear === 2027
    ? Math.max(820, rows * 38 + 260)
    : activeYear === 2029
    ? hexModalH
    : activeYear === 2031
    ? 850
    : 820;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col relative transition-all duration-300 ease-out"
        style={{
          width: `${modalWidth}px`,
          height: `${modalHeight}px`,
          maxWidth: '95vw',
          maxHeight: '95vh',
        }}
      >
        {/* Header decoration spark line */}
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-red-500 via-custom-accent to-custom-primary" />

        {/* Top Header */}
        <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="font-black text-custom-text text-base flex items-center gap-3 tracking-wide uppercase select-none">
              <Gamepad className="h-5 w-5 text-custom-accent animate-pulse" />
              <span>THC Game Vault</span>
            </h3>

            {/* Year Tabs */}
            {visibleEggs.length > 1 && (
              <div className="flex bg-custom-input border border-custom-border/60 rounded-lg p-0.5 ml-2.5 shadow-inner">
                {visibleEggs.map((egg) => (
                  <button
                    key={egg.year}
                    onClick={() => setActiveYear(egg.year)}
                    className={`px-3 py-1 text-[10px] font-extrabold uppercase rounded-md transition-all ${activeYear === egg.year
                      ? 'bg-custom-primary text-white shadow-md shadow-custom-primary/20'
                      : 'text-custom-muted hover:text-custom-text'
                      }`}
                  >
                    {egg.year}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            id="btn-close-easter-eggs"
            onClick={onClose}
            className="p-2 hover:bg-custom-primary/20 rounded-xl text-custom-muted hover:text-custom-text transition-all border border-custom-border bg-custom-input"
            title="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Modal Main Content Workspace */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {ActiveComponent && (
            <ActiveComponent
              cachedState={cachedStates[activeYear]}
              onSaveCache={(state) => onSaveCache(activeYear, state)}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};
