import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterView } from '../RegisterView';
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
      if (cmd === 'get_taxes') return Promise.resolve([]);
      if (cmd === 'get_payment_methods') return Promise.resolve([
        { id: 1, name: 'Cash', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active' },
        { id: 2, name: 'Card', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active' },
        { id: 3, name: 'GoDaddy Terminal Flex', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active' }
      ]);
      if (cmd === 'get_setting') {
        if (args.key === 'godaddy_pairing_status') return Promise.resolve('paired');
        if (args.key === 'cash_change_calculator_enabled') return Promise.resolve('false');
        return Promise.resolve(null);
      }
      if (cmd === 'get_item_by_barcode') {
        const item = mockItems.find(i => i.barcode === args.barcode);
        return Promise.resolve(item || null);
      }
      if (cmd === 'complete_sale') return Promise.resolve(99); // Mocked sale ID
      return Promise.resolve(null);
    });
  });

  it('renders blank checkout register and fetches database info on mount', async () => {
    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} lowStockThreshold={10} />);
    
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
      <RegisterView scannedBarcode="" onClearScan={handleClearScan} taxRate={0.00} lowStockThreshold={10} />
    );

    // Simulate scanning barcode "1001"
    rerender(
      <RegisterView scannedBarcode="1001" onClearScan={handleClearScan} taxRate={0.00} lowStockThreshold={10} />
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
    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} lowStockThreshold={10} />);
    
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
    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} lowStockThreshold={10} />);
    
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
    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.05} lowStockThreshold={10} />); // 5% tax
    
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

    // Wait for the modal and click cash
    await waitFor(() => {
      expect(screen.getByText('Select Payment Method')).toBeInTheDocument();
    });
    const cashBtn = screen.getByText(/Pay with Cash/i);
    fireEvent.click(cashBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('complete_sale', {
        items: [{ item_id: 1, quantity: 1, price_at_sale: 10.00, is_bulk: false }],
        subtotal: 10.00,
        discountTotal: 0,
        taxTotal: 0.50,
        finalTotal: 10.50,
        paymentMethod: 'Cash',
        godaddyTransactionId: null,
        transactionFee: 0
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
      if (cmd === 'get_taxes') return Promise.resolve([]);
      if (cmd === 'get_payment_methods') return Promise.resolve([
        { id: 1, name: 'Cash', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active' },
        { id: 2, name: 'Card', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active' }
      ]);
      if (cmd === 'get_setting') {
        if (args.key === 'cash_change_calculator_enabled') return Promise.resolve('false');
        return Promise.resolve(null);
      }
      if (cmd === 'get_item_by_barcode') {
        const item = mockBulkItems.find(i => i.barcode === args.barcode || i.bulk_barcode === args.barcode);
        return Promise.resolve(item || null);
      }
      if (cmd === 'complete_sale') return Promise.resolve(100);
      return Promise.resolve(null);
    });

    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} lowStockThreshold={10} />);

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

  it('handles GoDaddy terminal payment flow successfully', async () => {
    // Override invoke to mock GoDaddy settings and commands
    mockInvoke.mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'get_items') return Promise.resolve(mockItems);
      if (cmd === 'get_discounts') return Promise.resolve([]);
      if (cmd === 'get_taxes') return Promise.resolve([]);
      if (cmd === 'get_payment_methods') return Promise.resolve([
        { id: 1, name: 'Cash', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active' },
        { id: 2, name: 'Card', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active' },
        { id: 3, name: 'GoDaddy Terminal Flex', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active' }
      ]);
      if (cmd === 'get_setting') {
        if (args.key === 'godaddy_enabled') return Promise.resolve('true');
        if (args.key === 'godaddy_terminal_ip') return Promise.resolve('192.168.1.150');
        if (args.key === 'godaddy_pairing_token') return Promise.resolve('token_123');
        if (args.key === 'godaddy_pairing_status') return Promise.resolve('paired');
        if (args.key === 'auto_print_receipts') return Promise.resolve('true');
        if (args.key === 'receipt_column_width') return Promise.resolve('32');
        if (args.key === 'cash_change_calculator_enabled') return Promise.resolve('false');
        return Promise.resolve(null);
      }
      if (cmd === 'get_item_by_barcode') {
        return Promise.resolve(mockItems[0]);
      }
      if (cmd === 'godaddy_initiate_payment') {
        expect(args.amountCents).toBe(1000); // 10.00 subtotal, 0 discount, 0 tax
        return Promise.resolve({ txId: 'godaddy_tx_id_999', paymentMethod: 'GoDaddy Terminal Flex' });
      }
      if (cmd === 'complete_sale') {
        expect(args.subtotal).toBe(10.00);
        expect(args.finalTotal).toBe(10.00);
        // Payment method is resolved from bridge response — could be "GoDaddy Terminal Flex" or "Cash"
        expect(['GoDaddy Terminal Flex', 'Cash']).toContain(args.paymentMethod);
        expect(args.godaddyTransactionId).toBe('godaddy_tx_id_999');
        return Promise.resolve(101); // Mock sale ID
      }
      if (cmd === 'godaddy_print_receipt') {
        expect(args.ip).toBe('192.168.1.150');
        expect(args.token).toBe('token_123');
        expect(args.receiptText).toContain('101');
        return Promise.resolve(true);
      }
      return Promise.resolve(null);
    });

    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} lowStockThreshold={10} />);

    // Add item to cart
    fireEvent.change(screen.getByPlaceholderText(/Type Barcode/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText('Add Item'));

    await waitFor(() => {
      expect(screen.getAllByText('Sparkler Bomb').length).toBeGreaterThan(0);
    });

    // Click Complete Sale -> Shows payment methods because godaddy is enabled
    const completeSaleBtn = screen.getByRole('button', { name: 'Complete Sale' });
    fireEvent.click(completeSaleBtn);

    // Verify method selection modal is shown
    await waitFor(() => {
      expect(screen.getByText('Select Payment Method')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Pay with GoDaddy Terminal Flex/i })).toBeInTheDocument();
    });

    // Click Pay with GoDaddy Terminal Flex
    const godaddyBtn = screen.getByRole('button', { name: /Pay with GoDaddy Terminal Flex/i });
    fireEvent.click(godaddyBtn);

    // Should call initiate payment, then complete sale, then print receipt, then resolve
    await waitFor(() => {
      // Cart should be reset to empty
      expect(screen.getByText('Register is empty')).toBeInTheDocument();
      // Receipt popup showing transaction completed should display
      expect(screen.getByText('Transaction Completed')).toBeInTheDocument();
    });
  });

  it('applies complex discounts: mix-and-match quantity deals and cheapest free deals', async () => {
    const complexItems = [
      { id: 1, barcode: '1001', name: 'Sparkler Bomb', price: 10.00, stock_quantity: 5, discount_tags: 'sparkler' },
      { id: 2, barcode: '1002', name: 'Roman Flare', price: 20.00, stock_quantity: 2, discount_tags: 'sparkler' },
      { id: 3, barcode: '1003', name: 'Cheapest Sparkler', price: 5.00, stock_quantity: 10, discount_tags: 'sparkler' }
    ];

    const complexDiscounts = [
      {
        id: 10,
        name: 'Mix-and-Match Buy 3 cheapest free',
        qualifier_type: 'item_quantity',
        qualifier_value: 2, // Buy 2 tagged sparkler
        reward_type: 'lowest_cost_item',
        reward_value: 100, // Cheapest is 100% off (free)
        reward_value_type: 'percentage',
        reward_quantity: 1,
        discount_tag: 'sparkler',
        is_stackable: 1
      }
    ];

    mockInvoke.mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'get_items') return Promise.resolve(complexItems);
      if (cmd === 'get_discounts') return Promise.resolve(complexDiscounts);
      if (cmd === 'get_taxes') return Promise.resolve([]);
      if (cmd === 'get_payment_methods') return Promise.resolve([]);
      if (cmd === 'get_setting') return Promise.resolve(null);
      if (cmd === 'get_item_by_barcode') {
        const item = complexItems.find(i => i.barcode === args.barcode);
        return Promise.resolve(item || null);
      }
      return Promise.resolve(null);
    });

    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} lowStockThreshold={10} />);

    // Add Sparkler Bomb ($10)
    fireEvent.change(screen.getByPlaceholderText(/Type Barcode/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText('Add Item'));
    // Add Roman Flare ($20)
    fireEvent.change(screen.getByPlaceholderText(/Type Barcode/i), { target: { value: '1002' } });
    fireEvent.click(screen.getByText('Add Item'));
    // Add Cheapest Sparkler ($5)
    fireEvent.change(screen.getByPlaceholderText(/Type Barcode/i), { target: { value: '1003' } });
    fireEvent.click(screen.getByText('Add Item'));

    await waitFor(() => {
      expect(screen.getByText('Sparkler Bomb')).toBeInTheDocument();
      expect(screen.getByText('Roman Flare')).toBeInTheDocument();
      expect(screen.getByText('Cheapest Sparkler')).toBeInTheDocument();
    });

    // Subtotal is 10 + 20 + 5 = 35.
    // The discount requires Buy 2 sparkler, reward is cheapest sparkler free.
    // We have 3 sparklers: 10, 20, 5.
    // Two sparklers act as qualifiers, leaving the cheapest one (5) as reward.
    // Savings should be $5.00. Total should be $30.00.
    await waitFor(() => {
      expect(document.getElementById('label-final-total')?.textContent).toBe('$30.00');
    });
  });

  it('shows missing reward alert warning on checkout if qualifier met but reward target missing', async () => {
    const complexItems = [
      { id: 1, barcode: '1001', name: 'Sparkler Bomb', price: 10.00, stock_quantity: 5, discount_tags: 'sparkler' },
      { id: 4, barcode: '1004', name: 'Reward Firework', price: 15.00, stock_quantity: 5, discount_tags: '' }
    ];

    const complexDiscounts = [
      {
        id: 11,
        name: 'Buy Sparkler get Reward Firework free',
        qualifier_type: 'item_quantity',
        qualifier_value: 1,
        reward_type: 'item_discount_qty',
        reward_target_item_id: 4, // Reward Firework
        reward_value: 100, // 100% off
        reward_value_type: 'percentage',
        reward_quantity: 1,
        discount_tag: 'sparkler',
        is_stackable: 1
      }
    ];

    mockInvoke.mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'get_items') return Promise.resolve(complexItems);
      if (cmd === 'get_discounts') return Promise.resolve(complexDiscounts);
      if (cmd === 'get_taxes') return Promise.resolve([]);
      if (cmd === 'get_payment_methods') return Promise.resolve([
        { id: 1, name: 'Cash', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active' }
      ]);
      if (cmd === 'get_setting') return Promise.resolve(null);
      if (cmd === 'get_item_by_barcode') {
        const item = complexItems.find(i => i.barcode === args.barcode);
        return Promise.resolve(item || null);
      }
      return Promise.resolve(null);
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);

    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} lowStockThreshold={10} />);

    // Add Sparkler Bomb ($10)
    fireEvent.change(screen.getByPlaceholderText(/Type Barcode/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText('Add Item'));

    await waitFor(() => {
      expect(screen.getByText('Sparkler Bomb')).toBeInTheDocument();
    });

    // Complete checkout (Complete Sale button)
    const completeSaleBtn = screen.getByRole('button', { name: 'Complete Sale' });
    fireEvent.click(completeSaleBtn);

    // Verify warning alert is triggered (dialog popup warning the cashier that the discount is qualified but the reward item is not in the cart)
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Discount Qualifier Met, but Reward Cannot Be Applied'));
    });

    confirmSpy.mockRestore();
  });

  it('completes sale after bypassing missing reward warning', async () => {
    const complexItems = [
      { id: 1, barcode: '1001', name: 'Sparkler Bomb', price: 10.00, stock_quantity: 5, discount_tags: 'sparkler' },
      { id: 4, barcode: '1004', name: 'Reward Firework', price: 15.00, stock_quantity: 5, discount_tags: '' }
    ];

    const complexDiscounts = [
      {
        id: 11,
        name: 'Buy Sparkler get Reward Firework free',
        qualifier_type: 'item_quantity',
        qualifier_value: 1,
        reward_type: 'item_discount_qty',
        reward_target_item_id: 4,
        reward_value: 100,
        reward_value_type: 'percentage',
        reward_quantity: 1,
        discount_tag: 'sparkler',
        is_stackable: 1
      }
    ];

    mockInvoke.mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'get_items') return Promise.resolve(complexItems);
      if (cmd === 'get_discounts') return Promise.resolve(complexDiscounts);
      if (cmd === 'get_taxes') return Promise.resolve([]);
      if (cmd === 'get_payment_methods') return Promise.resolve([
        { id: 1, name: 'Cash', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active' }
      ]);
      if (cmd === 'get_setting') return Promise.resolve(null);
      if (cmd === 'get_item_by_barcode') {
        const item = complexItems.find(i => i.barcode === args.barcode);
        return Promise.resolve(item || null);
      }
      if (cmd === 'complete_sale') return Promise.resolve(120);
      return Promise.resolve(null);
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);

    render(<RegisterView scannedBarcode="" onClearScan={() => {}} taxRate={0.00} lowStockThreshold={10} />);

    // Add Sparkler Bomb ($10)
    fireEvent.change(screen.getByPlaceholderText(/Type Barcode/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText('Add Item'));

    await waitFor(() => {
      expect(screen.getByText('Sparkler Bomb')).toBeInTheDocument();
    });

    // Click Complete Sale
    const completeSaleBtn = screen.getByRole('button', { name: 'Complete Sale' });
    fireEvent.click(completeSaleBtn);

    // Verify confirm dialog is called
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
    });

    // Wait for the modal and click cash
    await waitFor(() => {
      expect(screen.getByText('Select Payment Method')).toBeInTheDocument();
    });
    const cashBtn = screen.getByText(/Pay with Cash/i);
    fireEvent.click(cashBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('complete_sale', expect.objectContaining({
        paymentMethod: 'Cash',
        discountTotal: 0
      }));
      expect(screen.getByText('Transaction Completed')).toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });
});
