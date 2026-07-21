import React, { useState } from 'react';
import { Bookmark, X, User, Phone, Tag } from 'lucide-react';
import { Theme } from '../../types';

interface ParkCartModalProps {
  theme: Theme;
  itemCount: number;
  subtotal: number;
  onConfirm: (label: string, customerName?: string, customerPhone?: string) => void;
  onClose: () => void;
}

export const ParkCartModal: React.FC<ParkCartModalProps> = ({
  theme,
  itemCount,
  subtotal,
  onConfirm,
  onClose,
}) => {
  const [label, setLabel] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalLabel = label.trim() || customerName.trim() || `Hold (${itemCount} items - $${subtotal.toFixed(2)})`;
    onConfirm(finalLabel, customerName.trim() || undefined, customerPhone.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border transition-all"
        style={{
          backgroundColor: theme.card,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ backgroundColor: theme.header, borderColor: theme.border }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl text-white font-bold"
              style={{ backgroundColor: theme.primary }}
            >
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Park Active Cart</h3>
              <p className="text-xs opacity-75" style={{ color: theme.muted }}>
                {itemCount} {itemCount === 1 ? 'item' : 'items'} • ${subtotal.toFixed(2)} Subtotal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-black/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5 opacity-90 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 opacity-70" /> Note / Hold Tag
            </label>
            <input
              type="text"
              placeholder="e.g. Blue Truck / Hold for John"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none transition-all"
              style={{
                backgroundColor: theme.input,
                borderColor: theme.border,
                color: theme.text,
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 opacity-90 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 opacity-70" /> Customer Name (Optional)
            </label>
            <input
              type="text"
              placeholder="John Doe"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none transition-all"
              style={{
                backgroundColor: theme.input,
                borderColor: theme.border,
                color: theme.text,
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 opacity-90 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 opacity-70" /> Customer Phone (Optional)
            </label>
            <input
              type="tel"
              placeholder="(555) 000-0000"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none transition-all"
              style={{
                backgroundColor: theme.input,
                borderColor: theme.border,
                color: theme.text,
              }}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: theme.border }}>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-bold border hover:bg-black/5 transition-all"
              style={{ borderColor: theme.border, color: theme.text }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-90 transition-all flex items-center gap-2"
              style={{ backgroundColor: theme.primary }}
            >
              <Bookmark className="w-4 h-4" /> Park Cart
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
