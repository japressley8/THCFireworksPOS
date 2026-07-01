import { useEffect, useRef } from 'react';

interface ScannerListenerProps {
  onScan: (barcode: string) => void;
  isEnabled: boolean;
}

export const ScannerListener: React.FC<ScannerListenerProps> = ({ onScan, isEnabled }) => {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If a modal is open, don't capture globally.
      if (document.querySelector('.fixed.z-50')) {
        return;
      }

      // If the user is currently typing in an input or textarea, don't capture globally.
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        // Exception: if it's the barcode manual override input, let it handle its own events.
        return;
      }

      const currentTime = Date.now();
      
      // Wedge scanners send characters very fast (typically < 15-20ms per character).
      // We check if the delay since last key is less than 50ms to verify scanner speed,
      // but to allow developers or volunteers to type barcodes manually on normal keyboards, 
      // we can be slightly lenient or just use a threshold of 100ms.
      // Let's use 100ms to allow testing with standard keyboard typing, while rejecting stray keys.
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      // Handle Enter key ( wedge scanner suffix )
      if (e.key === 'Enter') {
        if (bufferRef.current.trim().length > 0) {
          onScan(bufferRef.current.trim());
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onScan, isEnabled]);

  return null; // Invisible global listener component
};
export default ScannerListener;
