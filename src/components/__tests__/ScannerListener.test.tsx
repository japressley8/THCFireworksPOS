import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ScannerListener from '../ScannerListener';

describe('ScannerListener Component', () => {
  it('accumulates keystrokes and triggers onScan on Enter', async () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={true} />);

    // Simulate wedge scanner outputting "1001" followed by Enter key
    const chars = ['1', '0', '0', '1'];
    
    chars.forEach(char => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: char, bubbles: true })
      );
    });

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );

    expect(handleScan).toHaveBeenCalledTimes(1);
    expect(handleScan).toHaveBeenCalledWith('1001');
  });

  it('ignores inputs if isEnabled is false', () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={false} />);

    // Send keystrokes
    ['1', '0', '0', '2', 'Enter'].forEach(key => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

    expect(handleScan).not.toHaveBeenCalled();
  });

  it('resets buffer if keypress delay exceeds threshold (slow typing)', async () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={true} />);

    // First digit
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    
    // Simulate a time delay greater than the 150ms buffer reset interval
    await new Promise(r => setTimeout(r, 200));

    // Next digits and Enter
    ['0', '2', 'Enter'].forEach(key => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

    // The first '1' should have been discarded due to the delay, returning only "02"
    expect(handleScan).toHaveBeenCalledWith('02');
  });

  it('ignores keydown inputs if the user is typing in standard inputs', () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={true} />);

    // Create an input field, focus it, and append it to the document
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Fire keyboard events
    ['9', '9', 'Enter'].forEach(key => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

    expect(handleScan).not.toHaveBeenCalled();

    // Clean up
    document.body.removeChild(input);
  });
});
