import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  RotateCcw,
  Trophy,
  History,
  Sparkles
} from 'lucide-react';
import { getPlayerColors, getTheme } from '../shared/colorUtils';

interface Card {
  id: string;
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: number;
  isFaceUp: boolean;
  color: 'red' | 'black';
}

interface HighScore {
  gamertag: string;
  score: number;
  date: string;
}

interface DragState {
  cardId: string;
  source: string;
  cardIndex: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface SolitaireGameProps {
  cachedState: any;
  onSaveCache: (state: any) => void;
  onClose: () => void;
}

export const SolitaireGame: React.FC<SolitaireGameProps> = ({
  cachedState,
  onSaveCache,
  onClose
}) => {
  // State elements
  const [stock, setStock] = useState<Card[]>([]);
  const [waste, setWaste] = useState<Card[]>([]);
  const [tableau, setTableau] = useState<Card[][]>(Array.from({ length: 7 }, () => []));
  const [foundation, setFoundation] = useState<Card[][]>(Array.from({ length: 4 }, () => []));

  const [score, setScore] = useState<number>(0);
  const [history, setHistory] = useState<any[]>([]);
  const [isWon, setIsWon] = useState<boolean>(false);
  const [showWinForm, setShowWinForm] = useState<boolean>(false);
  const [gamertag, setGamertag] = useState<string>('');
  const [isScoreSaved, setIsScoreSaved] = useState<boolean>(false);
  const [highScores, setHighScores] = useState<HighScore[]>([]);

  // Selection state for click-to-move
  const [selectedCard, setSelectedCard] = useState<{ source: string; cardIndex: number } | null>(null);

  // Custom Pointer dragging states
  const [activeDrag, setActiveDrag] = useState<DragState | null>(null);
  const [justDroppedCardIds, setJustDroppedCardIds] = useState<string[]>([]);
  const [lastDrawnCount, setLastDrawnCount] = useState<number>(0);

  const [mode, setMode] = useState<'turn1' | 'turn3'>('turn3');
  const [caches, setCaches] = useState<{
    turn1: any;
    turn3: any;
  }>({ turn1: null, turn3: null });

  const stateRef = useRef({ stock: [] as Card[], waste: [] as Card[], tableau: [] as Card[][], foundation: [] as Card[][], score: 0, history: [] as any[], mode: 'turn3' as 'turn1' | 'turn3', caches: { turn1: null, turn3: null } as any, isWon: false });
  const hasSubmittedOrReset = useRef(false);
  const [isAutoCompleting, setIsAutoCompleting] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Helper formatting values
  type Suit = 'hearts' | 'clubs' | 'diamonds' | 'spades';
  const suits: Suit[] = ['hearts', 'clubs', 'diamonds', 'spades'];

  const theme = getTheme()
  const cardColors = getPlayerColors(2);

  const makeColorOpaque = (colorStr: string): string => {
    const clean = colorStr.trim();
    if (clean.startsWith('rgba')) {
      const matches = clean.match(/\d+/g);
      if (matches && matches.length >= 3) {
        return `rgb(${matches[0]}, ${matches[1]}, ${matches[2]})`;
      }
    }
    if (clean.startsWith('hsla')) {
      const numbers = clean.match(/\d+/g);
      if (numbers && numbers.length >= 3) {
        return `hsl(${numbers[0]}, ${numbers[1]}%, ${numbers[2]}%)`;
      }
    }
    return clean;
  };

  const solidCardBg = makeColorOpaque(theme.card);

  const getSuitIcon = (suit: 'hearts' | 'diamonds' | 'clubs' | 'spades', sizeClass = "h-4 w-4") => {
    if (suit === 'hearts') {
      return (
        <svg className={sizeClass} fill="currentColor" viewBox="0 0 14 14">
          <path d="m 7.4370106,12.777199 c -0.0491,-0.2454 -0.50182,-0.7919 -0.65606,-0.7919 -0.16603,0 -0.10478,-0.1004 0.1326,-0.2174 0.14606,-0.072 0.28991,-0.2351 0.40391,-0.4578 l 0.17706,-0.346 0.17555,0.3458 c 0.11372,0.224 0.25562,0.3853 0.40286,0.4578 0.23463,0.1156 0.29964,0.2176 0.13867,0.2176 -0.15194,0 -0.53165,0.4417 -0.6341,0.7376 l -0.0959,0.2771 -0.0446,-0.2228 z m -4.37087,-0.6543 c -0.0764,-0.3821 -0.45266,-0.8414 -0.83409,-1.0181 l -0.3499,-0.1621 0.22682,-0.05 c 0.3316,-0.073 0.82213,-0.5935 0.92636,-0.9831005 0.0469,-0.1756 0.10389,-0.3191 0.12656,-0.3191 0.0227,0 0.0796,0.1435 0.12657,0.3191 0.10422,0.3896005 0.59476,0.9102005 0.92635,0.9831005 l 0.22682,0.05 -0.35394,0.164 c -0.39887,0.1848 -0.75508,0.6126 -0.82636,0.9926 -0.0555,0.296 -0.13869,0.3061 -0.19519,0.024 z m 4.6099,-3.1770005 c -0.0514,-0.116 -0.16681,-0.2444 -0.25654,-0.2853 l -0.16314,-0.074 0.24181,-0.2281 c 0.13299,-0.1254 0.24193,-0.2877 0.24207,-0.3606 2.3e-4,-0.099 0.0341,-0.077 0.13483,0.088 0.074,0.1213 0.20772,0.2719 0.29714,0.3345 l 0.16257,0.1139 -0.16257,0.1138 c -0.0894,0.063 -0.21662,0.2028 -0.28268,0.3114 l -0.1201,0.1975 -0.0934,-0.211 z m 3.3584894,-0.7349 c -0.021,-0.035 -0.0616,-0.1751 -0.0903,-0.3107 -0.0759,-0.3586 -0.35521,-0.8801 -0.64051,-1.1959 -0.25709,-0.2845 -0.8626294,-0.6318 -1.1161094,-0.6401 -0.0796,0 -0.0123,-0.046 0.14946,-0.097 0.39996,-0.1251 0.7436094,-0.3468 1.0129494,-0.6536 0.25977,-0.2958 0.62969,-1.0394 0.62977,-1.2658 5e-5,-0.2776 0.12223,-0.2373 0.1691,0.056 0.0601,0.3759 0.33823,0.9164 0.64795,1.2592 0.25708,0.2846 0.86262,0.6319 1.11611,0.6401 -0.0796,0 0.0123,0.046 -0.14947,0.097 -0.78941,0.2468 -1.364,0.898 -1.59747,1.8102 -0.0514,0.2007 -0.11053,0.3361 -0.13149,0.3008 z m -5.8536194,-1.3451 c -0.0703,-0.4396 -0.44248,-0.9354 -0.86813,-1.1565 -0.35578,-0.1848 -0.35922,-0.1896 -0.16424,-0.2286 0.41813,-0.084 1.0397,-0.8739 1.06076,-1.3486 0.003,-0.078 0.0715,0.047 0.15128,0.2757 0.17302,0.4969 0.62133,0.985 0.97882,1.0657 l 0.23845,0.054 -0.24651,0.1006 c -0.47043,0.192 -0.84307,0.6466 -1.02199,1.2468 l -0.0827,0.2773 -0.0458,-0.2861 z m -2.39566,-1.7666 c -0.0533,-0.3328 -0.33021,-0.8898 -0.6117,-1.2302 -0.13182,-0.1594 -0.41707,-0.3602 -0.7239,-0.5095 -0.2785,-0.1355 -0.44984994,-0.2469 -0.38077,-0.2475 0.23203,0 0.79664,-0.3399 1.06509,-0.637 0.29341,-0.3248 0.67562,-1.0707 0.67571,-1.3187 1.1e-4,-0.25429996 0.11859,-0.18249996 0.16436,0.1 0.11474,0.707 0.85839,1.6053 1.48123,1.7892 l 0.31569,0.093 -0.48892,0.2365 c -0.35742,0.1729 -0.56295,0.3302 -0.7642,0.5848 -0.25532,0.323 -0.56724,0.998 -0.56724,1.2274 0,0.2231 -0.12631,0.1561 -0.16535,-0.088 z m 5.23936,-1.311 c -0.005,-0.2133 -0.27386,-0.5904 -0.4897,-0.6859 l -0.1993,-0.088 0.21979,-0.1458 c 0.12089,-0.08 0.28628,-0.2773 0.36755,-0.4379 l 0.14775,-0.2919 0.14919,0.3071 c 0.089,0.1831 0.23723,0.3526 0.36725,0.4198 l 0.21807,0.1128 -0.23328,0.155 c -0.1283,0.085 -0.30329,0.2974 -0.38885,0.4714 -0.0914,0.1857 -0.15676,0.2616 -0.15847,0.1837 z" />
        </svg>
      );
    }
    if (suit === 'diamonds') {
      return (
        <svg className={sizeClass} fill="currentColor" viewBox="0 0 14 14">
          <path d="M 6.9999998,1 C 3.9349949,2.0640814 2.7142855,5.2857143 2.7142855,7.8571429 2.7142855,10.428571 4.2099424,12.365511 6.1428569,13 4.4285712,10.206928 4.4285712,7.8571429 6.9999998,6.1428571 c -0.4327903,1.1595583 0,3.4285719 0.8571428,4.2857139 0.3698186,-0.343506 0.8571429,-1.221194 0.8571429,-1.7142853 1.7142855,1.7142853 0.482484,3.1142233 0,4.2857143 0.9327257,-0.47923 2.5714295,-1.714286 2.5714295,-4.2857143 0,-2.5714286 -1.7142866,-3.4285714 -1.7142866,-6 C 8.3855575,3.2279227 7.8571426,4.4285714 7.8571426,5.2857143 7.0410904,4.8086632 6.1428569,2.9255077 6.9999998,1 Z" />
        </svg>
      );
    }
    if (suit === 'clubs') {
      return (
        <svg className={sizeClass} fill="currentColor" viewBox="0 0 14 14">
          <path d="m 11.324219,3.07539 -1.21875,1.21875 0.621093,0.6211 c 0.220313,0.22031 0.220313,0.57656 0,0.79453 L 10.31875,6.11758 C 10.595313,6.7293 10.75,7.40899 10.75,8.12383 c 0,2.69297 -2.1820313,4.875 -4.875,4.875 C 3.1820313,12.99883 1,10.81914 1,8.12617 c 0,-2.69296 2.1820312,-4.875 4.875,-4.875 0.7148437,0 1.3945312,0.15469 2.00625,0.43125 L 8.2890625,3.27461 C 8.509375,3.0543 8.865625,3.0543 9.0835937,3.27461 L 9.7046875,3.8957 10.923438,2.67695 11.324219,3.07539 Z m 1.394531,-0.66797 -0.5625,0 c -0.154688,0 -0.28125,0.12657 -0.28125,0.28125 0,0.15469 0.126562,0.28125 0.28125,0.28125 l 0.5625,0 C 12.873438,2.96992 13,2.84336 13,2.68867 13,2.53399 12.873438,2.40742 12.71875,2.40742 Z M 11.3125,1.00117 c -0.154688,0 -0.28125,0.12657 -0.28125,0.28125 l 0,0.5625 c 0,0.15469 0.126562,0.28125 0.28125,0.28125 0.154688,0 0.28125,-0.12656 0.28125,-0.28125 l 0,-0.5625 c 0,-0.15468 -0.126562,-0.28125 -0.28125,-0.28125 z m 0.794531,1.28907 0.398438,-0.39844 c 0.110156,-0.11016 0.110156,-0.28828 0,-0.39844 -0.110157,-0.11016 -0.288281,-0.11016 -0.398438,0 L 11.708594,1.8918 c -0.110157,0.11015 -0.110157,0.28828 0,0.39844 0.1125,0.11015 0.290625,0.11015 0.398437,0 z m -1.589062,0 c 0.110156,0.11015 0.288281,0.11015 0.398437,0 0.110156,-0.11016 0.110156,-0.28829 0,-0.39844 L 10.517969,1.49336 c -0.110156,-0.11016 -0.288281,-0.11016 -0.398438,0 -0.110156,0.11016 -0.110156,0.28828 0,0.39844 l 0.398438,0.39844 z m 1.589062,0.79687 c -0.110156,-0.11016 -0.288281,-0.11016 -0.398437,0 -0.110157,0.11016 -0.110157,0.28828 0,0.39844 l 0.398437,0.39844 c 0.110157,0.11015 0.288281,0.11015 0.398438,0 0.110156,-0.11016 0.110156,-0.28829 0,-0.39844 L 12.107031,3.08711 Z M 3.625,7.37617 c 0,-0.82734 0.6726562,-1.5 1.5,-1.5 0.20625,0 0.375,-0.16875 0.375,-0.375 0,-0.20625 -0.16875,-0.375 -0.375,-0.375 -1.2398438,0 -2.25,1.01016 -2.25,2.25 0,0.20625 0.16875,0.375 0.375,0.375 0.20625,0 0.375,-0.16875 0.375,-0.375 z" />
        </svg>
      );
    }
    return (
      <svg className={sizeClass} fill="currentColor" viewBox="0 0 14 14">
        <path d="m 1.3503604,12.850876 c -0.15428,-0.1053 -0.21007,-0.302 -0.13077,-0.461 0.0212,-0.043 0.80557,-0.8455 1.74294,-1.7842 l 1.70433,-1.7066996 -0.10579,-0.1038 -0.1058,-0.1039 -0.15717,0.086 c -0.33068,0.1818 -0.66056,0.2612 -1.07628,0.2589 -0.29579,0 -0.46049,-0.033 -0.86011,-0.1615 -0.36547,-0.1179 -0.6593,-0.1649 -0.93204,-0.1492 -0.20189,0.012 -0.23079,0.01 -0.30251,-0.04 -0.11178,-0.075 -0.1582,-0.2234 -0.10494,-0.3357 0.071,-0.1496 0.1499,-0.1752 0.53386,-0.1729 0.38048,0 0.5406,0.031 0.99346,0.1782 0.49538,0.1609 0.76598,0.1773 1.15365,0.07 0.24118,-0.067 0.36631,-0.1345 0.34405,-0.186 -0.0341,-0.079 -0.0402,-0.3384 -0.0101,-0.4295 0.0306,-0.093 0.39238,-0.4951 0.44452,-0.4943 0.0345,5e-4 3.30562,1.2495 3.32611,1.27 0.008,0.01 -0.30568,0.3344 -0.69807,0.7243 -0.6539,0.6499 -0.7243,0.7125996 -0.84337,0.7515996 -0.15076,0.049 -0.29449,0.038 -0.43283,-0.034 -0.0499,-0.026 -0.21029,-0.1676996 -0.35647,-0.3149996 -0.14619,-0.1474 -0.27691,-0.268 -0.29048,-0.268 -0.0136,0 -0.78698,0.7629996 -1.71868,1.6955996 -0.9317,0.9326 -1.72341,1.7113 -1.75935,1.7304 -0.0999,0.053 -0.26479,0.044 -0.35818,-0.02 z m 5.25609,-5.3967996 -1.6533,-0.632 0.55267,-0.5527 0.55268,-0.5527 1.65473,0.6305 c 0.91011,0.3467 1.66527,0.6369 1.67813,0.6449 0.0307,0.019 -1.04757,1.0977 -1.09512,1.0956 -0.0201,-8e-4 -0.78048,-0.286 -1.68979,-0.6336 z m 1.62909,-1.5704 c -0.90512,-0.3459 -1.65359,-0.6367 -1.66327,-0.6462 -0.01,-0.01 0.3851,-0.4199 0.8773,-0.912 l 0.8949,-0.8946 1.16154,1.1613 1.1615396,1.1614 -0.38079,0.3813 c -0.20943,0.2098 -0.3863596,0.3806 -0.3931696,0.3795 -0.007,-10e-4 -0.75294,-0.2848 -1.65805,-0.6307 z m 3.5333396,0.1379 c -0.0399,-0.018 -0.88622,-0.8481 -1.8806396,-1.8444 -1.61812,-1.6211 -1.8102,-1.8215 -1.82872,-1.9082 -0.0114,-0.053 -0.013,-0.133 -0.004,-0.1774 0.019,-0.09 0.12571,-0.2152 0.21146,-0.2485 0.0838,-0.033 4.2638396,-0.7478 4.3703396,-0.7478 0.17876,0 0.32004,0.1144 0.36201,0.2933 0.0224,0.095 -0.72046,4.3846 -0.77622,4.4818 -0.0489,0.085 -0.2244,0.1866 -0.32056,0.1851 -0.0338,-5e-4 -0.0941,-0.016 -0.13402,-0.034 z" />
      </svg>
    );
  };

  const getRankSymbol = (rank: number) => {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return rank.toString();
  };

  // Switch between game modes (Turn 1 / Turn 3)
  const handleSwitchMode = (newMode: 'turn1' | 'turn3') => {
    if (newMode === mode) return;

    // Save current game state to cache
    const currentGameState = isWon ? null : {
      stock: stock.map(c => ({ ...c })),
      waste: waste.map(c => ({ ...c })),
      tableau: tableau.map(p => p.map(c => ({ ...c }))),
      foundation: foundation.map(p => p.map(c => ({ ...c }))),
      score,
      history,
      isWon
    };

    const updatedCaches = {
      ...caches,
      [mode]: currentGameState
    };
    setCaches(updatedCaches);

    // Swap mode
    setMode(newMode);

    // Load from cache or initialize new
    const targetState = updatedCaches[newMode];
    if (targetState) {
      setStock(targetState.stock || []);
      setWaste(targetState.waste || []);
      setTableau(targetState.tableau || Array.from({ length: 7 }, () => []));
      setFoundation(targetState.foundation || Array.from({ length: 4 }, () => []));
      setScore(targetState.score || 0);
      setHistory(targetState.history || []);
      setIsWon(targetState.isWon || false);
      setShowWinForm(targetState.isWon && !isScoreSaved);
    } else {
      // Setup a fresh board
      const rawDeck: Card[] = [];
      suits.forEach(suit => {
        for (let rank = 1; rank <= 13; rank++) {
          rawDeck.push({
            id: `${suit}-${rank}`,
            suit,
            rank,
            isFaceUp: false,
            color: (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black'
          });
        }
      });
      // Shuffle rawDeck
      for (let i = rawDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rawDeck[i], rawDeck[j]] = [rawDeck[j], rawDeck[i]];
      }

      let deckIdx = 0;
      const nextTableau: Card[][] = Array.from({ length: 7 }, (_, pIdx) => {
        const pile: Card[] = [];
        for (let j = 0; j <= pIdx; j++) {
          const card = rawDeck[deckIdx++];
          card.isFaceUp = (j === pIdx);
          pile.push(card);
        }
        return pile;
      });

      const nextStock = rawDeck.slice(deckIdx);

      setStock(nextStock);
      setWaste([]);
      setTableau(nextTableau);
      setFoundation(Array.from({ length: 4 }, () => []));
      setScore(0);
      setHistory([]);
      setIsWon(false);
      setShowWinForm(false);
      setIsScoreSaved(false);
      setSelectedCard(null);
      setLastDrawnCount(0);
    }

    // Load scoreboard scores for the new mode
    loadHighScores(newMode);
  };

  // Helper to verify if a state cache is non-empty and has cards
  const isValidState = (st: any): boolean => {
    if (!st) return false;
    const hasStock = Array.isArray(st.stock) && st.stock.length > 0;
    const hasWaste = Array.isArray(st.waste) && st.waste.length > 0;
    const hasTableau = Array.isArray(st.tableau) && st.tableau.some((p: any) => Array.isArray(p) && p.length > 0);
    const hasFoundation = Array.isArray(st.foundation) && st.foundation.some((f: any) => Array.isArray(f) && f.length > 0);
    return hasStock || hasWaste || hasTableau || hasFoundation;
  };

  // Initialize/Restore State
  useEffect(() => {
    if (cachedState) {
      if (cachedState.hasOwnProperty('turn1') || cachedState.hasOwnProperty('turn3')) {
        // Structured format
        setCaches(cachedState);
        const activeMode = cachedState.lastMode || 'turn3';
        setMode(activeMode);

        const target = cachedState[activeMode];
        if (isValidState(target)) {
          setStock(target.stock || []);
          setWaste(target.waste || []);
          setTableau(target.tableau || Array.from({ length: 7 }, () => []));
          setFoundation(target.foundation || Array.from({ length: 4 }, () => []));
          setScore(target.score || 0);
          setHistory(target.history || []);
          setIsWon(target.isWon || false);
          setShowWinForm(target.isWon && !isScoreSaved);
        } else {
          handleRestart();
        }
        loadHighScores(activeMode);
      } else {
        // Backwards compatibility with old flat format (map to Turn 3)
        if (isValidState(cachedState)) {
          setCaches({ turn1: null, turn3: cachedState });
          setMode('turn3');
          setStock(cachedState.stock || []);
          setWaste(cachedState.waste || []);
          setTableau(cachedState.tableau || Array.from({ length: 7 }, () => []));
          setFoundation(cachedState.foundation || Array.from({ length: 4 }, () => []));
          setScore(cachedState.score || 0);
          setHistory(cachedState.history || []);
          setIsWon(false);
          setShowWinForm(false);
          setIsScoreSaved(false);
          loadHighScores('turn3');
        } else {
          handleRestart();
          loadHighScores('turn3');
        }
      }
    } else {
      handleRestart();
      loadHighScores('turn3');
    }
  }, [cachedState]);

  // Win Checker
  useEffect(() => {
    if (foundation.length === 4 && foundation.every(pile => pile.length === 13)) {
      setIsWon(true);
      setShowWinForm(true);
    }
  }, [foundation]);

  // Load High Scores
  const loadHighScores = async (currentMode = mode) => {
    try {
      const key = `solitaire_high_scores_${currentMode}`;
      const val = await invoke<string | null>('get_setting', { key });
      if (val) {
        const parsed: HighScore[] = JSON.parse(val);
        parsed.sort((a, b) => a.score - b.score);
        setHighScores(parsed);
      } else {
        setHighScores([]);
      }
    } catch (err) {
      console.error('Failed to load high scores: ', err);
    }
  };

  // Save High Score
  const handleSaveScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (gamertag.trim().length === 0) return;

    const newEntry: HighScore = {
      gamertag: gamertag.trim().slice(0, 3).toUpperCase(),
      score,
      date: new Date().toLocaleDateString()
    };

    const updated = [...highScores, newEntry];
    updated.sort((a, b) => a.score - b.score);
    const top10 = updated.slice(0, 10);

    try {
      const key = `solitaire_high_scores_${mode}`;
      await invoke('save_setting', { key, value: JSON.stringify(top10) });
      setHighScores(top10);
      setIsScoreSaved(true);
      setShowWinForm(false);

      // Clear cache for current mode, keeping other mode's cache
      hasSubmittedOrReset.current = true;
      const finalCaches = {
        ...caches,
        [mode]: null,
        lastMode: mode
      };
      onSaveCache(finalCaches);

      // Reset the board to a clean state
      handleRestart();

      // Close solitaire
      onClose();
    } catch (err) {
      console.error('Failed to save score: ', err);
    }
  };

