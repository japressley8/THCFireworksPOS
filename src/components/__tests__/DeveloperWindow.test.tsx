import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeveloperWindow } from '../DeveloperWindow';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

const mockInvoke = invoke as any;
const mockEmit = emit as any;

describe('DeveloperWindow Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'check_developer_bypass') return Promise.resolve(true);
      if (cmd === 'get_simulated_date') return Promise.resolve('');
      if (cmd === 'get_setting') return Promise.resolve(null);
      if (cmd === 'seed_test_data') return Promise.resolve();
      if (cmd === 'seed_parked_carts') return Promise.resolve();
      if (cmd === 'reset_database') return Promise.resolve();
      return Promise.resolve(null);
    });
  });

  it('renders developer window controls correctly', async () => {
    render(<DeveloperWindow />);
    
    expect(screen.getByText('THC Fireworks Developer Console')).toBeInTheDocument();
    expect(screen.getByText('Insert Test Data')).toBeInTheDocument();
    expect(screen.getByText('Seed Parked Carts')).toBeInTheDocument();
  });

  it('triggers test data seeding when Insert Test Data is clicked', async () => {
    render(<DeveloperWindow />);
    
    const seedBtn = screen.getByText('Insert Test Data');
    fireEvent.click(seedBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('seed_test_data');
      expect(mockEmit).toHaveBeenCalledWith('database-seeding-completed', {});
    });
  });

  it('triggers barcode scan emission when barcode simulator form is submitted', async () => {
    render(<DeveloperWindow />);

    const barcodeInput = screen.getByPlaceholderText(/Barcode \(e\.g\. 1002\)/i);
    fireEvent.change(barcodeInput, { target: { value: '1001' } });

    const scanBtn = screen.getByText('Send Scan');
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(mockEmit).toHaveBeenCalledWith('simulate-barcode-scan', { barcode: '1001', autoNewline: true });
    });
  });

  it('switches between logs tabs', async () => {
    render(<DeveloperWindow />);

    const appLogsTab = screen.getByText('Application Logs');
    fireEvent.click(appLogsTab);

    expect(screen.getByPlaceholderText('Filter logs by message...')).toBeInTheDocument();
  });
});
