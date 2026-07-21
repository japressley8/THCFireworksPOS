import React, { useState } from 'react';
import { Bookmark, X, Trash2, ArrowRight, AlertTriangle, Clock, User, Phone, ShoppingCart } from 'lucide-react';
import { ParkedCart, CartItem, Item, Theme } from '../../types';

interface ParkedCartsModalProps {
  theme: Theme;
  parkedCarts: ParkedCart[];
  catalogItems: Item[];
  activeCartCount: number;
  onRecall: (parkedCart: ParkedCart) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

export const ParkedCartsModal: React.FC<ParkedCartsModalProps> = ({
  theme,
  parkedCarts,
  catalogItems,
  activeCartCount,
  onRecall,
  onDelete,
  onClose,
}) => {
  const [selectedCartId, setSelectedCartId] = useState<number | null>(
    parkedCarts.length > 0 ? parkedCarts[0].id : null
  );

  const selectedCart = parkedCarts.find((c) => c.id === selectedCartId) || (parkedCarts[0] ?? null);

  // Parse items for selected cart
  let parsedCartItems: CartItem[] = [];
  if (selectedCart) {
    try {
      parsedCartItems = JSON.parse(selectedCart.cart_json);
    } catch {
      parsedCartItems = [];
    }
  }

  // Helper to check stock status against current catalog
  const checkStockStatus = (cartItem: CartItem) => {
    const matched = catalogItems.find((i) => i.id === cartItem.item.id);
    if (!matched || matched.stock_quantity === null) return { isOutOfStock: false, remaining: null };
    const required = cartItem.isBulk
      ? cartItem.quantity * (matched.bulk_quantity || 1)
      : cartItem.quantity;
    return {
      isOutOfStock: matched.stock_quantity < required,
      remaining: matched.stock_quantity,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border transition-all flex flex-col max-h-[85vh]"
        style={{
          backgroundColor: theme.card,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
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
              <h3 className="text-lg font-bold">Parked Carts ({parkedCarts.length})</h3>
              <p className="text-xs opacity-75" style={{ color: theme.muted }}>
                Select a held order to review or recall back to the sales register
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

        {/* Modal Body */}
        {parkedCarts.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center my-auto">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4 opacity-50"
              style={{ backgroundColor: theme.input }}
            >
              <Bookmark className="w-8 h-8 opacity-70" />
            </div>
            <h4 className="text-base font-bold mb-1">No Parked Carts Found</h4>
            <p className="text-xs opacity-75 max-w-sm" style={{ color: theme.muted }}>
              When you hold an order from the checkout register, it will appear here for easy recall.
            </p>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
            {/* Left Sidebar - List of Carts */}
            <div
              className="md:col-span-5 border-r overflow-y-auto p-4 space-y-2.5"
              style={{ borderColor: theme.border }}
            >
              {parkedCarts.map((cart) => {
                const isSelected = selectedCart?.id === cart.id;
                let itemCount = 0;
                try {
                  const items: CartItem[] = JSON.parse(cart.cart_json);
                  itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
                } catch {
                  itemCount = 0;
                }

                return (
                  <div
                    key={cart.id}
                    onClick={() => setSelectedCartId(cart.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected ? 'shadow-md border-l-4' : 'hover:opacity-90'
                    }`}
                    style={{
                      backgroundColor: isSelected ? theme.input : theme.bg,
                      borderColor: isSelected ? theme.primary : theme.border,
                      borderLeftColor: isSelected ? theme.primary : undefined,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="text-sm font-bold truncate">{cart.label}</h4>
                      <span
                        className="text-xs font-extrabold px-2 py-0.5 rounded-full text-white shrink-0"
                        style={{ backgroundColor: theme.primary }}
                      >
                        ${cart.final_total.toFixed(2)}
                      </span>
                    </div>

                    <div
                      className="flex items-center justify-between text-xs opacity-75 mt-2"
                      style={{ color: theme.muted }}
                    >
                      <span className="flex items-center gap-1">
                        <ShoppingCart className="w-3.5 h-3.5" /> {itemCount} {itemCount === 1 ? 'item' : 'items'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(cart.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {(cart.customer_name || cart.customer_phone) && (
                      <div className="mt-2 pt-2 border-t flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-80" style={{ borderColor: theme.border }}>
                        {cart.customer_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 opacity-60" /> {cart.customer_name}
                          </span>
                        )}
                        {cart.customer_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 opacity-60" /> {cart.customer_phone}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Details Panel */}
            {selectedCart && (
              <div className="md:col-span-7 flex flex-col h-full overflow-hidden p-5">
                {/* Cart Info Header */}
                <div className="pb-4 border-b flex items-start justify-between" style={{ borderColor: theme.border }}>
                  <div>
                    <h3 className="text-base font-bold">{selectedCart.label}</h3>
                    <p className="text-xs opacity-75 mt-0.5" style={{ color: theme.muted }}>
                      Parked at {new Date(selectedCart.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => onDelete(selectedCart.id)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-1 text-xs font-bold"
                    title="Delete Parked Cart"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto my-4 space-y-2 pr-1">
                  {parsedCartItems.map((cItem, idx) => {
                    const stockInfo = checkStockStatus(cItem);
                    const lineTotal = cItem.quantity * (cItem.isBulk ? (cItem.item.bulk_price || cItem.item.price) : cItem.item.price);

                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border flex items-center justify-between gap-3 text-sm"
                        style={{ backgroundColor: theme.bg, borderColor: theme.border }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold truncate">{cItem.item.name}</span>
                            {cItem.isBulk && (
                              <span className="text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                                Bulk Package
                              </span>
                            )}
                            {stockInfo.isOutOfStock && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">
                                <AlertTriangle className="w-3 h-3" /> Low Stock ({stockInfo.remaining} left)
                              </span>
                            )}
                          </div>
                          <p className="text-xs opacity-70 mt-0.5" style={{ color: theme.muted }}>
                            Qty: {cItem.quantity} × ${cItem.isBulk ? (cItem.item.bulk_price || cItem.item.price).toFixed(2) : cItem.item.price.toFixed(2)}
                          </p>
                        </div>
                        <span className="font-bold text-base shrink-0">${lineTotal.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Cart Totals & Recall Action */}
                <div className="pt-4 border-t space-y-3" style={{ borderColor: theme.border }}>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span style={{ color: theme.muted }}>Subtotal:</span>
                      <span className="font-medium">${selectedCart.subtotal.toFixed(2)}</span>
                    </div>
                    {selectedCart.discount_total > 0 && (
                      <div className="flex justify-between text-green-500 font-medium">
                        <span>Discounts:</span>
                        <span>-${selectedCart.discount_total.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span style={{ color: theme.muted }}>Taxes:</span>
                      <span className="font-medium">${selectedCart.tax_total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base font-extrabold pt-1 border-t" style={{ borderColor: theme.border }}>
                      <span>Total:</span>
                      <span style={{ color: theme.primary }}>${selectedCart.final_total.toFixed(2)}</span>
                    </div>
                  </div>

                  {activeCartCount > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Recalling this cart will auto-park your current register cart ({activeCartCount} items).</span>
                    </div>
                  )}

                  <button
                    onClick={() => onRecall(selectedCart)}
                    className="w-full py-3 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99]"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <span>Recall Order to Register</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