  // Game setup
  const handleRestart = () => {
    const rawDeck: Card[] = [];
    suits.forEach(suit => {
      for (let rank = 1; rank <= 13; rank++) {
        rawDeck.push({
          id: `${suit}-${rank}`,
          suit,
          rank,
          isFaceUp: false,
          color: (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black'
        });
      }
    });

    // Shuffle
    for (let i = rawDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rawDeck[i], rawDeck[j]] = [rawDeck[j], rawDeck[i]];
    }

    let deckIdx = 0;
    const nextTableau: Card[][] = Array.from({ length: 7 }, (_, pIdx) => {
      const pile: Card[] = [];
      for (let j = 0; j <= pIdx; j++) {
        const card = rawDeck[deckIdx++];
        card.isFaceUp = (j === pIdx);
        pile.push(card);
      }
      return pile;
    });

    const nextStock = rawDeck.slice(deckIdx);

    setStock(nextStock);
    setWaste([]);
    setTableau(nextTableau);
    setFoundation(Array.from({ length: 4 }, () => []));
    setScore(0);
    setHistory([]);
    setIsWon(false);
    setShowWinForm(false);
    setIsScoreSaved(false);
    setSelectedCard(null);
    setLastDrawnCount(0);
  };

  // History State push helper
  const createHistoryState = (
    st: Card[],
    ws: Card[],
    tb: Card[][],
    fd: Card[][],
    sc: number
  ) => {
    return {
      stock: st.map(c => ({ ...c })),
      waste: ws.map(c => ({ ...c })),
      tableau: tb.map(p => p.map(c => ({ ...c }))),
      foundation: fd.map(p => p.map(c => ({ ...c }))),
      score: sc
    };
  };

