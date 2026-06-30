import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import confetti from 'canvas-confetti';
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  Tag, 
  Percent, 
  DollarSign, 
  Printer, 
  CheckCircle, 
  X, 
  Search,
  Sparkles,
  Barcode,
  Video,
  Package
} from 'lucide-react';
import { Item, Discount, CartItem, Tax } from '../types';

interface RegisterViewProps {
  scannedBarcode: string;
  onClearScan: () => void;
  taxRate: number; // default e.g. 0.00
  lowStockThreshold: number;
  onPlayShowcaseVideo?: (title: string, path: string) => void;
}

export const RegisterView: React.FC<RegisterViewProps> = ({ 
  scannedBarcode, 
  onClearScan,
  taxRate: _taxRate,
  lowStockThreshold,
  onPlayShowcaseVideo
}) => {
  // State
  const [items, setItems] = useState<Item[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [allowOversell, setAllowOversell] = useState<boolean>(false);
  
  // Discount states
  const [selectedDiscountId, setSelectedDiscountId] = useState<number | null>(null);
  const [customDiscountType, setCustomDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [customDiscountValue, setCustomDiscountValue] = useState<number>(0);
  const [showCustomDiscountModal, setShowCustomDiscountModal] = useState<boolean>(false);
  const [numpadBuffer, setNumpadBuffer] = useState<string>('');
  
  // Search & input overrides
  const [manualBarcode, setManualBarcode] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [lastSaleData, setLastSaleData] = useState<any>(null);
  const [organizationName, setOrganizationName] = useState<string>('🎆 THC FIREWORKS 🎆');
  const [receiptMessage, setReceiptMessage] = useState<string>('');
  
  // Notification banner
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Load items and discounts on mount
  useEffect(() => {
    loadDatabaseData();
  }, []);

  const loadDatabaseData = async () => {
    try {
      const itemsList = await invoke<Item[]>('get_items');
      const discountsList = await invoke<Discount[]>('get_discounts');
      const taxesList = await invoke<Tax[]>('get_taxes');
      
      let oversell = false;
      try {
        const oversellVal = await invoke<string | null>('get_setting', { key: 'allow_oversell' });
        oversell = oversellVal === 'true';
      } catch (err) {
        console.error("Failed to load allow_oversell setting", err);
      }
      
      let orgName = '🎆 THC FIREWORKS 🎆';
      try {
        const orgVal = await invoke<string | null>('get_setting', { key: 'organization_name' });
        if (orgVal && orgVal.trim() !== '') orgName = orgVal;
      } catch (err) {
        console.error("Failed to load organization_name setting", err);
      }

      let receiptMsg = '';
      try {
        const receiptVal = await invoke<string | null>('get_setting', { key: 'receipt_message' });
        if (receiptVal) receiptMsg = receiptVal;
      } catch (err) {
        console.error("Failed to load receipt_message setting", err);
      }
      
      setItems(itemsList || []);
      setDiscounts(discountsList || []);
      setTaxes(taxesList || []);
      setAllowOversell(oversell);
      setOrganizationName(orgName);
      setReceiptMessage(receiptMsg);
    } catch (err) {
      showNotice('Failed to load database: ' + err, 'error');
    }
  };

  // Monitor barcode scan triggers from parent
  useEffect(() => {
    if (scannedBarcode) {
      handleBarcodeScan(scannedBarcode);
      onClearScan();
    }
  }, [scannedBarcode]);

  const showNotice = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleBarcodeScan = async (barcode: string) => {
    try {
      const item = await invoke<Item | null>('get_item_by_barcode', { barcode });
      if (item) {
        const isBulk = item.bulk_barcode === barcode;
        addToCart(item, isBulk);
      } else {
        showNotice(`Barcode not found: "${barcode}"`, 'error');
      }
    } catch (err) {
      showNotice('Scan error: ' + err, 'error');
    }
  };

  const addToCart = (item: Item, isBulk = false) => {
    setCart(prevCart => {
      const existing = prevCart.find(i => i.item.id === item.id && !!i.isBulk === isBulk);
      const multiplier = isBulk && item.bulk_quantity !== null && item.bulk_quantity !== undefined ? item.bulk_quantity : 1;

      // Sum all units of this item in the cart
      const currentCartTotal = prevCart.reduce((total, i) => {
        if (i.item.id === item.id) {
          const m = i.isBulk && i.item.bulk_quantity !== null && i.item.bulk_quantity !== undefined ? i.item.bulk_quantity : 1;
          return total + (i.quantity * m);
        }
        return total;
      }, 0);

      if (item.stock_quantity !== null && item.stock_quantity !== undefined && !allowOversell) {
        if (currentCartTotal + multiplier > item.stock_quantity) {
          showNotice(`Cannot add. Only ${item.stock_quantity} units available in stock.`, 'error');
          return prevCart;
        }
      }

      showNotice(`Added: ${item.name}${isBulk ? ' (Bulk Case)' : ''}`, 'success');

      if (existing) {
        return prevCart.map(i => 
          (i.item.id === item.id && !!i.isBulk === isBulk) ? { ...i, quantity: i.quantity + 1 } : i
        );
      } else {
        return [...prevCart, { item, quantity: 1, isBulk }];
      }
    });
  };

  const updateCartQuantity = (itemId: number, delta: number, isBulk = false) => {
    setCart(prevCart => {
      return prevCart.map(i => {
        if (i.item.id === itemId && !!i.isBulk === isBulk) {
          const newQty = i.quantity + delta;
          if (newQty <= 0) return null;
          
          const multiplier = isBulk && i.item.bulk_quantity !== null && i.item.bulk_quantity !== undefined ? i.item.bulk_quantity : 1;
          const otherCartTotal = prevCart.reduce((total, c) => {
            if (c.item.id === itemId && (!!c.isBulk !== isBulk)) {
              const m = c.isBulk && c.item.bulk_quantity !== null && c.item.bulk_quantity !== undefined ? c.item.bulk_quantity : 1;
              return total + (c.quantity * m);
            }
            return total;
          }, 0);

          if (i.item.stock_quantity !== null && i.item.stock_quantity !== undefined && !allowOversell) {
            if (otherCartTotal + (newQty * multiplier) > i.item.stock_quantity) {
              showNotice(`Only ${i.item.stock_quantity} in stock for ${i.item.name}`, 'error');
              return i;
            }
          }
          return { ...i, quantity: newQty };
        }
        return i;
      }).filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (itemId: number, isBulk = false) => {
    setCart(prevCart => prevCart.filter(i => !(i.item.id === itemId && !!i.isBulk === isBulk)));
    showNotice('Item removed from cart', 'success');
  };

  // Calculations
  const calculateCartSubtotal = () => {
    return cart.reduce((total, i) => {
      const price = i.isBulk && i.item.bulk_price !== null && i.item.bulk_price !== undefined ? i.item.bulk_price : i.item.price;
      return total + (price * i.quantity);
    }, 0);
  };

  const calculateDiscountTotal = (subtotal: number) => {
    // 1. Check pre-made discounts
    if (selectedDiscountId !== null) {
      const disc = discounts.find(d => d.id === selectedDiscountId);
      if (disc) {
        if (disc.type === 'percentage') {
          return subtotal * (disc.value / 100);
        } else {
          return Math.min(disc.value, subtotal); // Don't exceed subtotal
        }
      }
    }
    // 2. Check custom discount
    if (customDiscountValue > 0) {
      if (customDiscountType === 'percentage') {
        return subtotal * (customDiscountValue / 100);
      } else {
        return Math.min(customDiscountValue, subtotal);
      }
    }
    return 0;
  };

  const getActiveDiscountName = () => {
    if (selectedDiscountId !== null) {
      return discounts.find(d => d.id === selectedDiscountId)?.name || 'Discount';
    }
    if (customDiscountValue > 0) {
      return customDiscountType === 'percentage' 
        ? `Custom - ${customDiscountValue}%` 
        : `Custom - $${customDiscountValue.toFixed(2)}`;
    }
    return null;
  };

  const subtotal = calculateCartSubtotal();
  const discountTotal = calculateDiscountTotal(subtotal);
  const taxableAmount = Math.max(0, subtotal - discountTotal);
  
  const calculateTaxTotal = (subtotalVal: number, discountTotalVal: number) => {
    const ratio = subtotalVal > 0 ? (discountTotalVal / subtotalVal) : 0;
    let totalTaxRate = (taxes || []).filter(t => t.scope === 'total').reduce((s, t) => s + t.rate, 0);
    if ((taxes || []).length === 0 && _taxRate > 0) {
      totalTaxRate = _taxRate * 100;
    }
    
    return cart.reduce((totalTax, cartItem) => {
      const price = cartItem.isBulk && cartItem.item.bulk_price !== null && cartItem.item.bulk_price !== undefined 
        ? cartItem.item.bulk_price 
        : cartItem.item.price;
      const itemSubtotal = price * cartItem.quantity;
      const itemTaxable = Math.max(0, itemSubtotal * (1 - ratio));
      
      let itemRate = totalTaxRate;
      if (cartItem.item.tax_id === -1) {
        itemRate = 0;
      } else if (cartItem.item.tax_id !== null && cartItem.item.tax_id !== undefined) {
        const matchingTax = (taxes || []).find(t => t.id === cartItem.item.tax_id);
        itemRate = matchingTax ? matchingTax.rate : 0;
      }
      
      return totalTax + (itemTaxable * (itemRate / 100));
    }, 0);
  };

  const taxTotal = calculateTaxTotal(subtotal, discountTotal);
  const finalTotal = taxableAmount + taxTotal;

  // Keypad controls for custom discount
  const handleKeypadPress = (val: string) => {
    if (val === 'C') {
      setNumpadBuffer('');
    } else if (val === '⌫') {
      setNumpadBuffer(prev => prev.slice(0, -1));
    } else if (val === '.') {
      if (!numpadBuffer.includes('.')) {
        setNumpadBuffer(prev => prev + '.');
      }
    } else {
      // Prevent excess decimals or large values
      if (numpadBuffer.includes('.') && numpadBuffer.split('.')[1].length >= 2) return;
      setNumpadBuffer(prev => prev + val);
    }
  };

  const applyCustomDiscount = () => {
    const value = parseFloat(numpadBuffer) || 0;
    if (customDiscountType === 'percentage' && value > 100) {
      showNotice('Percentage discount cannot exceed 100%', 'error');
      return;
    }
    if (customDiscountType === 'fixed' && value > subtotal) {
      showNotice('Fixed discount cannot exceed subtotal amount', 'error');
      return;
    }
    
    setCustomDiscountValue(value);
    setSelectedDiscountId(null); // Clear pre-made discount
    setShowCustomDiscountModal(false);
    setNumpadBuffer('');
    showNotice(`Applied custom discount of ${customDiscountType === 'percentage' ? `${value}%` : `$${value.toFixed(2)}`}`);
  };

  // Listen to physical keyboard events when custom discount keypad modal is active
  useEffect(() => {
    if (!showCustomDiscountModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If the user is currently typing in an input or textarea, don't capture.
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const key = e.key;

      if (key >= '0' && key <= '9') {
        handleKeypadPress(key);
      } else if (key === '.') {
        handleKeypadPress('.');
      } else if (key === 'Backspace') {
        e.preventDefault();
        setNumpadBuffer(prev => prev.slice(0, -1));
      } else if (key === 'Escape') {
        e.preventDefault();
        setShowCustomDiscountModal(false);
        setNumpadBuffer('');
      } else if (key === 'Enter') {
        e.preventDefault();
        applyCustomDiscount();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCustomDiscountModal, numpadBuffer, customDiscountType, subtotal]);

  const triggerConfetti = () => {
    const end = Date.now() + (2 * 1000);
    const colors = ['#dc2626', '#ffffff', '#3b82f6', '#fbbf24']; // Red, White, Blue, Gold

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 1 },
        colors: colors
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 1 },
        colors: colors
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showNotice('Cart is empty', 'error');
      return;
    }

    try {
      // Structure the cart items for Rust serialization
      const itemsPayload = cart.map(i => ({
        item_id: i.item.id,
        quantity: i.quantity,
        price_at_sale: i.isBulk && i.item.bulk_price !== null && i.item.bulk_price !== undefined ? i.item.bulk_price : i.item.price,
        is_bulk: !!i.isBulk
      }));

      // Call Rust backend to register the sale and update SQLite
      const saleId = await invoke<number>('complete_sale', {
        items: itemsPayload,
        subtotal,
        discountTotal,
        taxTotal,
        finalTotal
      });

      // Cache sale details for printing
      setLastSaleData({
        id: saleId,
        timestamp: new Date().toLocaleString(),
        cart: [...cart],
        subtotal,
        discountName: getActiveDiscountName(),
        discountTotal,
        taxTotal,
        finalTotal
      });

      // Check for low stock items from the completed transaction
      const threshold = lowStockThreshold;
      const lowStockItems: string[] = [];
      
      for (const cartItem of cart) {
        if (cartItem.item.stock_quantity !== null && cartItem.item.stock_quantity !== undefined) {
          const multiplier = cartItem.isBulk && cartItem.item.bulk_quantity !== null && cartItem.item.bulk_quantity !== undefined ? cartItem.item.bulk_quantity : 1;
          const newStock = cartItem.item.stock_quantity - (cartItem.quantity * multiplier);
          if (newStock <= threshold) {
            lowStockItems.push(`${cartItem.item.name} (${newStock} remaining)`);
          }
        }
      }

      // Clear register state
      setCart([]);
      setSelectedDiscountId(null);
      setCustomDiscountValue(0);
      
      // Success indicators
      triggerConfetti();
      setShowReceiptModal(true);
      showNotice('Sale Completed Successfully! 🎆', 'success');

      if (lowStockItems.length > 0) {
        setTimeout(() => {
          alert(`⚠️ Low Stock Warning:\n\nThe following items have dropped below the threshold:\n\n${lowStockItems.map(x => `• ${x}`).join('\n')}`);
        }, 500);
      }

      // Reload item lists to reflect new stock counts
      loadDatabaseData();

    } catch (err) {
      showNotice('Transaction Failed: ' + err, 'error');
    }
  };

  const handleManualBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      handleBarcodeScan(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  // Filter items for helper list search
  const filteredProducts = items.filter(item => {
    const query = searchQuery.toLowerCase();
    return item.name.toLowerCase().includes(query) || item.barcode.includes(query);
  });

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full p-2 relative lg:overflow-hidden overflow-y-auto select-none">
      
      {/* Alert Notification banner */}
      {notification && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl transition-all border ${
          notification.type === 'error' 
            ? 'bg-red-950/95 border-red-500 text-red-100 shadow-red-950/40' 
            : 'bg-slate-900/95 border-emerald-500 text-emerald-100 shadow-slate-950/40'
        }`}>
          <div className={`h-3 w-3 rounded-full animate-ping ${notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
          <span className="font-semibold text-lg">{notification.message}</span>
        </div>
      )}
           {/* LEFT COLUMN: ACTIVE CHECKOUT CART */}
      <div className="flex-1 flex flex-col glass-panel rounded-2xl border-custom-border overflow-hidden shadow-2xl">
        {/* Cart Header */}
        <div className="bg-custom-header/90 border-b border-custom-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-custom-primary/20 text-custom-primary rounded-xl border border-custom-border">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-custom-text flex items-center gap-2">
                Checkout Register
                <span className="text-sm bg-custom-primary/30 text-custom-text border border-custom-border px-2 py-0.5 rounded-full font-semibold">
                  {cart.reduce((s, i) => s + i.quantity, 0)} Items
                </span>
              </h2>
              <p className="text-xs text-custom-muted">Scan fireworks or add manually below</p>
            </div>
          </div>
          <button 
            id="btn-clear-cart"
            onClick={() => { if (cart.length > 0 && confirm('Clear active cart?')) setCart([]); }}
            className="text-xs font-semibold px-4 py-2 bg-custom-input hover:bg-custom-primary/20 text-custom-text rounded-lg transition-all border border-custom-border flex items-center gap-1.5"
            disabled={cart.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear Cart
          </button>
        </div>

        {/* Cart Item Rows */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-custom-muted py-16 space-y-4">
              <div className="h-20 w-20 rounded-full border-2 border-dashed border-custom-border flex items-center justify-center text-custom-muted animate-pulse">
                <Barcode className="h-10 w-10" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-custom-text">Register is empty</p>
                <p className="text-sm text-custom-muted max-w-xs mt-1">Ready to receive scans. Point the barcode scanner at the firework packages.</p>
              </div>
            </div>
          ) : (
            cart.map(cartItem => {
              const effectivePrice = cartItem.isBulk && cartItem.item.bulk_price !== null && cartItem.item.bulk_price !== undefined ? cartItem.item.bulk_price : cartItem.item.price;
              const hasStock = cartItem.item.stock_quantity !== null && cartItem.item.stock_quantity !== undefined;
              return (
                <div 
                  key={`${cartItem.item.id}-${cartItem.isBulk ? 'bulk' : 'reg'}`}
                  className="flex items-center justify-between p-4 bg-custom-input/40 border border-custom-border rounded-xl hover:border-custom-primary/30 transition-all shadow-md animate-in fade-in duration-200"
                >
                  {/* Details */}
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-custom-text text-base md:text-lg truncate max-w-[200px] md:max-w-sm">
                        {cartItem.item.name}{cartItem.isBulk ? ' (Bulk Case)' : ''}
                      </h3>
                      <span className="text-[10px] bg-custom-input text-custom-muted px-2 py-0.5 rounded font-mono border border-custom-border">
                        {cartItem.isBulk && cartItem.item.bulk_barcode ? cartItem.item.bulk_barcode : cartItem.item.barcode}
                      </span>
                      {cartItem.isBulk && (
                        <span className="text-[10px] bg-custom-accent/20 border border-custom-accent/30 text-custom-accent px-2 py-0.5 rounded font-bold font-sans">
                          Case of {cartItem.item.bulk_quantity}
                        </span>
                      )}
                      {cartItem.item.video_path && (
                        <button
                          onClick={() => onPlayShowcaseVideo?.(cartItem.item.name, cartItem.item.video_path!)}
                          className="p-1 hover:bg-custom-primary/20 text-custom-accent hover:text-custom-text rounded transition-all cursor-pointer flex items-center justify-center shrink-0"
                          title="Watch Showcase Video"
                        >
                          <Video className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-sm flex-wrap">
                      <span className="text-custom-muted">Price:</span>
                      <span className="text-custom-accent font-mono font-semibold">${effectivePrice.toFixed(2)}</span>
                      <span className="text-custom-muted/50">|</span>
                      <span className="text-custom-muted">
                        In Stock: {hasStock ? cartItem.item.stock_quantity : '∞'}
                      </span>
                    </div>
                  </div>

                  {/* Adjuster */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center bg-custom-input border border-custom-border rounded-xl p-1 shadow-inner">
                      <button 
                        id={`btn-qty-minus-${cartItem.item.id}-${cartItem.isBulk ? 'bulk' : 'reg'}`}
                        onClick={() => updateCartQuantity(cartItem.item.id, -1, !!cartItem.isBulk)}
                        className="p-2.5 hover:bg-custom-primary/20 active:scale-90 text-custom-muted hover:text-custom-text rounded-lg transition-all"
                      >
                        <Minus className="h-4.5 w-4.5" />
                      </button>
                      <span className="w-10 text-center font-mono font-bold text-lg text-custom-text">
                        {cartItem.quantity}
                      </span>
                      <button 
                        id={`btn-qty-plus-${cartItem.item.id}-${cartItem.isBulk ? 'bulk' : 'reg'}`}
                        onClick={() => updateCartQuantity(cartItem.item.id, 1, !!cartItem.isBulk)}
                        className="p-2.5 hover:bg-custom-primary/20 active:scale-90 text-custom-muted hover:text-custom-text rounded-lg transition-all"
                      >
                        <Plus className="h-4.5 w-4.5" />
                      </button>
                    </div>

                    {/* Line Total */}
                    <div className="w-24 text-right">
                      <span className="block font-mono font-bold text-lg text-custom-text">
                        ${(effectivePrice * cartItem.quantity).toFixed(2)}
                      </span>
                    </div>

                    {/* Delete */}
                    <button 
                      id={`btn-remove-item-${cartItem.item.id}-${cartItem.isBulk ? 'bulk' : 'reg'}`}
                      onClick={() => removeFromCart(cartItem.item.id, !!cartItem.isBulk)}
                      className="p-3 bg-custom-input border border-custom-border hover:bg-red-900/30 text-custom-muted hover:text-red-400 rounded-xl transition-all"
                      title="Remove item"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Manual Barcode entry row (for volunteers when scanner fails) */}
        <div className="bg-custom-header/50 border-t border-custom-border px-6 py-4 flex flex-col md:flex-row gap-3">
          <form onSubmit={handleManualBarcodeSubmit} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-custom-muted" />
              <input 
                ref={barcodeInputRef}
                id="input-manual-barcode"
                type="text" 
                placeholder="Type Barcode & press Enter..." 
                value={manualBarcode}
                onChange={e => setManualBarcode(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none focus:ring-2 focus:ring-custom-primary/20 transition-all placeholder:text-custom-muted/50 font-mono text-base"
              />
            </div>
            <button 
              id="btn-manual-scan-submit"
              type="submit" 
              className="px-6 py-3 bg-custom-input hover:bg-custom-primary/20 active:scale-95 text-custom-text font-semibold rounded-xl border border-custom-border transition-all shrink-0 text-base"
            >
              Add Item
            </button>
          </form>
        </div>
      </div>

      {/* RIGHT COLUMN: DISCOUNTS, TOTALS, AND CHECKOUT */}
      <div className="w-full lg:w-96 flex flex-col gap-6 lg:h-full lg:overflow-hidden shrink-0">
        
        {/* PANEL A: SEARCH & RAPID INVENTORY ADD */}
        <div className="glass-panel rounded-2xl border-custom-border p-4 shadow-xl flex flex-col flex-1 overflow-hidden hidden lg:flex">
          <h3 className="text-base font-bold text-custom-text mb-3 flex items-center gap-2">
            <Search className="h-4.5 w-4.5 text-custom-primary" /> Quick Add
          </h3>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-custom-muted" />
            <input 
              id="input-product-search"
              type="text"
              placeholder="Search by name or code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-lg text-sm focus:outline-none transition-all placeholder:text-custom-muted/50"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {filteredProducts.length === 0 ? (
              <div className="text-xs text-custom-muted text-center py-6">No matching items</div>
            ) : (
              filteredProducts.map(item => {
                const hasStock = item.stock_quantity !== null && item.stock_quantity !== undefined;
                return (
                  <div 
                    key={item.id} 
                    onClick={() => addToCart(item, false)}
                    className="w-full p-2 bg-custom-input/40 border border-custom-border rounded-lg flex justify-between items-center transition-all text-xs cursor-pointer hover:bg-custom-input/70 active:border-custom-primary/50 hover:border-custom-primary/30 shadow-sm select-none"
                  >
                    <div className="min-w-0 pr-2 flex-1">
                      <span className="block font-semibold text-custom-text truncate text-sm">{item.name}</span>
                      <span className="block text-[10px] text-custom-muted font-mono mt-0.5 truncate">
                        {item.barcode} | Stock: {hasStock ? item.stock_quantity : '∞'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 select-none">
                      {item.video_path && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayShowcaseVideo?.(item.name, item.video_path!);
                          }}
                          className="p-1 hover:bg-custom-primary/20 text-custom-accent hover:text-custom-text rounded active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                          title="Play Showcase Video"
                        >
                          <Video className="h-4 w-4" />
                        </button>
                      )}
                      {item.bulk_barcode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(item, true);
                          }}
                          className="p-1 hover:bg-custom-primary/20 text-custom-primary hover:text-custom-text rounded active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                          title={`Add Case of ${item.bulk_quantity} units`}
                        >
                          <Package className="h-4 w-4" />
                        </button>
                      )}
                      <span className="font-mono font-bold text-sm text-custom-accent pl-1.5">${item.price.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* PANEL B: DISCOUNT ENGINE */}
        <div className="glass-panel rounded-2xl border-custom-border p-5 shadow-xl flex flex-col shrink-0 overflow-hidden">
          <h3 className="text-base font-bold text-custom-text mb-4 flex items-center gap-2">
            <Tag className="h-4.5 w-4.5 text-custom-primary" /> Apply Discount
          </h3>
          
          {/* Pre-made discounts list (scrollable container) */}
          <div className="max-h-[110px] overflow-y-auto pr-1 mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {discounts.map(disc => {
                const isActive = selectedDiscountId === disc.id;
                return (
                  <button
                    key={disc.id}
                    id={`btn-discount-select-${disc.id}`}
                    onClick={() => {
                      setCustomDiscountValue(0); // Reset custom discount
                      setSelectedDiscountId(isActive ? null : disc.id);
                      showNotice(isActive ? 'Discount removed' : `Applied discount: ${disc.name}`);
                    }}
                    className={`p-2.5 rounded-xl border text-center font-bold text-sm transition-all active:scale-95 flex flex-col justify-center items-center min-h-[64px] ${
                      isActive 
                        ? 'bg-custom-primary/20 border-custom-primary text-custom-text shadow-md' 
                        : 'bg-custom-input/60 border-custom-border hover:bg-custom-primary/10 text-custom-text'
                    }`}
                  >
                    <span className="block text-xs font-medium text-custom-muted mb-1 whitespace-normal break-words leading-snug text-center max-w-full">{disc.name}</span>
                    <span className="block text-sm font-mono text-custom-accent font-bold">
                      {disc.type === 'percentage' ? `${disc.value}% OFF` : `$${disc.value.toFixed(2)} OFF`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom variable discount button */}
          <button
            id="btn-custom-discount-modal"
            onClick={() => setShowCustomDiscountModal(true)}
            className={`w-full py-4 rounded-xl font-bold text-sm border flex items-center justify-center gap-2 transition-all active:scale-95 ${
              customDiscountValue > 0 
                ? 'bg-custom-primary/20 border-custom-primary text-custom-text shadow-md' 
                : 'bg-custom-input/60 border-custom-border hover:bg-custom-primary/10 text-custom-text'
            }`}
          >
            <Percent className="h-4 w-4" />
            {customDiscountValue > 0 
              ? `Custom: ${customDiscountType === 'percentage' ? `${customDiscountValue}%` : `$${customDiscountValue.toFixed(2)}`}`
              : 'Add Custom Discount Keypad'
            }
          </button>
        </div>

        {/* PANEL C: TOTALS CALCULATOR AND PRIMARY COMPLETE BUTTON */}
        <div className="glass-panel rounded-2xl border-custom-border p-6 shadow-2xl space-y-4 bg-custom-input/30 shrink-0">
          <div className="space-y-2 border-b border-custom-border pb-4">
            <div className="flex justify-between text-custom-muted text-sm font-semibold">
              <span>Subtotal</span>
              <span className="font-mono text-custom-text">${subtotal.toFixed(2)}</span>
            </div>
            
            {discountTotal > 0 && (
              <div className="flex justify-between text-custom-accent text-sm font-semibold">
                <span className="flex items-center gap-1.5">
                  Discount ({getActiveDiscountName()})
                  <button 
                    id="btn-clear-active-discount"
                    onClick={() => { setSelectedDiscountId(null); setCustomDiscountValue(0); }} 
                    className="p-0.5 bg-custom-input hover:bg-custom-primary/20 rounded-full text-custom-muted hover:text-custom-text"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
                <span className="font-mono">-${discountTotal.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-custom-muted text-sm font-semibold">
              <span>Sales Tax</span>
              <span className="font-mono text-custom-text">${taxTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between items-baseline pt-2">
            <span className="text-lg font-bold text-custom-text uppercase tracking-wide">Final Total</span>
            <span id="label-final-total" className="text-4xl font-mono font-bold text-custom-accent drop-shadow-md select-text">
              ${finalTotal.toFixed(2)}
            </span>
          </div>

          {/* Checkout Action Button */}
          <button
            id="btn-complete-sale"
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className={`w-full py-5 rounded-2xl font-extrabold text-xl shadow-xl flex items-center justify-center gap-3 transition-all active:scale-97 select-none ${
              cart.length === 0
                ? 'bg-custom-input border border-custom-border text-custom-muted cursor-not-allowed shadow-none'
                : 'bg-custom-primary hover:bg-custom-primary-hover text-white border border-white/10'
            }`}
          >
            <Sparkles className={`h-6 w-6 ${cart.length > 0 ? 'animate-bounce' : ''}`} />
            Complete Sale
          </button>

          {/* Print Last Receipt scaffold if available */}
          {lastSaleData && (
            <button
              id="btn-print-last-receipt"
              onClick={() => setShowReceiptModal(true)}
              className="w-full py-3 bg-custom-input border border-custom-border hover:bg-custom-primary/10 active:scale-95 text-custom-muted hover:text-custom-text rounded-xl transition-all text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" /> View/Reprint Receipt
            </button>
          )}
        </div>
      </div>

      {/* MODAL 1: CUSTOM DISCOUNT NUMERICAL KEYPAD */}
      {showCustomDiscountModal && (
        <div className="fixed inset-0 bg-custom-bg/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-custom-card border border-custom-border rounded-2xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              id="btn-close-discount-modal"
              onClick={() => { setShowCustomDiscountModal(false); setNumpadBuffer(''); }}
              className="absolute top-4 right-4 p-2 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-muted hover:text-custom-text rounded-xl transition-all"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold text-custom-text mb-4">Manual Custom Discount</h3>
            
            {/* Toggle types */}
            <div className="flex bg-custom-input border border-custom-border rounded-xl p-1 mb-4 shadow-inner">
              <button
                id="btn-discount-type-fixed"
                onClick={() => setCustomDiscountType('fixed')}
                className={`flex-1 py-3 text-center rounded-lg font-bold text-base flex items-center justify-center gap-1.5 transition-all ${
                  customDiscountType === 'fixed' 
                    ? 'bg-custom-primary text-white shadow' 
                    : 'text-custom-muted hover:text-custom-text hover:bg-custom-primary/20'
                }`}
              >
                <DollarSign className="h-4.5 w-4.5" /> Flat Dollar ($)
              </button>
              <button
                id="btn-discount-type-percentage"
                onClick={() => setCustomDiscountType('percentage')}
                className={`flex-1 py-3 text-center rounded-lg font-bold text-base flex items-center justify-center gap-1.5 transition-all ${
                  customDiscountType === 'percentage' 
                    ? 'bg-custom-primary text-white shadow' 
                    : 'text-custom-muted hover:text-custom-text hover:bg-custom-primary/20'
                }`}
              >
                <Percent className="h-4.5 w-4.5" /> Percentage (%)
              </button>
            </div>

            {/* Readout screen */}
            <div className="bg-custom-input border border-custom-border rounded-xl p-4 text-right mb-4 shadow-inner">
              <span className="text-xs text-custom-muted font-bold block mb-1">Discount Amount</span>
              <span className="text-3xl font-mono font-bold text-custom-accent">
                {customDiscountType === 'fixed' ? '$' : ''}
                {numpadBuffer || '0'}
                {customDiscountType === 'percentage' ? '%' : ''}
              </span>
            </div>

            {/* Keypad Buttons */}
            <div className="grid grid-cols-3 gap-2.5 mb-5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '.'].map(key => (
                <button
                  key={key}
                  id={`btn-numpad-${key === '.' ? 'dot' : key.toLowerCase()}`}
                  onClick={() => handleKeypadPress(key)}
                  className={`py-4 rounded-xl font-bold font-mono text-xl transition-all active:scale-90 border ${
                    key === 'C'
                      ? 'bg-custom-input border-red-500/30 hover:bg-red-900/30 text-red-400'
                      : 'bg-custom-input border-custom-border hover:bg-custom-primary/20 text-custom-text'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Apply Action */}
            <button
              id="btn-apply-custom-discount"
              onClick={applyCustomDiscount}
              className="w-full py-4 bg-custom-primary hover:bg-custom-primary-hover text-white font-extrabold text-base rounded-xl transition-all shadow-lg active:scale-97 border border-custom-border"
            >
              Apply Discount
            </button>
          </div>
        </div>
      )}
           {/* MODAL 2: RECEIPT MODAL FOR 3-INCH ROLL PRINT */}
      {showReceiptModal && lastSaleData && (
        <div className="fixed inset-0 bg-custom-bg/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-200">
            {/* Modal Actions */}
            <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between no-print">
              <h3 className="font-bold text-custom-text text-lg flex items-center gap-2">
                <CheckCircle className="h-5.5 w-5.5 text-emerald-400" /> Transaction Completed
              </h3>
              <button 
                id="btn-close-receipt-modal"
                onClick={() => setShowReceiptModal(false)}
                className="p-2 hover:bg-custom-primary/20 rounded-xl text-custom-muted hover:text-custom-text transition-all border border-custom-border"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Receipt Preview Body (Scoped for printable styles) */}
            <div className="p-6 bg-custom-input/40 overflow-y-auto max-h-[400px] flex justify-center no-print">
              {/* Virtual Receipt Render */}
              <div className="w-[72mm] bg-white text-black p-5 font-mono text-[11px] leading-relaxed shadow-lg rounded border border-slate-300">
                <div className="text-center border-b border-dashed border-black pb-4 mb-4">
                  <h4 className="font-extrabold text-sm tracking-tight">{organizationName}</h4>
                  {receiptMessage && (
                    <p className="text-[10px] text-zinc-700 font-semibold mt-1 whitespace-pre-wrap">{receiptMessage}</p>
                  )}
                  <p className="text-[10px] text-zinc-600 mt-1">{organizationName === '🎆 THC FIREWORKS 🎆' ? 'Thousand Hills Church Booth' : 'Sales Receipt'}</p>
                  <p className="text-[9px] text-zinc-500">100% Volunteer Supported</p>
                  <p className="text-[9px] text-zinc-400 mt-2">------------------------------</p>
                  <p className="text-[9px] text-left mt-2">Sale #: {lastSaleData.id}</p>
                  <p className="text-[9px] text-left">Date: {lastSaleData.timestamp}</p>
                </div>

                <div className="space-y-2 border-b border-dashed border-black pb-3 mb-3">
                  {lastSaleData.cart.map((cartItem: CartItem) => {
                    const price = cartItem.isBulk && cartItem.item.bulk_price !== null && cartItem.item.bulk_price !== undefined ? cartItem.item.bulk_price : cartItem.item.price;
                    return (
                      <div key={`${cartItem.item.id}-${cartItem.isBulk ? 'bulk' : 'reg'}`} className="flex justify-between">
                        <div className="pr-2">
                          <span className="font-bold">{cartItem.item.name}{cartItem.isBulk ? ' (Bulk Case)' : ''}</span>
                          <span className="block text-[10px] text-zinc-600 font-normal">
                            {cartItem.quantity} x ${price.toFixed(2)}
                          </span>
                        </div>
                        <span className="font-bold shrink-0">${(price * cartItem.quantity).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1.5 text-right font-bold">
                  <div className="flex justify-between font-normal text-zinc-600">
                    <span>Subtotal</span>
                    <span>${lastSaleData.subtotal.toFixed(2)}</span>
                  </div>
                  {lastSaleData.discountTotal > 0 && (
                    <div className="flex justify-between font-normal text-zinc-800">
                      <span>Disc: {lastSaleData.discountName}</span>
                      <span>-${lastSaleData.discountTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-normal text-zinc-650">
                    <span>Tax</span>
                    <span>${lastSaleData.taxTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-dotted border-black pt-1.5 text-xs text-black font-extrabold uppercase">
                    <span>Total Due</span>
                    <span>${lastSaleData.finalTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="text-center mt-6 pt-4 border-t border-dashed border-black">
                  <p className="font-bold text-[10px] tracking-wide">THANK YOU FOR YOUR PATRONAGE!</p>
                  <p className="text-[9px] text-zinc-600 mt-1">Have a safe and happy 4th of July!</p>
                </div>
              </div>
            </div>

            {/* Invisible block injected solely for standard browser layout printing */}
            <div id="receipt-print-area" className="hidden">
              <div className="text-center pb-4 mb-4" style={{ borderBottom: '1px dashed black' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0' }}>{organizationName}</h4>
                {receiptMessage && (
                  <p style={{ margin: '3px 0 0 0', fontSize: '10px', color: '#333', whiteSpace: 'pre-wrap' }}>{receiptMessage}</p>
                )}
                <p style={{ margin: '3px 0 0 0', fontSize: '10px' }}>{organizationName === '🎆 THC FIREWORKS 🎆' ? 'Thousand Hills Church Booth' : 'Sales Receipt'}</p>
                <p style={{ margin: '0', fontSize: '9px' }}>100% Volunteer Supported</p>
                <p style={{ margin: '5px 0 0 0', fontSize: '9px' }}>---------------------------------</p>
                <div style={{ textAlign: 'left', marginTop: '5px', fontSize: '9px' }}>
                  <p style={{ margin: '0' }}>Sale #: {lastSaleData.id}</p>
                  <p style={{ margin: '0' }}>Date: {lastSaleData.timestamp}</p>
                </div>
              </div>

              <div style={{ paddingBottom: '8px', marginBottom: '8px', borderBottom: '1px dashed black' }}>
                {lastSaleData.cart.map((cartItem: CartItem) => {
                  const price = cartItem.isBulk && cartItem.item.bulk_price !== null && cartItem.item.bulk_price !== undefined ? cartItem.item.bulk_price : cartItem.item.price;
                  return (
                    <div key={`${cartItem.item.id}-${cartItem.isBulk ? 'bulk' : 'reg'}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ paddingRight: '10px' }}>
                        <p style={{ margin: '0', fontWeight: 'bold' }}>{cartItem.item.name}{cartItem.isBulk ? ' (Bulk Case)' : ''}</p>
                        <p style={{ margin: '0', fontSize: '10px', color: '#333' }}>
                          {cartItem.quantity} x ${price.toFixed(2)}
                        </p>
                      </div>
                      <span style={{ fontWeight: 'bold' }}>${(price * cartItem.quantity).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ textAlign: 'right', fontWeight: 'bold' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', color: '#555' }}>
                  <span>Subtotal</span>
                  <span>${lastSaleData.subtotal.toFixed(2)}</span>
                </div>
                {lastSaleData.discountTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', color: '#222' }}>
                    <span>Disc: {lastSaleData.discountName}</span>
                    <span>-${lastSaleData.discountTotal.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', color: '#555' }}>
                  <span>Tax</span>
                  <span>${lastSaleData.taxTotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dotted black', paddingTop: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                  <span>TOTAL PAID</span>
                  <span>${lastSaleData.finalTotal.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '10px', borderTop: '1px dashed black' }}>
                <p style={{ margin: '0', fontWeight: 'bold', fontSize: '10px' }}>THANK YOU FOR YOUR PATRONAGE!</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '9px' }}>Have a safe and happy 4th of July!</p>
              </div>
            </div>

            {/* Modal Print Trigger Actions */}
            <div className="bg-custom-header border-t border-custom-border px-6 py-4 flex gap-3 no-print">
              <button
                id="btn-print-receipt-execute"
                onClick={handlePrintReceipt}
                className="flex-1 py-3 bg-custom-primary hover:bg-custom-primary-hover text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-97 border border-custom-border"
              >
                <Printer className="h-5 w-5" /> Print Receipt
              </button>
              <button
                id="btn-close-receipt-modal-footer"
                onClick={() => setShowReceiptModal(false)}
                className="px-6 py-3 bg-custom-input hover:bg-custom-primary/20 text-custom-text font-semibold rounded-xl transition-all border border-custom-border active:scale-97"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default RegisterView;
