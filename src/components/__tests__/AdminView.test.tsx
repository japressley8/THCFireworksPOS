import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminView from '../AdminView';
import { invoke } from '@tauri-apps/api/core';
import { Theme } from '../../types';

const mockInvoke = invoke as any;

describe('AdminView Component', () => {
  const mockItems = [
    { id: 1, barcode: '1001', name: 'Roman Candle', price: 9.99, stock_quantity: 12 },
  ];

  const mockDiscounts = [
    { id: 1, name: 'Youth Leader 20%', type: 'percentage', value: 20 },
  ];

  const mockSales = [
    {
      id: 10,
      timestamp: '2026-06-28T12:00:00Z',
      subtotal: 9.99,
      discount_total: 0,
      tax_total: 0,
      final_total: 9.99,
      items: [
        { id: 1, sale_id: 10, item_id: 1, item_name: 'Roman Candle', item_barcode: '1001', quantity: 1, price_at_sale: 9.99 }
      ]
    }
  ];

  const mockThemes: Theme[] = [
    {
      id: 'dark',
      name: 'Dark Mode',
      bg: '#090d16',
      card: 'rgba(15, 23, 42, 0.75)',
      text: '#f8fafc',
      muted: '#94a3b8',
      primary: '#3b82f6',
      primaryHover: '#2563eb',
      accent: '#f59e0b',
      border: 'rgba(51, 65, 85, 0.5)',
      header: '#0f172a',
      input: '#05080e'
    }
  ];

  const defaultProps = {
    scannedBarcode: '',
    onClearScan: vi.fn(),
    activeThemeId: 'dark',
    themes: mockThemes,
    onSelectTheme: vi.fn(),
    onSaveCustomTheme: vi.fn(),
    onDeleteCustomTheme: vi.fn(),
    lowStockThreshold: 10,
    onThresholdChange: vi.fn(),
    totalStockCostSpent: 0,
    onTotalCostChange: vi.fn(),
    onTriggerUpdateCheck: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockInvoke.mockImplementation((cmd: string, _args?: any) => {
      if (cmd === 'get_items') return Promise.resolve(mockItems);
      if (cmd === 'get_discounts') return Promise.resolve(mockDiscounts);
      if (cmd === 'get_sales') return Promise.resolve(mockSales);
      if (cmd === 'get_yearly_sales_summary') return Promise.resolve([
        { year: '2026', total_sales: 9.99, subtotal: 9.99, tax_total: 0, discount_total: 0, ticket_count: 1, avg_ticket_value: 9.99, profit: 9.99 }
      ]);
      if (cmd === 'seed_historical_sales') return Promise.resolve();
      if (cmd === 'add_item') return Promise.resolve();
      if (cmd === 'update_item_details') return Promise.resolve();
      if (cmd === 'delete_item') return Promise.resolve();
      if (cmd === 'add_discount') return Promise.resolve();
      if (cmd === 'get_item_price_history') return Promise.resolve([]);
      return Promise.resolve(null);
    });
  });

  it('renders admin console tab directly on mount', async () => {
    render(<AdminView {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
      expect(screen.getByText('Catalog New Product')).toBeInTheDocument();
    });
  });

  it('handles new inventory catalog entries', async () => {
    render(<AdminView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Catalog New Product')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Scan or type barcode'), { target: { value: '9001' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Red White & Boom 16s Aerial'), { target: { value: 'Crackling Willow 32s' } });
    fireEvent.change(screen.getByPlaceholderText('45.00'), { target: { value: '29.99' } });
    fireEvent.change(screen.getByPlaceholderText('Unlimited (Optional)'), { target: { value: '50' } });

    fireEvent.click(screen.getByText('Add Product to Catalog'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('add_item', {
        barcode: '9001',
        name: 'Crackling Willow 32s',
        price: 29.99,
        stockQuantity: 50,
        notes: null,
        bulkPrice: null,
        bulkBarcode: null,
        bulkQuantity: null,
        unitCost: null,
        taxId: null,
        videoPath: null
      });
    });
  });

  it('navigates preset tab and deletes discount presets', async () => {
    render(<AdminView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });

    // Click Discounts sub-tab
    fireEvent.click(screen.getByText('Discounts'));

    await waitFor(() => {
      expect(screen.getByText('Youth Leader 20%')).toBeInTheDocument();
    });

    // Setup window.confirm mock
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);

    // Click Delete preset
    const deleteBtn = screen.getByRole('button', { name: 'Delete Preset' });
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('delete_discount', { id: 1 });
    });
  });

  it('navigates sales tab and expands detailed nested transaction rows', async () => {
    render(<AdminView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });

    // Click Sales Ledger tab
    fireEvent.click(screen.getByText('Sales Ledger'));

    await waitFor(() => {
      expect(screen.getByText('Sale ID')).toBeInTheDocument();
      expect(screen.getByText(/#10/)).toBeInTheDocument();
      expect(screen.getAllByText('$9.99').length).toBeGreaterThan(0);
    });

    // Sub-items details should be closed initially
    expect(screen.queryByText('Sold Items Receipt Detail')).not.toBeInTheDocument();

    // Toggle expansion button
    const eyeBtn = screen.getByTitle('Inspect sold items');
    fireEvent.click(eyeBtn);

    // Now drawer is expanded, revealing inner detailed items
    expect(screen.getByText('Sold Items Receipt Detail')).toBeInTheDocument();
    expect(screen.getByText('Roman Candle')).toBeInTheDocument();
    expect(screen.getAllByText('1')[0]).toBeInTheDocument();
  });

  it('navigates analytics tab and displays comparison stats', async () => {
    render(<AdminView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });

    // Click Analytics sub-tab
    fireEvent.click(screen.getByText('Analytics'));

    await waitFor(() => {
      expect(screen.getByText('Sales Analytics Dashboard')).toBeInTheDocument();
      expect(screen.getByText('2026')).toBeInTheDocument();
    });

    // Click Daily Summary Toggle
    const dailyBtn = screen.getByText('Daily Summary');
    fireEvent.click(dailyBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_daily_sales_summary');
    });
  });

  it('navigates themes tab and selects/creates themes', async () => {
    render(<AdminView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });

    // Click Settings sub-tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Available Themes')).toBeInTheDocument();
      expect(screen.getByText('Dark Mode')).toBeInTheDocument();
    });

    // Select theme
    const darkThemeCard = screen.getByText('Dark Mode');
    fireEvent.click(darkThemeCard);
    expect(defaultProps.onSelectTheme).toHaveBeenCalledWith('dark');

    // Create a custom theme
    fireEvent.change(screen.getByPlaceholderText('e.g. Volunteer Teal / Christmas Theme'), {
      target: { value: 'Church Mint' }
    });

    const saveThemeBtn = screen.getByRole('button', { name: 'Save & Apply Theme' });
    fireEvent.click(saveThemeBtn);

    expect(defaultProps.onSaveCustomTheme).toHaveBeenCalled();
  });

  it('handles inline editing of catalog items and saves with theme-primary styled button', async () => {
    render(<AdminView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Catalog New Product')).toBeInTheDocument();
    });

    // The catalog row with "Roman Candle" should be visible
    await waitFor(() => {
      expect(screen.getByText('Roman Candle')).toBeInTheDocument();
    });

    // Click the Edit button for the first catalog item
    const editBtn = document.getElementById('btn-edit-item-1')!;
    expect(editBtn).not.toBeNull();
    fireEvent.click(editBtn);

    // Edit fields should now appear (editing mode)
    await waitFor(() => {
      expect(document.getElementById('admin-edit-stock-1')).not.toBeNull();
    });

    // The Save button should exist and use theme-primary CSS classes
    const saveBtn = document.getElementById('btn-save-edit-1')!;
    expect(saveBtn).not.toBeNull();
    expect(saveBtn.className).toContain('bg-custom-primary/20');
    expect(saveBtn.className).toContain('border-custom-primary');
    expect(saveBtn.className).toContain('text-custom-primary');

    // Trigger save
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('update_item_details', expect.objectContaining({
        id: 1,
        name: 'Roman Candle',
      }));
    });
  });

  it('renders receipt preview with correct layout classes (items-start, h-fit)', async () => {
    render(<AdminView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });

    // Go to Settings to access receipt preview section
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Available Themes')).toBeInTheDocument();
    });

    // The receipt preview container should use items-start (not stretch cards vertically)
    // and the receipt card itself should use h-fit
    const previewContainers = document.querySelectorAll('.overflow-y-auto.max-h-\\[400px\\]');
    previewContainers.forEach(container => {
      expect(container.className).toContain('items-start');
    });

    const receiptCards = document.querySelectorAll('.w-\\[72mm\\]');
    receiptCards.forEach(card => {
      expect(card.className).toContain('h-fit');
    });
  });
});

