/**
 * @file App.tsx
 * @description Main application container and global state coordinator for the THC Fireworks POS.
 *
 * This component handles:
 * 1. Global Themes: Manages and loads the system UI themes, applying custom styling variables.
 * 2. Navigation & View Routing: Switches tabs between the Sales Register ('register') and Manager Dashboard ('admin').
 * 3. Database Recovery Alerts: Captures database restore states and displays the self-healing recovery banner.
 * 4. Keyboard Wedge Gating: Syncs current navigation focus to enable/disable global barcode wedge listeners.
 */

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
  Package,
  ArrowUpCircle,
  AlertTriangle,
  Video,
  Play,
  Pause,
  Lock,
  RefreshCw,
  Loader2
} from 'lucide-react';
import RegisterView from './components/RegisterView';
import AdminView from './components/AdminView';
import ScannerListener from './components/ScannerListener';
import { Theme, CartItem, DbStatus } from './types';
import logoImg from './logo.png';
import { EasterEggModal } from './components/eastereggs/EasterEggModal';
import { PlaybackWindow } from './components/PlaybackWindow';
import { DeveloperWindow } from './components/DeveloperWindow';

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
    bg: '#f8fafc',
    card: '#ffffff',
    text: '#1e3a8a',
    muted: '#475569',
    primary: '#b22234',
    primaryHover: '#8c1b29',
    accent: '#3c3b6e',
    border: '#cbd5e1',
    header: '#dbeafe',
    input: '#ffffff'
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

