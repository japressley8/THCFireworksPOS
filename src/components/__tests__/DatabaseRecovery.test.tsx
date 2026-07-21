import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from '../../App';
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

let closeRequestedCallback: any = null;

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn().mockImplementation((cb) => {
      closeRequestedCallback = cb;
      return Promise.resolve(vi.fn());
    }),
  }),
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
// Default invoke mock
// ---------------------------------------------------------------------------
function setupMockStatus(status: any) {
  mockInvoke.mockImplementation((cmd: string, _args: any) => {
    if (cmd === 'get_db_status') return Promise.resolve(status);
    if (cmd === 'get_items') return Promise.resolve([]);
    if (cmd === 'get_discounts') return Promise.resolve([]);
    if (cmd === 'get_sales') return Promise.resolve([]);
    if (cmd === 'get_yearly_sales_summary') return Promise.resolve([]);
    if (cmd === 'get_payment_methods') return Promise.resolve([]);
    if (cmd === 'get_taxes') return Promise.resolve([]);
    if (cmd === 'get_backup_restore_info') return Promise.resolve({ restored: false, restored_at: null, local_backup_last_updated: null });
    if (cmd === 'check_developer_bypass') return Promise.resolve(false);
    if (cmd === 'get_setting') return Promise.resolve(null);
    if (cmd === 'use_backup_as_temp_db') return Promise.resolve(undefined);
    if (cmd === 'rescan_for_primary_db') return Promise.resolve(true);
    if (cmd === 'restore_primary_db') return Promise.resolve({ overwritten: true });
    if (cmd === 'choose_new_location_restore') return Promise.resolve("D:/new_path/firework_pos.db");
    if (cmd === 'log_event') return Promise.resolve(undefined);
    return Promise.resolve(null);
  });
}

describe('App.tsx — Database Recovery & Relocation Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Database Connection Lost modal when primary drive is disconnected and not in temp mode', async () => {
    setupMockStatus({
      custom_db_path: 'E:/firework_pos.db',
      is_temp: false,
      original_custom_path: null,
      primary_path_exists: false,
      resolved_db_path: 'E:/firework_pos.db',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Database Connection Lost')).toBeInTheDocument();
      expect(screen.getByText('Configured Storage Drive Disconnected')).toBeInTheDocument();
      expect(screen.getByText('E:/firework_pos.db')).toBeInTheDocument();
    });
  });

  it('triggers use_backup_as_temp_db and re-fetches status when Work in Temporary Mode is clicked', async () => {
    setupMockStatus({
      custom_db_path: 'E:/firework_pos.db',
      is_temp: false,
      original_custom_path: null,
      primary_path_exists: false,
      resolved_db_path: 'E:/firework_pos.db',
    });

    render(<App />);

    const tempBtn = await screen.findByRole('button', { name: /Work in Temporary Mode/i });
    fireEvent.click(tempBtn);

    const confirmBtn = await screen.findByRole('button', { name: /^Confirm$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('use_backup_as_temp_db');
    });
  });

  it('triggers choose_new_location_restore and re-fetches status when Restore Backup to New Folder is clicked', async () => {
    setupMockStatus({
      custom_db_path: 'E:/firework_pos.db',
      is_temp: false,
      original_custom_path: null,
      primary_path_exists: false,
      resolved_db_path: 'E:/firework_pos.db',
    });

    render(<App />);

    const restoreBtn = await screen.findByRole('button', { name: /Restore Backup to a New Permanent Location/i });
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('choose_new_location_restore');
    });
  });

  it('renders Temporary Mode yellow warning banner when app is running from a temp backup database', async () => {
    setupMockStatus({
      custom_db_path: 'C:/temp/firework_pos_temp.db',
      is_temp: true,
      original_custom_path: 'E:/firework_pos.db',
      primary_path_exists: false,
      resolved_db_path: 'C:/temp/firework_pos_temp.db',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Running in Temporary Mode')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reconnect & Sync Drive/i })).toBeInTheDocument();
    });
  });

  it('triggers rescan_for_primary_db and restore_primary_db when Reconnect & Sync Drive is clicked in Temporary Mode banner', async () => {
    setupMockStatus({
      custom_db_path: 'C:/temp/firework_pos_temp.db',
      is_temp: true,
      original_custom_path: 'E:/firework_pos.db',
      primary_path_exists: false,
      resolved_db_path: 'C:/temp/firework_pos_temp.db',
    });

    render(<App />);

    const reconnectBtn = await screen.findByRole('button', { name: /Reconnect & Sync Drive/i });
    fireEvent.click(reconnectBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('rescan_for_primary_db');
      expect(mockInvoke).toHaveBeenCalledWith('restore_primary_db');
    });
  });

  it('triggers exit confirmation modal on close requested when cloud sync is connected', async () => {
    setupMockStatus({
      custom_db_path: null,
      is_temp: false,
      original_custom_path: null,
      primary_path_exists: true,
      resolved_db_path: 'E:/firework_pos.db',
    });

    // Mock get_cloud_backup_status to return connected
    mockInvoke.mockImplementation((cmd: string, _args: any) => {
      if (cmd === 'get_db_status') return Promise.resolve({
        custom_db_path: null,
        is_temp: false,
        original_custom_path: null,
        primary_path_exists: true,
        resolved_db_path: 'E:/firework_pos.db',
      });
      if (cmd === 'get_cloud_backup_status') return Promise.resolve({ is_connected: true });
      if (cmd === 'exit_app') return Promise.resolve(undefined);
      if (cmd === 'trigger_final_cloud_backup') return Promise.resolve("Success");
      if (cmd === 'get_items') return Promise.resolve([]);
      if (cmd === 'get_discounts') return Promise.resolve([]);
      if (cmd === 'get_sales') return Promise.resolve([]);
      if (cmd === 'get_payment_methods') return Promise.resolve([]);
      if (cmd === 'get_taxes') return Promise.resolve([]);
      if (cmd === 'get_backup_restore_info') return Promise.resolve({ restored: false, restored_at: null, local_backup_last_updated: null });
      if (cmd === 'check_developer_bypass') return Promise.resolve(false);
      if (cmd === 'get_setting') return Promise.resolve(null);
      if (cmd === 'log_event') return Promise.resolve(undefined);
      return Promise.resolve(null);
    });

    render(<App />);

    // Wait for the app to initialize
    await waitFor(() => {
      expect(closeRequestedCallback).toBeTypeOf('function');
    });

    // Simulate window close event
    const preventDefaultMock = vi.fn();
    await closeRequestedCallback({ preventDefault: preventDefaultMock });

    // Verify confirmation modal is shown
    await waitFor(() => {
      expect(screen.getByText('Closing Application')).toBeInTheDocument();
      expect(screen.getByText('Sync Cloud & Exit')).toBeInTheDocument();
    });

    // Click Exit Immediately
    const exitBtn = screen.getByRole('button', { name: /Exit Immediately/i });
    fireEvent.click(exitBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('exit_app');
    });
  });
});
