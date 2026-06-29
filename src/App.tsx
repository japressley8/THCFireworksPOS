import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
  ArrowUpCircle
} from 'lucide-react';
import RegisterView from './components/RegisterView';
import AdminView from './components/AdminView';
import ScannerListener from './components/ScannerListener';
import { Theme } from './types';
import logoImg from './logo.png';

const starterThemes: Theme[] = [
  {
    id: 'dark',
    name: 'Dark Mode',
    bg: '#090d16',
    card: 'rgba(15, 23, 42, 0.75)',
    text: '#f8fafc',
    muted: '#94a3b8',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    accent: '#f59e0b',
    border: 'rgba(51, 65, 85, 0.5)',
    header: '#0f172a',
    input: '#05080e'
  },
  {
    id: 'light',
    name: 'Light Mode',
    bg: '#f8fafc',
    card: '#ffffff',
    text: '#0f172a',
    muted: '#475569',
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    accent: '#d97706',
    border: '#cbd5e1',
    header: '#e2e8f0',
    input: '#ffffff'
  },
  {
    id: 'thc',
    name: 'THC Mode',
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
  const [activeTab, setActiveTab] = useState<'register' | 'admin'>('register');
  const [scannedBarcode, setScannedBarcode] = useState<string>('');
  const [dbPath, setDbPath] = useState<string>('Resolving SQLite path...');
  const [isScannerListening, setIsScannerListening] = useState<boolean>(true);
  const [dbConnected, setDbConnected] = useState<boolean>(false);
  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(false);
  const [tutorialMode, setTutorialMode] = useState<'volunteer' | 'admin'>('volunteer');
  const [activeTutorialStep, setActiveTutorialStep] = useState<number>(0);

  // Updater states
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [updateProgress, setUpdateProgress] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);

  // Themes state loading from localStorage or starters
  const [themes, setThemes] = useState<Theme[]>(() => {
    const saved = localStorage.getItem('thc_fireworks_themes');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Theme[];
        const custom = parsed.filter(t => t.isCustom);
        return [...starterThemes, ...custom];
      } catch (e) {
        return starterThemes;
      }
    }
    return starterThemes;
  });

  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    return localStorage.getItem('thc_fireworks_active_theme') || 'thc';
  });

  const activeTheme = themes.find(t => t.id === activeThemeId) || starterThemes[0];

  const handleSelectTheme = (id: string) => {
    setActiveThemeId(id);
    localStorage.setItem('thc_fireworks_active_theme', id);
  };

  const handleSaveCustomTheme = (theme: Theme) => {
    const newThemes = [...themes.filter(t => t.id !== theme.id), theme];
    setThemes(newThemes);
    localStorage.setItem('thc_fireworks_themes', JSON.stringify(newThemes));
    setActiveThemeId(theme.id);
    localStorage.setItem('thc_fireworks_active_theme', theme.id);
  };

  const handleDeleteCustomTheme = (id: string) => {
    if (id === activeThemeId) {
      setActiveThemeId('thc');
      localStorage.setItem('thc_fireworks_active_theme', 'thc');
    }
    const newThemes = themes.filter(t => t.id !== id);
    setThemes(newThemes);
    localStorage.setItem('thc_fireworks_themes', JSON.stringify(newThemes));
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

  const handleInstallUpdate = async () => {
    if (!updateAvailable) return;
    setIsUpdating(true);
    setUpdateProgress('Starting download...');
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      let downloaded = 0;
      let contentLength = 0;

      await updateAvailable.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            setUpdateProgress('Downloading... (0%)');
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            const pct = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
            setUpdateProgress(`Downloading... (${pct}%)`);
            break;
          case 'Finished':
            setUpdateProgress('Installing update...');
            break;
        }
      });
      
      setUpdateProgress('Relaunching...');
      setTimeout(async () => {
        await relaunch();
      }, 1000);
    } catch (err) {
      alert('Failed to install update: ' + err);
      setIsUpdating(false);
      setUpdateProgress('');
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
              disabled={isUpdating}
              className="absolute top-4 right-4 p-2 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-muted hover:text-custom-text rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <p className="text-xs text-custom-text leading-relaxed bg-black/20 rounded-lg p-3 max-h-32 overflow-y-auto font-sans border border-custom-border/20 whitespace-pre-line">
                      {updateAvailable.body}
                    </p>
                  </div>
                )}
              </div>

              {isUpdating ? (
                <div className="space-y-2.5 pt-2">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-custom-muted animate-pulse">{updateProgress}</span>
                    <span className="text-custom-accent font-mono">{updateProgress.includes('%') ? updateProgress.match(/\d+/)?.[0] + '%' : ''}</span>
                  </div>
                  <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden border border-custom-border relative">
                    <div 
                      className="h-full bg-gradient-to-r from-custom-primary to-custom-accent transition-all duration-300" 
                      style={{ 
                        width: updateProgress.includes('%') 
                          ? `${updateProgress.match(/\d+/)?.[0] || 0}%` 
                          : '50%' 
                      }} 
                    />
                  </div>
                </div>
              ) : (
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
                    onClick={handleInstallUpdate}
                    className="flex-1 py-3 bg-custom-primary hover:bg-custom-primary-hover text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow-lg border border-white/10"
                  >
                    Update Now
                  </button>
                </div>
              )}
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
            className="h-10 w-10 hover:scale-105 active:scale-95 transition-all rounded-full border border-custom-border shadow-lg" 
            alt="THC Logo" 
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
            onClick={() => setActiveTab('admin')}
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
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2 cursor-pointer ${
              isScannerListening 
                ? 'bg-emerald-950/60 border-emerald-900 text-emerald-400' 
                : 'bg-red-950/60 border-red-900 text-red-400'
            }`}
            title="Click to toggle wedge barcode scanner listener"
          >
            <Scan className="h-3.5 w-3.5" />
            <span>{isScannerListening ? 'Scanner Hook: ON' : 'Scanner Hook: OFF'}</span>
          </button>
          
          {/* Help Tutorial trigger */}
          <button
            id="btn-trigger-help-tutorial"
            onClick={() => setShowTutorialModal(true)}
            className="px-3 py-1.5 rounded-lg border border-blue-900 bg-blue-950/60 text-blue-400 transition-all flex items-center gap-2 cursor-pointer"
            title="Open Interactive Volunteer Guide"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Volunteer Guide</span>
          </button>

          {/* Database Path indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/40 border border-custom-border rounded-lg max-w-[240px] md:max-w-[320px] text-custom-muted relative group">
            <Database className="h-3.5 w-3.5 text-custom-accent shrink-0" />
            <span className="truncate font-mono text-[10px]" title={dbPath}>
              DB: {dbPath}
            </span>
            <span className="absolute -bottom-8 right-0 bg-slate-900 border border-slate-800 text-[9px] px-2 py-1 rounded shadow-xl hidden group-hover:block whitespace-nowrap z-50">
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
          />
        )}
      </main>

      {/* VOLUNTEER & ADMIN TUTORIAL MODAL */}
      {showTutorialModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-850 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <BookOpen className="h-5.5 w-5.5 text-blue-400" />
                Volunteer & Admin POS Guides
              </h3>
              <button 
                id="btn-close-tutorial"
                onClick={() => setShowTutorialModal(false)}
                className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition-all border border-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Sub-Header Tabs */}
            <div className="flex bg-slate-950 border-b border-slate-800 px-6 py-2 gap-6 select-none">
              <button 
                onClick={() => { setTutorialMode('volunteer'); setActiveTutorialStep(0); }}
                className={`py-2 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all ${
                  tutorialMode === 'volunteer' 
                    ? 'border-blue-500 text-white' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Volunteer POS Mode
              </button>
              <button 
                onClick={() => { setTutorialMode('admin'); setActiveTutorialStep(0); }}
                className={`py-2 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all ${
                  tutorialMode === 'admin' 
                    ? 'border-blue-500 text-white' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Admin Config Mode
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Step indicator bubbles */}
              <div className="flex justify-between items-center px-4">
                {[0, 1, 2, 3].map((idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveTutorialStep(idx)}
                    className={`h-9 w-9 rounded-full font-bold text-sm transition-all border flex items-center justify-center ${
                      idx === activeTutorialStep
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30 font-extrabold scale-110'
                        : idx < activeTutorialStep
                        ? 'bg-blue-950/40 border-blue-900 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-500'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>

              {/* Active Step Panel */}
              <div className="bg-slate-950/50 border border-slate-850 rounded-xl p-5 space-y-4">
                {tutorialMode === 'volunteer' ? (
                  <>
                    {activeTutorialStep === 0 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                          <ShoppingCart className="h-6 w-6 text-emerald-400" />
                          <h4 className="font-bold text-white text-lg">Register & Shopping Cart</h4>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300">
                          <p>
                            Volunteers can click items in the <strong>Quick Add Products</strong> panel on the right side of the screen to quickly load them into the checkout register.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1.5">
                            <li>Use the green <span className="text-emerald-400 font-bold">+</span> and red <span className="text-red-400 font-bold">-</span> buttons on any cart item row to adjust the volume.</li>
                            <li>If a volunteer attempts to add more items than are in stock, the app will display a notification and restrict additions to prevent stock overselling.</li>
                            <li>Stock optional: items without stock counts are infinite/unrestricted.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 1 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                          <Scan className="h-6 w-6 text-blue-400" />
                          <h4 className="font-bold text-white text-lg">Barcode Scanning (UPC)</h4>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300">
                          <p>
                            The application captures scans from USB barcode guns. Simply aim and scan.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1.5">
                            <li>Wedge scanning works out of the box when the green <strong>Scanner Hook: ON</strong> header state is active.</li>
                            <li>Bulk sales: scanning a bulk case UPC adds a case cart item, which decrements the individual product stock levels by case quantity.</li>
                            <li>If a barcode label is damaged, type the barcode manually and click Add Item.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 2 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                          <Tag className="h-6 w-6 text-amber-400" />
                          <h4 className="font-bold text-white text-lg">Custom Discount Presets</h4>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300">
                          <p>
                            Apply custom promotions or church group member discounts to cart subtotals.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1.5">
                            <li>Scroll through active discount presets on the left side of the sales page. Click to apply/toggle.</li>
                            <li>For custom special pricing, click <strong>Add Custom Discount Keypad</strong> to pull up a virtual numpad.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 3 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                          <Printer className="h-6 w-6 text-red-400" />
                          <h4 className="font-bold text-white text-lg">Complete Checkout & Print</h4>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300">
                          <p>
                            Finalize transactions, trigger receipt printing, and complete sales securely.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1.5">
                            <li>Click the green <strong>Complete Sale</strong> button to submit.</li>
                            <li>Low-Stock warning banners will trigger if any item drops below the manager's defined threshold.</li>
                            <li>Successful sales display a receipt. Click <strong>Print Receipt</strong> to send to roll printers.</li>
                          </ul>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {activeTutorialStep === 0 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                          <Package className="h-6 w-6 text-emerald-400" />
                          <h4 className="font-bold text-white text-lg">Product Catalog & Notes</h4>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300">
                          <p>
                            Configure the booth's catalog, wholesale price parameters, and custom item logs.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1.5">
                            <li>Leave the stock count blank to disable stock tracking for an item (infinity stock).</li>
                            <li>Allow admins to type notes on each item. These notes are stored in SQLite and only display inside the admin manager catalog table.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 1 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                          <Tag className="h-6 w-6 text-blue-400" />
                          <h4 className="font-bold text-white text-lg">Wholesale & Bulk Selling</h4>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300">
                          <p>
                            Configure items to be purchased individually OR wholesale in cases.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1.5">
                            <li>Specify a unique bulk barcode, bulk price, and bulk pack quantity (e.g. 24 units inside).</li>
                            <li>When volunteers scan the bulk case barcode, the app sells the bulk variant at the bulk price and automatically deducts 24 units from individual item stock.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 2 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                          <Palette className="h-6 w-6 text-amber-400" />
                          <h4 className="font-bold text-white text-lg">Sunlight Visibility Themes</h4>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300">
                          <p>
                            Skin the application header, background, buttons, and custom inputs.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1.5">
                            <li>Select <strong>High Contrast (Sunlight)</strong> theme for maximum sunlight legibility when selling outdoors.</li>
                            <li>Build custom color schemes using the color builder panel, allowing inputs to take distinct backgrounds.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 3 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                          <TrendingUp className="h-6 w-6 text-red-400" />
                          <h4 className="font-bold text-white text-lg">Analytics, Profit & YoY Trends</h4>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300">
                          <p>
                            Audit ledger logs, profit stats, and item price histories.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1.5">
                            <li>Adjust low-stock notification thresholds for volunteer terminals.</li>
                            <li>Specify a global "Total spent on stock" cost to calculate actual profit margins: <code>Revenue - Cost</code>.</li>
                            <li>Track item prices as they change year-to-year in the interactive YoY prices grid.</li>
                          </ul>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="bg-slate-950 border-t border-slate-800 px-6 py-4 flex items-center justify-between">
              <button
                id="btn-tutorial-prev"
                onClick={() => setActiveTutorialStep(prev => Math.max(0, prev - 1))}
                disabled={activeTutorialStep === 0}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 font-semibold rounded-lg border border-slate-800 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all text-xs"
              >
                Previous
              </button>
              
              {activeTutorialStep < 3 ? (
                <button
                  id="btn-tutorial-next"
                  onClick={() => setActiveTutorialStep(prev => prev + 1)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg active:scale-95 transition-all text-xs"
                >
                  Next Step
                </button>
              ) : (
                <button
                  id="btn-tutorial-finish"
                  onClick={() => { setShowTutorialModal(false); setActiveTutorialStep(0); }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg active:scale-95 transition-all text-xs shadow-lg shadow-emerald-950/20"
                >
                  Get Started
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;
