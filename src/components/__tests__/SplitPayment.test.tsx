import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SplitPaymentModal } from '../shared/SplitPaymentModal';
import { PaymentMethod, Theme } from '../../types';

const mockTheme: Theme = {
  id: 'thc-dark',
  name: 'THC Dark',
  bg: '#0f172a',
  card: '#1e293b',
  text: '#f8fafc',
  muted: '#94a3b8',
  primary: '#10b981',
  primaryHover: '#059669',
  accent: '#38bdf8',
  border: '#334155',
  header: '#1e293b',
  input: '#0f172a',
};

const mockPaymentMethods: PaymentMethod[] = [
  { id: 1, name: 'Cash', enabled: 1, fee_percentage: 0, fee_flat: 0, is_custom: 0, status: 'active', fee_mode: 'deducted' },
  { id: 2, name: 'Card', enabled: 1, fee_percentage: 3.0, fee_flat: 0, is_custom: 0, status: 'active', fee_mode: 'on_top' },
];

describe('SplitPaymentModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders order summary and allows adding cash tender', async () => {
    const handleComplete = vi.fn();
    const handleClose = vi.fn();

    render(
      <SplitPaymentModal
        theme={mockTheme}
        orderSubtotal={100.00}
        orderTaxTotal={7.00}
        orderDiscountTotal={0.00}
        paymentMethods={mockPaymentMethods}
        onCompleteSale={handleComplete}
        onClose={handleClose}
      />
    );

    expect(screen.getByText('Split Payment Checkout')).toBeInTheDocument();
    expect(screen.getAllByText('$107.00').length).toBeGreaterThan(0); // Base order total (100 + 7)

    // Select Tender amount: $50
    const amountInput = screen.getByLabelText(/Tender Amount/i);
    fireEvent.change(amountInput, { target: { value: '50.00' } });

    // Add Tender button
    const addBtn = screen.getByRole('button', { name: /Add Cash Tender/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('Applied Tenders (1)')).toBeInTheDocument();
      expect(screen.getAllByText('$57.00').length).toBeGreaterThan(0); // Remaining balance (107 - 50)
    });
  });

  it('calculates on-top fee surcharges independently per tender', async () => {
    const handleComplete = vi.fn();
    const handleClose = vi.fn();

    render(
      <SplitPaymentModal
        theme={mockTheme}
        orderSubtotal={100.00}
        orderTaxTotal={0.00}
        orderDiscountTotal={0.00}
        paymentMethods={mockPaymentMethods}
        onCompleteSale={handleComplete}
        onClose={handleClose}
      />
    );

    // Switch to Card (which has 3% on-top fee mode)
    const cardBtn = screen.getByText('Card');
    fireEvent.click(cardBtn);

    const amountInput = screen.getByLabelText(/Tender Amount/i);
    fireEvent.change(amountInput, { target: { value: '100.00' } });

    const addBtn = screen.getByRole('button', { name: /Add Card Tender/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('+ $3.00 Surcharge')).toBeInTheDocument();
      expect(screen.getAllByText('+$3.00').length).toBeGreaterThan(0);
    });
  });

  it('completes split payment sale when total balance is fully tendered', async () => {
    const handleComplete = vi.fn();
    const handleClose = vi.fn();

    render(
      <SplitPaymentModal
        theme={mockTheme}
        orderSubtotal={50.00}
        orderTaxTotal={0.00}
        orderDiscountTotal={0.00}
        paymentMethods={mockPaymentMethods}
        onCompleteSale={handleComplete}
        onClose={handleClose}
      />
    );

    // Add $50 Cash Tender
    const amountInput = screen.getByLabelText(/Tender Amount/i);
    fireEvent.change(amountInput, { target: { value: '50.00' } });

    const addBtn = screen.getByRole('button', { name: /Add Cash Tender/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      const completeBtn = screen.getByRole('button', { name: /Complete Split Sale/i });
      expect(completeBtn).toBeEnabled();
      fireEvent.click(completeBtn);
      expect(handleComplete).toHaveBeenCalledWith(expect.any(Array), 0);
    });
  });

  it('triggers onClose when Cancel button is clicked', () => {
    const handleComplete = vi.fn();
    const handleClose = vi.fn();

    render(
      <SplitPaymentModal
        theme={mockTheme}
        orderSubtotal={50.00}
        orderTaxTotal={0.00}
        orderDiscountTotal={0.00}
        paymentMethods={mockPaymentMethods}
        onCompleteSale={handleComplete}
        onClose={handleClose}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(handleClose).toHaveBeenCalled();
  });
});
