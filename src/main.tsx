import React from 'react'
import ReactDOM from 'react-dom/client'
import { emit, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import App from './App.tsx'
import './index.css'

// --- Date Simulation Override ---
const OriginalDate = window.Date;
(window as any).__simulatedDate = null;

function CustomDate(this: any, ...args: any[]) {
  if (!(this instanceof CustomDate)) {
    // Called as a function: Date()
    if ((window as any).__simulatedDate) {
      return new OriginalDate((window as any).__simulatedDate).toString();
    }
    return OriginalDate();
  }

  // Called with new: new Date()
  if (args.length === 0) {
    if ((window as any).__simulatedDate) {
      return new OriginalDate((window as any).__simulatedDate);
    }
    return new OriginalDate();
  }
  
  return new (OriginalDate as any)(...args);
}

CustomDate.prototype = OriginalDate.prototype;
CustomDate.now = function() {
  if ((window as any).__simulatedDate) {
    return new OriginalDate((window as any).__simulatedDate).getTime();
  }
  return OriginalDate.now();
};
CustomDate.UTC = OriginalDate.UTC;
CustomDate.parse = OriginalDate.parse;

window.Date = CustomDate as any;

// Initialize simulated date from settings
invoke<string | null>('get_setting', { key: 'dev_simulated_date' })
  .then((val) => {
    if (val) {
      (window as any).__simulatedDate = val;
    }
  })
  .catch((err) => {
    console.error('Failed to load simulated date setting on startup:', err);
  });

// Listen for simulated date updates
listen<{ key: string; value: string }>('developer-setting-changed', (event) => {
  if (event.payload.key === 'dev_simulated_date') {
    (window as any).__simulatedDate = event.payload.value || null;
  }
}).catch(() => {});
// ---------------------------------


// Hook console logging methods to emit events to Tauri, allowing the Developer window
// to listen and display application logs in real-time.
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;
const originalDebug = console.debug;

interface AppLog {
  type: string;
  message: string;
  timestamp: string;
  windowLabel: string;
}

const logBuffer: AppLog[] = [];
const MAX_BUFFER_SIZE = 500;
let isLogging = false;

const formatMessage = (args: any[]): string => {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack || arg.message;
      }
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
};

const sendLogToTauri = (type: string, args: any[]) => {
  if (isLogging) return;
  isLogging = true;
  try {
    const message = formatMessage(args);
    const windowLabel =
      typeof window !== 'undefined'
        ? window.location.search.includes('window=developer')
          ? 'developer'
          : window.location.search.includes('window=playback')
          ? 'playback'
          : 'main'
        : 'main';

    const logEntry: AppLog = {
      type,
      message,
      timestamp: new Date().toLocaleTimeString(),
      windowLabel,
    };

    // Buffer the log in the main window to replay when the developer console opens
    if (windowLabel === 'main') {
      logBuffer.push(logEntry);
      if (logBuffer.length > MAX_BUFFER_SIZE) {
        logBuffer.shift();
      }
    }

    emit('app-log', logEntry).catch(() => {
      // Ignore IPC errors when running outside of Tauri/webview context
    });
  } catch (e) {
    // Avoid console loop if error handler logs
  } finally {
    isLogging = false;
  }
};

console.log = (...args: any[]) => {
  originalLog(...args);
  sendLogToTauri('log', args);
};

console.error = (...args: any[]) => {
  originalError(...args);
  sendLogToTauri('error', args);
};

console.warn = (...args: any[]) => {
  originalWarn(...args);
  sendLogToTauri('warn', args);
};

console.info = (...args: any[]) => {
  originalInfo(...args);
  sendLogToTauri('info', args);
};

console.debug = (...args: any[]) => {
  originalDebug(...args);
  sendLogToTauri('debug', args);
};

// Listen for history requests from the developer window
listen('request-log-history', () => {
  const isMainWindow = typeof window !== 'undefined' && !window.location.search.includes('window=');
  if (isMainWindow) {
    // Replay all buffered logs to the developer window
    logBuffer.forEach((logEntry) => {
      emit('app-log', logEntry).catch(() => {});
    });
  }
}).catch(() => {});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