  // Undo Function
  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setStock(prev.stock);
    setWaste(prev.waste);
    setTableau(prev.tableau);
    setFoundation(prev.foundation);
    setScore(prev => prev + 1);
    setHistory(prev => prev.slice(0, -1));
    setSelectedCard(null);
    setLastDrawnCount(0);
  };

  // Draw card Draw 3
  const handleDrawCard = () => {
    const histState = createHistoryState(stock, waste, tableau, foundation, score);
    setHistory(prev => [...prev, histState]);

    if (stock.length === 0) {
      // Recycle waste
      const recycled = [...waste].reverse().map(c => ({ ...c, isFaceUp: false }));
      setStock(recycled);
      setWaste([]);
    } else {
      const drawnCount = Math.min(mode === 'turn1' ? 1 : 3, stock.length);
      const drawn = stock.slice(stock.length - drawnCount).reverse().map(c => ({ ...c, isFaceUp: true }));
      setStock(prev => prev.slice(0, prev.length - drawnCount));
      setWaste(prev => [...prev, ...drawn]);
      setLastDrawnCount(drawnCount);
    }
    setScore(prev => prev + 1);
    setSelectedCard(null);
  };

  // Move evaluation
  const moveCards = (source: string, cardIndex: number, target: string) => {
    setLastDrawnCount(0);
    let movingCards: Card[] = [];

    if (source === 'waste') {
      if (waste.length > 0) movingCards = [waste[waste.length - 1]];
    } else if (source.startsWith('tableau-')) {
      const pIdx = parseInt(source.split('-')[1], 10);
      movingCards = tableau[pIdx].slice(cardIndex);
    } else if (source.startsWith('foundation-')) {
      const fIdx = parseInt(source.split('-')[1], 10);
      if (foundation[fIdx].length > 0) {
        movingCards = [foundation[fIdx][foundation[fIdx].length - 1]];
      }
    }

    if (movingCards.length === 0) return;
    const bottomCard = movingCards[0];

    // Validate
    let isValid = false;
    if (target.startsWith('foundation-')) {
      const fIdx = parseInt(target.split('-')[1], 10);
      const fPile = foundation[fIdx];
      if (movingCards.length === 1) {
        if (fPile.length === 0) {
          isValid = (bottomCard.rank === 1 && bottomCard.suit === suits[fIdx]);
        } else {
          const topCard = fPile[fPile.length - 1];
          isValid = (bottomCard.suit === suits[fIdx] && bottomCard.rank === topCard.rank + 1);
        }
      }
    } else if (target.startsWith('tableau-')) {
      const pIdx = parseInt(target.split('-')[1], 10);
      const tPile = tableau[pIdx];
      if (tPile.length === 0) {
        isValid = (bottomCard.rank === 13);
      } else {
        const topCard = tPile[tPile.length - 1];
        isValid = (bottomCard.color !== topCard.color && bottomCard.rank === topCard.rank - 1);
      }
    }

    if (!isValid) return;

    // Push to history
    const hist = createHistoryState(stock, waste, tableau, foundation, score);
    setHistory(prev => [...prev, hist]);

    // Remove cards from source
    if (source === 'waste') {
      setWaste(prev => prev.slice(0, -1));
    } else if (source.startsWith('tableau-')) {
      const srcPIdx = parseInt(source.split('-')[1], 10);
      setTableau(prev => prev.map((pile, idx) => {
        if (idx === srcPIdx) {
          const updated = pile.slice(0, cardIndex);
          if (updated.length > 0) {
            const lastCard = updated[updated.length - 1];
            updated[updated.length - 1] = {
              ...lastCard,
              isFaceUp: true
            };
          }
          return updated;
        }
        return pile;
      }));
    } else if (source.startsWith('foundation-')) {
      const srcFIdx = parseInt(source.split('-')[1], 10);
      setFoundation(prev => prev.map((pile, idx) => idx === srcFIdx ? pile.slice(0, -1) : pile));
    }

    // Add cards to target
    if (target.startsWith('foundation-')) {
      const fIdx = parseInt(target.split('-')[1], 10);
      setFoundation(prev => prev.map((pile, idx) => idx === fIdx ? [...pile, bottomCard] : pile));
    } else if (target.startsWith('tableau-')) {
      const tIdx = parseInt(target.split('-')[1], 10);
      setTableau(prev => prev.map((pile, idx) => idx === tIdx ? [...pile, ...movingCards] : pile));
    }

    setScore(prev => prev + 1);
  };

  // Pointer dragging event handlers
  const handlePointerDown = (e: React.PointerEvent, source: string, cardIndex: number, cardId: string) => {
    const cardInfo = allCardsToRender.find(c => c.card.id === cardId);
    if (!cardInfo || !cardInfo.card.isFaceUp || isWon) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    setActiveDrag({
      cardId,
      source,
      cardIndex,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag) return;
    e.preventDefault();
    setActiveDrag(prev => prev ? {
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY
    } : null);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!activeDrag) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore
    }

    const distance = Math.sqrt(
      Math.pow(e.clientX - activeDrag.startX, 2) + Math.pow(e.clientY - activeDrag.startY, 2)
    );

    if (distance < 5) {
      handleCardClick(activeDrag.source, activeDrag.cardIndex);
      setActiveDrag(null);
      return;
    }

    const fieldEl = document.querySelector('.solitaire-field');
    if (fieldEl) {
      const rect = fieldEl.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;

      if (relY >= 10 && relY <= 130) {
        for (let fIdx = 0; fIdx < 4; fIdx++) {
          const fLeft = 276 + fIdx * 84;
          if (relX >= fLeft - 15 && relX <= fLeft + 72 + 15) {
            executePointerMove(activeDrag.source, activeDrag.cardIndex, `foundation-${fIdx}`);
            setActiveDrag(null);
            return;
          }
        }
      }

      if (relY >= 130) {
        for (let pIdx = 0; pIdx < 7; pIdx++) {
          const colLeft = 24 + pIdx * 84;
          if (relX >= colLeft - 15 && relX <= colLeft + 72 + 15) {
            executePointerMove(activeDrag.source, activeDrag.cardIndex, `tableau-${pIdx}`);
            setActiveDrag(null);
            return;
          }
        }
      }
    }

    setActiveDrag(null);
  };

  const executePointerMove = (source: string, cardIndex: number, target: string) => {
    let movingIds: string[] = [];
    if (source === 'waste') {
      if (waste.length > 0) movingIds = [waste[waste.length - 1].id];
    } else if (source.startsWith('tableau-')) {
      const pIdx = parseInt(source.split('-')[1], 10);
      movingIds = tableau[pIdx].slice(cardIndex).map(c => c.id);
    } else if (source.startsWith('foundation-')) {
      const fIdx = parseInt(source.split('-')[1], 10);
      if (foundation[fIdx].length > 0) {
        movingIds = [foundation[fIdx][foundation[fIdx].length - 1].id];
      }
    }

    let isValid = false;
    let bottomCard: Card | null = null;
    if (movingIds.length > 0) {
      const bCardId = movingIds[0];
      const match = allCardsToRender.find(c => c.card.id === bCardId);
      if (match) bottomCard = match.card;
    }

    if (bottomCard) {
      if (target.startsWith('foundation-')) {
        const fIdx = parseInt(target.split('-')[1], 10);
        const fPile = foundation[fIdx];
        if (movingIds.length === 1) {
          if (fPile.length === 0) {
            isValid = (bottomCard.rank === 1 && bottomCard.suit === suits[fIdx]);
          } else {
            const topCard = fPile[fPile.length - 1];
            isValid = (bottomCard.suit === suits[fIdx] && bottomCard.rank === topCard.rank + 1);
          }
        }
      } else if (target.startsWith('tableau-')) {
        const pIdx = parseInt(target.split('-')[1], 10);
        const tPile = tableau[pIdx];
        if (tPile.length === 0) {
          isValid = (bottomCard.rank === 13);
        } else {
          const topCard = tPile[tPile.length - 1];
          isValid = (bottomCard.color !== topCard.color && bottomCard.rank === topCard.rank - 1);
        }
      }
    }

    if (isValid) {
      setJustDroppedCardIds(movingIds);
      moveCards(source, cardIndex, target);
    }
  };

  useEffect(() => {
    if (justDroppedCardIds.length > 0) {
      const timer = setTimeout(() => {
        setJustDroppedCardIds([]);
      }, 50);
      return () => clearTimeout(timer);
    }
    return;
  }, [justDroppedCardIds]);

  const handleCardClick = (source: string, cardIndex: number) => {
    if (selectedCard) {
      if (selectedCard.source === source && selectedCard.cardIndex === cardIndex) {
        setSelectedCard(null);
      } else {
        const target = source.startsWith('tableau-') ? source.split('-')[0] + '-' + source.split('-')[1] : source;
        moveCards(selectedCard.source, selectedCard.cardIndex, target);
        setSelectedCard(null);
      }
    } else {
      setSelectedCard({ source, cardIndex });
    }
  };

  const handlePileClick = (targetPile: string) => {
    if (selectedCard) {
      moveCards(selectedCard.source, selectedCard.cardIndex, targetPile);
      setSelectedCard(null);
    }
  };

  const handleCardDoubleClick = (source: string, cardIndex: number) => {
    let card: Card | null = null;
    if (source === 'waste') {
      card = waste[waste.length - 1];
    } else if (source.startsWith('tableau-')) {
      const pIdx = parseInt(source.split('-')[1], 10);
      const pile = tableau[pIdx];
      if (cardIndex === pile.length - 1) {
        card = pile[pile.length - 1];
      }
    }

    if (!card) return;

    for (let fIdx = 0; fIdx < 4; fIdx++) {
      const target = `foundation-${fIdx}`;
      const fPile = foundation[fIdx];
      let isValid = false;
      if (fPile.length === 0) {
        isValid = (card.rank === 1 && card.suit === suits[fIdx]);
      } else {
        const topCard = fPile[fPile.length - 1];
        isValid = (card.suit === suits[fIdx] && card.rank === topCard.rank + 1);
      }

      if (isValid) {
        moveCards(source, cardIndex, target);
        setSelectedCard(null);
        return;
      }
    }
  };

  const getCardPosition = (cardId: string) => {
    const stockIdx = stock.findIndex(c => c.id === cardId);
    if (stockIdx !== -1) {
      return { left: 24, top: 20, zIndex: stockIdx };
    }

    const wasteIdx = waste.findIndex(c => c.id === cardId);
    if (wasteIdx !== -1) {
      const showCount = 3;
      const startVisibleIdx = Math.max(0, waste.length - showCount);
      if (wasteIdx >= startVisibleIdx) {
        const visibleOffset = wasteIdx - startVisibleIdx;
        return { left: 108 + visibleOffset * 14, top: 20, zIndex: 10 + wasteIdx };
      }
      return { left: 108, top: 20, zIndex: 10 + wasteIdx };
    }

    for (let fIdx = 0; fIdx < 4; fIdx++) {
      const fPile = foundation[fIdx];
      const fIdxInPile = fPile.findIndex(c => c.id === cardId);
      if (fIdxInPile !== -1) {
        return { left: 276 + fIdx * 84, top: 20, zIndex: 10 + fIdxInPile };
      }
    }

    for (let pIdx = 0; pIdx < 7; pIdx++) {
      const tPile = tableau[pIdx];
      const tIdxInPile = tPile.findIndex(c => c.id === cardId);
      if (tIdxInPile !== -1) {
        return { left: 24 + pIdx * 84, top: 150 + tIdxInPile * 18, zIndex: 10 + tIdxInPile };
      }
    }

    return { left: 24, top: 20, zIndex: 0 };
  };

  const isCardInDraggingStack = (cardId: string) => {
    if (!activeDrag) return false;
    if (cardId === activeDrag.cardId) return true;

    for (let pIdx = 0; pIdx < 7; pIdx++) {
      const pile = tableau[pIdx];
      const dragIdx = pile.findIndex(c => c.id === activeDrag.cardId);
      if (dragIdx !== -1) {
        const cardIdx = pile.findIndex(c => c.id === cardId);
        return cardIdx !== -1 && cardIdx > dragIdx;
      }
    }
    return false;
  };

  // Canvas Fireworks celebration loop
  useEffect(() => {
    if (!isWon) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let particles: any[] = [];
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#ec4899', '#8b5cf6'];

    const createFirework = (x: number, y: number) => {
      const count = 60 + Math.random() * 40;
      const baseColor = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = 1 + Math.random() * 5;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          alpha: 1,
          decay: 0.015 + Math.random() * 0.015,
          color: baseColor
        });
      }
    };

    let frameCount = 0;
    const run = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      frameCount++;
      if (frameCount % 25 === 0) {
        createFirework(
          50 + Math.random() * (canvas.width - 100),
          50 + Math.random() * (canvas.height * 0.5)
        );
      }

      particles.forEach((p, index) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04;
        p.alpha -= p.decay;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (p.alpha <= 0) {
          particles.splice(index, 1);
        }
      });

      animId = requestAnimationFrame(run);
    };

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    for (let i = 0; i < 4; i++) {
      createFirework(
        200 + Math.random() * (canvas.width - 400),
        100 + Math.random() * (canvas.height * 0.4)
      );
    }

    run();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isWon]);

  useEffect(() => {
    stateRef.current = { stock, waste, tableau, foundation, score, history, mode, caches, isWon };
  }, [stock, waste, tableau, foundation, score, history, mode, caches, isWon]);

  // Clean unmount helper to persist state caches
  useEffect(() => {
    return () => {
      if (hasSubmittedOrReset.current) return;
      const s = stateRef.current;

      // If the current game board is completely empty, don't overwrite the cache with a blank game.
      const hasCards = (s.stock && s.stock.length > 0) ||
        (s.waste && s.waste.length > 0) ||
        (s.tableau && s.tableau.some(p => p && p.length > 0)) ||
        (s.foundation && s.foundation.some(f => f && f.length > 0));

      if (!hasCards) return;

      const currentGameState = s.isWon ? null : {
        stock: s.stock.map(c => ({ ...c })),
        waste: s.waste.map(c => ({ ...c })),
        tableau: s.tableau.map(p => p.map(c => ({ ...c }))),
        foundation: s.foundation.map(p => p.map(c => ({ ...c }))),
        score: s.score,
        history: s.history,
        isWon: s.isWon
      };
      const finalCaches = {
        ...s.caches,
        [s.mode]: currentGameState,
        lastMode: s.mode
      };
      onSaveCache(finalCaches);
    };
  }, []);

  const canAutoComplete =
    stock.length === 0 &&
    waste.length === 0 &&
    foundation.some(pile => pile.length < 13) &&
    tableau.some(pile => pile.length > 0) &&
    tableau.every(pile => pile.every(c => c.isFaceUp));

  // Auto-complete solver cascade
  useEffect(() => {
    if (!isAutoCompleting) return;

    const makeNextMove = () => {
      for (let pIdx = 0; pIdx < 7; pIdx++) {
        const pile = tableau[pIdx];
        if (pile.length === 0) continue;
        const card = pile[pile.length - 1];

        for (let fIdx = 0; fIdx < 4; fIdx++) {
          const fPile = foundation[fIdx];
          let canMove = false;
          if (fPile.length === 0) {
            canMove = (card.rank === 1 && card.suit === suits[fIdx]);
          } else {
            const fTop = fPile[fPile.length - 1];
            canMove = (card.suit === suits[fIdx] && card.rank === fTop.rank + 1);
          }

          if (canMove) {
            setTableau(prev => {
              const next = prev.map(p => [...p]);
              next[pIdx].pop();
              return next;
            });
            setFoundation(prev => {
              const next = prev.map(p => [...p]);
              next[fIdx].push(card);
              return next;
            });
            setScore(prev => prev + 1);
            return true;
          }
        }
      }
      return false;
    };

    const timer = setTimeout(() => {
      const moved = makeNextMove();
      if (!moved) {
        setIsAutoCompleting(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [isAutoCompleting, tableau, foundation]);

  // Compile full render list of cards in flat format
  const allCardsToRender: { card: Card; source: string; index: number }[] = [];
  stock.forEach((card, idx) => {
    allCardsToRender.push({ card, source: 'stock', index: idx });
  });
  waste.forEach((card, idx) => {
    allCardsToRender.push({ card, source: 'waste', index: idx });
  });
  foundation.forEach((pile, fIdx) => {
    pile.forEach((card, idx) => {
      allCardsToRender.push({ card, source: `foundation-${fIdx}`, index: idx });
    });
  });
  tableau.forEach((pile, pIdx) => {
    pile.forEach((card, idx) => {
      allCardsToRender.push({ card, source: `tableau-${pIdx}`, index: idx });
    });
  });

  allCardsToRender.sort((a, b) => a.card.id.localeCompare(b.card.id));

  return (
    <div className="flex-1 flex flex-col min-h-0 relative select-none">
      {/* Selection card wiggle animation definition wrapper stylesheet */}
      <style>{`
        @keyframes cardWiggle {
          0% { transform: scale(1.08) rotate(0deg); }
          25% { transform: scale(1.08) rotate(-1.5deg); }
          75% { transform: scale(1.08) rotate(1.5deg); }
          100% { transform: scale(1.08) rotate(0deg); }
        }
        .animate-card-wiggle {
          animation: cardWiggle 0.22s infinite alternate ease-in-out;
        }
      `}</style>

      {isWon && (
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-50 w-full h-full" />
      )}

      {/* Top Header */}
      <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-black text-custom-text text-base flex items-center gap-3 tracking-wide uppercase select-none">
            <Sparkles className="h-5 w-5 text-custom-accent animate-pulse" />
            <span>Solitaire</span>
            <span className="text-xs px-2.5 py-1 bg-custom-input border border-custom-border/60 rounded-lg text-custom-accent font-black tracking-normal normal-case font-mono">
              Moves: {score}
            </span>
          </h3>

          {/* Mode Switcher Segmented Control */}
          <div className="flex bg-custom-input border border-custom-border/60 rounded-lg p-0.5 ml-2.5">
            <button
              onClick={() => handleSwitchMode('turn1')}
              className={`px-3 py-1 text-[10px] font-extrabold uppercase rounded-md transition-all ${mode === 'turn1'
                ? 'bg-custom-primary text-white shadow-md'
                : 'text-custom-muted hover:text-custom-text'
                }`}
            >
              Turn 1
            </button>
            <button
              onClick={() => handleSwitchMode('turn3')}
              className={`px-3 py-1 text-[10px] font-extrabold uppercase rounded-md transition-all ${mode === 'turn3'
                ? 'bg-custom-primary text-white shadow-md'
                : 'text-custom-muted hover:text-custom-text'
                }`}
            >
              Turn 3
            </button>
          </div>
        </div>
      </div>

      {/* Modal Main Content Workspace */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* LEFT SIDE: Solitaire Card Field */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col justify-between select-none">
          <div>
            {/* Cards workspace bounding field relative */}
            <div
              className="solitaire-field relative w-[624px] h-[510px] mx-auto select-none bg-custom-input/5 border border-custom-border/20 rounded-2xl p-4 shadow-inner overflow-hidden"
              style={{ perspective: '1000px' }}
            >

              {/* Background slots */}

              {/* Stock empty slot */}
              <div
                onClick={handleDrawCard}
                className="absolute w-[72px] h-[100px] rounded-lg border border-dashed border-custom-border/30 bg-custom-input/10 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-custom-input/15"
                style={{ left: '24px', top: '20px' }}
              >
                <div className="flex flex-col items-center justify-center text-custom-muted/40 select-none">
                  <RotateCcw className="h-6 w-6 stroke-[2.5]" />
                  <span className="text-[8px] font-extrabold uppercase mt-1">Recycle</span>
                </div>
              </div>

              {/* Waste empty slot */}
              <div
                className="absolute w-[72px] h-[100px] rounded-lg border border-dashed border-custom-border/30 bg-custom-input/10 flex flex-col items-center justify-center"
                style={{ left: '108px', top: '20px' }}
              >
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-custom-muted/40 select-none">Waste</span>
              </div>

              {/* 4 Foundations empty placeholders */}
              {suits.map((pileSuit, fIdx) => {
                const sourceName = `foundation-${fIdx}`;

                return (
                  <div
                    key={fIdx}
                    onClick={() => handlePileClick(sourceName)}
                    className="absolute w-[72px] h-[100px] rounded-lg border border-dashed border-custom-border/40 bg-custom-input/10 flex items-center justify-center transition-all cursor-pointer hover:border-custom-accent/40"
                    style={{ left: `${276 + fIdx * 84}px`, top: '20px' }}
                  >
                    {getSuitIcon(pileSuit, "h-8 w-8 opacity-20 text-custom-accent")}
                  </div>
                );
              })}

              {/* 7 Tableau empty placeholders */}
              {Array.from({ length: 7 }).map((_, pIdx) => {
                const sourceName = `tableau-${pIdx}`;
                return (
                  <div
                    key={pIdx}
                    onClick={() => handlePileClick(sourceName)}
                    className="absolute w-[72px] h-[330px] rounded-lg border border-dashed border-custom-border/20 bg-custom-input/5 flex flex-col items-center pt-2 transition-all cursor-pointer hover:bg-custom-input/10"
                    style={{ left: `${24 + pIdx * 84}px`, top: '150px' }}
                  >
                    <span className="text-custom-muted/15 font-black text-3xl select-none">K</span>
                  </div>
                );
              })}

              {/* FOREGROUND ABSOLUTE TRANSLATED CARD STACK RENDERS */}
              {allCardsToRender.map(({ card, source, index }) => {
                const pos = getCardPosition(card.id);
                const isSelected = selectedCard && (
                  selectedCard.source === source && (
                    source.startsWith('tableau-')
                      ? index >= selectedCard.cardIndex
                      : index === selectedCard.cardIndex
                  )
                );
                const isThisCardDragged = activeDrag && isCardInDraggingStack(card.id);

                const deltaX = activeDrag ? activeDrag.currentX - activeDrag.startX : 0;
                const deltaY = activeDrag ? activeDrag.currentY - activeDrag.startY : 0;

                const leftPos = isThisCardDragged ? pos.left + deltaX : pos.left;
                const topPos = isThisCardDragged ? pos.top + deltaY : pos.top;
                const zIndex = isThisCardDragged ? 1000 + pos.zIndex : pos.zIndex;

                const isRecentlyDrawn = source === 'waste' && lastDrawnCount > 0 && index >= waste.length - lastDrawnCount;
                const drawnOffset = isRecentlyDrawn ? index - (waste.length - lastDrawnCount) : 0;
                const transitionDelay = isRecentlyDrawn ? `${(lastDrawnCount - 1 - drawnOffset) * 150}ms` : '0ms';

                return (
                  <div
                    key={card.id}
                    data-card-id={card.id}
                    onPointerDown={(e) => handlePointerDown(e, source, index, card.id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      card.isFaceUp && handleCardDoubleClick(source, index);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (source === 'stock') {
                        handleDrawCard();
                      }
                    }}
                    className="absolute w-[72px] h-[100px] cursor-pointer select-none"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      transform: `translate3d(${leftPos}px, ${topPos}px, 0) rotateY(${card.isFaceUp ? 0 : 180}deg)`,
                      transformStyle: 'preserve-3d',
                      zIndex: zIndex,
                      transition: isThisCardDragged
                        ? 'none'
                        : justDroppedCardIds.includes(card.id)
                          ? 'none'
                          : 'transform 600ms cubic-bezier(0.25, 0.8, 0.25, 1)',
                      transitionDelay: transitionDelay,
                      touchAction: 'none'
                    }}
                  >
                    {/* CARD FRONT SIDE */}
                    <div
                      className={`w-full h-full rounded-lg border flex flex-col justify-between p-1.5 transition-all duration-200 select-none shadow-md absolute inset-0 ${isSelected
                        ? 'animate-card-wiggle ring-3 ring-custom-accent border-transparent shadow-glow shadow-custom-accent/30'
                        : isThisCardDragged
                          ? 'scale-[1.06] shadow-2xl shadow-black/50 rotate-1 border-slate-300'
                          : 'hover:translate-y-[-4px] hover:shadow-lg'
                        }`}
                      style={{
                        backgroundColor: solidCardBg,
                        borderColor: 'var(--color-border)',
                        color: card.color === 'red' ? cardColors[0] : cardColors[1],
                        backfaceVisibility: 'hidden',
                        zIndex: card.isFaceUp ? 2 : 1
                      }}
                    >
                      <div className="flex flex-col items-center justify-start self-start leading-none pointer-events-none">
                        <span className="text-[11px] font-black tracking-tight">{getRankSymbol(card.rank)}</span>
                        {getSuitIcon(card.suit, "h-2.5 w-2.5 mt-0.5")}
                      </div>

                      <div className="text-center flex justify-center items-center opacity-85 leading-none select-none pointer-events-none">
                        {getSuitIcon(card.suit, "h-7 w-7")}
                      </div>

                      <div className="flex flex-col items-center justify-start self-end leading-none rotate-180 pointer-events-none">
                        <span className="text-[11px] font-black tracking-tight">{getRankSymbol(card.rank)}</span>
                        {getSuitIcon(card.suit, "h-2.5 w-2.5 mt-0.5")}
                      </div>
                    </div>

                    {/* CARD BACK SIDE */}
                    <div
                      className="w-full h-full rounded-lg absolute inset-0 border border-white/10 shadow-lg flex items-center justify-center overflow-hidden"
                      style={{
                        transform: 'rotateY(180deg)',
                        backfaceVisibility: 'hidden',
                        zIndex: card.isFaceUp ? 1 : 2,
                        backgroundColor: 'var(--color-primary)',
                        backgroundImage: 'radial-gradient(circle, var(--color-primary-hover) 15%, transparent 16%)',
                        backgroundSize: '10px 10px'
                      }}
                    >
                      <div className="absolute inset-1 rounded-[6px] border border-white/20 flex items-center justify-center overflow-hidden">
                        <svg className="w-7 h-7 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707-.707m0-12.728l.707.707m12.728 12.728l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Auto Complete button */}
              {canAutoComplete && !isAutoCompleting && (
                <div className="absolute w-full flex justify-center bottom-6 left-0 z-40 animate-in fade-in duration-200">
                  <button
                    onClick={() => setIsAutoCompleting(true)}
                    className="px-6 py-2.5 bg-gradient-to-r from-custom-primary to-custom-accent hover:scale-105 active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-custom-primary/30 transition-all border border-white/10 animate-bounce"
                  >
                    ✨ Auto Complete Game
                  </button>
                </div>
              )}

            </div>

            {/* Bottom Control Bar */}
            <div className="flex justify-between items-center mt-6 px-4 shrink-0">
              <button
                onClick={handleUndo}
                disabled={history.length === 0}
                className="px-5 py-2.5 bg-custom-input hover:bg-custom-primary/10 text-custom-muted hover:text-custom-text disabled:opacity-40 disabled:hover:bg-custom-input disabled:hover:text-custom-muted rounded-xl transition-all border border-custom-border flex items-center gap-2 text-xs font-bold shadow-md active:scale-95"
                title="Undo Move (+1 Score penalty)"
              >
                <History className="h-4.5 w-4.5" /> Undo Move
              </button>
              <button
                onClick={handleRestart}
                className="px-5 py-2.5 bg-custom-primary hover:bg-custom-primary/90 text-white rounded-xl transition-all border border-custom-primary flex items-center gap-2 text-xs font-extrabold shadow-md shadow-custom-primary/20 active:scale-95"
                title="Restart Game"
              >
                <RotateCcw className="h-4.5 w-4.5" /> New Game
              </button>
            </div>

          </div>
        </div>

        {/* RIGHT SIDE: SCOREBOARD PANEL */}
        <div className="w-80 border-l border-custom-border bg-custom-input/25 p-6 flex flex-col select-none">
          <h3 className="text-sm font-black text-custom-text uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-custom-border pb-3 shrink-0">
            <Trophy className="h-4.5 w-4.5 text-custom-accent" /> High Scores ({mode === 'turn1' ? 'Turn 1' : 'Turn 3'})
          </h3>

          <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0 pr-1">
            {highScores.length === 0 ? (
              <div className="text-center text-xs text-custom-muted/75 py-12">
                No high score records. Complete a game to list!
              </div>
            ) : (
              highScores.map((entry, idx) => {
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${idx === 0
                      ? 'bg-custom-accent/15 border-custom-accent/40 text-custom-text shadow-sm'
                      : 'bg-custom-card border-custom-border text-custom-text shadow-sm'
                      }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-black text-custom-muted">#{idx + 1}</span>
                      <span className="font-extrabold tracking-wider font-mono text-sm">{entry.gamertag}</span>
                    </div>
                    <div className="text-right">
                      <span className="block font-mono text-xs font-black text-custom-accent">{entry.score} moves</span>
                      <span className="block text-[8px] text-custom-muted/70">{entry.date}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {isScoreSaved && (
            <div className="mt-4 p-3 bg-custom-primary/20 border border-custom-primary/30 rounded-xl text-center">
              <span className="text-xs font-bold text-custom-text block">Score saved successfully!</span>
              <span className="text-[9px] text-custom-muted mt-1 block">Try another round to beat it.</span>
            </div>
          )}
        </div>

      </div>

      {/* Centered Victory Form Overlay Modal */}
      {showWinForm && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 select-none animate-in fade-in duration-200">
          <div className="w-[340px] bg-custom-card border border-custom-accent/60 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[4px] bg-custom-accent" />

            <div className="flex flex-col items-center">
              <span className="text-4xl mb-2 animate-bounce">🎇</span>
              <h4 className="font-extrabold text-lg text-custom-text uppercase tracking-tight">Victory!</h4>
              <p className="text-[10px] text-custom-muted font-bold uppercase tracking-wider">Congratulations, Solitaire Solved!</p>
            </div>

            <p className="text-xs text-custom-text leading-relaxed">
              You resolved Solitaire in <strong className="text-custom-accent">{score}</strong> moves! Enter your initials to submit.
            </p>

            <form onSubmit={handleSaveScoreSubmit} className="space-y-3">
              <input
                type="text"
                maxLength={3}
                placeholder="TAG"
                required
                value={gamertag}
                onChange={e => setGamertag(e.target.value.toUpperCase().slice(0, 3))}
                className="w-full text-center font-mono font-black text-xl tracking-widest px-4 py-2.5 bg-custom-input border border-custom-border rounded-xl focus:outline-none focus:ring-2 focus:ring-custom-accent/50 text-custom-text uppercase"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-custom-accent hover:bg-custom-accent/80 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow"
                >
                  Submit Score
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hasSubmittedOrReset.current = true;
                    const finalCaches = {
                      ...caches,
                      [mode]: null,
                      lastMode: mode
                    };
                    onSaveCache(finalCaches);
                    handleRestart();
                    onClose();
                  }}
                  className="px-4 py-2.5 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-muted font-bold text-xs uppercase rounded-xl transition-all"
                >
                  Skip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
