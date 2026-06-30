import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { 
  DollarSign, 
  Settings, 
  Database, 
  Scan,
  CircleDot,
  HelpCircle,
  X,
  ShoppingCart,
  Tag,
  Printer,
  BookOpen,
  TrendingUp,
  Palette,
  Package,
  ArrowUpCircle,
  AlertTriangle,
  Video,
  Play,
  Pause
} from 'lucide-react';
import RegisterView from './components/RegisterView';
import AdminView from './components/AdminView';
import ScannerListener from './components/ScannerListener';
import { Theme } from './types';
import logoImg from './logo.png';
import { SolitaireModal } from './components/SolitaireModal';
import { PlaybackWindow } from './components/PlaybackWindow';

const starterThemes: Theme[] = [
  {
    id: 'thc',
    name: 'THC Dark',
    bg: '#081a12',
    card: 'rgba(15, 46, 34, 0.75)',
    text: '#ffffff',
    muted: '#a7f3d0',
    primary: '#10b981',
    primaryHover: '#059669',
    accent: '#3b82f6',
    border: 'rgba(16, 185, 129, 0.25)',
    header: '#0b241b',
    input: '#040e0a'
  },
  {
    id: 'thc-light',
    name: 'THC Light',
    bg: '#f0fdf4',
    card: '#ffffff',
    text: '#064e3b',
    muted: '#047857',
    primary: '#10b981',
    primaryHover: '#059669',
    accent: '#2563eb',
    border: '#a7f3d0',
    header: '#dcfce7',
    input: '#ffffff'
  },
  {
    id: 'patriotic',
    name: 'Patriotic',
    bg: '#0a192f',
    card: '#172a45',
    text: '#ffffff',
    muted: '#8892b0',
    primary: '#e63946',
    primaryHover: '#d62828',
    accent: '#3b82f6',
    border: 'rgba(59, 130, 246, 0.3)',
    header: '#1d3557',
    input: '#0c1a2f'
  },
  {
    id: 'high-contrast',
    name: 'High Contrast (Sunlight)',
    bg: '#ffffff',
    card: '#ffffff',
    text: '#000000',
    muted: '#374151',
    primary: '#000000',
    primaryHover: '#1f2937',
    accent: '#000000',
    border: '#000000',
    header: '#ffffff',
    input: '#ffffff'
  }
];

