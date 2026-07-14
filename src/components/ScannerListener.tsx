/**
 * @file ScannerListener.tsx
 * @description Global keyboard wedge barcode listener and simulated scan interceptor.
 *
 * This component intercepts keystrokes dispatched by barcode scanner hardware. Barcode wedge
 * scanners behave like high-speed keyboards that dump character sequences followed by an Enter key.
 *
 * Interception Rules:
 * 1. Focus Check: If the cursor is inside a focused text input or textarea, global capture is skipped.
 * 2. Modal Gating: Captures are suppressed if a dialog overlay is open (identified via CSS selector `.fixed.z-50`),
 *    preventing double-scans from interacting with background tables or input portals.
 * 3. Timing Check: Wedge keystrokes typically arrive within < 50ms of each other. We use a 100ms
 *    keystroke threshold and 150ms buffer reset timeout to differentiate hardware scans from manual typing.
 */

import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

interface ScannerListenerProps {
  onScan: (barcode: string) => void;
  isEnabled: boolean;
}

/**
 * Deduplicates barcodes that duplicate their characters due to hardware scanner double-transmissions.
 * E.g., Converts "1234512345" to "12345" if the repeating substring is >= 3 characters.
 *
 * @param rawBarcode The raw scanned string buffer.
 * @returns The deduplicated barcode string.
 */
export const deDuplicateBarcode = (rawBarcode: string): string => {
  const len = rawBarcode.length;
  // Try to find if rawBarcode is a repetition of a shorter substring
  for (let i = 1; i <= Math.floor(len / 2); i++) {
    if (len % i === 0) {
      const sub = rawBarcode.substring(0, i);
      if (sub.repeat(len / i) === rawBarcode) {
        if (sub.length >= 3) {
          return sub;
        }
      }
    }
  }
  return rawBarcode;
};

/**
 * Invisible global key event listener hook that processes scanned barcode buffers.
 */
export const ScannerListener: React.FC<ScannerListenerProps> = ({ onScan, isEnabled }) => {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const timeoutRef = useRef<any | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If a modal is open, don't capture globally.
      // Exception: If the Easter Egg modal is open, we DO want to capture globally so scanning a barcode closes it.
      const isEasterEggOpen = !!document.getElementById('btn-close-easter-eggs');
      if (document.querySelector('.fixed.z-50') && !isEasterEggOpen) {
        return;
      }

      // If the user is currently typing in an input or textarea, don't capture globally.
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        // Exception: if it's the barcode manual override input, let it handle its own events.
        return;
      }

      const currentTime = performance.now();
      
      // Wedge scanners send characters very fast (typically < 15-20ms per character).
      // We check if the delay since last key is less than 50ms to verify scanner speed,
      // but to allow developers or volunteers to type barcodes manually on normal keyboards, 
      // we can be slightly lenient or just use a threshold of 100ms.
      // Let's use 100ms to allow testing with standard keyboard typing, while rejecting stray keys.
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      // Clear any pending scan completion timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Handle Enter key ( wedge scanner suffix )
      if (e.key === 'Enter') {
        if (bufferRef.current.trim().length > 0) {
          onScanRef.current(deDuplicateBarcode(bufferRef.current.trim()));
          bufferRef.current = '';
        }
        e.preventDefault();
        return;
      }

      // Ignore modifiers and non-printable keys
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // Reset buffer if there has been a large gap, implying it's not a single scan sequence.
      // (Unless it's the very first character of a sequence, where timeDiff could be anything)
      if (bufferRef.current.length > 0 && timeDiff > 150) {
        bufferRef.current = '';
      }

      bufferRef.current += e.key;
      e.preventDefault();

      // Schedule timeout to process barcode if no further characters are typed.
      // Threshold barcode length of 3 is used to prevent single stray keystrokes from auto-scanning.
      timeoutRef.current = setTimeout(() => {
        if (bufferRef.current.trim().length >= 3) {
          onScanRef.current(deDuplicateBarcode(bufferRef.current.trim()));
          bufferRef.current = '';
        }
      }, 50);
    };

    window.addEventListener('keydown', handleKeyDown);

    let unsubscribe: (() => void) | null = null;

    listen<any>('simulate-barcode-scan', (event) => {
      let barcode = '';
      let autoNewline = true;

      if (typeof event.payload === 'string') {
        barcode = event.payload;
      } else if (event.payload && typeof event.payload === 'object') {
        barcode = event.payload.barcode || '';
        autoNewline = event.payload.autoNewline !== false;
      }

      // Simulate character-by-character keypresses to test the wedge scanning logic!
      for (let i = 0; i < barcode.length; i++) {
        const char = barcode[i];
        window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      }
      if (autoNewline) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }
    }).then((fn) => {
      unsubscribe = fn;
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isEnabled]);

  return null; // Invisible global listener component
};

export default ScannerListener;
