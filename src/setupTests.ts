import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Global mocks for Tauri APIs
vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn((cmd, args) => {
      console.log(`[Mocked Invoke] cmd: ${cmd}`, args);
      // We can define base default fallback resolutions if needed,
      // but individual tests will override this via mockImplementation or mockResolvedValue
      if (cmd === 'get_items') {
        return Promise.resolve([]);
      }
      if (cmd === 'get_discounts') {
        return Promise.resolve([]);
      }
      if (cmd === 'get_db_path') {
        return Promise.resolve('mocked_database_path.db');
      }
      if (cmd === 'check_developer_bypass') {
        return Promise.resolve(false);
      }
      return Promise.resolve(null);
    })
  };
});

vi.mock('@tauri-apps/api/event', () => {
  return {
    listen: vi.fn(() => Promise.resolve(() => {})),
    emit: vi.fn(() => Promise.resolve())
  };
});

// Mock canvas-confetti because it is visual and accesses canvas graphics contexts
vi.mock('canvas-confetti', () => {
  return {
    default: vi.fn(() => {})
  };
});
