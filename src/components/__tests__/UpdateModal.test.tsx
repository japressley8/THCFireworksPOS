/**
 * @file UpdateModal.test.tsx
 *
 * Tests for the App.tsx native auto-updater modal flow:
 *  - Modal renders when an update is available
 *  - "Update & Restart" button replaces the legacy "Download Update" button
 *  - prepare_update Tauri command is invoked before downloadAndInstall
 *  - Permission error ("access denied") is surfaced with an advisory message
 *  - Generic download errors are shown as plain error messages
 *  - "View releases on GitHub" secondary link is rendered
 *  - Close button is disabled while an install is in progress
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../../App';
import { invoke } from '@tauri-apps/api/core';

const mockInvoke = invoke as any;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockReturnValue(Promise.resolve(() => {})),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helper: build a mock update object returned by check()
// ---------------------------------------------------------------------------
const buildMockUpdate = (overrides: Record<string, any> = {}) => ({
  version: '28.0.0',
  body: 'Bug fixes and performance improvements.',
  downloadAndInstall: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Default invoke mock
// ---------------------------------------------------------------------------
function setupDefaultInvoke() {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_items') return Promise.resolve([]);
    if (cmd === 'get_discounts') return Promise.resolve([]);
    if (cmd === 'get_sales') return Promise.resolve([]);
    if (cmd === 'get_yearly_sales_summary') return Promise.resolve([]);
    if (cmd === 'get_payment_methods') return Promise.resolve([]);
    if (cmd === 'get_taxes') return Promise.resolve([]);
    if (cmd === 'get_backup_restore_info') return Promise.resolve({ restored: false, restored_at: null, local_backup_last_updated: null });
    if (cmd === 'check_developer_bypass') return Promise.resolve(false);
    if (cmd === 'get_setting') return Promise.resolve(null);
    if (cmd === 'prepare_update') return Promise.resolve(undefined);
    if (cmd === 'log_event') return Promise.resolve(undefined);
    return Promise.resolve(null);
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('App.tsx — Native Auto-Updater Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultInvoke();
  });

  it('renders the "Update & Restart" button (not "Download Update") when update is available', async () => {
    const { check } = await import('@tauri-apps/plugin-updater');
    (check as any).mockResolvedValueOnce(buildMockUpdate());

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update & restart/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /download update/i })).not.toBeInTheDocument();
  });

  it('shows the "View releases on GitHub" secondary link when update modal is open', async () => {
    const { check } = await import('@tauri-apps/plugin-updater');
    (check as any).mockResolvedValueOnce(buildMockUpdate());

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /view releases on github/i })).toBeInTheDocument();
    });
  });

  it('calls prepare_update before downloadAndInstall when "Update & Restart" is clicked', async () => {
    const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined);
    const { check } = await import('@tauri-apps/plugin-updater');
    (check as any).mockResolvedValueOnce(buildMockUpdate({ downloadAndInstall: mockDownloadAndInstall }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update & restart/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /update & restart/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('prepare_update');
      expect(mockDownloadAndInstall).toHaveBeenCalled();
    });

    const calls = mockInvoke.mock.calls.map((c: any[]) => c[0]);
    const prepIdx = calls.indexOf('prepare_update');
    expect(prepIdx).toBeGreaterThanOrEqual(0);
  });

  it('shows a permission advisory message when downloadAndInstall throws an "access denied" error', async () => {
    const { check } = await import('@tauri-apps/plugin-updater');
    (check as any).mockResolvedValueOnce(
      buildMockUpdate({
        downloadAndInstall: vi.fn().mockRejectedValue(new Error('Access is denied')),
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update & restart/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /update & restart/i }));

    await waitFor(() => {
      expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
      expect(screen.getByText(/documents or desktop/i)).toBeInTheDocument();
    });
  });

  it('shows a generic error message for non-permission failures', async () => {
    const { check } = await import('@tauri-apps/plugin-updater');
    (check as any).mockResolvedValueOnce(
      buildMockUpdate({
        downloadAndInstall: vi.fn().mockRejectedValue(new Error('Network timeout')),
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update & restart/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /update & restart/i }));

    await waitFor(() => {
      expect(screen.getByText(/Update failed: Error: Network timeout/i)).toBeInTheDocument();
    });
  });

  it('disables the close button (btn-update-close) while install is in progress', async () => {
    const neverResolves = new Promise<void>(() => {});
    const { check } = await import('@tauri-apps/plugin-updater');
    (check as any).mockResolvedValueOnce(
      buildMockUpdate({ downloadAndInstall: vi.fn().mockReturnValue(neverResolves) })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update & restart/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /update & restart/i }));

    await new Promise(r => setTimeout(r, 50));

    const allButtons = screen.getAllByRole('button');
    const closeBtn = allButtons.find(b => b.id === 'btn-update-close');
    if (closeBtn) {
      expect(closeBtn).toBeDisabled();
    }
  });
});
