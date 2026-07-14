import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { Database, Sparkles, CreditCard, Scan, Printer, Trash2, Terminal, Archive } from 'lucide-react';

export const DeveloperWindow: React.FC = () => {
  // DB Seeding States
  const [seeding, setSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  // Simulated Date State
  const [simulatedDate, setSimulatedDate] = useState<string>('');

  // Password Bypass State
  const [passwordBypass, setPasswordBypass] = useState(false);

  // GoDaddy Mocking States
  const [mockGoDaddy, setMockGoDaddy] = useState(false);
  const [mockBehavior, setMockBehavior] = useState('approve');
  const [pairingStatus, setPairingStatus] = useState('unpaired');
  const [pairingIp, setPairingIp] = useState('');
  const [pairingToken, setPairingToken] = useState('');
  const [terminalActionText, setTerminalActionText] = useState<string>('Ready for POS connection');
  const [terminalActionStatus, setTerminalActionStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  // Google OAuth Credentials States
  const [googleClientId, setGoogleClientId] = useState<string>('515783768484-s1si27t2p0j03eau66k0u0hcqnf32gro.apps.googleusercontent.com');
  const [googleClientSecret, setGoogleClientSecret] = useState<string>('');

  // Scanner Simulator States
  const [scanBarcode, setScanBarcode] = useState('');
  const [autoNewline, setAutoNewline] = useState(true);

  // Tab states
  const [activeTab, setActiveTab] = useState<'printer' | 'app'>('printer');

  // Printer Logs
  const [printLogs, setPrintLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // App Logs
  interface AppLog {
    type: string;
    message: string;
    timestamp: string;
    windowLabel: string;
  }
  const [appLogs, setAppLogs] = useState<AppLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [logSearch, setLogSearch] = useState('');
  const appLogsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll printer logs to bottom
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [printLogs]);

  useEffect(() => {
    // Scroll app logs to bottom
    if (appLogsEndRef.current) {
      appLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [appLogs]);

  // Load configuration on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const simDateVal = await invoke<string | null>('get_setting', { key: 'dev_simulated_date' });
        if (simDateVal) {
          setSimulatedDate(simDateVal);
          (window as any).__simulatedDate = simDateVal;
        }

        const bypassVal = await invoke<string | null>('get_setting', { key: 'dev_password_bypass' });
        setPasswordBypass(bypassVal === 'true');

        const mockGdVal = await invoke<string | null>('get_setting', { key: 'dev_godaddy_mock_enabled' });
        setMockGoDaddy(mockGdVal === 'true');

        const gdBehaviorVal = await invoke<string | null>('get_setting', { key: 'dev_godaddy_mock_behavior' });
        if (gdBehaviorVal) {
          setMockBehavior(gdBehaviorVal);
        }

        const cidVal = await invoke<string | null>('get_setting', { key: 'google_client_id' });
        if (cidVal) {
          setGoogleClientId(cidVal);
        }

        const secretVal = await invoke<string | null>('get_setting', { key: 'google_client_secret' });
        if (secretVal) {
          setGoogleClientSecret(secretVal);
        }
        
        await refreshPairingState();
      } catch (err) {
        console.error('Failed to load developer configurations:', err);
      }
    };
    loadSettings();
  }, []);

  // Poll GoDaddy pairing status periodically when simulation is active
  useEffect(() => {
    if (!mockGoDaddy) return;
    const interval = setInterval(() => {
      refreshPairingState();
    }, 1000);
    return () => clearInterval(interval);
  }, [mockGoDaddy]);

  const refreshPairingState = async () => {
    try {
      const status = await invoke<string | null>('get_setting', { key: 'godaddy_pairing_status' });
      const ip = await invoke<string | null>('get_setting', { key: 'godaddy_terminal_ip' });
      const token = await invoke<string | null>('get_setting', { key: 'godaddy_pairing_token' });
      setPairingStatus(status || 'unpaired');
      setPairingIp(ip || '');
      setPairingToken(token || '');
    } catch (err) {
      console.error('Failed to refresh GoDaddy pairing state:', err);
    }
  };

  // Listen for receipt printing events
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    listen<string>('receipt-printed', (event) => {
      if (!active) return;
      const timestamp = new Date().toLocaleTimeString();
      setPrintLogs((prev) => [...prev, `[${timestamp}] Printer output:\n${event.payload}\n-------------------`]);
    }).then((fn) => {
      unsubscribe = fn;
    });

    return () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Listen for mock terminal events
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    listen<any>('mock-terminal-event', (event) => {
      if (!active) return;
      const data = event.payload;
      
      if (data.type === 'pair') {
        setTerminalActionStatus('processing');
        setTerminalActionText(`Pairing with POS...\nCode: ${data.pairingCode}`);
        setTimeout(() => {
          if (!active) return;
          setTerminalActionStatus('success');
          setTerminalActionText('Paired successfully!');
        }, 1000);
      }
      else if (data.type === 'sale') {
        setTerminalActionStatus('processing');
        const amt = (data.amount / 100).toFixed(2);
        setTerminalActionText(`Processing Sale: $${amt}\nRef: ${data.saleId}`);
        
        const delay = data.behavior === 'timeout' ? 4000 : 1500;
        setTimeout(() => {
          if (!active) return;
          if (data.behavior === 'decline') {
            setTerminalActionStatus('error');
            setTerminalActionText('Transaction Declined\nby Customer');
          } else if (data.behavior === 'timeout') {
            setTerminalActionStatus('error');
            setTerminalActionText('Connection Timed Out');
          } else {
            setTerminalActionStatus('success');
            setTerminalActionText(`Approved!\nAuth: MOCK_AUTH\nSale: $${amt}`);
          }
        }, delay);
      }
      else if (data.type === 'refund') {
        setTerminalActionStatus('processing');
        const amtText = data.amount ? `$${(data.amount / 100).toFixed(2)}` : 'Full';
        setTerminalActionText(`Processing Refund...\nTx: ${data.transactionId}\nAmt: ${amtText}`);
        setTimeout(() => {
          if (!active) return;
          setTerminalActionStatus('success');
          setTerminalActionText(`Refund Approved!\nTx: ${data.transactionId}`);
        }, 1500);
      }
      else if (data.type === 'void') {
        setTerminalActionStatus('processing');
        setTerminalActionText(`Processing Void...\nTx: ${data.transactionId}`);
        setTimeout(() => {
          if (!active) return;
          setTerminalActionStatus('success');
          setTerminalActionText(`Void Approved!\nTx: ${data.transactionId}`);
        }, 1000);
      }
    }).then((fn) => {
      unsubscribe = fn;
    });

    return () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Listen for application logs
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    listen<AppLog>('app-log', (event) => {
      if (!active) return;
      setAppLogs((prev) => {
        const next = [...prev, event.payload];
        // Limit to 1000 logs to prevent memory exhaustion
        if (next.length > 1000) {
          return next.slice(next.length - 1000);
        }
        return next;
      });
    }).then((fn) => {
      unsubscribe = fn;
      // Request log history from the main window after listener is ready
      emit('request-log-history', {}).catch(() => {});
    });

    return () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const handleSeedTestData = async () => {
    setSeeding(true);
    setSeedStatus('Wiping existing database and inserting mock fireworks data...');
    try {
      await invoke('seed_test_data');
      setSeedStatus('Success: Database has been populated with premium test data.');
      // Emit a global event so that other windows know the database has changed
      emit('database-seeding-completed', {});
    } catch (err) {
      setSeedStatus(`Error seeding database: ${err}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleSimulatedDateChange = async (dateVal: string) => {
    setSimulatedDate(dateVal);
    const valueToSave = dateVal || '';
    try {
      await invoke('save_setting', { key: 'dev_simulated_date', value: valueToSave });
      (window as any).__simulatedDate = valueToSave || null;
      emit('developer-setting-changed', { key: 'dev_simulated_date', value: valueToSave });
    } catch (err) {
      console.error('Failed to save simulated date setting:', err);
    }
  };

  const handleTogglePasswordBypass = async (checked: boolean) => {
    setPasswordBypass(checked);
    try {
      await invoke('save_setting', { key: 'dev_password_bypass', value: checked ? 'true' : 'false' });
      emit('developer-setting-changed', { key: 'dev_password_bypass', value: checked ? 'true' : 'false' });
    } catch (err) {
      console.error('Failed to save password bypass setting:', err);
    }
  };

  const handleToggleMockGoDaddy = async (checked: boolean) => {
    setMockGoDaddy(checked);
    try {
      await invoke('save_setting', { key: 'dev_godaddy_mock_enabled', value: checked ? 'true' : 'false' });
      if (checked) {
        await invoke('save_setting', { key: 'godaddy_enabled', value: 'true' });
        const currentIp = await invoke<string | null>('get_setting', { key: 'godaddy_terminal_ip' });
        if (!currentIp || currentIp === 'mock_terminal') {
          await invoke('save_setting', { key: 'godaddy_terminal_ip', value: '127.0.0.1' });
        }
        await invoke('save_setting', { key: 'godaddy_pairing_status', value: 'unpaired' });
        await invoke('save_setting', { key: 'godaddy_pairing_token', value: '' });
      } else {
        await invoke('save_setting', { key: 'godaddy_enabled', value: 'false' });
      }
      emit('developer-setting-changed', { key: 'dev_godaddy_mock_enabled', value: checked ? 'true' : 'false' });
      await refreshPairingState();
    } catch (err) {
      console.error('Failed to save godaddy mock setting:', err);
    }
  };

  const handleQuickPairTerminal = async () => {
    try {
      await invoke('save_setting', { key: 'godaddy_enabled', value: 'true' });
      await invoke('save_setting', { key: 'godaddy_terminal_ip', value: '127.0.0.1' });
      await invoke('save_setting', { key: 'godaddy_pairing_status', value: 'paired' });
      await invoke('save_setting', { key: 'godaddy_pairing_token', value: 'mock_token_abc123' });
      emit('developer-setting-changed', { key: 'dev_godaddy_mock_enabled', value: 'true' });
      await refreshPairingState();
    } catch (err) {
      console.error('Failed to quick-pair terminal:', err);
    }
  };

  const handleUnpairTerminal = async () => {
    try {
      await invoke('save_setting', { key: 'godaddy_pairing_status', value: 'unpaired' });
      await invoke('save_setting', { key: 'godaddy_pairing_token', value: '' });
      emit('developer-setting-changed', { key: 'dev_godaddy_mock_enabled', value: 'true' });
      await refreshPairingState();
    } catch (err) {
      console.error('Failed to unpair terminal:', err);
    }
  };

  const handleBehaviorChange = async (behavior: string) => {
    setMockBehavior(behavior);
    try {
      await invoke('save_setting', { key: 'dev_godaddy_mock_behavior', value: behavior });
      emit('developer-setting-changed', { key: 'dev_godaddy_mock_behavior', value: behavior });
    } catch (err) {
      console.error('Failed to save godaddy mock behavior:', err);
    }
  };

  const handleSimulateScan = () => {
    if (scanBarcode.trim()) {
      emit('simulate-barcode-scan', { barcode: scanBarcode.trim(), autoNewline });
      setScanBarcode('');
    }
  };

  const handleClearLogs = () => {
    setPrintLogs([]);
  };

  const filteredAppLogs = appLogs.filter((log) => {
    if (logFilter !== 'all') {
      if (logFilter === 'info' && log.type !== 'info' && log.type !== 'log') return false;
      if (logFilter === 'warn' && log.type !== 'warn') return false;
      if (logFilter === 'error' && log.type !== 'error') return false;
    }
    if (logSearch.trim()) {
      const searchLower = logSearch.toLowerCase();
      return (
        log.message.toLowerCase().includes(searchLower) ||
        log.windowLabel.toLowerCase().includes(searchLower) ||
        log.type.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-screen w-screen bg-[#1e1e24] text-[#d4d4d4] font-sans p-6 overflow-y-auto select-none">
      
      {/* Title */}
      <div className="flex items-center gap-3 border-b border-[#3c3c3c] pb-4 mb-6">
        <div className="p-2 rounded bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
          <Sparkles className="h-6 w-6 animate-pulse" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white uppercase">THC Fireworks Developer Console</h1>
          <p className="text-xs text-indigo-400 font-mono">Bypass mode active via developer.bypass</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Left Column: Controls */}
        <div className="flex flex-col gap-6">
          
          {/* Database seeding */}
          <div className="bg-[#25252b] border border-[#3c3c3c] rounded-xl p-5 shadow-lg">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-3">
              <Database className="h-4 w-4 text-emerald-400" />
              <span>Database Management</span>
            </h2>
            <p className="text-xs text-[#a0a0a8] mb-4">
              Clears the inventory database completely and inserts pre-configured testing catalog items, sales, and analytics records.
            </p>
            <button
              onClick={handleSeedTestData}
              disabled={seeding}
              className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-all border ${
                seeding 
                  ? 'bg-[#323238] border-[#444] text-[#6e6e76] cursor-not-allowed'
                  : 'bg-emerald-600 border-emerald-500 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/20 active:scale-[0.98]'
              }`}
            >
              {seeding ? 'Seeding Data...' : 'Insert Test Data'}
            </button>
            {seedStatus && (
              <div className={`mt-3 p-3 rounded-lg text-xs font-mono border ${
                seedStatus.startsWith('Error') 
                  ? 'bg-red-950/30 border-red-800/40 text-red-400' 
                  : 'bg-emerald-950/20 border-emerald-800/20 text-emerald-400'
              }`}>
                {seedStatus}
              </div>
            )}
          </div>

          {/* Simulated Date Simulation */}
          <div className="bg-[#25252b] border border-[#3c3c3c] rounded-xl p-5 shadow-lg">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span>System Date Simulation</span>
            </h2>
            <div className="space-y-3">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Simulate Year & Date</span>
                <span className="text-[10px] text-[#a0a0a8] mt-0.5">
                  Overrides the current date/year across the entire app. Leave empty/clear to use real local system time.
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={simulatedDate}
                  onChange={(e) => handleSimulatedDateChange(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-[#323238] border border-[#444] text-white rounded-lg focus:outline-none focus:border-purple-500 text-xs font-mono"
                />
                {simulatedDate && (
                  <button
                    onClick={() => handleSimulatedDateChange('')}
                    className="px-3 py-1.5 bg-[#444] hover:bg-[#555] text-white rounded-lg text-xs font-bold transition-all active:scale-95 border border-[#555]"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Admin Password Bypass Config */}
          <div className="bg-[#25252b] border border-[#3c3c3c] rounded-xl p-5 shadow-lg">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-3">
              <Terminal className="h-4 w-4 text-rose-400" />
              <span>Admin Security Bypass</span>
            </h2>
            
            <div className="flex items-center justify-between">
              <div className="flex flex-col pr-4">
                <span className="text-xs font-bold text-white">Password Bypass Mode</span>
                <span className="text-[10px] text-[#a0a0a8]">Bypass the admin password gate when entering the Admin console.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={passwordBypass}
                  onChange={(e) => handleTogglePasswordBypass(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#323238] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#888] after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600 peer-checked:after:bg-white"></div>
              </label>
            </div>
          </div>

          {/* Google Drive Credentials Config */}
          <div className="bg-[#25252b] border border-[#3c3c3c] rounded-xl p-5 shadow-lg space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-[#3c3c3c] pb-2">
              <Archive className="h-4 w-4 text-sky-400" />
              <span>Google Cloud Backup Credentials</span>
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#a0a0a8] mb-1">
                  Google OAuth Client ID
                </label>
                <input
                  type="text"
                  placeholder="Enter Google Client ID"
                  value={googleClientId}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setGoogleClientId(val);
                    try {
                      await invoke('save_setting', { key: 'google_client_id', value: val });
                    } catch (err) {
                      console.error("Failed to save google_client_id setting", err);
                    }
                  }}
                  className="w-full bg-[#1a1a20] border border-[#3c3c3c] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#a0a0a8] mb-1">
                  Google OAuth Client Secret
                </label>
                <input
                  type="password"
                  placeholder="Enter Google Client Secret"
                  value={googleClientSecret}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setGoogleClientSecret(val);
                    try {
                      await invoke('save_setting', { key: 'google_client_secret', value: val });
                    } catch (err) {
                      console.error("Failed to save google_client_secret setting", err);
                    }
                  }}
                  className="w-full bg-[#1a1a20] border border-[#3c3c3c] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* GoDaddy Terminal Simulator */}
          <div className="bg-[#25252b] border border-[#3c3c3c] rounded-xl p-5 shadow-lg">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-indigo-400" />
              <span>GoDaddy Smart Terminal Simulator</span>
            </h2>
            
            <div className="flex items-center justify-between border-b border-[#323238] pb-4 mb-4">
              <div className="flex flex-col pr-4">
                <span className="text-xs font-bold text-white">Enable GoDaddy Simulation</span>
                <span className="text-[10px] text-[#a0a0a8]">Simulates payment bridge processing on the terminal device.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={mockGoDaddy}
                  onChange={(e) => handleToggleMockGoDaddy(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#323238] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#888] after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
              </label>
            </div>

            {mockGoDaddy && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">Simulated Payment Outcome</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'approve', label: 'Approve' },
                      { value: 'decline', label: 'Decline' },
                      { value: 'timeout', label: 'Timeout' }
                    ].map((item) => (
                      <button
                        key={item.value}
                        onClick={() => handleBehaviorChange(item.value)}
                        className={`py-1.5 px-3 rounded-lg font-bold text-[10px] uppercase border transition-all ${
                          mockBehavior === item.value
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                            : 'bg-[#2a2a30] border-[#3c3c3c] text-[#a0a0a8] hover:text-[#d4d4d4]'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[9px] text-[#8c8c94] font-mono">
                    {mockBehavior === 'approve' && '💳 Transaction finishes successfully in 1.5s.'}
                    {mockBehavior === 'decline' && '❌ Transaction fails immediately with decline error.'}
                    {mockBehavior === 'timeout' && '⏳ Hangs for 4.0s before throwing connection timeout.'}
                  </span>
                </div>

                {/* Mock GoDaddy Terminal Screen Interface */}
                <div className="flex flex-col border border-[#444] rounded-2xl bg-[#0f0f13] overflow-hidden shadow-inner p-3">
                  <div className="flex items-center justify-between border-b border-[#222] pb-2 mb-2">
                    <span className="text-[9px] font-extrabold uppercase text-[#a0a0a8] tracking-wider">Smart Terminal Flex v1</span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-[8px] font-mono text-emerald-400 uppercase">POS Bridge Active</span>
                    </span>
                  </div>

                  {pairingStatus === 'paired' ? (
                    <div className="flex flex-col gap-1 p-2 bg-[#14151b] rounded-lg border border-[#2a2b36]">
                      <div className="text-[10px] text-emerald-400 font-extrabold uppercase">Status: Connected</div>
                      <div className="text-[9px] text-[#a0a0a8] font-mono">IP Address: {pairingIp || 'N/A'}</div>
                      <div className="text-[9px] text-[#a0a0a8] font-mono truncate">Token: {pairingToken || 'N/A'}</div>
                      
                      <button
                        onClick={handleUnpairTerminal}
                        className="mt-2 py-1.5 px-3 bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded-lg text-[9px] font-bold uppercase transition-all active:scale-[0.97]"
                      >
                        Disconnect Terminal
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 p-2 bg-[#14151b] rounded-lg border border-[#2a2b36] items-center text-center">
                      <div className="text-[10px] text-amber-500 font-extrabold uppercase">Status: Ready to Pair</div>
                      <div className="text-[9px] text-[#8c8c94] mt-0.5">Enter code in POS Admin &rarr; Devices:</div>
                      <div className="text-sm font-mono font-black text-white tracking-widest my-1.5 bg-[#0b0c10] px-3 py-1 rounded border border-[#222] select-text">
                        123456
                      </div>
                      
                      <button
                        onClick={handleQuickPairTerminal}
                        className="mt-1 w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[9px] font-bold uppercase transition-all shadow-sm active:scale-[0.97]"
                      >
                        Quick Pair (Bypass Code)
                      </button>
                    </div>
                  )}

                  {/* Active Simulated Screen */}
                  <div className={`mt-2.5 p-2.5 rounded-lg border font-mono text-[9px] whitespace-pre-line leading-relaxed ${
                    terminalActionStatus === 'processing' ? 'bg-indigo-950/20 border-indigo-900/40 text-indigo-300 animate-pulse' :
                    terminalActionStatus === 'success' ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300' :
                    terminalActionStatus === 'error' ? 'bg-red-950/20 border-red-900/40 text-red-300' :
                    'bg-[#0b0c10] border-[#222] text-[#8c8c94]'
                  }`}>
                    <span className="text-[7px] text-[#8c8c94] uppercase tracking-wider block mb-1">Terminal Screen Content:</span>
                    {terminalActionText}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Barcode Scanner Simulator */}
          <div className="bg-[#25252b] border border-[#3c3c3c] rounded-xl p-5 shadow-lg">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-3">
              <Scan className="h-4 w-4 text-amber-400" />
              <span>Keyboard Wedge Scanner Simulator</span>
            </h2>
            <p className="text-xs text-[#a0a0a8] mb-3">
              Simulates a hardware barcode wedge scanning input. Type a barcode and send to cart.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={scanBarcode}
                onChange={(e) => setScanBarcode(e.target.value)}
                placeholder="Barcode (e.g. 1002)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSimulateScan();
                }}
                className="flex-1 bg-[#1a1a20] border border-[#3c3c3c] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500 font-mono"
              />
              <button
                onClick={handleSimulateScan}
                className="bg-amber-600 border border-amber-500 hover:bg-amber-500 text-white font-bold text-xs uppercase px-4 py-2 rounded-lg transition-all active:scale-[0.97]"
              >
                Send Scan
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-newline-checkbox"
                checked={autoNewline}
                onChange={(e) => setAutoNewline(e.target.checked)}
                className="rounded border-[#3c3c3c] bg-[#1a1a20] text-amber-600 focus:ring-amber-500 cursor-pointer h-4 w-4"
              />
              <label htmlFor="auto-newline-checkbox" className="text-xs text-[#a0a0a8] select-none cursor-pointer">
                Auto-Newline (Suffix Enter)
              </label>
            </div>
          </div>

        </div>

        {/* Right Column: Tabbed Logs (Printer Output & Application Logs) */}
        <div className="flex flex-col h-full bg-[#25252b] border border-[#3c3c3c] rounded-xl p-5 shadow-lg">
          {/* Tab Selector */}
          <div className="flex border-b border-[#3c3c3c] mb-4">
            <button
              onClick={() => setActiveTab('printer')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                activeTab === 'printer'
                  ? 'border-cyan-500 text-white bg-[#2a2a30]/30 rounded-t-lg'
                  : 'border-transparent text-[#8c8c94] hover:text-[#d4d4d4]'
              }`}
            >
              <Printer className="h-4 w-4 text-cyan-400" />
              <span>Printer Output</span>
            </button>
            <button
              onClick={() => setActiveTab('app')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                activeTab === 'app'
                  ? 'border-indigo-500 text-white bg-[#2a2a30]/30 rounded-t-lg'
                  : 'border-transparent text-[#8c8c94] hover:text-[#d4d4d4]'
              }`}
            >
              <Terminal className="h-4 w-4 text-indigo-400" />
              <span>Application Logs</span>
            </button>
          </div>

          {/* Active Tab Controls & Header */}
          {activeTab === 'printer' ? (
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-bold text-[#8c8c94] uppercase tracking-wider">Receipt Print Stream</span>
              {printLogs.length > 0 && (
                <button 
                  onClick={handleClearLogs}
                  className="p-1.5 text-xs text-[#8c8c94] hover:text-red-400 transition-all rounded hover:bg-[#323238] flex items-center gap-1"
                  title="Clear Logs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase">Clear</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 mb-3 bg-[#1a1a20] p-2 rounded-lg border border-[#3c3c3c]">
              {/* Level filter */}
              <div className="flex bg-[#25252b] rounded border border-[#3c3c3c] p-0.5">
                {(['all', 'info', 'warn', 'error'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setLogFilter(level)}
                    className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded transition-all ${
                      logFilter === level
                        ? level === 'error'
                          ? 'bg-red-950 text-red-400 border border-red-800/40'
                          : level === 'warn'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800/40'
                          : level === 'info'
                          ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/40'
                          : 'bg-indigo-600 text-white shadow-sm'
                        : 'text-[#8c8c94] hover:text-[#d4d4d4]'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <input
                type="text"
                placeholder="Filter logs by message..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="flex-1 bg-[#25252b] border border-[#3c3c3c] text-white text-[10px] px-2.5 py-1 rounded focus:outline-none focus:border-indigo-500 font-mono"
              />

              {/* Clear button */}
              {appLogs.length > 0 && (
                <button
                  onClick={() => setAppLogs([])}
                  className="p-1 text-xs text-[#8c8c94] hover:text-red-400 transition-all rounded hover:bg-[#323238] flex items-center gap-1"
                  title="Clear Logs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase">Clear</span>
                </button>
              )}
            </div>
          )}
          
          {/* Logs Display Screen */}
          <div className="flex-1 min-h-[300px] max-h-[460px] bg-[#1a1a20] border border-[#3c3c3c] rounded-lg p-3 overflow-y-auto font-mono text-[10px] flex flex-col gap-1.5 animate-in fade-in select-text">
            {activeTab === 'printer' ? (
              printLogs.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-[#6e6e76] italic">
                  Waiting for receipt printing triggers...
                </div>
              ) : (
                <div className="flex flex-col whitespace-pre text-[#a8d3a8]">
                  {printLogs.map((log, idx) => (
                    <div key={idx} className="mb-2">
                      {log}
                    </div>
                  ))}
                </div>
              )
            ) : (
              filteredAppLogs.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-[#6e6e76] italic">
                  {appLogs.length === 0 ? 'Waiting for application logs...' : 'No logs match the current filters.'}
                </div>
              ) : (
                filteredAppLogs.map((log, idx) => {
                  let badgeColor = 'bg-[#2a2a30] text-[#a0a0a8] border border-[#3c3c3c]';
                  let textColor = 'text-[#d4d4d4]';
                  let bgColor = 'bg-transparent';
                  
                  if (log.type === 'error') {
                    badgeColor = 'bg-red-950/60 text-red-400 border border-red-800/40';
                    textColor = 'text-red-300';
                    bgColor = 'bg-red-950/10 border-l-2 border-red-500 pl-1.5';
                  } else if (log.type === 'warn') {
                    badgeColor = 'bg-amber-950/60 text-amber-400 border border-amber-800/40';
                    textColor = 'text-amber-300';
                    bgColor = 'bg-amber-950/10 border-l-2 border-amber-500 pl-1.5';
                  } else if (log.type === 'info') {
                    badgeColor = 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/40';
                    textColor = 'text-cyan-300';
                    bgColor = 'bg-cyan-950/5';
                  } else if (log.type === 'debug') {
                    badgeColor = 'bg-purple-950/60 text-purple-400 border border-purple-800/40';
                    textColor = 'text-purple-300';
                    bgColor = 'bg-purple-950/5';
                  }

                  const winBadgeColor = log.windowLabel === 'developer' 
                    ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-800/40' 
                    : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40';

                  return (
                    <div key={idx} className={`py-1 border-b border-[#25252b]/30 ${bgColor} flex flex-col gap-1`}>
                      <div className="flex items-center gap-1.5 text-[9px] text-[#8c8c94] mb-0.5">
                        <span>[{log.timestamp}]</span>
                        <span className={`px-1.5 py-0.2 rounded font-extrabold uppercase ${winBadgeColor}`}>
                          {log.windowLabel}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded font-extrabold uppercase ${badgeColor}`}>
                          {log.type}
                        </span>
                      </div>
                      <pre className={`whitespace-pre-wrap break-all ${textColor} font-mono leading-relaxed`}>
                        {log.message}
                      </pre>
                    </div>
                  );
                })
              )
            )}
            {activeTab === 'printer' ? (
              <div ref={logsEndRef} />
            ) : (
              <div ref={appLogsEndRef} />
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
export default DeveloperWindow;
