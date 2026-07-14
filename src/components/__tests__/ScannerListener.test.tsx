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

  it('ignores inputs when a fixed modal overlay (.fixed.z-50) is open', () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={true} />);

    // Simulate a modal overlay being present in the DOM
    const modal = document.createElement('div');
    modal.className = 'fixed z-50';
    document.body.appendChild(modal);

    // Scanner should be suppressed while modal is open
    ['1', '0', '0', '5', 'Enter'].forEach(key => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

    expect(handleScan).not.toHaveBeenCalled();

    // Remove modal — scanner should resume
    document.body.removeChild(modal);

    ['1', '0', '0', '6', 'Enter'].forEach(key => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

    expect(handleScan).toHaveBeenCalledTimes(1);
    expect(handleScan).toHaveBeenCalledWith('1006');
  });

  it('does NOT suppress scanner when the Easter Egg modal is open', () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={true} />);

    // Simulate the Easter Egg modal being present in the DOM (marked by its close button id)
    const modal = document.createElement('div');
    modal.className = 'fixed z-50';
    const closeBtn = document.createElement('button');
    closeBtn.id = 'btn-close-easter-eggs';
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);

    // Scanner should NOT be suppressed
    ['1', '0', '0', '7', 'Enter'].forEach(key => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

    expect(handleScan).toHaveBeenCalledTimes(1);
    expect(handleScan).toHaveBeenCalledWith('1007');

    document.body.removeChild(modal);
  });

  it('does NOT suppress scanner for non-fixed z-50 elements (only fixed modals)', () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={true} />);

    // A z-50 element that is NOT fixed (e.g. an absolutely positioned badge)
    const badge = document.createElement('div');
    badge.className = 'z-50'; // not "fixed z-50"
    document.body.appendChild(badge);

    ['2', '0', '0', '1', 'Enter'].forEach(key => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

    // Scanner should NOT be blocked — the element is z-50 but not fixed
    expect(handleScan).toHaveBeenCalledTimes(1);
    expect(handleScan).toHaveBeenCalledWith('2001');

    document.body.removeChild(badge);
  });

  it('triggers onScan automatically on timeout (50ms) if no Enter key is received', async () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={true} />);

    // Simulate wedge scanner outputting "1003" without Enter key
    const chars = ['1', '0', '0', '3'];
    
    chars.forEach(char => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: char, bubbles: true })
      );
    });

    // Before timeout, it should not have triggered onScan
    expect(handleScan).not.toHaveBeenCalled();

    // Wait for the 50ms character-typing timeout
    await new Promise(r => setTimeout(r, 60));

    expect(handleScan).toHaveBeenCalledTimes(1);
    expect(handleScan).toHaveBeenCalledWith('1003');
  });

  it('de-duplicates repeated barcode outputs without Enter key (timeout)', async () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={true} />);

    // Simulate wedge scanner sending "100810081008100810081008" rapidly
    const payload = "100810081008100810081008";
    for (let char of payload) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }

    await new Promise(r => setTimeout(r, 60));

    expect(handleScan).toHaveBeenCalledTimes(1);
    expect(handleScan).toHaveBeenCalledWith('1008');
  });

  it('de-duplicates repeated barcode outputs with Enter key', () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={true} />);

    // Simulate wedge scanner sending "100810081008" followed by Enter key
    const payload = "100810081008";
    for (let char of payload) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(handleScan).toHaveBeenCalledTimes(1);
    expect(handleScan).toHaveBeenCalledWith('1008');
  });

  it('does NOT de-duplicate short patterns (repeated pattern length < 3)', () => {
    const handleScan = vi.fn();
    render(<ScannerListener onScan={handleScan} isEnabled={true} />);

    // "1212" contains repeated pattern "12", but length is 2, which is < 3
    const payload = "1212";
    for (let char of payload) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(handleScan).toHaveBeenCalledTimes(1);
    expect(handleScan).toHaveBeenCalledWith('1212');
  });
});