interface CustomDialogState {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title?: string;
  message: string;
  resolve: (value: boolean) => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export const App: React.FC = () => {
  const isPlayback = typeof window !== 'undefined' && window.location.search.includes('window=playback');
  const isDeveloper = typeof window !== 'undefined' && window.location.search.includes('window=developer');

  const [, setIsDeveloperBypass] = useState<boolean>(false);
  const [, setSimulatedDate] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'register' | 'admin'>('register');
  const [adminSubTab, setAdminSubTab] = useState<'inventory' | 'discounts' | 'taxes' | 'sales' | 'analytics' | 'data' | 'settings' | 'devices' | 'payment_methods'>('inventory');
  const [scannedBarcode, setScannedBarcode] = useState<string>('');
  const [dbPath, setDbPath] = useState<string>('Resolving SQLite path...');
  const [isScannerListening, setIsScannerListening] = useState<boolean>(true);
  const [dbConnected, setDbConnected] = useState<boolean>(false);

  // Database status and recovery states
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [isDbChecking, setIsDbChecking] = useState<boolean>(false);
  const [isRecovering, setIsRecovering] = useState<boolean>(false);
  void isDbChecking;
  
  // Exit cloud backup prompt states
  const [exitBackupModalOpen, setExitBackupModalOpen] = useState<boolean>(false);
  const [isExitBackingUp, setIsExitBackingUp] = useState<boolean>(false);
  const [exitBackupError, setExitBackupError] = useState<string | null>(null);

  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(false);
  const [tutorialMode, setTutorialMode] = useState<'volunteer' | 'admin'>('volunteer');
  const [activeTutorialStep, setActiveTutorialStep] = useState<number>(0);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Custom dialog popup states
  const [dialogState, setDialogState] = useState<CustomDialogState | null>(null);

  const showCustomAlert = (message: string, title: string = 'Notice'): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        type: 'alert',
        title,
        message,
        resolve: (val) => {
          setDialogState(null);
          resolve(val);
        },
        confirmText: 'OK'
      });
    });
  };

  const showCustomConfirm = (
    message: string,
    title: string = 'Confirm Action',
    options?: { confirmText?: string; cancelText?: string; isDanger?: boolean }
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        resolve: (val) => {
          setDialogState(null);
          resolve(val);
        },
        confirmText: options?.confirmText || 'Confirm',
        cancelText: options?.cancelText || 'Cancel',
        isDanger: options?.isDanger || false
      });
    });
  };

  // Showcase video playback state
  const [isPlaybackWindowOpen, setIsPlaybackWindowOpen] = useState<boolean>(false);

  // Updater states
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState<boolean>(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isPortable, setIsPortable] = useState<boolean>(false);
  const [showAdminWarning, setShowAdminWarning] = useState<boolean>(false);

  // Easter egg states
  const [showEasterEggModal, setShowEasterEggModal] = useState<boolean>(false);
  const [cachedEasterEggStates, setCachedEasterEggStates] = useState<{ [year: number]: any }>({});
  const [, setLogoClickCount] = useState<number>(0);
  const [logoClickTimer, setLogoClickTimer] = useState<any>(null);

  // Restore notification state (Task 2.3)
  const [showRestoreModal, setShowRestoreModal] = useState<boolean>(false);
  const [restoreInfo, setRestoreInfo] = useState<{ restored_at: string | null; local_backup_last_updated: string | null } | null>(null);

  // Admin security states
  const [_, setIsAdminPasswordSet] = useState<boolean>(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [adminPasswordTimeout, setAdminPasswordTimeout] = useState<number>(5);
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState<boolean>(false);
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [showForgotFlow, setShowForgotFlow] = useState<boolean>(false);
  const [recoveryTab, setRecoveryTab] = useState<'question' | 'key'>('question');
  const [securityQuestionText, setSecurityQuestionText] = useState<string>('');
  const [recoveryAnswer, setRecoveryAnswer] = useState<string>('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState<string>('');

  // Load restore info on mount — runs once and never again after the flag is cleared.
  useEffect(() => {
    let cancelled = false;
    invoke<{ restored: boolean; restored_at: string | null; local_backup_last_updated: string | null }>('get_backup_restore_info').then((info) => {
      if (cancelled) return;
      if (info.restored) {
        setRestoreInfo({ restored_at: info.restored_at, local_backup_last_updated: info.local_backup_last_updated });
        setShowRestoreModal(true);
      }
    }).catch(() => { });
  }, []);

  // Check if running in portable mode on mount
  useEffect(() => {
    invoke<boolean>('is_portable')
      .then((res) => {
        setIsPortable(res);
      })
      .catch((e) => {
        console.error('Failed to check if portable:', e);
      });
  }, []);

  // Global Event, Error, and Lifecycle Logger
  useEffect(() => {
    // Intercept button clicks globally
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && typeof target.closest === 'function') {
        const button = target.closest('button');
        if (button) {
          const label = (button.innerText || button.getAttribute('aria-label') || button.title || button.id || button.className || '').trim().substring(0, 100);
          invoke('log_event', { level: 'INFO', message: `Button Clicked: "${label}"` }).catch(() => {});
        }
      }
    };

    // Log uncaught script errors
    const handleError = (e: ErrorEvent) => {
      const message = `JS Error: ${e.message} at ${e.filename || 'unknown'}:${e.lineno || 0}:${e.colno || 0}`;
      invoke('log_event', { level: 'ERROR', message }).catch(() => {});
    };

    // Log unhandled promise rejections
    const handleRejection = (e: PromiseRejectionEvent) => {
      let reasonMsg = 'Unknown Reason';
      if (e.reason) {
        if (typeof e.reason === 'object' && e.reason.message) {
          reasonMsg = e.reason.message;
        } else {
          reasonMsg = String(e.reason);
        }
      }
      const message = `Unhandled Promise Rejection: ${reasonMsg}`;
      invoke('log_event', { level: 'ERROR', message }).catch(() => {});
    };

    // Log window focus/blur
    const handleFocus = () => {
      invoke('log_event', { level: 'INFO', message: 'Application Window Gained Focus' }).catch(() => {});
    };
    const handleBlur = () => {
      invoke('log_event', { level: 'INFO', message: 'Application Window Lost Focus' }).catch(() => {});
    };

    window.addEventListener('click', handleClick);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Initial load log
    invoke('log_event', { level: 'INFO', message: 'UI mounts completed. Global event listeners attached.' }).catch(() => {});

    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    invoke('log_event', { level: 'INFO', message: `Navigation: Switched active tab to "${activeTab}"` }).catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    invoke('log_event', { level: 'INFO', message: `Navigation: Switched admin sub-tab to "${adminSubTab}"` }).catch(() => {});
  }, [adminSubTab]);

  const handleLogoClick = () => {
    if (logoClickTimer) clearTimeout(logoClickTimer);
    setLogoClickCount(prev => {
      const next = prev + 1;
      if (next >= 10) {
        setShowEasterEggModal(true);
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

  const hashString = async (input: string): Promise<string> => {
    const msgBuffer = new TextEncoder().encode(input);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const checkAdminPasswordStatus = async () => {
    try {
      const pwdHash = await invoke<string | null>('get_setting', { key: 'admin_password_hash' });
      setIsAdminPasswordSet(!!pwdHash);

      const timeoutVal = await invoke<string | null>('get_setting', { key: 'admin_password_timeout' });
      if (timeoutVal) {
        setAdminPasswordTimeout(parseInt(timeoutVal, 10));
      } else {
        setAdminPasswordTimeout(5);
      }
    } catch (e) {
      console.error('Failed to check admin password status', e);
    }
  };

  useEffect(() => {
    if (showForgotFlow) {
      invoke<string | null>('get_setting', { key: 'admin_security_question' })
        .then((q) => {
          setSecurityQuestionText(q || 'Security Question not found.');
        })
        .catch((e) => {
          console.error(e);
          setSecurityQuestionText('Failed to load security question.');
        });
    }
  }, [showForgotFlow]);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        await checkAdminPasswordStatus();
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

  const handleLockAdmin = () => {
    setIsAdminUnlocked(false);
    setActiveTab('register');
  };

  // Inactivity timeout auto-lock hook
  useEffect(() => {
    if (activeTab !== 'admin' || !isAdminUnlocked || adminPasswordTimeout <= 0) {
      return;
    }

    let timeoutId: any;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLockAdmin();
      }, adminPasswordTimeout * 60 * 1000);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Start initial timer
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [activeTab, isAdminUnlocked, adminPasswordTimeout]);

  // Lock on click off tab hook
  useEffect(() => {
    if (activeTab !== 'admin' && adminPasswordTimeout === -1 && isAdminUnlocked) {
      setIsAdminUnlocked(false);
    }
  }, [activeTab, adminPasswordTimeout, isAdminUnlocked]);

  const activeTheme = themes.find(t => t.id === activeThemeId) || starterThemes[0];

  const handleAdminTabClick = async () => {
    try {
      const bypass = await invoke<string | null>('get_setting', { key: 'dev_password_bypass' });
      if (bypass === 'true') {
        setIsAdminUnlocked(true);
        setActiveTab('admin');
        return;
      }

      const pwdHash = await invoke<string | null>('get_setting', { key: 'admin_password_hash' });
      if (pwdHash && pwdHash.trim() !== '') {
        if (isAdminUnlocked) {
          setActiveTab('admin');
        } else {
          setAuthPassword('');
          setAuthError('');
          setShowForgotFlow(false);
          setRecoveryAnswer('');
          setRecoveryKeyInput('');
          setShowAdminPasswordModal(true);
        }
      } else {
        setShowAdminWarning(true);
      }
    } catch (err) {
      console.error(err);
      setShowAdminWarning(true);
    }
  };

  const handlePasswordAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authPassword) {
      setAuthError('Password is required');
      return;
    }
    try {
      const storedHash = await invoke<string | null>('get_setting', { key: 'admin_password_hash' });
      if (!storedHash) {
        setIsAdminUnlocked(true);
        setShowAdminPasswordModal(false);
        setActiveTab('admin');
        return;
      }

      const inputHash = await hashString(authPassword);
      if (inputHash === storedHash) {
        setIsAdminUnlocked(true);
        setShowAdminPasswordModal(false);
        setActiveTab('admin');
      } else {
        setAuthError('Invalid Admin Password. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setAuthError('Authentication error. Try again.');
    }
  };

  const handleQuestionRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryAnswer) {
      setAuthError('Security question answer is required');
      return;
    }
    try {
      const storedAnswerHash = await invoke<string | null>('get_setting', { key: 'admin_security_answer_hash' });
      if (!storedAnswerHash) {
        setAuthError('Security question recovery is not set up.');
        return;
      }

      const normalizedAnswer = recoveryAnswer.trim().toLowerCase();
      const inputAnswerHash = await hashString(normalizedAnswer);

      if (inputAnswerHash === storedAnswerHash) {
        setIsAdminUnlocked(true);
        setShowAdminPasswordModal(false);
        setActiveTab('admin');
      } else {
        setAuthError('Incorrect security question answer.');
      }
    } catch (err) {
      console.error(err);
      setAuthError('Recovery error. Try again.');
    }
  };

  const handleKeyRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryKeyInput) {
      setAuthError('Recovery key is required');
      return;
    }
    try {
      const storedKeyHash = await invoke<string | null>('get_setting', { key: 'admin_recovery_key_hash' });
      if (!storedKeyHash) {
        setAuthError('Recovery key bypass is not set up.');
        return;
      }

      const normalizedKey = recoveryKeyInput.trim().toUpperCase().replace(/-/g, '');
      const inputKeyHash = await hashString(normalizedKey);

      if (inputKeyHash === storedKeyHash) {
        setIsAdminUnlocked(true);
        setShowAdminPasswordModal(false);
        setActiveTab('admin');
      } else {
        setAuthError('Invalid Recovery Key.');
      }
    } catch (err) {
      console.error(err);
      setAuthError('Recovery key check error. Try again.');
    }
  };

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
    } catch (err) {
      showCustomAlert('Failed to open releases page: ' + err, 'Error');
    }
  };

  /**
   * One-click native update flow:
   * 1. Kill the GoDaddy bridge sidecar so its .exe is not file-locked on Windows.
   * 2. Tauri downloads, cryptographically verifies, and applies the NSIS update payload.
   * 3. App relaunches automatically on the new version.
   *
   * Permission errors (e.g. running from C:\Program Files) are caught and surfaced
   * as an actionable message advising the user to move to a writable location.
   */
  const handleInstallUpdate = async () => {
    if (!updateAvailable || isInstallingUpdate) return;
    setIsInstallingUpdate(true);
    setUpdateError(null);
    try {
      // Kill sidecar processes so no .exe files are locked during the NSIS install
      await invoke('prepare_update');
      // Download + install via Tauri (handles signature verification internally)
      await updateAvailable.downloadAndInstall();
      // Relaunch into the new version
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err: any) {
      const msg = String(err);
      const isPermission =
        msg.toLowerCase().includes('access') ||
        msg.toLowerCase().includes('denied') ||
        msg.toLowerCase().includes('permission') ||
        msg.toLowerCase().includes('unauthorized');
      if (isPermission) {
        setUpdateError(
          'Update failed: permission denied. This app may be running from a ' +
          'protected folder (e.g. C:\\Program Files). ' +
          'Move the app folder to your Documents or Desktop and try again.'
        );
      } else {
        setUpdateError('Update failed: ' + msg);
      }
      setIsInstallingUpdate(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
    const interval = setInterval(fetchDbStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // Setup window close requested listener
  useEffect(() => {
    let unlistenClose: (() => void) | null = null;

    const setupCloseListener = async () => {
      try {
        const unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
          event.preventDefault();
          try {
            const cloudStatus = await invoke<{ is_connected: boolean }>('get_cloud_backup_status');
            if (cloudStatus.is_connected) {
              setExitBackupModalOpen(true);
            } else {
              await invoke('exit_app');
            }
          } catch (e) {
            console.error("Failed to check cloud status on close:", e);
            await invoke('exit_app');
          }
        });
        unlistenClose = unlisten;
      } catch (err) {
        console.error("Failed to setup close listener:", err);
      }
    };

    setupCloseListener();

    return () => {
      if (unlistenClose) unlistenClose();
    };
  }, []);

  // Check developer mode status and listen to settings updates
  useEffect(() => {
    const checkBypass = async () => {
      try {
        const bypass = await invoke<boolean>('check_developer_bypass');
        setIsDeveloperBypass(bypass);
        if (bypass) {
          const simDate = await invoke<string | null>('get_setting', { key: 'dev_simulated_date' });
          if (simDate) {
            (window as any).__simulatedDate = simDate;
            setSimulatedDate(simDate);
          }
        }
      } catch (err) {
        console.error('Failed to load developer bypass status:', err);
      }
    };
    checkBypass();
  }, []);

  useEffect(() => {
    let active = true;
    let unsubSettings: (() => void) | null = null;
    let unsubSeeding: (() => void) | null = null;

    listen<any>('developer-setting-changed', (event) => {
      if (!active) return;
      if (event.payload.key === 'dev_simulated_date') {
        const val = event.payload.value || null;
        (window as any).__simulatedDate = val;
        setSimulatedDate(val);
      }
    }).then((fn) => {
      unsubSettings = fn;
    });

    listen<any>('database-seeding-completed', () => {
      if (!active) return;
      window.location.reload();
    }).then((fn) => {
      unsubSeeding = fn;
    });

    return () => {
      active = false;
      if (unsubSettings) unsubSettings();
      if (unsubSeeding) unsubSeeding();
    };
  }, []);

  const fetchDbStatus = async (): Promise<DbStatus | null> => {
    setIsDbChecking(true);
    try {
      const status = await invoke<DbStatus>('get_db_status');
      if (status) {
        setDbStatus(status);
        setDbPath(status.resolved_db_path);
        setDbConnected(status.primary_path_exists || status.is_temp);
      }
      setIsDbChecking(false);
      return status;
    } catch (err) {
      console.error('Failed to fetch DB status:', err);
      setDbConnected(false);
      setIsDbChecking(false);
      return null;
    }
  };

  const handleExitImmediately = async () => {
    try {
      await invoke('exit_app');
    } catch (e) {
      console.error(e);
    }
  };

  const handleExitWithBackup = async () => {
    setIsExitBackingUp(true);
    setExitBackupError(null);
    try {
      await invoke('trigger_final_cloud_backup');
      await invoke('exit_app');
    } catch (e) {
      console.error("Exit cloud backup failed:", e);
      setExitBackupError(String(e));
      setIsExitBackingUp(false);
    }
  };

  const handleGlobalBarcodeScan = (barcode: string) => {
    setScannedBarcode(barcode);
    if (showEasterEggModal) {
      setShowEasterEggModal(false);
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

  if (isDeveloper) {
    return <DeveloperWindow />;
  }

  if (isPlayback) {
    return <PlaybackWindow themeStyles={themeStyles} />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-custom-bg text-custom-text overflow-hidden font-sans" style={themeStyles}>

      {/* TEMPORARY DATABASE WARNING BANNER */}
      {dbStatus?.is_temp && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/25 p-3 flex items-center justify-between gap-4 select-none animate-in slide-in-from-top duration-200 shrink-0">
          <div className="flex items-center gap-3 w-full md:w-auto min-w-0">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 animate-pulse" />
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold text-yellow-500 uppercase tracking-wide">Running in Temporary Mode</span>
              <span className="block text-[10px] text-custom-muted mt-0.5 leading-tight">
                Operating using local AppData backup. Reconnect the primary database drive (USB) to merge and restore full synchronization.
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={isRecovering}
            onClick={async () => {
              setIsRecovering(true);
              try {
                const reconnected = await invoke<boolean>('rescan_for_primary_db');
                if (reconnected) {
                  const res = await invoke<{ overwritten: boolean }>('restore_primary_db');
                  await fetchDbStatus();
                  if (res.overwritten) {
                    await showCustomAlert("Primary database drive successfully reconnected! Temporary changes have been merged back to the drive.", "Database Restored");
                  } else {
                    await showCustomAlert("Primary database drive reconnected successfully! No temporary changes were newer.", "Database Reconnected");
                  }
                } else {
                  await showCustomAlert("Primary database storage location is still not detected. Please verify your USB drive is connected.", "Reconnection Failed");
                }
              } catch (e) {
                await showCustomAlert("Error reconnecting database: " + e, "Error");
              } finally {
                setIsRecovering(false);
              }
            }}
            className="px-4 py-1.5 bg-yellow-500 text-black font-extrabold text-xs rounded-lg transition-all active:scale-95 cursor-pointer border-0 uppercase hover:bg-yellow-400 shrink-0 flex items-center gap-1.5 shadow-sm"
          >
            {isRecovering && <RefreshCw className="h-3 w-3 animate-spin" />}
            Reconnect & Sync Drive
          </button>
        </div>
      )}

      {/* DATABASE CONNECTION LOST DIALOG */}
      {dbStatus && !dbStatus.primary_path_exists && !dbStatus.is_temp && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-custom-card border border-red-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 w-full h-[4px] bg-red-600 animate-pulse" />
            
            <div className="flex items-center gap-4 mb-6 mt-2">
              <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl border border-red-500/20">
                <AlertTriangle className="h-7 w-7 text-red-500 animate-bounce" />
              </div>
              <div>
                <h3 className="text-xl font-black text-custom-text uppercase tracking-tight">Database Connection Lost</h3>
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                  Configured Storage Drive Disconnected
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-custom-muted leading-relaxed">
                The application cannot access the primary SQLite database file at:
              </p>
              <div className="bg-custom-input/60 rounded-xl p-3 border border-custom-border/30 font-mono text-xs break-all text-custom-text select-text selection:bg-red-500/30">
                {dbStatus.custom_db_path || 'Default Executable Directory'}
              </div>
              <p className="text-xs text-custom-muted">
                Please insert the USB flash drive or choose one of the following recovery options to restore operations:
              </p>

              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  disabled={isRecovering}
                  onClick={async () => {
                    setIsRecovering(true);
                    try {
                      const status = await fetchDbStatus();
                      if (status && status.primary_path_exists) {
                        // Reconnected
                      } else {
                        await showCustomAlert("The database storage location is still not accessible. Please ensure your USB drive is connected and try again.", "Drive Not Detected");
                      }
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setIsRecovering(false);
                    }
                  }}
                  className="w-full py-3 bg-custom-primary text-white font-bold text-sm rounded-xl transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-2 border-0 disabled:opacity-50"
                >
                  {isRecovering && <RefreshCw className="h-4 w-4 animate-spin" />}
                  I Reconnected the Drive (Retry)
                </button>

                <button
                  type="button"
                  disabled={isRecovering}
                  onClick={async () => {
                    setIsRecovering(true);
                    try {
                      if (await showCustomConfirm("Would you like to load a temporary copy of the database from local backups? Note: any new sales made in temporary mode will be merged back when you reconnect the primary drive.", "Use Temporary Database")) {
                        await invoke('use_backup_as_temp_db');
                        await fetchDbStatus();
                      }
                    } catch (e) {
                      await showCustomAlert("Failed to load local backup: " + e, "Error");
                    } finally {
                      setIsRecovering(false);
                    }
                  }}
                  className="w-full py-3 bg-custom-primary/10 hover:bg-custom-primary/20 border border-custom-primary/30 text-custom-primary font-bold text-sm rounded-xl transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Work in Temporary Mode (Use Local Backup)
                </button>

                <button
                  type="button"
                  disabled={isRecovering}
                  onClick={async () => {
                    setIsRecovering(true);
                    try {
                      const path = await invoke<string>('choose_new_location_restore');
                      if (path) {
                        await fetchDbStatus();
                        await showCustomAlert(`Database successfully restored and set to new location: ${path}`, "Database Restored");
                      }
                    } catch (e) {
                      if (e !== 'No folder selected.') {
                        await showCustomAlert("Failed to restore to new location: " + e, "Error");
                      }
                    } finally {
                      setIsRecovering(false);
                    }
                  }}
                  className="w-full py-3 bg-custom-accent/15 hover:bg-custom-accent/25 border border-custom-accent/30 text-custom-accent font-bold text-sm rounded-xl transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Restore Backup to a New Permanent Location...
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXIT CLOUD BACKUP CONFIRMATION DIALOG */}
      {exitBackupModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-custom-primary to-custom-accent" />

            <div className="flex items-center gap-3.5 mb-5 mt-2">
              <div className="p-3 bg-custom-primary/20 text-custom-primary rounded-2xl border border-custom-primary/30">
                <Database className={`h-6 w-6 text-custom-accent ${isExitBackingUp ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h3 className="text-lg font-black text-custom-text uppercase tracking-tight">Closing Application</h3>
                <p className="text-[10px] text-custom-muted font-bold uppercase tracking-wider">
                  Cloud Synchronization Check
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-custom-muted leading-relaxed">
                Your Google Drive account is connected. Would you like to perform a final cloud backup before closing the POS system?
              </p>

              {exitBackupError && (
                <div className="p-3 bg-red-950/40 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Backup failed: {exitBackupError}</span>
                </div>
              )}

              {isExitBackingUp && (
                <div className="flex items-center justify-center gap-2 p-4 bg-custom-input/40 border border-custom-border/20 rounded-xl">
                  <Loader2 className="h-5 w-5 text-custom-primary animate-spin" />
                  <span className="text-xs font-bold text-custom-text">Syncing database to Google Drive...</span>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  id="btn-exit-backup"
                  disabled={isExitBackingUp}
                  onClick={handleExitWithBackup}
                  className="w-full py-3.5 bg-custom-primary text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 border-0 uppercase tracking-wider"
                >
                  {isExitBackingUp ? 'Backing Up...' : 'Sync Cloud & Exit'}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    id="btn-exit-no-backup"
                    disabled={isExitBackingUp}
                    onClick={handleExitImmediately}
                    className="flex-1 py-2.5 bg-custom-input border border-custom-border hover:bg-red-500/10 hover:text-red-500 text-custom-muted font-bold text-xs rounded-xl transition-all disabled:opacity-50 cursor-pointer uppercase tracking-wider"
                  >
                    Exit Immediately
                  </button>
                  <button
                    type="button"
                    id="btn-exit-cancel"
                    disabled={isExitBackingUp}
                    onClick={() => setExitBackupModalOpen(false)}
                    className="flex-1 py-2.5 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-text font-bold text-xs rounded-xl transition-all disabled:opacity-50 cursor-pointer uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPDATE MODAL POPUP */}
      {showUpdateModal && updateAvailable && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header branding band */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-red-600 via-white to-blue-600" />

            {/* Close button — disabled while installing */}
            <button
              id="btn-update-close"
              onClick={() => { if (!isInstallingUpdate) { setShowUpdateModal(false); setUpdateError(null); } }}
              disabled={isInstallingUpdate}
              className="absolute top-4 right-4 p-2 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-muted hover:text-custom-text rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3.5 mb-5 mt-2">
              <div className="p-3 bg-custom-primary/25 text-custom-primary rounded-2xl border border-custom-primary/30">
                <ArrowUpCircle className={`h-6 w-6 text-custom-accent ${isInstallingUpdate ? 'animate-spin' : 'animate-bounce'}`} />
              </div>
              <div>
                <h3 className="text-lg font-black text-custom-text uppercase tracking-tight">Software Update</h3>
                <p className="text-[10px] text-custom-muted font-bold uppercase tracking-wider">
                  {isInstallingUpdate ? 'Downloading & Installing…' : 'New Version Available'}
                </p>
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

              {/* Permission / download error display */}
              {updateError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <p className="text-xs text-red-400 leading-relaxed font-medium">
                    {updateError}
                  </p>
                </div>
              )}

              {isInstallingUpdate && (
                <p className="text-[10px] text-custom-muted text-center leading-relaxed">
                  Please wait — the update is downloading and verifying.&nbsp;
                  <strong className="text-custom-accent">Do not close the app.</strong>
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  id="btn-update-remind-later"
                  onClick={() => { setShowUpdateModal(false); setUpdateError(null); }}
                  disabled={isInstallingUpdate}
                  className="flex-1 py-3 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text font-bold text-xs rounded-xl transition-all active:scale-95 shadow disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Remind Me Later
                </button>
                {isPortable ? (
                  <button
                    id="btn-update-download-github"
                    onClick={async () => {
                      await handleOpenReleasesPage();
                      setShowUpdateModal(false);
                    }}
                    className="flex-1 py-3 bg-custom-primary hover:bg-custom-primary-hover text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow-lg border border-white/10"
                  >
                    Go to GitHub Releases
                  </button>
                ) : (
                  <button
                    id="btn-update-execute"
                    onClick={handleInstallUpdate}
                    disabled={isInstallingUpdate}
                    className="flex-1 py-3 bg-custom-primary hover:bg-custom-primary-hover text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow-lg border border-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isInstallingUpdate ? 'Installing…' : 'Update & Restart'}
                  </button>
                )}
              </div>

              {/* Secondary fallback link */}
              {!isPortable && (
                <div className="text-center pt-1">
                  <button
                    id="btn-update-view-github"
                    onClick={handleOpenReleasesPage}
                    disabled={isInstallingUpdate}
                    className="text-[10px] text-custom-muted hover:text-custom-accent underline underline-offset-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    View releases on GitHub
                  </button>
                </div>
              )}
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
                  setIsAdminUnlocked(true);
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

      {/* ADMIN AUTHENTICATION PASSWORD MODAL */}
      {showAdminPasswordModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200 animate-out fade-out">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header branding band */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-custom-primary" />

            <div className="flex items-center justify-between mb-5 mt-2">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-custom-primary/20 text-custom-primary rounded-2xl border border-custom-primary/30">
                  <Lock className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-custom-text uppercase tracking-tight">Admin Authentication</h3>
                  <p className="text-[10px] text-custom-primary font-bold uppercase tracking-wider">Access Restricted</p>
                </div>
              </div>
              <button
                id="btn-admin-auth-close"
                onClick={() => setShowAdminPasswordModal(false)}
                className="text-custom-muted hover:text-custom-text transition-colors p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ERROR MESSAGE DISPLAY */}
            {authError && (
              <div
                id="admin-auth-error-msg"
                className="p-3 mb-4 bg-red-955 border border-red-500/50 rounded-xl text-xs text-red-200 font-semibold"
              >
                {authError}
              </div>
            )}

            {!showForgotFlow ? (
              <form onSubmit={handlePasswordAuthSubmit} className="space-y-4">
                <div>
                  <label htmlFor="admin-auth-pwd-input" className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-2">
                    Enter Admin Password
                  </label>
                  <input
                    type="password"
                    id="admin-auth-pwd-input"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-custom-input border border-custom-border text-custom-text rounded-xl focus:outline-none focus:border-custom-primary text-sm font-sans"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    id="btn-forgot-password"
                    onClick={() => {
                      setShowForgotFlow(true);
                      setAuthError('');
                    }}
                    className="text-xs text-custom-accent hover:underline font-bold"
                  >
                    Forgot Password?
                  </button>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    id="btn-admin-auth-cancel"
                    onClick={() => setShowAdminPasswordModal(false)}
                    className="flex-1 py-3 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text font-bold text-xs rounded-xl transition-all active:scale-95 shadow"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="btn-admin-auth-submit"
                    className="flex-1 py-3 bg-custom-primary hover:bg-custom-primary/95 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow-lg border-0"
                  >
                    Unlock Console
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {/* Recovery method tabs */}
                <div className="flex bg-custom-input border border-custom-border rounded-xl p-1 shadow-inner text-xs">
                  <button
                    type="button"
                    id="btn-recovery-tab-question"
                    onClick={() => {
                      setRecoveryTab('question');
                      setAuthError('');
                    }}
                    className={`flex-1 py-2 rounded-lg font-bold transition-all ${recoveryTab === 'question'
                      ? 'bg-custom-primary text-white shadow-sm'
                      : 'text-custom-muted hover:text-custom-text'
                      }`}
                  >
                    Security Question
                  </button>
                  <button
                    type="button"
                    id="btn-recovery-tab-key"
                    onClick={() => {
                      setRecoveryTab('key');
                      setAuthError('');
                    }}
                    className={`flex-1 py-2 rounded-lg font-bold transition-all ${recoveryTab === 'key'
                      ? 'bg-custom-primary text-white shadow-sm'
                      : 'text-custom-muted hover:text-custom-text'
                      }`}
                  >
                    Recovery Key
                  </button>
                </div>

                {recoveryTab === 'question' ? (
                  <form onSubmit={handleQuestionRecoverySubmit} className="space-y-4">
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-custom-muted mb-1">
                        Security Question:
                      </span>
                      <p
                        id="admin-recovery-question-text"
                        className="text-sm font-semibold text-custom-text leading-relaxed bg-custom-input/40 p-3 rounded-xl border border-custom-border/50"
                      >
                        {securityQuestionText || 'Loading security question...'}
                      </p>
                    </div>

                    <div>
                      <label htmlFor="admin-recovery-answer-input" className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-2">
                        Your Answer
                      </label>
                      <input
                        type="text"
                        id="admin-recovery-answer-input"
                        value={recoveryAnswer}
                        onChange={(e) => setRecoveryAnswer(e.target.value)}
                        placeholder="Enter answer"
                        className="w-full px-4 py-3 bg-custom-input border border-custom-border text-custom-text rounded-xl focus:outline-none focus:border-custom-primary text-sm font-sans"
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        id="btn-recovery-question-back"
                        onClick={() => {
                          setShowForgotFlow(false);
                          setAuthError('');
                        }}
                        className="flex-1 py-3 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text font-bold text-xs rounded-xl transition-all active:scale-95 shadow"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        id="btn-recovery-question-submit"
                        className="flex-1 py-3 bg-custom-primary hover:bg-custom-primary/95 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow-lg border-0"
                      >
                        Verify & Unlock
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleKeyRecoverySubmit} className="space-y-4">
                    <div>
                      <label htmlFor="admin-recovery-key-input" className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-2">
                        Enter 16-Character Recovery Key
                      </label>
                      <input
                        type="text"
                        id="admin-recovery-key-input"
                        value={recoveryKeyInput}
                        onChange={(e) => setRecoveryKeyInput(e.target.value)}
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        className="w-full px-4 py-3 bg-custom-input border border-custom-border text-custom-text rounded-xl focus:outline-none focus:border-custom-primary text-sm font-mono text-center tracking-widest uppercase"
                        maxLength={19}
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        id="btn-recovery-key-back"
                        onClick={() => {
                          setShowForgotFlow(false);
                          setAuthError('');
                        }}
                        className="flex-1 py-3 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text font-bold text-xs rounded-xl transition-all active:scale-95 shadow"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        id="btn-recovery-key-submit"
                        className="flex-1 py-3 bg-custom-primary hover:bg-custom-primary/95 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow-lg border-0"
                      >
                        Verify & Unlock
                      </button>
                    </div>
                  </form>
                )}


              </div>
            )}
          </div>
        </div>
      )}

      {/* DATABASE RESTORE NOTIFICATION MODAL (Task 2.3) */}
      {showRestoreModal && restoreInfo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header branding band */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-red-600" />

            <div className="flex items-center gap-3.5 mb-5 mt-2">
              <div className="p-3 bg-custom-primary/25 text-custom-accent rounded-2xl border border-custom-accent/30">
                <AlertTriangle className="h-6 w-6 text-red-400 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-black text-custom-text uppercase tracking-tight">Database Restored From Backup</h3>
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Automatic Recovery Active</p>
              </div>
            </div>

            <p className="text-xs text-custom-muted leading-relaxed mb-5">
              Your database file was not found. It has been automatically restored from the local backup. Backup was last updated:
            </p>

            {restoreInfo.local_backup_last_updated && (
              <div className="p-3 bg-custom-input/40 rounded-xl text-center border border-custom-border/20">
                <span className="block text-[10px] font-bold text-custom-muted uppercase tracking-wider">Last Local Backup:</span>
                <span className="font-mono text-xs text-custom-accent block mt-1">{restoreInfo.local_backup_last_updated}</span>
              </div>
            )}

            {restoreInfo.restored_at && (
              <p className="text-[10px] text-red-300 font-mono bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg">
                Restored at: {restoreInfo.restored_at}
              </p>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowRestoreModal(false)}
                className="flex-1 py-2.5 bg-custom-primary hover:bg-custom-primary-hover text-white font-bold text-sm rounded-xl transition-all active:scale-95 shadow-lg border border-white/10"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}


      {/* GLOBAL KEYBOARD SCANNERS INTERCEPTOR */}
      <ScannerListener
        onScan={handleGlobalBarcodeScan}
        isEnabled={isScannerListening && (showEasterEggModal || activeTab === 'register' || (activeTab === 'admin' && adminSubTab === 'devices'))}
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
            className={`px-6 py-3 rounded-xl text-base font-extrabold flex items-center gap-2.5 transition-all active:scale-95 ${activeTab === 'register'
              ? 'bg-custom-primary text-white shadow-md'
              : 'text-custom-muted hover:text-custom-text'
              }`}
          >
            <DollarSign className="h-4.5 w-4.5" /> Sales Register
          </button>
          <button
            id="btn-nav-admin"
            onClick={handleAdminTabClick}
            className={`px-6 py-3 rounded-xl text-base font-extrabold flex items-center gap-2.5 transition-all active:scale-95 ${activeTab === 'admin'
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
            className={`px-3 py-1.5 rounded-lg border bg-custom-input border-custom-border transition-all flex items-center gap-2 cursor-pointer ${isScannerListening
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
            className={`px-3 py-1.5 rounded-lg border bg-custom-input border-custom-border transition-all flex items-center gap-2 cursor-pointer ${isPlaybackWindowOpen
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
            title="Open Interactive Guide"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Guide</span>
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
      <main className="flex-1 overflow-hidden min-h-0 bg-custom-bg">
        {activeTab === 'register' ? (
          <RegisterView
            scannedBarcode={scannedBarcode}
            onClearScan={clearScan}
            taxRate={taxRate}
            lowStockThreshold={lowStockThreshold}
            onPlayShowcaseVideo={playShowcaseVideo}
            cart={cart}
            setCart={setCart}
            customConfirm={showCustomConfirm}
            customAlert={showCustomAlert}
            onNavigateToPairing={() => {
              setActiveTab('admin');
              setAdminSubTab('devices');
            }}
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
            isAdminUnlocked={isAdminUnlocked}
            onLockAdmin={handleLockAdmin}
            onAdminPasswordConfigChanged={checkAdminPasswordStatus}
            customConfirm={showCustomConfirm}
            customAlert={showCustomAlert}
            subTab={adminSubTab}
            onSubTabChange={setAdminSubTab}
            dbStatus={dbStatus}
            onRefreshDbStatus={fetchDbStatus}
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
                className={`py-2 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all ${tutorialMode === 'volunteer'
                  ? 'border-custom-accent text-custom-text'
                  : 'border-transparent text-custom-muted hover:text-custom-text'
                  }`}
              >
                Volunteer POS Mode
              </button>
              <button
                onClick={() => { setTutorialMode('admin'); setActiveTutorialStep(0); }}
                className={`py-2 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all ${tutorialMode === 'admin'
                  ? 'border-custom-accent text-custom-text'
                  : 'border-transparent text-custom-muted hover:text-custom-text'
                  }`}
              >
                Admin Config Mode
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Labeled Tab Headers */}
              <div className="flex flex-wrap gap-2 px-4 border-b border-custom-border/30 pb-3">
                {(tutorialMode === 'volunteer'
                  ? [
                    { id: 0, label: 'Register & Cart', icon: ShoppingCart },
                    { id: 1, label: 'Discounts', icon: Tag },
                    { id: 2, label: 'Scanners', icon: Scan },
                    { id: 3, label: 'Sales', icon: Printer },
                    { id: 4, label: 'Showcase Video', icon: Video },
                  ]
                  : [
                    { id: 0, label: 'Catalog & Thresholds', icon: Package },
                    { id: 1, label: 'Wholesale Cases', icon: DollarSign },
                    { id: 2, label: 'Color & Security', icon: Lock },
                    { id: 3, label: 'Analytics & Ledger', icon: TrendingUp },
                    { id: 4, label: 'Data & Cloud Sync', icon: Database },
                  ]).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTutorialStep(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTutorialStep === tab.id
                        ? 'bg-custom-accent/20 border border-custom-accent/40 text-custom-text shadow-inner'
                        : 'text-custom-muted hover:text-custom-text hover:bg-custom-input/50 border border-transparent'
                        }`}
                    >
                      <tab.icon className="h-3.5 w-3.5" /> {tab.label}
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
                            <li>Use the <strong>Quick Add</strong> panel to quickly add multiple products at once by holding down the Ctrl key and clicking on product icons.</li>
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
                            <li>Click <strong>Add Custom Discount</strong> to toggle the virtual numpad. Type numbers, delete with Backspace, and press Enter to save.</li>
                            <li>Discounts can be cleared at any time by pressing the active promotion's toggle button again.</li>
                            <li>Use the <strong>Apply Discount</strong> button to apply a discount to the entire cart at once.</li>
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
                            <li>Use the <strong>Manual Entry</strong> feature to add products that are not in the catalog by typing their barcode or name manually.</li>
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
                            <li>Use the <strong>Void Sale</strong> feature to cancel a sale if it was made in error.</li>
                            <li>If enabled, select <strong>Pay with GoDaddy Terminal</strong> to process credit card sales directly on a paired Smart Terminal. Approved transactions are saved automatically and receipts are output via its built-in printer.</li>
                          </ul>
                          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-200 mt-2 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <strong>Important:</strong> While this POS tracks item sales, inventory, and generates analytics, it <strong>does not</strong> process credit cards or execute financial transfers (unless configured with a GoDaddy terminal). You must collect customer funds externally using your own card reader or cash box before completing the sale.
                            </div>
                          </div>
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
                            <li>Use the <strong>Showcase Screen</strong> feature to display promotional videos during busy periods to attract customer attention.</li>
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
                            <li>Use the <strong>Restock Inventory</strong> feature to quickly update stock levels for multiple products at once.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 1 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <DollarSign className="h-6 w-6 text-custom-primary" />
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
                            <li>Use the <strong>Bulk Sale</strong> feature to quickly process multiple cases of products at once.</li>
                          </ul>
                        </div>
                      </>
                    )}

                    {activeTutorialStep === 2 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <Lock className="h-6 w-6 text-custom-accent" />
                          <h4 className="font-bold text-custom-text text-lg">Color Builder & Security Settings</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            Skin the application to fit direct sunlight marquee setups and configure console protection.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li>Select the <strong>High Contrast (Sunlight)</strong> theme for maximum legibility when working outdoors.</li>
                            <li>Build custom color profiles using the theme builder. Tweak buttons, headers, cards, and inputs. All configurations are stored directly in SQLite settings.</li>
                            <li>Enable an <strong>Admin Password</strong> to gate console access. Configure a custom <strong>Security Question & Answer</strong> and note down your 16-character <strong>Recovery Key</strong> for password recovery. (Note: Password gates can be bypassed via Developer Console).</li>
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

                    {activeTutorialStep === 4 && (
                      <>
                        <div className="flex items-center gap-3 border-b border-custom-border/30 pb-3">
                          <Database className="h-6 w-6 text-custom-accent" />
                          <h4 className="font-bold text-custom-text text-lg">Data Management & Cloud Backups</h4>
                        </div>
                        <div className="space-y-3 text-sm text-custom-text">
                          <p>
                            Import or export data spreadsheets, clear database tables, and configure Google Drive cloud backups.
                          </p>
                          <ul className="list-disc pl-5 text-xs text-custom-muted space-y-1.5">
                            <li><strong>Spreadsheet CSV Import & Export:</strong> Export any tables to a chosen directory, or scan/import CSV data with a flexible duplicate policy.</li>
                            <li><strong>Local Auto-Backup & Restore:</strong> The SQLite database is automatically duplicated to <code>%LOCALAPPDATA%\THCFireworksPOS\</code> after changes and silently restored on startup if needed. A notification banner displays on startup if a restore occurred.</li>
                            <li><strong>Google Drive Cloud Sync:</strong> Save Google OAuth credentials locally to link a Google Drive account. Synchronizes every 30 minutes, allowing manual backups or restores.</li>
                            <li><strong>Selective Data Clearing:</strong> Wipe specific tables (catalog, settings, sales logs) securely in the danger zone using a generated random confirmation code.</li>
                            <li><strong>Developer Console (Bypass Mode):</strong> If <code>developer.bypass</code> exists next to the database or when in development, a Developer Console opens at startup. It supports mock terminal operations, system date/year simulation (useful to test future analytics calculations or seasonal resets), test data seeding, raw receipt printing logs, and barcode scans simulation.</li>
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

              {activeTutorialStep < 4 ? (
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

      {showEasterEggModal && (
        <EasterEggModal
          isOpen={showEasterEggModal}
          onClose={() => setShowEasterEggModal(false)}
          cachedStates={cachedEasterEggStates}
          onSaveCache={(year, state) => {
            setCachedEasterEggStates(prev => ({
              ...prev,
              [year]: state
            }));
          }}
        />
      )}

      {/* MINI VIDEO PLAYBACK CONTROLLER (MAIN WINDOW) */}
      <MiniPlaybackController onCloseController={() => setIsPlaybackWindowOpen(false)} />

      {/* CUSTOM DIALOG POPUP */}
      {dialogState && dialogState.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header branding band */}
            <div className={`absolute top-0 left-0 w-full h-[3px] ${dialogState.isDanger ? 'bg-red-600' : 'bg-custom-primary'}`} />

            <div className="flex items-center gap-3.5 mb-4 mt-2">
              <div className={`p-3 rounded-2xl border ${dialogState.isDanger
                ? 'bg-red-500/25 text-red-500 border-red-500/30'
                : 'bg-custom-primary/20 text-custom-primary border-custom-primary/30'
                }`}>
                {dialogState.isDanger ? (
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                ) : (
                  <HelpCircle className="h-6 w-6 text-custom-accent" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-black text-custom-text uppercase tracking-tight">
                  {dialogState.title}
                </h3>
                <p className="text-[10px] text-custom-muted font-bold uppercase tracking-wider">
                  {dialogState.type === 'confirm' ? 'User Confirmation Required' : 'System Notification'}
                </p>
              </div>
            </div>

            <div className="text-sm text-custom-text leading-relaxed mb-6 whitespace-pre-wrap">
              {dialogState.message}
            </div>

            <div className="flex gap-3">
              {dialogState.type === 'confirm' && (
                <button
                  id="btn-custom-dialog-cancel"
                  onClick={() => dialogState.resolve(false)}
                  className="flex-1 py-3 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text font-bold text-xs rounded-xl transition-all active:scale-95 shadow"
                >
                  {dialogState.cancelText || 'Cancel'}
                </button>
              )}
              <button
                id="btn-custom-dialog-confirm"
                onClick={() => dialogState.resolve(true)}
                className={`flex-1 py-3 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow-lg border border-white/10 ${dialogState.isDanger
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-custom-primary hover:bg-custom-primary-hover'
                  }`}
                autoFocus
              >
                {dialogState.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
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