export const App: React.FC = () => {
  const isPlayback = typeof window !== 'undefined' && window.location.search.includes('window=playback');

  const [activeTab, setActiveTab] = useState<'register' | 'admin'>('register');
  const [scannedBarcode, setScannedBarcode] = useState<string>('');
  const [dbPath, setDbPath] = useState<string>('Resolving SQLite path...');
  const [isScannerListening, setIsScannerListening] = useState<boolean>(true);
  const [dbConnected, setDbConnected] = useState<boolean>(false);
  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(false);
  const [tutorialMode, setTutorialMode] = useState<'volunteer' | 'admin'>('volunteer');
  const [activeTutorialStep, setActiveTutorialStep] = useState<number>(0);

  // Showcase video playback state
  const [isPlaybackWindowOpen, setIsPlaybackWindowOpen] = useState<boolean>(false);

  // Updater states
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [showAdminWarning, setShowAdminWarning] = useState<boolean>(false);

  // Solitaire easter egg states
  const [showSolitaireModal, setShowSolitaireModal] = useState<boolean>(false);
  const [cachedSolitaireState, setCachedSolitaireState] = useState<any>(null);
  const [, setLogoClickCount] = useState<number>(0);
  const [logoClickTimer, setLogoClickTimer] = useState<any>(null);

  const handleLogoClick = () => {
    if (logoClickTimer) clearTimeout(logoClickTimer);
    setLogoClickCount(prev => {
      const next = prev + 1;
      if (next >= 10) {
        setShowSolitaireModal(true);
        return 0;
      }
      return next;
    });
    const timer = setTimeout(() => {
      setLogoClickCount(0);
    }, 3000);
    setLogoClickTimer(timer);
  };

  // Themes state loading from SQLite settings
  const [themes, setThemes] = useState<Theme[]>(starterThemes);
  const [activeThemeId, setActiveThemeId] = useState<string>('thc');
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(10);
  const [totalStockCostSpent, setTotalStockCostSpent] = useState<number>(0);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const activeTheme = await invoke<string | null>('get_setting', { key: 'active_theme' });
        if (activeTheme) {
          setActiveThemeId(activeTheme);
        }

        const customThemesJson = await invoke<string | null>('get_setting', { key: 'custom_themes' });
        if (customThemesJson) {
          try {
            const parsed = JSON.parse(customThemesJson) as Theme[];
            const custom = parsed.filter(t => t.isCustom);
            setThemes([...starterThemes, ...custom]);
          } catch (e) {
            console.error('Failed to parse custom themes from DB', e);
          }
        }

        const threshold = await invoke<string | null>('get_setting', { key: 'low_stock_threshold' });
        if (threshold) {
          setLowStockThreshold(parseInt(threshold, 10));
        }

        const costSpent = await invoke<string | null>('get_setting', { key: 'total_stock_cost_spent' });
        if (costSpent) {
          setTotalStockCostSpent(parseFloat(costSpent));
        }
      } catch (e) {
        console.error('Failed to load settings from DB', e);
      }
    };
    loadSettings();
  }, []);

  const activeTheme = themes.find(t => t.id === activeThemeId) || starterThemes[0];

  const handleSelectTheme = async (id: string) => {
    setActiveThemeId(id);
    try {
      await invoke('save_setting', { key: 'active_theme', value: id });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCustomTheme = async (theme: Theme) => {
    const newThemes = [...themes.filter(t => t.id !== theme.id), theme];
    setThemes(newThemes);
    setActiveThemeId(theme.id);
    try {
      await invoke('save_setting', { key: 'custom_themes', value: JSON.stringify(newThemes) });
      await invoke('save_setting', { key: 'active_theme', value: theme.id });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCustomTheme = async (id: string) => {
    if (id === activeThemeId) {
      setActiveThemeId('thc');
      try {
        await invoke('save_setting', { key: 'active_theme', value: 'thc' });
      } catch (e) {
        console.error(e);
      }
    }
    const newThemes = themes.filter(t => t.id !== id);
    setThemes(newThemes);
    try {
      await invoke('save_setting', { key: 'custom_themes', value: JSON.stringify(newThemes) });
    } catch (e) {
      console.error(e);
    }
  };

  const handleThresholdChange = async (val: number) => {
    setLowStockThreshold(val);
    try {
      await invoke('save_setting', { key: 'low_stock_threshold', value: val.toString() });
    } catch (e) {
      console.error(e);
    }
  };

  const handleTotalCostChange = async (val: number) => {
    setTotalStockCostSpent(val);
    try {
      await invoke('save_setting', { key: 'total_stock_cost_spent', value: val.toString() });
    } catch (e) {
      console.error(e);
    }
  };

  // Check for updates automatically on start
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update) {
          setUpdateAvailable(update);
          setShowUpdateModal(true);
        }
      } catch (e) {
        console.warn('Updater plugin not available or dev context:', e);
      }
    };
    checkForUpdates();
  }, []);

  // Listen for video status updates and handle playback state sync
  useEffect(() => {
    // Check if playback window exists on start
    const checkPlaybackWindow = async () => {
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const win = await WebviewWindow.getByLabel('playback');
        setIsPlaybackWindowOpen(win !== null);
      } catch (e) {
        console.warn('Playback window API error:', e);
      }
    };
    checkPlaybackWindow();

    const unlisten = listen<any>('video-status-update', () => {
      setIsPlaybackWindowOpen(prev => {
        if (!prev) return true;
        return prev;
      });
    });

    const unlistenClosed = listen('playback-window-closed', () => {
      setIsPlaybackWindowOpen(false);
      emit('video-status-update', { playing: false, currentTime: 0, duration: 0, title: '', path: '' });
    });

    return () => {
      unlisten.then(f => f());
      unlistenClosed.then(f => f());
    };
  }, []);

  const playShowcaseVideo = async (title: string, path: string) => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const win = await WebviewWindow.getByLabel('playback');
      if (!win) {
        await invoke('toggle_playback_window');
        // Let window initialize and setup listener
        setTimeout(() => {
          emit('showcase-play-video', { title, path });
          setIsPlaybackWindowOpen(true);
        }, 1000);
      } else {
        emit('showcase-play-video', { title, path });
        setIsPlaybackWindowOpen(true);
      }
    } catch (e) {
      console.error('Failed to command playback window', e);
    }
  };

  const handleTogglePlaybackWindow = async () => {
    try {
      const opened = await invoke<boolean>('toggle_playback_window');
      setIsPlaybackWindowOpen(opened);
      if (!opened) {
        emit('video-status-update', { playing: false, currentTime: 0, duration: 0, title: '', path: '' });
      }
    } catch (e) {
      console.error('Failed to toggle playback window', e);
    }
  };

  const handleOpenReleasesPage = async () => {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl('https://github.com/japressley8/THCFireworksPOS/releases');
      setShowUpdateModal(false);
    } catch (err) {
      alert('Failed to open download page: ' + err);
    }
  };

  useEffect(() => {
    loadDatabasePath();
  }, []);

  const loadDatabasePath = async () => {
    try {
      const path = await invoke<string>('get_db_path');
      setDbPath(path);
      setDbConnected(true);
    } catch (err) {
      setDbPath('Failed to link database: ' + err);
      setDbConnected(false);
    }
  };

  const handleGlobalBarcodeScan = (barcode: string) => {
    setScannedBarcode(barcode);
    if (showSolitaireModal) {
      setShowSolitaireModal(false);
      setActiveTab('register');
    }
  };

  const clearScan = () => {
    setScannedBarcode('');
  };

  const themeStyles = {
    '--color-bg': activeTheme.bg,
    '--color-card': activeTheme.card,
    '--color-text': activeTheme.text,
    '--color-muted': activeTheme.muted,
    '--color-primary': activeTheme.primary,
    '--color-primary-hover': activeTheme.primaryHover,
    '--color-accent': activeTheme.accent,
    '--color-border': activeTheme.border,
    '--color-header': activeTheme.header,
    '--color-input': activeTheme.input || '#05080e',
  } as React.CSSProperties;

  // Expose the configured tax rate (e.g. 0.00 = 0%, 0.08 = 8%)
  const taxRate = 0.00;

  if (isPlayback) {
    return <PlaybackWindow themeStyles={themeStyles} />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-custom-bg text-custom-text overflow-hidden font-sans" style={themeStyles}>
      
      {/* UPDATE MODAL POPUP */}
      {showUpdateModal && updateAvailable && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header branding band */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-red-600 via-white to-blue-600" />
            
            {/* Close / Remind Later top button */}
            <button
              id="btn-update-close"
              onClick={() => setShowUpdateModal(false)}
              className="absolute top-4 right-4 p-2 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-muted hover:text-custom-text rounded-xl transition-all"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3.5 mb-5 mt-2">
              <div className="p-3 bg-custom-primary/25 text-custom-primary rounded-2xl border border-custom-primary/30">
                <ArrowUpCircle className="h-6 w-6 text-custom-accent animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-black text-custom-text uppercase tracking-tight">Software Update</h3>
                <p className="text-[10px] text-custom-muted font-bold uppercase tracking-wider">New Release Found on GitHub</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-custom-input/40 rounded-xl p-4 border border-custom-border/30">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold text-custom-muted uppercase tracking-wider">Target Version</span>
                  <span className="text-xs font-bold text-custom-accent font-mono bg-custom-primary/25 px-2 py-0.5 rounded border border-custom-primary/30">
                    v{updateAvailable.version}
                  </span>
                </div>
                {updateAvailable.body && (
                  <div>
                    <span className="text-[9px] font-extrabold text-custom-muted uppercase tracking-wider block mb-1.5">Release Notes:</span>
                    <p className="text-xs text-custom-text leading-relaxed bg-custom-input/40 rounded-lg p-3 max-h-32 overflow-y-auto font-sans border border-custom-border/20 whitespace-pre-line">
                      {updateAvailable.body}
                    </p>
                  </div>
                )}
              </div>

              <p className="text-xs text-custom-muted leading-relaxed mt-2">
                To keep your app <strong className="text-custom-accent">100% portable</strong> on your USB drive, clicking below will open the GitHub Releases page in your web browser. 
                Simply download the new <code className="text-custom-text font-mono font-bold bg-custom-input px-1 py-0.5 rounded">fireworks-pos-app.exe</code> directly to your USB drive and replace the old file.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  id="btn-update-remind-later"
                  onClick={() => setShowUpdateModal(false)}
                  className="flex-1 py-3 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text font-bold text-xs rounded-xl transition-all active:scale-95 shadow"
                >
                  Remind Me Later
                </button>
                <button
                  id="btn-update-execute"
                  onClick={handleOpenReleasesPage}
                  className="flex-1 py-3 bg-custom-primary hover:bg-custom-primary-hover text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow-lg border border-white/10"
                >
                  Download Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RESTRICTED ACCESS WARNING MODAL */}
      {showAdminWarning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header branding band */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-red-600" />
            
            <div className="flex items-center gap-3.5 mb-5 mt-2">
              <div className="p-3 bg-red-500/25 text-red-500 rounded-2xl border border-red-500/30">
                <AlertTriangle className="h-6 w-6 text-red-500 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-black text-custom-text uppercase tracking-tight">Restricted Access</h3>
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Authorized Staff Only</p>
              </div>
            </div>

            <p className="text-xs text-custom-muted leading-relaxed mb-6">
              This area is restricted to qualified staff only. Proceeding allows access to sensitive inventory records, pricing configurations, and system analytics. Do you wish to proceed?
            </p>

            <div className="flex gap-3">
              <button
                id="btn-warn-cancel"
                onClick={() => setShowAdminWarning(false)}
                className="flex-1 py-3 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text font-bold text-xs rounded-xl transition-all active:scale-95 shadow"
              >
                Cancel
              </button>
              <button
                id="btn-warn-proceed"
                onClick={() => {
                  setShowAdminWarning(false);
                  setActiveTab('admin');
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow-lg border border-white/10"
              >
                Proceed to Admin
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* GLOBAL KEYBOARD SCANNERS INTERCEPTOR */}
      <ScannerListener 
        onScan={handleGlobalBarcodeScan} 
        isEnabled={isScannerListening} 
      />

      {/* TOP HEADER STATUS & BAR */}
      <header className="bg-custom-header border-b border-custom-border px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 shadow-lg relative">
        {/* Glow effect at the top */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-red-600 via-white to-blue-600" />
        
        {/* App Branding */}
        <div className="flex items-center gap-3 select-none">
          <img 
            src={logoImg} 
            className="h-10 w-10 hover:scale-105 active:scale-95 transition-all rounded-full border border-custom-border shadow-lg cursor-pointer" 
            alt="THC Logo" 
            onClick={handleLogoClick}
          />
          <div>
            <h1 className="text-xl font-black tracking-tight text-custom-text flex items-center gap-1.5 uppercase">
              THC<span className="text-custom-accent"> Fireworks</span>
            </h1>
            <p className="text-[10px] font-bold text-custom-muted uppercase tracking-widest">
              Thousand Hills Church POS
            </p>
          </div>
        </div>

        {/* View Switcher Toggles */}
        <div className="flex bg-custom-bg border border-custom-border rounded-2xl p-1 shadow-inner select-none animate-in">
          <button
            id="btn-nav-register"
            onClick={() => setActiveTab('register')}
            className={`px-6 py-3 rounded-xl text-base font-extrabold flex items-center gap-2.5 transition-all active:scale-95 ${
              activeTab === 'register'
                ? 'bg-custom-primary text-white shadow-md'
                : 'text-custom-muted hover:text-custom-text'
            }`}
          >
            <DollarSign className="h-4.5 w-4.5" /> Sales Register
          </button>
          <button
            id="btn-nav-admin"
            onClick={() => {
              if (activeTab === 'register') {
                setShowAdminWarning(true);
              } else {
                setActiveTab('admin');
              }
            }}
            className={`px-6 py-3 rounded-xl text-base font-extrabold flex items-center gap-2.5 transition-all active:scale-95 ${
              activeTab === 'admin'
                ? 'bg-custom-primary text-white shadow-md'
                : 'text-custom-muted hover:text-custom-text'
            }`}
          >
            <Settings className="h-4.5 w-4.5" /> Admin
          </button>
        </div>

        {/* Telemetry Status widgets */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold select-none">
          {/* Barcode scanner wedge state */}
          <button
            id="btn-toggle-scanner-state"
            onClick={() => setIsScannerListening(prev => !prev)}
            className={`px-3 py-1.5 rounded-lg border bg-custom-input border-custom-border transition-all flex items-center gap-2 cursor-pointer ${
              isScannerListening 
                ? 'text-emerald-500 hover:bg-emerald-500/10' 
                : 'text-red-500 hover:bg-red-500/10'
            }`}
            title="Click to toggle wedge barcode scanner listener"
          >
            <Scan className="h-3.5 w-3.5" />
            <span>{isScannerListening ? 'Scanner Hook: ON' : 'Scanner Hook: OFF'}</span>
          </button>

          {/* Showcase Video Playback Screen Toggle */}
          <button
            id="btn-toggle-playback-window"
            onClick={handleTogglePlaybackWindow}
            className={`px-3 py-1.5 rounded-lg border bg-custom-input border-custom-border transition-all flex items-center gap-2 cursor-pointer ${
              isPlaybackWindowOpen 
                ? 'text-custom-accent border-custom-accent/40 hover:bg-custom-accent/10' 
                : 'text-custom-muted hover:text-custom-text'
            }`}
            title="Toggle Secondary Showcase Video Playback Screen"
          >
            <Video className="h-3.5 w-3.5" />
            <span>Showcase Screen: {isPlaybackWindowOpen ? 'ON' : 'OFF'}</span>
          </button>
          
          {/* Help Tutorial trigger */}
          <button
            id="btn-trigger-help-tutorial"
            onClick={() => setShowTutorialModal(true)}
            className="px-3 py-1.5 rounded-lg border border-custom-border bg-custom-input text-custom-primary hover:bg-custom-primary/10 transition-all flex items-center gap-2 cursor-pointer"
            title="Open Interactive Volunteer Guide"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Volunteer Guide</span>
          </button>

          {/* Database Path indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-custom-input border border-custom-border rounded-lg max-w-[240px] md:max-w-[320px] text-custom-muted relative group">
            <Database className="h-3.5 w-3.5 text-custom-accent shrink-0" />
            <span className="truncate font-mono text-[10px]" title={dbPath}>
              DB: {dbPath}
            </span>
            <span className="absolute -bottom-8 right-0 bg-custom-card border border-custom-border text-custom-text text-[9px] px-2 py-1 rounded shadow-xl hidden group-hover:block whitespace-nowrap z-50">
              100% portable flash drive sqlite storage
            </span>
            <CircleDot className={`h-2 w-2 shrink-0 ${dbConnected ? 'text-emerald-500 fill-emerald-500' : 'text-red-500 fill-red-500'}`} />
          </div>
        </div>
      </header>

      {/* PRIMARY ACTIVE VIEW WINDOW */}
      <main className="flex-1 overflow-hidden p-4 min-h-0 bg-custom-bg">
        {activeTab === 'register' ? (
          <RegisterView 
            scannedBarcode={scannedBarcode} 
            onClearScan={clearScan}
            taxRate={taxRate}
            lowStockThreshold={lowStockThreshold}
            onPlayShowcaseVideo={playShowcaseVideo}
          />
        ) : (
          <AdminView 
            scannedBarcode={scannedBarcode} 
            onClearScan={clearScan}
            activeThemeId={activeThemeId}
            themes={themes}
            onSelectTheme={handleSelectTheme}
            onSaveCustomTheme={handleSaveCustomTheme}
            onDeleteCustomTheme={handleDeleteCustomTheme}
            lowStockThreshold={lowStockThreshold}
            onThresholdChange={handleThresholdChange}
            totalStockCostSpent={totalStockCostSpent}
            onTotalCostChange={handleTotalCostChange}
            onPlayShowcaseVideo={playShowcaseVideo}
            onTriggerUpdateCheck={async () => {
              try {
                const { check } = await import('@tauri-apps/plugin-updater');
                const update = await check();
                if (update) {
                  setUpdateAvailable(update);
                  setShowUpdateModal(true);
                  return true;
                }
                return false;
              } catch (e) {
                console.error(e);
                throw e;
              }
            }}
          />
        )}
      </main>

      {/* VOLUNTEER & ADMIN TUTORIAL MODAL */}
      {showTutorialModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-custom-text text-lg flex items-center gap-2">
                <BookOpen className="h-5.5 w-5.5 text-custom-accent" />
                Volunteer & Admin POS Guides
              </h3>
              <button 
                id="btn-close-tutorial"
                onClick={() => setShowTutorialModal(false)}
                className="p-1.5 hover:bg-custom-primary/10 text-custom-muted hover:text-custom-text transition-all border border-custom-border bg-custom-input rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Sub-Header Tabs */}
            <div className="flex bg-custom-header border-b border-custom-border px-6 py-2 gap-6 select-none">
              <button 
                onClick={() => { setTutorialMode('volunteer'); setActiveTutorialStep(0); }}
                className={`py-2 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all ${
                  tutorialMode === 'volunteer' 
                    ? 'border-custom-accent text-custom-text' 
                    : 'border-transparent text-custom-muted hover:text-custom-text'
                }`}
              >
                Volunteer POS Mode
              </button>
              <button 
                onClick={() => { setTutorialMode('admin'); setActiveTutorialStep(0); }}
                className={`py-2 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all ${
                  tutorialMode === 'admin' 
                    ? 'border-custom-accent text-custom-text' 
                    : 'border-transparent text-custom-muted hover:text-custom-text'
                }`}
              >
                Admin Config Mode
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Step indicator bubbles */}
              <div className="flex justify-between items-center px-4">
                {(tutorialMode === 'volunteer' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3]).map((idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveTutorialStep(idx)}
                    className={`h-9 w-9 rounded-full font-bold text-sm transition-all border flex items-center justify-center ${
                      idx === activeTutorialStep
                        ? 'bg-custom-accent border-custom-accent text-white shadow-lg shadow-custom-accent/30 font-extrabold scale-110'
                        : idx < activeTutorialStep
                        ? 'bg-custom-accent/20 border-custom-accent/40 text-custom-accent'
                        : 'bg-custom-input border-custom-border text-custom-muted'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>

              {/* Active Step Panel */}
              <div className="bg-custom-input/40 border border-custom-border rounded-xl p-5 space-y-4">
                {tutorialMode === 'volunteer' ? (
                  <>
                    {activeTutorialStep === 0 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <ShoppingCart className="h-6 w-6 text-custom-accent" />
                          <h4 className="font-bold text-custom-text text-lg">Register & Shopping Cart</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            Volunteers can build checkouts by clicking products inside the <strong>Quick Add Products</strong> panel on the right of the sales window, or scanning their barcodes.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li>Adjust quantities on any cart item row using the <span className="font-bold">+</span> and <span className="font-bold">-</span> controls.</li>
                            <li>If stock tracking is active, the app blocks additions beyond inventory counts unless the manager has enabled out-of-stock checkouts.</li>
                            <li>Press the Trash icon to instantly remove items from the active checkout register.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 1 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <Tag className="h-6 w-6 text-custom-primary" />
                          <h4 className="font-bold text-custom-text text-lg">Discounts & Special Keypad</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            Apply percentage promotions or staff benefits to cart subtotals using the discounts toolbar.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li>Click discount shortcut buttons on the right side of the screen (e.g. Volunteer, Bulk discount) to apply.</li>
                            <li>Click <strong>Add Custom Discount Keypad</strong> to toggle the virtual numpad. Type numbers, delete with Backspace, and press Enter to save.</li>
                            <li>Discounts can be cleared at any time by pressing the active promotion's toggle button again.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 2 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <Scan className="h-6 w-6 text-custom-accent" />
                          <h4 className="font-bold text-custom-text text-lg">Wedge Scanners & Manual Entry</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            The POS intercepts sweeps from hardware USB barcode scanner guns automatically.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li>Ensure the green <strong>Scanner Hook: ON</strong> header button is active to capture scanning gun inputs.</li>
                            <li>Damaged labels override: type the barcode number manually in the UPC text input and click <strong>Add Item</strong>.</li>
                            <li>Yellow warnings and alerts automatically trigger in the header when scanned items drop below low-stock threshold levels.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 3 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <Printer className="h-6 w-6 text-custom-primary" />
                          <h4 className="font-bold text-custom-text text-lg">Complete Sales & Print Receipts</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            Record transaction ledgers, compute cash change, and trigger roll receipt printing.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li>Click <strong>Complete Sale</strong> (or press Ctrl+Enter) to save. Select cash or credit.</li>
                            <li>The transaction popup calculates exact change details for cash purchases.</li>
                            <li>Press <strong>Print Receipt</strong> (Ctrl+P) to output standard 80mm receipts to roll thermal printers. Sales can be reprinted later in the Sales Ledger.</li>
                          </ul>
                        </div>
                      </>
                    )}
                    {activeTutorialStep === 4 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <Video className="h-6 w-6 text-custom-accent" />
                          <h4 className="font-bold text-custom-text text-lg">Showcase Videos Screen</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            Present high-definition product demonstrations to customers on a secondary display screen.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li>Click the green <strong>Showcase Screen: ON</strong> header button to open the secondary window, and drag it to your customer-facing screen.</li>
                            <li>Click the Video icon next to any product in the Quick Add grid, checkout cart, or product catalog to launch play.</li>
                            <li>Playback controls, seeking timelines, volume muting, and fullscreen options sync instantly between both displays.</li>
                          </ul>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {activeTutorialStep === 0 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <Package className="h-6 w-6 text-custom-accent" />
                          <h4 className="font-bold text-custom-text text-lg">Catalog inventory & Thresholds</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            Manage the booth's product offerings, cost thresholds, and warning thresholds.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li>Leave the stock count blank to designate an item as "Infinity Stock" (unrestricted sales).</li>
                            <li>Configure global safety alerts in settings by setting the <strong>Low-Stock Notification Threshold</strong>.</li>
                            <li>Log internally visible manager notes on catalog rows to track items, stock notes, or wholesale locations.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 1 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <Tag className="h-6 w-6 text-custom-primary" />
                          <h4 className="font-bold text-custom-text text-lg">Wholesale Cases & Case Sales</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            Link individual retail items to wholesale case items to support bulk selling.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li>Assign a unique bulk barcode, bulk pack case quantity (e.g. 24 units), and bulk case price to a product.</li>
                            <li>When volunteers scan the case barcode, the app sells the wholesale variant and automatically decrements 24 units from individual item stock.</li>
                            <li>Toggle the out-of-stock checkout permission setting to prevent or allow selling beyond available stock.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 2 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <Palette className="h-6 w-6 text-custom-accent" />
                          <h4 className="font-bold text-custom-text text-lg">Sunlight Visibility & Color Builder</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            Skin the application to fit direct sunlight marquee setups.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li>Select the <strong>High Contrast (Sunlight)</strong> theme for maximum legibility when working outdoors.</li>
                            <li>Build custom color profiles using the theme builder. Tweak buttons, headers, cards, and inputs. All configurations are stored directly in SQLite settings.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 3 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <TrendingUp className="h-6 w-6 text-custom-primary" />
                          <h4 className="font-bold text-custom-text text-lg">Analytics, Profits & Ledger Maintenance</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            Audit ledger logs, profit trends, margins, and dangerous database operations.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li>Track the total cost of merchandise purchased using the <strong>Total Stock Cost Spent</strong> tracker in settings.</li>
                            <li>Compare year-over-year revenue and net profit margins side-by-side in SVG graphs.</li>
                            <li>Reprint receipts or delete records in the Sales Ledger. To clear database tables, input the system generated random <strong>Confirmation Code</strong>.</li>
                          </ul>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="bg-custom-header border-t border-custom-border px-6 py-4 flex items-center justify-between">
              <button
                id="btn-tutorial-prev"
                onClick={() => setActiveTutorialStep(prev => Math.max(0, prev - 1))}
                disabled={activeTutorialStep === 0}
                className="px-4 py-2 bg-custom-input hover:bg-custom-primary/10 text-custom-muted hover:text-custom-text font-semibold rounded-lg border border-custom-border active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all text-xs"
              >
                Previous
              </button>
              
              {activeTutorialStep < (tutorialMode === 'volunteer' ? 4 : 3) ? (
                <button
                  id="btn-tutorial-next"
                  onClick={() => setActiveTutorialStep(prev => prev + 1)}
                  className="px-5 py-2.5 bg-custom-primary hover:bg-custom-primary-hover text-white font-bold rounded-lg active:scale-95 transition-all text-xs"
                >
                  Next Step
                </button>
              ) : (
                <button
                  id="btn-tutorial-finish"
                  onClick={() => { setShowTutorialModal(false); setActiveTutorialStep(0); }}
                  className="px-5 py-2.5 bg-custom-primary hover:bg-custom-primary-hover text-white font-bold rounded-lg active:scale-95 transition-all text-xs shadow-lg shadow-black/20"
                >
                  Get Started
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showSolitaireModal && (
        <SolitaireModal 
          isOpen={showSolitaireModal}
          onClose={() => setShowSolitaireModal(false)}
          cachedState={cachedSolitaireState}
          onSaveCache={(state) => setCachedSolitaireState(state)}
        />
      )}

      {/* MINI VIDEO PLAYBACK CONTROLLER (MAIN WINDOW) */}
      <MiniPlaybackController onCloseController={() => setIsPlaybackWindowOpen(false)} />
    </div>
  );
};

interface MiniPlaybackControllerProps {
  onCloseController: () => void;
}

const MiniPlaybackController: React.FC<MiniPlaybackControllerProps> = ({ onCloseController }) => {
  const [videoPlaying, setVideoPlaying] = useState<boolean>(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [videoPath, setVideoPath] = useState<string>('');

  useEffect(() => {
    let active = true;
    const unlistenPromise = listen<any>('video-status-update', (event) => {
      if (!active) return;
      const status = event.payload;
      setVideoPlaying(status.playing);
      setVideoCurrentTime(status.currentTime);
      setVideoDuration(status.duration);
      setVideoTitle(status.title);
      setVideoPath(status.path);
    });

    return () => {
      active = false;
      unlistenPromise.then(f => f());
    };
  }, []);

  if (!videoPath) return null;

  return (
    <div className={`bg-custom-header border-t border-custom-border p-3.5 flex flex-col md:flex-row items-center justify-between gap-4 select-none animate-in slide-in-from-bottom duration-200 shrink-0 ${videoPlaying ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-3 w-full md:w-auto min-w-0">
        <Video className="h-4.5 w-4.5 text-custom-accent shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-extrabold truncate max-w-sm text-custom-text">{videoTitle}</span>
          <span className="block text-[9px] text-custom-muted font-mono tracking-wider mt-0.5">
            {videoPlaying ? 'SHOWCASE PLAYING' : 'SHOWCASE PAUSED'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 w-full md:w-auto shrink-0">
        {/* Timeline */}
        <div className="flex items-center gap-2 flex-1 md:w-64 font-mono text-[10px] text-custom-muted">
          <span>{Math.floor(videoCurrentTime / 60)}:{(Math.floor(videoCurrentTime % 60) < 10 ? '0' : '') + Math.floor(videoCurrentTime % 60)}</span>
          <input
            type="range"
            min={0}
            max={videoDuration || 100}
            value={videoCurrentTime}
            onChange={(e) => emit('video-control-seek', { seconds: parseFloat(e.target.value) })}
            className="flex-1 h-1 bg-custom-input rounded-lg appearance-none cursor-pointer accent-custom-accent border border-custom-border/50"
          />
          <span>{Math.floor(videoDuration / 60)}:{(Math.floor(videoDuration % 60) < 10 ? '0' : '') + Math.floor(videoDuration % 60)}</span>
        </div>

        {/* Play/Pause control buttons */}
        <button
          onClick={() => emit(videoPlaying ? 'video-control-pause' : 'video-control-play')}
          className="p-2 bg-custom-primary hover:bg-custom-primary-hover text-white rounded-xl shadow active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          {videoPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-white" />}
        </button>

        {/* Clear/Stop bar */}
        <button
          onClick={() => {
            setVideoPath('');
            onCloseController();
          }}
          className="p-2 bg-custom-input border border-custom-border hover:bg-custom-primary/10 text-custom-text rounded-xl transition-all active:scale-95 flex items-center justify-center cursor-pointer"
          title="Close controller bar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default App;
