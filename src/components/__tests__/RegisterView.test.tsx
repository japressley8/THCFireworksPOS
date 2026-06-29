import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RegisterView from '../RegisterView';
import { invoke } from '@tauri-apps/api/core';

// Helper to cast mock
const mockInvoke = invoke as any;

describe('RegisterView Component', () => {
  const mockItems = [
    { id: 1, barcode: '1001', name: 'Sparkler Bomb', price: 10.00, stock_quantity: 5 },
    { id: 2, barcode: '1002', name: 'Roman Flare', price: 20.00, stock_quantity: 2 },
  ];

  const mockDiscounts = [
    { id: 1, name: 'Church 10%', type: 'percentage', value: 10.00 },
    { id: 2, name: 'VIP $5 Off', type: 'fixed', value: 5.00 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks resolution
    mockInvoke.mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'get_items') return Promise.resolve(mockItems);
      if (cmd === 'get_discounts') return Promise.resolve(mockDiscounts);
      if (cmd === 'get_item_by_barcode') {
        const item = mockItems.find(i => i.barcode === args.barcode);
        return Promise.resolve(item || null);
      }
      if (cmd === 'complete_sale') return Promise.resolve(99); // Mocked sale ID
      return Promise.resolve(null);
    });
  });

  it('renders blank checkout register and fetches database info on mount', async () => {
    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} />);
    
    expect(screen.getByText('Checkout Register')).toBeInTheDocument();
    expect(screen.getByText('Register is empty')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_items');
      expect(mockInvoke).toHaveBeenCalledWith('get_discounts');
    });
  });

  it('adds scanned barcode item to the register cart', async () => {
    const handleClearScan = vi.fn();
    const { rerender } = render(
      <RegisterView scannedBarcode="" onClearScan={handleClearScan} taxRate={0.00} />
    );

    // Simulate scanning barcode "1001"
    rerender(
      <RegisterView scannedBarcode="1001" onClearScan={handleClearScan} taxRate={0.00} />
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_item_by_barcode', { barcode: '1001' });
      expect(screen.getAllByText('Sparkler Bomb').length).toBeGreaterThan(0);
      expect(screen.getByText('1 Items')).toBeInTheDocument();
      // Total should be $10.00
      expect(document.getElementById('label-final-total')?.textContent).toBe('$10.00');
    });
    
    expect(handleClearScan).toHaveBeenCalledTimes(1);
  });

  it('handles quantity adjustments and bounds check', async () => {
    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} />);
    
    // Force manual scan insert by scanning "1002"
    fireEvent.change(screen.getByPlaceholderText(/Type Barcode/i), { target: { value: '1002' } });
    fireEvent.click(screen.getByText('Add Item'));

    await waitFor(() => {
      expect(screen.getAllByText('Roman Flare').length).toBeGreaterThan(0);
    });

    const plusBtn = document.getElementById('btn-qty-plus-2-reg')!;
    const minusBtn = document.getElementById('btn-qty-minus-2-reg')!;

    // Current quantity: 1
    // Click plus: quantity should become 2
    fireEvent.click(plusBtn);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(document.getElementById('label-final-total')?.textContent).toBe('$40.00');

    // Click plus again: stock level is 2, so it should block increment and show error
    fireEvent.click(plusBtn);
    expect(screen.getByText('2')).toBeInTheDocument(); // Stays at 2

    // Click minus: quantity should return to 1
    fireEvent.click(minusBtn);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(document.getElementById('label-final-total')?.textContent).toBe('$20.00');
  });

  it('applies percentage and fixed price discount presets', async () => {
    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} />);
    
    // Add "1001" ($10)
    fireEvent.change(screen.getByPlaceholderText(/Type Barcode/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText('Add Item'));

    await waitFor(() => {
      expect(screen.getAllByText('Sparkler Bomb').length).toBeGreaterThan(0);
    });

    // Subtotal: $10.00, Total: $10.00
    expect(document.getElementById('label-final-total')?.textContent).toBe('$10.00');

    // Apply Church 10% (should subtract $1.00)
    const discBtn = await screen.findByText('Church 10%');
    fireEvent.click(discBtn);
    
    // Final Total is now $9.00
    expect(document.getElementById('label-final-total')?.textContent).toBe('$9.00');
    expect(screen.getByText('-$1.00')).toBeInTheDocument();

    // Toggle off
    fireEvent.click(discBtn);
    expect(document.getElementById('label-final-total')?.textContent).toBe('$10.00');
  });

  it('completes checkout sale, calls Rust API, and triggers receipt popup', async () => {
    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.05} />); // 5% tax
    
    // Add Sparkler Bomb ($10)
    fireEvent.change(screen.getByPlaceholderText(/Type Barcode/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText('Add Item'));

    await waitFor(() => {
      expect(screen.getAllByText('Sparkler Bomb').length).toBeGreaterThan(0);
    });

    // 5% tax of $10.00 = $0.50
    // Total should be $10.50
    expect(document.getElementById('label-final-total')?.textContent).toBe('$10.50');

    // Checkout
    const checkoutBtn = screen.getByText('Complete Sale');
    fireEvent.click(checkoutBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('complete_sale', {
        items: [{ item_id: 1, quantity: 1, price_at_sale: 10.00, is_bulk: false }],
        subtotal: 10.00,
        discountTotal: 0,
        taxTotal: 0.50,
        finalTotal: 10.50
      });
      // Receipt modal should show up
      expect(screen.getByText('Transaction Completed')).toBeInTheDocument();
      // Cart resets
      expect(screen.getByText('Register is empty')).toBeInTheDocument();
    });
  });

  it('handles bulk case additions and correct stock calculations', async () => {
    const mockBulkItems = [
      { 
        id: 3, 
        barcode: '1003', 
        name: 'Mega Rockets', 
        price: 15.00, 
        stock_quantity: 24,
        bulk_barcode: '1003B',
        bulk_price: 120.00,
        bulk_quantity: 12
      }
    ];
    mockInvoke.mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'get_items') return Promise.resolve(mockBulkItems);
      if (cmd === 'get_discounts') return Promise.resolve([]);
      if (cmd === 'get_item_by_barcode') {
        const item = mockBulkItems.find(i => i.barcode === args.barcode || i.bulk_barcode === args.barcode);
        return Promise.resolve(item || null);
      }
      if (cmd === 'complete_sale') return Promise.resolve(100);
      return Promise.resolve(null);
    });

    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} />);

    // Add Case (Bulk) of Mega Rockets by typing bulk barcode
    fireEvent.change(screen.getByPlaceholderText(/Type Barcode/i), { target: { value: '1003B' } });
    fireEvent.click(screen.getByText('Add Item'));

    await waitFor(() => {
      expect(screen.getByText('Mega Rockets (Bulk Case)')).toBeInTheDocument();
      expect(screen.getByText('Case of 12')).toBeInTheDocument();
      // Bulk price: $120.00
      expect(document.getElementById('label-final-total')?.textContent).toBe('$120.00');
    });
  });
});
