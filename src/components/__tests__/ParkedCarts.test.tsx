import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParkCartModal } from '../shared/ParkCartModal';
import { ParkedCartsModal } from '../shared/ParkedCartsModal';
import { Theme, ParkedCart, Item } from '../../types';

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

const mockParkedCarts: ParkedCart[] = [
  {
    id: 101,
    label: 'John / Blue Truck',
    customer_name: 'John Doe',
    customer_phone: '555-1234',
    cart_json: JSON.stringify([{ item: { id: 1, barcode: '1001', name: 'Sparklers', price: 10.00 }, quantity: 2 }]),
    subtotal: 20.00,
    tax_total: 1.40,
    discount_total: 0,
    final_total: 21.40,
    created_at: '2026-07-21T14:00:00Z',
  },
];

const mockCatalog: Item[] = [
  { id: 1, barcode: '1001', name: 'Sparklers', price: 10.00, stock_quantity: 50 },
];

describe('ParkCartModal Component', () => {
  it('submits park cart form with label and customer info', () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ParkCartModal
        theme={mockTheme}
        itemCount={2}
        subtotal={20.00}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    expect(screen.getByText('Park Active Cart')).toBeInTheDocument();

    const tagInput = screen.getByPlaceholderText(/e.g. Blue Truck/i);
    fireEvent.change(tagInput, { target: { value: 'Hold for John' } });

    const nameInput = screen.getByPlaceholderText('John Doe');
    fireEvent.change(nameInput, { target: { value: 'John Smith' } });

    const phoneInput = screen.getByPlaceholderText('(555) 000-0000');
    fireEvent.change(phoneInput, { target: { value: '555-0199' } });

    const submitBtn = screen.getByRole('button', { name: /^Park Cart$/i });
    fireEvent.click(submitBtn);

    expect(handleConfirm).toHaveBeenCalledWith('Hold for John', 'John Smith', '555-0199');
  });

  it('triggers onClose when Cancel button is clicked', () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ParkCartModal
        theme={mockTheme}
        itemCount={1}
        subtotal={10.00}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(handleClose).toHaveBeenCalled();
  });
});

describe('ParkedCartsModal Component', () => {
  it('renders parked carts list and triggers recall callback', () => {
    const handleRecall = vi.fn();
    const handleDelete = vi.fn();
    const handleClose = vi.fn();

    render(
      <ParkedCartsModal
        theme={mockTheme}
        parkedCarts={mockParkedCarts}
        catalogItems={mockCatalog}
        activeCartCount={0}
        onRecall={handleRecall}
        onDelete={handleDelete}
        onClose={handleClose}
      />
    );

    expect(screen.getAllByText(/Parked/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('John / Blue Truck').length).toBeGreaterThan(0);
    expect(screen.getByText('Recall Order to Register')).toBeInTheDocument();

    const recallBtn = screen.getByRole('button', { name: /Recall Order to Register/i });
    fireEvent.click(recallBtn);

    expect(handleRecall).toHaveBeenCalledWith(mockParkedCarts[0]);
  });

  it('renders empty parked carts state', () => {
    const handleRecall = vi.fn();
    const handleDelete = vi.fn();
    const handleClose = vi.fn();

    render(
      <ParkedCartsModal
        theme={mockTheme}
        parkedCarts={[]}
        catalogItems={mockCatalog}
        activeCartCount={0}
        onRecall={handleRecall}
        onDelete={handleDelete}
        onClose={handleClose}
      />
    );

    expect(screen.getByText('No Parked Carts Found')).toBeInTheDocument();
  });

  it('triggers delete callback when Trash icon/Delete button is clicked', () => {
    const handleRecall = vi.fn();
    const handleDelete = vi.fn();
    const handleClose = vi.fn();

    render(
      <ParkedCartsModal
        theme={mockTheme}
        parkedCarts={mockParkedCarts}
        catalogItems={mockCatalog}
        activeCartCount={0}
        onRecall={handleRecall}
        onDelete={handleDelete}
        onClose={handleClose}
      />
    );

    const deleteBtn = screen.getByTitle('Delete Parked Cart');
    fireEvent.click(deleteBtn);

    expect(handleDelete).toHaveBeenCalledWith(101);
  });
});
