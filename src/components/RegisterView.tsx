/**
 * @file RegisterView.tsx
 * @description The main Point of Sale (POS) register interface for checkout and sales logging.
 *
 * Key Responsibilities:
 * 1. Cart Management: Handles addition, subtraction, bulk packaging toggles, and catalog filtering of goods.
 * 2. Pricing & Discounts: Calculates nested discounts, applying fixed, percentage, and tag-qualified rules.
 * 3. Checkout Gateway: Handles payment methods (Cash, Card, GoDaddy Terminal) and completes database sales logs.
 * 4. Receipt Rendering: Designs and prints structured receipts formatted for standard 80mm thermal roll printers.
 */

import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { triggerConfetti } from './shared/confettiUtils';
import { defaultConfirm, defaultAlert } from './shared/dialogUtils';
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
  Package,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { Item, Discount, CartItem, Tax, PaymentMethod } from '../types';

interface RegisterViewProps {
  scannedBarcode: string;
  onClearScan: () => void;
  taxRate: number; // default e.g. 0.00
  lowStockThreshold: number;
  onPlayShowcaseVideo?: (title: string, path: string) => void;
  cart?: CartItem[];
  setCart?: React.Dispatch<React.SetStateAction<CartItem[]>>;
  customConfirm?: (message: string, title?: string, options?: { confirmText?: string; cancelText?: string; isDanger?: boolean }) => Promise<boolean>;
  customAlert?: (message: string, title?: string) => Promise<boolean>;
  onNavigateToPairing?: () => void;
}

export const RegisterView: React.FC<RegisterViewProps> = ({
  scannedBarcode,
  onClearScan,
  taxRate: _taxRate,
  lowStockThreshold,
  onPlayShowcaseVideo,
  cart: passedCart,
  setCart: passedSetCart,
  customConfirm,
  customAlert,
  onNavigateToPairing
}) => {
  // Controlled fallback for testing / standalone usage
  const [localCart, localSetCart] = useState<CartItem[]>([]);
  const cart = passedCart !== undefined ? passedCart : localCart;
  const setCart = passedSetCart !== undefined ? passedSetCart : localSetCart;

  const handleConfirm = async (message: string, title?: string, isDanger?: boolean): Promise<boolean> => {
    return (customConfirm || defaultConfirm)(message, title, { isDanger });
  };

  const handleAlert = async (message: string, title?: string): Promise<void> => {
    await (customAlert || defaultAlert)(message, title);
  };

  // State
  const [items, setItems] = useState<Item[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [allowOversell, setAllowOversell] = useState<boolean>(false);

  // Discount states
  const [activeManualDiscountIds, setActiveManualDiscountIds] = useState<number[]>([]);
  const [customDiscountType, setCustomDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [customDiscountValue, setCustomDiscountValue] = useState<number>(0);
  const [showCustomDiscountModal, setShowCustomDiscountModal] = useState<boolean>(false);
  const [numpadBuffer, setNumpadBuffer] = useState<string>('');

  // Search & input overrides
  const [manualBarcode, setManualBarcode] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [lastSaleData, setLastSaleData] = useState<any>(null);
  const [pendingAutoPrint, setPendingAutoPrint] = useState<boolean>(false);
  const [organizationName, setOrganizationName] = useState<string>('🎆 THC FIREWORKS 🎆');
  const [receiptMessage, setReceiptMessage] = useState<string>('');
  const [autoPrintReceipts, setAutoPrintReceipts] = useState<boolean>(true);
  const [receiptColumnWidth, setReceiptColumnWidth] = useState<number>(32);
  const [receiptFontSize, setReceiptFontSize] = useState<number>(11);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<string>('58mm');

  // GoDaddy settings states
  const [godaddyEnabled, setGodaddyEnabled] = useState<boolean>(true);
  const [godaddyTerminalIp, setGodaddyTerminalIp] = useState<string>('');
  const [godaddyPairingToken, setGodaddyPairingToken] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [isCompletingSale, setIsCompletingSale] = useState<boolean>(false);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [showPaymentMethodSelector, setShowPaymentMethodSelector] = useState<boolean>(false);

  // Payment methods and calculator states
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isCashChangeCalculatorEnabled, setIsCashChangeCalculatorEnabled] = useState<boolean>(false);
  const [godaddyPairingStatus, setGodaddyPairingStatus] = useState<string>('unpaired');
  const [amountTenderedInput, setAmountTenderedInput] = useState<string>('');
  const [showCashChangeModal, setShowCashChangeModal] = useState<boolean>(false);
  const [showGoDaddyCheckoutWarningModal, setShowGoDaddyCheckoutWarningModal] = useState<boolean>(false);

  // Notification banner
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Load items and discounts on mount
  useEffect(() => {
    loadDatabaseData();
  }, []);

  // Handle automatic receipt printing with system printer dialog
  useEffect(() => {
    if (pendingAutoPrint && showReceiptModal && lastSaleData) {
      setPendingAutoPrint(false);
      const timer = setTimeout(() => {
        window.print();
      }, 300);
      return () => clearTimeout(timer);
    }
    return;
  }, [pendingAutoPrint, showReceiptModal, lastSaleData]);

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

      let gdEnabled = true;
      let gdIp = '';
      let gdToken = '';
      try {
        await invoke('save_setting', { key: 'godaddy_enabled', value: 'true' });
        const gdIpVal = await invoke<string | null>('get_setting', { key: 'godaddy_terminal_ip' });
        gdIp = gdIpVal || '';
        const gdTokenVal = await invoke<string | null>('get_setting', { key: 'godaddy_pairing_token' });
        gdToken = gdTokenVal || '';
      } catch (err) {
        console.error("Failed to load GoDaddy settings", err);
      }

      let paymentMethodsList: PaymentMethod[] = [];
      try {
        paymentMethodsList = await invoke<PaymentMethod[]>('get_payment_methods');
      } catch (err) {
        console.error("Failed to load payment methods", err);
      }
      let changeCalcEnabled = false;
      try {
        const val = await invoke<string | null>('get_setting', { key: 'cash_change_calculator_enabled' });
        changeCalcEnabled = val === 'true';
      } catch (err) {
        console.error("Failed to load change calculator setting", err);
      }
      let pairingStatus = 'unpaired';
      try {
        const val = await invoke<string | null>('get_setting', { key: 'godaddy_pairing_status' });
        pairingStatus = val || 'unpaired';
      } catch (err) {
        console.error("Failed to load pairing status", err);
      }

      let autoPrint = true;
      let colWidth = 32;
      let fontSize = 11;
      let paperWidth = '58mm';
      try {
        const autoPrintVal = await invoke<string | null>('get_setting', { key: 'auto_print_receipts' });
        if (autoPrintVal !== null) {
          autoPrint = autoPrintVal === 'true';
        }
        const colWidthVal = await invoke<string | null>('get_setting', { key: 'receipt_column_width' });
        if (colWidthVal !== null) {
          colWidth = parseInt(colWidthVal, 10) || 32;
        }
        const fontSizeVal = await invoke<string | null>('get_setting', { key: 'receipt_font_size' });
        if (fontSizeVal !== null) {
          fontSize = parseInt(fontSizeVal, 10) || 11;
        }
        const paperWidthVal = await invoke<string | null>('get_setting', { key: 'receipt_paper_width' });
        if (paperWidthVal !== null) {
          paperWidth = paperWidthVal || '58mm';
        }
      } catch (err) {
        console.error("Failed to load receipt printer settings", err);
      }

      setItems(itemsList || []);
      setDiscounts(discountsList || []);
      setTaxes(taxesList || []);
      setAllowOversell(oversell);
      setOrganizationName(orgName);
      setReceiptMessage(receiptMsg);
      setGodaddyEnabled(gdEnabled);
      setGodaddyTerminalIp(gdIp);
      setGodaddyPairingToken(gdToken);
      setAutoPrintReceipts(autoPrint);
      setReceiptColumnWidth(colWidth);
      setReceiptFontSize(fontSize);
      setReceiptPaperWidth(paperWidth);
      setPaymentMethods(paymentMethodsList);
      setIsCashChangeCalculatorEnabled(changeCalcEnabled);
      setGodaddyPairingStatus(pairingStatus);

      // Sync cart items with fresh db data
      setCart(prevCart => {
        return prevCart.map(cItem => {
          const freshItem = (itemsList || []).find(i => i.id === cItem.item.id);
          if (freshItem) {
            return { ...cItem, item: freshItem };
          }
          return cItem;
        });
      });
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
    if (isCompletingSale) return;
    try {
      const item = await invoke<Item | null>('get_item_by_barcode', { barcode });
      if (item) {
        if (item.is_invalid || item.barcode.startsWith('INVALID-TEMP-')) {
          showNotice(`Cannot add invalid item "${item.name}": Missing required fields (${item.missing_fields || 'unknown'})`, 'error');
          return;
        }
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
    if (item.is_invalid || item.barcode.startsWith('INVALID-TEMP-')) {
      showNotice(`Cannot add invalid item "${item.name}": Missing required fields (${item.missing_fields || 'unknown'})`, 'error');
      return;
    }

    const currentCartTotal = cart.reduce((total, i) => {
      if (i.item.id === item.id) {
        const m = i.isBulk && i.item.bulk_quantity !== null && i.item.bulk_quantity !== undefined ? i.item.bulk_quantity : 1;
        return total + (i.quantity * m);
      }
      return total;
    }, 0);

    const multiplier = isBulk && item.bulk_quantity !== null && item.bulk_quantity !== undefined ? item.bulk_quantity : 1;

    if (item.stock_quantity !== null && item.stock_quantity !== undefined && !allowOversell) {
      if (currentCartTotal + multiplier > item.stock_quantity) {
        showNotice(`Cannot add. Only ${item.stock_quantity} units available in stock.`, 'error');
        return;
      }
    }

    showNotice(`Added: ${item.name}${isBulk ? ' (Bulk Case)' : ''}`, 'success');

    setCart(prevCart => {
      const existing = prevCart.find(i => i.item.id === item.id && !!i.isBulk === isBulk);
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
    const targetItem = cart.find(i => i.item.id === itemId && !!i.isBulk === isBulk);
    if (!targetItem) return;

    const newQty = targetItem.quantity + delta;
    if (newQty <= 0) {
      removeFromCart(itemId, isBulk);
      return;
    }

    const multiplier = isBulk && targetItem.item.bulk_quantity !== null && targetItem.item.bulk_quantity !== undefined ? targetItem.item.bulk_quantity : 1;
    const otherCartTotal = cart.reduce((total, c) => {
      if (c.item.id === itemId && (!!c.isBulk !== isBulk)) {
        const m = c.isBulk && c.item.bulk_quantity !== null && c.item.bulk_quantity !== undefined ? c.item.bulk_quantity : 1;
        return total + (c.quantity * m);
      }
      return total;
    }, 0);

    if (targetItem.item.stock_quantity !== null && targetItem.item.stock_quantity !== undefined && !allowOversell) {
      if (otherCartTotal + (newQty * multiplier) > targetItem.item.stock_quantity) {
        showNotice(`Only ${targetItem.item.stock_quantity} in stock for ${targetItem.item.name}`, 'error');
        return;
      }
    }

    setCart(prevCart => {
      return prevCart.map(i => {
        if (i.item.id === itemId && !!i.isBulk === isBulk) {
          return { ...i, quantity: newQty };
        }
        return i;
      });
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

  const parseTags = (tagsStr?: string): string[] => {
    if (!tagsStr) return [];
    return tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
  };

  const getDiscountDetails = () => {
    const subtotalVal = calculateCartSubtotal();

    interface CartUnit {
      itemId: number;
      price: number;
      actualPaidPrice: number;
      isBulk: boolean;
      tags: string[];
      isConsumed: boolean;
    }

    const cartUnits: CartUnit[] = [];
    for (const cartItem of cart) {
      const qty = cartItem.isBulk ? cartItem.quantity * (cartItem.item.bulk_quantity || 1) : cartItem.quantity;
      const unitPaidPrice = cartItem.isBulk && cartItem.item.bulk_price !== null && cartItem.item.bulk_price !== undefined
        ? cartItem.item.bulk_price / (cartItem.item.bulk_quantity || 1)
        : cartItem.item.price;
      const tags = parseTags(cartItem.item.discount_tags);
      for (let i = 0; i < qty; i++) {
        cartUnits.push({
          itemId: cartItem.item.id,
          price: cartItem.item.price,
          actualPaidPrice: unitPaidPrice,
          isBulk: !!cartItem.isBulk,
          tags,
          isConsumed: false
        });
      }
    }

    const qualifiedDiscounts: Discount[] = [];
    const missingRewardDiscounts: Discount[] = [];

    for (const disc of discounts) {
      const qType = disc.qualifier_type || 'manual';
      const qValue = disc.qualifier_value !== undefined ? disc.qualifier_value : 0;
      const rType = disc.reward_type || 'order_discount';
      const rValue = (disc.reward_value !== undefined && disc.reward_value !== null) ? disc.reward_value : (disc.value || 0);
      const rQty = disc.reward_quantity !== undefined ? disc.reward_quantity : 0;
      const discTag = (disc.discount_tag || '').toLowerCase().trim();

      let qualified = false;

      if (qType === 'manual') {
        qualified = activeManualDiscountIds.includes(disc.id);
      } else if (qType === 'order_total') {
        qualified = subtotalVal >= qValue;
      } else if (qType === 'item_quantity') {
        const matchingQty = cartUnits.filter(u => u.tags.includes(discTag)).length;
        qualified = matchingQty >= qValue;
      }

      if (qualified) {
        let rewardApplicable = false;

        if (rType === 'order_discount') {
          rewardApplicable = true;
        } else if (rType === 'item_discount_qty' || rType === 'item_discount_all') {
          rewardApplicable = cartUnits.some(u => u.itemId === disc.reward_target_item_id);
        } else if (rType === 'lowest_cost_item') {
          let priceLimit = rValue;
          if (disc.reward_lowest_cost_linked_item_id) {
            const linkedItem = items.find(itemObj => itemObj.id === disc.reward_lowest_cost_linked_item_id);
            if (linkedItem) {
              priceLimit = linkedItem.price;
            }
          }
          rewardApplicable = cartUnits.some(u => u.tags.includes(discTag) && u.price < priceLimit);
        } else if (rType === 'items_for_price') {
          rewardApplicable = cartUnits.filter(u => u.tags.includes(discTag)).length >= rQty;
        }

        if (rewardApplicable) {
          qualifiedDiscounts.push(disc);
        } else {
          missingRewardDiscounts.push(disc);
        }
      }
    }

    const stackable = qualifiedDiscounts.filter(d => d.is_stackable === 1 || d.is_stackable === null || d.is_stackable === undefined);
    const unstackable = qualifiedDiscounts.filter(d => d.is_stackable === 0);

    if (customDiscountValue > 0) {
      const customDisc: Discount = {
        id: -999,
        name: customDiscountType === 'percentage' ? `Custom - ${customDiscountValue}%` : `Custom - $${customDiscountValue.toFixed(2)}`,
        type: customDiscountType,
        value: customDiscountValue,
        qualifier_type: 'manual',
        qualifier_value: 0,
        reward_type: 'order_discount',
        reward_value: customDiscountValue,
        reward_value_type: customDiscountType,
        reward_quantity: 0,
        discount_tag: '',
        is_stackable: 1,
        max_limit_per_order: 1
      };
      stackable.push(customDisc);
    }

    const evaluateGroupSavings = (group: Discount[]) => {
      const units = cartUnits.map(u => ({ ...u, isConsumed: false }));
      const applied: { name: string; savings: number; id: number }[] = [];
      let totalSavings = 0;

      const remainingDiscounts = [...group];

      let iterations = 0;
      while (remainingDiscounts.length > 0 && iterations < 100) {
        iterations++;
        let bestIdx = -1;
        let bestSavings = 0;
        let bestUnitsToConsume: CartUnit[] = [];

        for (let i = 0; i < remainingDiscounts.length; i++) {
          const disc = remainingDiscounts[i];
          const discTag = (disc.discount_tag || '').toLowerCase().trim();
          const rType = disc.reward_type || 'order_discount';
          const rValue = (disc.reward_value !== undefined && disc.reward_value !== null) ? disc.reward_value : (disc.value || 0);
          const rValueType = disc.reward_value_type || disc.type || 'percentage';
          const rQty = disc.reward_quantity !== undefined ? disc.reward_quantity : 0;
          const qType = disc.qualifier_type || 'manual';
          const qValue = disc.qualifier_value !== undefined ? disc.qualifier_value : 0;

          const matchingUnits = units.filter(u => !u.isConsumed && u.tags.includes(discTag));

          let savings = 0;
          let unitsToConsume: CartUnit[] = [];

          if (rType === 'order_discount') {
            const unconsumedSubtotal = units.filter(u => !u.isConsumed).reduce((sum, u) => sum + u.actualPaidPrice, 0);
            if (rValueType === 'percentage') {
              savings = unconsumedSubtotal * (rValue / 100);
            } else {
              savings = Math.min(rValue, unconsumedSubtotal);
            }
          } else if (rType === 'item_discount_qty') {
            const targetUnits = units.filter(u => !u.isConsumed && u.itemId === disc.reward_target_item_id);
            const rewardQty = Math.min(rQty, targetUnits.length);
            const selected = targetUnits.slice(0, rewardQty);
            for (const u of selected) {
              const unitSavings = rValueType === 'percentage' ? u.price * (rValue / 100) : rValue;
              savings += Math.min(unitSavings, u.actualPaidPrice);
              unitsToConsume.push(u);
            }
          } else if (rType === 'item_discount_all') {
            const targetUnits = units.filter(u => !u.isConsumed && u.itemId === disc.reward_target_item_id);
            for (const u of targetUnits) {
              const unitSavings = rValueType === 'percentage' ? u.price * (rValue / 100) : rValue;
              savings += Math.min(unitSavings, u.actualPaidPrice);
              unitsToConsume.push(u);
            }
          } else if (rType === 'lowest_cost_item') {
            let priceLimit = rValue;
            if (disc.reward_lowest_cost_linked_item_id) {
              const linkedItem = items.find(itemObj => itemObj.id === disc.reward_lowest_cost_linked_item_id);
              if (linkedItem) {
                priceLimit = linkedItem.price;
              }
            }
            const qualifierQty = qType === 'item_quantity' ? qValue : 0;
            const qualifierUnits = matchingUnits.slice(0, qualifierQty);

            const availableForReward = matchingUnits.slice(qualifierQty).filter(u => u.price < priceLimit);
            if (availableForReward.length > 0) {
              availableForReward.sort((a, b) => a.price - b.price);
              const lowestCost = availableForReward[0];
              const unitSavings = rValueType === 'percentage' ? lowestCost.price * (rValue / 100) : rValue;
              savings = Math.min(unitSavings, lowestCost.actualPaidPrice);
              unitsToConsume = [...qualifierUnits, lowestCost];
            }
          } else if (rType === 'items_for_price') {
            const rewardQty = rQty;
            if (matchingUnits.length >= rewardQty) {
              const sortedMatching = [...matchingUnits].sort((a, b) => a.price - b.price);
              const selected = sortedMatching.slice(0, rewardQty);
              const sumPaid = selected.reduce((sum, u) => sum + u.actualPaidPrice, 0);
              savings = Math.max(0, sumPaid - rValue);
              unitsToConsume.push(...selected);
            }
          }

          if (disc.value_cap && disc.value_cap > 0) {
            savings = Math.min(savings, disc.value_cap);
          }

          if (savings > bestSavings) {
            bestSavings = savings;
            bestIdx = i;
            bestUnitsToConsume = unitsToConsume;
          }
        }

        if (bestIdx !== -1 && bestSavings > 0) {
          const bestDisc = remainingDiscounts[bestIdx];

          for (const uToConsume of bestUnitsToConsume) {
            uToConsume.isConsumed = true;
          }

          applied.push({ name: bestDisc.name, savings: bestSavings, id: bestDisc.id });
          totalSavings += bestSavings;

          const appId = bestDisc.id;
          const appCount = applied.filter(a => a.id === appId).length;

          if (bestUnitsToConsume.length === 0) {
            remainingDiscounts.splice(bestIdx, 1);
          } else {
            const limit = bestDisc.max_limit_per_order !== null && bestDisc.max_limit_per_order !== undefined
              ? bestDisc.max_limit_per_order
              : (bestDisc.reward_type === 'order_discount' || bestDisc.reward_type === 'item_discount_all' || !bestDisc.reward_type ? 1 : null);

            if (limit !== null && appCount >= limit) {
              remainingDiscounts.splice(bestIdx, 1);
            }
          }
        } else {
          break;
        }
      }

      return { totalSavings, applied };
    };

    let bestOutcome = evaluateGroupSavings(stackable);

    for (const u of unstackable) {
      const outcome = evaluateGroupSavings([u, ...stackable]);
      if (outcome.totalSavings > bestOutcome.totalSavings) {
        bestOutcome = outcome;
      }
    }

    return {
      discountTotal: bestOutcome.totalSavings,
      appliedDiscounts: bestOutcome.applied,
      missingRewardDiscounts
    };
  };

  const getActiveDiscountName = () => {
    const { appliedDiscounts } = getDiscountDetails();
    if (appliedDiscounts.length > 0) {
      return appliedDiscounts.map(ad => ad.name).join(', ');
    }
    return null;
  };

  const subtotal = calculateCartSubtotal();
  const { discountTotal, appliedDiscounts, missingRewardDiscounts } = getDiscountDetails();
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
    setActiveManualDiscountIds([]); // Clear pre-made manual discounts
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

  const generateTextReceipt = (saleData: any, orgName: string, message: string, colWidth: number = 32) => {
    if (!saleData) return "";

    const centerLine = (str: string, width: number): string => {
      const trimmed = str.trim();
      if (trimmed.length >= width) return trimmed.slice(0, width) + "\n";
      const leftPadding = Math.floor((width - trimmed.length) / 2);
      const rightPadding = width - trimmed.length - leftPadding;
      return " ".repeat(leftPadding) + trimmed + " ".repeat(rightPadding) + "\n";
    };

    const formatLine = (str: string, width: number): string => {
      if (str.length >= width) return str.slice(0, width) + "\n";
      return str + " ".repeat(width - str.length) + "\n";
    };

    const centerText = (text: string, width: number): string => {
      const paragraphs = text.split('\n');
      const wrappedLines: string[] = [];

      for (const paragraph of paragraphs) {
        if (paragraph.trim() === '') {
          wrappedLines.push('');
          continue;
        }

        const words = paragraph.split(/\s+/);
        let currentLine = '';

        for (const word of words) {
          if (word === '') continue;

          if (currentLine === '') {
            currentLine = word;
          } else if (currentLine.length + 1 + word.length <= width) {
            currentLine += ' ' + word;
          } else {
            wrappedLines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine !== '') {
          wrappedLines.push(currentLine);
        }
      }

      return wrappedLines.map(line => centerLine(line, width)).join('');
    };

    const separator = "-".repeat(colWidth) + "\n";
    let text = "";

    // 1. Header
    text += centerText(orgName, colWidth);
    if (message) {
      text += centerText(message, colWidth);
    }
    const subheader = orgName === '🎆 THC FIREWORKS 🎆' ? 'Thousand Hills Church Booth' : 'Sales Receipt';
    text += centerText(subheader, colWidth);
    text += centerText("100% Volunteer Supported", colWidth);
    text += separator;

    // Sale Info
    text += formatLine(`Sale #: ${saleData.id}`, colWidth);
    text += formatLine(`Date: ${saleData.timestamp}`, colWidth);
    text += separator;

    // 2. Items
    const cartItems = saleData.cart || [];
    cartItems.forEach((item: any) => {
      const name = item.item.name + (item.isBulk ? ' (Bulk Case)' : '');
      const priceVal = item.isBulk && item.item.bulk_price !== null && item.item.bulk_price !== undefined ? item.item.bulk_price : item.item.price;
      const total = `$${(item.quantity * priceVal).toFixed(2)}`;

      // Row 1: Name and Total Price
      let namePart = name;
      if (namePart.length > (colWidth - total.length - 1)) {
        namePart = namePart.slice(0, colWidth - total.length - 2) + "…";
      }
      const spaces = colWidth - namePart.length - total.length;
      text += formatLine(`${namePart}${" ".repeat(spaces)}${total}`, colWidth);

      // Row 2: Qty x Unit Price
      text += formatLine(`${item.quantity} x $${priceVal.toFixed(2)}`, colWidth);
    });

    text += separator;

    // 3. Totals
    const formatTotalLine = (label: string, val: string): string => {
      const spaces = Math.max(1, colWidth - label.length - val.length);
      return formatLine(label + " ".repeat(spaces) + val, colWidth);
    };

    text += formatTotalLine("Subtotal", `$${saleData.subtotal.toFixed(2)}`);

    if (saleData.discountTotal > 0) {
      const discLabel = saleData.discountName ? `Disc: ${saleData.discountName}` : "Discount";
      text += formatTotalLine(discLabel, `-$${saleData.discountTotal.toFixed(2)}`);
    }

    text += formatTotalLine("Tax", `$${saleData.taxTotal.toFixed(2)}`);
    text += separator;
    text += formatTotalLine("TOTAL DUE", `$${saleData.finalTotal.toFixed(2)}`);
    text += separator;

    // 4. Footer
    text += centerText("THANK YOU FOR YOUR PATRONAGE!", colWidth);
    text += centerText("Have a safe and happy 4th of July!", colWidth);
    text += "\n\n\n";
    return text;
  };

  const triggerSaleCompletion = async (paymentMethodName: string, gatewayTxId?: string) => {
    setIsCompletingSale(true);
    try {
      const itemsPayload = cart.map(i => ({
        item_id: i.item.id,
        quantity: i.quantity,
        price_at_sale: i.isBulk && i.item.bulk_price !== null && i.item.bulk_price !== undefined ? i.item.bulk_price : i.item.price,
        is_bulk: !!i.isBulk
      }));

      let transactionFee = 0.0;
      const method = paymentMethods.find(m => m.name === paymentMethodName);
      if (method) {
        transactionFee = (finalTotal * method.fee_percentage / 100) + method.fee_flat;
      }

      const saleId = await invoke<number>('complete_sale', {
        items: itemsPayload,
        subtotal,
        discountTotal,
        taxTotal,
        finalTotal,
        paymentMethod: paymentMethodName,
        godaddyTransactionId: gatewayTxId || null,
        transactionFee
      });

      const saleData = {
        id: saleId,
        timestamp: new Date().toLocaleString(),
        cart: [...cart],
        subtotal,
        discountName: getActiveDiscountName(),
        discountTotal,
        taxTotal,
        finalTotal,
        paymentMethod: paymentMethodName,
        gatewayTxId: gatewayTxId || null
      };

      // Cache sale details for printing
      setLastSaleData(saleData);

      // Print receipt if auto-print is enabled
      if (autoPrintReceipts) {
        const savedPrinter = localStorage.getItem('selected_receipt_printer') || 'System Print Dialog (Default)';
        const savedMode = localStorage.getItem('selected_print_mode') || 'dialog';
        const isGoDaddyConnected = godaddyEnabled && godaddyTerminalIp;
        const useGoDaddyPrinter = isGoDaddyConnected && (savedPrinter === 'GoDaddy Smart Terminal Printer' || savedPrinter === 'System Print Dialog (Default)');

        if (useGoDaddyPrinter) {
          try {
            // GoDaddy Smart Terminal built-in printer has a fixed hardware/OS font size and 2" paper width,
            // which fits exactly 26 characters per line. We must force colWidth to 26 to prevent truncation.
            const receiptText = generateTextReceipt(saleData, organizationName, receiptMessage, 26);
            await invoke('godaddy_print_receipt', {
              ip: godaddyTerminalIp,
              token: godaddyPairingToken,
              receiptText: receiptText
            });
          } catch (printErr) {
            console.error("Failed to print to GoDaddy Terminal built-in printer:", printErr);
            showNotice("Sale recorded, but GoDaddy printing failed.", "error");
          }
        } else if (savedPrinter !== 'System Print Dialog (Default)' && savedMode === 'direct') {
          try {
            const receiptText = generateTextReceipt(saleData, organizationName, receiptMessage, receiptColumnWidth);
            await invoke('print_to_named_printer', {
              printerName: savedPrinter,
              text: receiptText
            });
          } catch (printErr) {
            console.error("Failed to print to system printer:", printErr);
            showNotice("Sale recorded, but system printing failed.", "error");
          }
        } else {
          setPendingAutoPrint(true);
        }
      }

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
      setActiveManualDiscountIds([]);
      setCustomDiscountValue(0);

      // Success indicators
      triggerConfetti();
      setShowReceiptModal(true);
      showNotice('Sale Completed Successfully! 🎆', 'success');

      if (lowStockItems.length > 0) {
        setTimeout(() => {
          handleAlert(`⚠️ Low Stock Warning:\n\nThe following items have dropped below the threshold:\n\n${lowStockItems.map(x => `• ${x}`).join('\n')}`, 'Low Stock Warning');
        }, 500);
      }

      // Reload item lists to reflect new stock counts
      loadDatabaseData();
    } catch (err) {
      console.error("Sale completion failed:", err);
      showNotice("Sale completion failed: " + err, "error");
    } finally {
      setIsCompletingSale(false);
    }
  };

  const handleCheckout = async () => {
    if (isCompletingSale) return;
    if (cart.length === 0) {
      showNotice('Cart is empty', 'error');
      return;
    }

    if (missingRewardDiscounts.length > 0) {
      const names = missingRewardDiscounts.map(d => d.name).join('\n• ');
      const message = `⚠️ Discount Qualifier Met, but Reward Cannot Be Applied:\n\nThe following discounts have met their qualifiers, but the reward items are missing from the cart:\n• ${names}\n\nWould you like to go back to add the reward items, or continue to checkout anyway?`;
      if (!await handleConfirm(message, 'Discount Warning')) {
        return;
      }
    }

    setShowPaymentMethodSelector(true);
  };

  const processGoDaddyPayment = async () => {
    if (!godaddyTerminalIp) {
      showNotice('GoDaddy Terminal IP is not configured in settings.', 'error');
      return;
    }

    setShowPaymentMethodSelector(false);
    setShowPaymentModal(true);
    setIsProcessingPayment(true);
    setPaymentStatusMessage('Sending order to GoDaddy Terminal...');
    setPaymentError(null);

    const amountCents = Math.round(finalTotal * 100);
    const mockSaleId = `SALE_${Date.now()}`;

    try {
      setPaymentStatusMessage('Waiting for customer payment on terminal...');
      const txId = await invoke<string>('godaddy_initiate_payment', {
        ip: godaddyTerminalIp,
        token: godaddyPairingToken,
        amountCents,
        saleId: mockSaleId
      });

      setPaymentStatusMessage('Payment approved! Saving sale...');
      await triggerSaleCompletion('GoDaddy Terminal Flex', txId);
      setShowPaymentModal(false);
    } catch (err) {
      setPaymentError(String(err));
      setIsProcessingPayment(false);
    }
  };

  const handleManualBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      handleBarcodeScan(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  const handlePrintReceipt = async () => {
    const savedPrinter = localStorage.getItem('selected_receipt_printer') || 'System Print Dialog (Default)';
    const savedMode = localStorage.getItem('selected_print_mode') || 'dialog';
    const isGoDaddyConnected = godaddyEnabled && godaddyTerminalIp;
    const useGoDaddyPrinter = isGoDaddyConnected && (savedPrinter === 'GoDaddy Smart Terminal Printer' || savedPrinter === 'System Print Dialog (Default)');

    if (useGoDaddyPrinter) {
      if (lastSaleData) {
        try {
          // GoDaddy Smart Terminal built-in printer has a fixed hardware/OS font size and 2" paper width,
          // which fits exactly 26 characters per line. We must force colWidth to 26 to prevent truncation.
          const receiptText = generateTextReceipt(lastSaleData, organizationName, receiptMessage, 26);
          await invoke('godaddy_print_receipt', {
            ip: godaddyTerminalIp,
            token: godaddyPairingToken,
            receiptText: receiptText
          });
          showNotice("Receipt printed on GoDaddy Terminal!", 'success');
        } catch (err) {
          console.error("GoDaddy print failed", err);
          showNotice(`GoDaddy print failed: ${err}`, 'error');
        }
      } else {
        showNotice("No receipt data available to print.", "error");
      }
    } else if (savedPrinter !== 'System Print Dialog (Default)' && savedMode === 'direct') {
      if (lastSaleData) {
        try {
          const receiptText = generateTextReceipt(lastSaleData, organizationName, receiptMessage, receiptColumnWidth);
          const ok = await invoke<boolean>('print_to_named_printer', {
            printerName: savedPrinter,
            text: receiptText
          });
          if (ok) {
            showNotice(`Receipt sent to printer ${savedPrinter}!`, 'success');
          } else {
            showNotice(`Failed to send receipt to printer.`, 'error');
          }
        } catch (err) {
          console.error("Direct print failed", err);
          showNotice(`Direct print failed: ${err}`, 'error');
        }
      } else {
        showNotice("No receipt data available to print.", "error");
      }
    } else {
      window.print();
    }
  };

  // Filter items for helper list search
  const filteredProducts = items.filter(item => {
    if (item.is_invalid || (item.barcode && item.barcode.startsWith('INVALID-TEMP-'))) return false;
    const query = searchQuery.toLowerCase();
    return item.name.toLowerCase().includes(query) || item.barcode.includes(query);
  });

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full p-6 relative lg:overflow-hidden overflow-y-auto select-none">

      {/* Alert Notification banner */}
      {notification && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl transition-all border ${notification.type === 'error'
          ? 'bg-red-950/95 border-red-500 text-red-100 shadow-red-950/40'
          : 'bg-custom-card border-custom-accent/40 text-custom-text shadow-custom-accent/10 shadow-lg'
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
            onClick={async () => { if (cart.length > 0 && await handleConfirm('Clear active cart?', 'Clear Cart')) setCart([]); }}
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
      <div className="w-full lg:w-96 flex flex-col gap-6 lg:h-full lg:overflow-visible shrink-0">

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
          <div className="max-h-[150px] overflow-y-auto pr-1 mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {discounts.map(disc => {
                const qType = disc.qualifier_type || 'manual';
                const isActive = qType === 'manual'
                  ? activeManualDiscountIds.includes(disc.id)
                  : appliedDiscounts.some(ad => ad.id === disc.id);

                const valType = disc.reward_value_type || disc.type || 'percentage';
                const val = (disc.reward_value !== undefined && disc.reward_value !== null) ? disc.reward_value : (disc.value || 0);

                return (
                  <button
                    key={disc.id}
                    id={`btn-discount-select-${disc.id}`}
                    onClick={() => {
                      if (qType !== 'manual') {
                        showNotice(`"${disc.name}" is automatically qualified by the cart.`, 'success');
                        return;
                      }
                      setCustomDiscountValue(0); // Reset custom discount
                      setActiveManualDiscountIds(prev =>
                        isActive ? prev.filter(id => id !== disc.id) : [...prev, disc.id]
                      );
                      showNotice(isActive ? 'Discount removed' : `Applied discount: ${disc.name}`);
                    }}
                    className={`p-2.5 rounded-xl border text-center font-bold text-sm transition-all active:scale-95 flex flex-col justify-center items-center min-h-[64px] ${isActive
                      ? 'bg-custom-primary/20 border-custom-primary text-custom-text shadow-md'
                      : 'bg-custom-input/60 border-custom-border hover:bg-custom-primary/10 text-custom-text'
                      }`}
                  >
                    <span className="block text-xs font-medium text-custom-muted mb-1 whitespace-normal break-words leading-snug text-center max-w-full">
                      {disc.name} {disc.qualifier_type !== 'manual' && disc.qualifier_type !== undefined && " (Auto)"}
                    </span>
                    <span className="block text-sm font-mono text-custom-accent font-bold">
                      {valType === 'percentage' ? `${val}% OFF` : `$${val.toFixed(2)} OFF`}
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
            className={`w-full py-4 rounded-xl font-bold text-sm border flex items-center justify-center gap-2 transition-all active:scale-95 ${customDiscountValue > 0
              ? 'bg-custom-primary/20 border-custom-primary text-custom-text shadow-md'
              : 'bg-custom-input/60 border-custom-border hover:bg-custom-primary/10 text-custom-text'
              }`}
          >
            <Percent className="h-4 w-4" />
            {customDiscountValue > 0
              ? `Custom: ${customDiscountType === 'percentage' ? `${customDiscountValue}%` : `$${customDiscountValue.toFixed(2)}`}`
              : 'Add Custom Discount'
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
                    onClick={() => { setActiveManualDiscountIds([]); setCustomDiscountValue(0); }}
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
            disabled={cart.length === 0 || isCompletingSale}
            className={`w-full py-5 rounded-2xl font-extrabold text-xl shadow-xl flex items-center justify-center gap-3 transition-all active:scale-97 select-none ${(cart.length === 0 || isCompletingSale)
              ? 'bg-custom-input border border-custom-border text-custom-muted cursor-not-allowed shadow-none'
              : 'bg-custom-primary hover:bg-custom-primary-hover text-white border border-white/10'
              }`}
          >
            {isCompletingSale ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-custom-primary" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className={`h-6 w-6 ${cart.length > 0 ? 'animate-bounce' : ''}`} />
                Complete Sale
              </>
            )}
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
                className={`flex-1 py-3 text-center rounded-lg font-bold text-base flex items-center justify-center gap-1.5 transition-all ${customDiscountType === 'fixed'
                  ? 'bg-custom-primary text-white shadow'
                  : 'text-custom-muted hover:text-custom-text hover:bg-custom-primary/20'
                  }`}
              >
                <DollarSign className="h-4.5 w-4.5" /> Flat Dollar ($)
              </button>
              <button
                id="btn-discount-type-percentage"
                onClick={() => setCustomDiscountType('percentage')}
                className={`flex-1 py-3 text-center rounded-lg font-bold text-base flex items-center justify-center gap-1.5 transition-all ${customDiscountType === 'percentage'
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
                  className={`py-4 rounded-xl font-bold font-mono text-xl transition-all active:scale-90 border ${key === 'C'
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
            <div className="p-6 bg-custom-input/40 overflow-y-auto max-h-[400px] flex justify-center items-start no-print">
              {/* Virtual Receipt Render */}
              <div
                className={`${receiptPaperWidth === '58mm' ? 'w-[52mm]' : 'w-[72mm]'} bg-white text-black p-5 font-mono leading-relaxed shadow-lg rounded border border-slate-300 h-fit`}
                style={{ fontSize: `${receiptFontSize}px` }}
              >
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
            <div
              id="receipt-print-area"
              className={`hidden ${receiptPaperWidth === '58mm' ? 'width-58mm' : 'width-80mm'}`}
              style={{ '--receipt-font-size': `${receiptFontSize}px` } as React.CSSProperties}
            >
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

      {/* MODAL: PAYMENT METHOD SELECTOR */}
      {/* MODAL: PAYMENT METHOD SELECTOR */}
      {showPaymentMethodSelector && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-200">
            <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between mt-1">
              <h3 className="font-bold text-custom-text text-base flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-custom-primary" /> Select Payment Method
              </h3>
              <button
                onClick={() => setShowPaymentMethodSelector(false)}
                className="p-2 hover:bg-custom-primary/20 rounded-xl text-custom-muted hover:text-custom-text transition-all border border-custom-border"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {paymentMethods
                .filter(m => m.enabled === 1 && m.status === 'active')
                .map(method => {
                  const isGoDaddy = method.name === 'GoDaddy Terminal Flex';
                  const isPaired = godaddyPairingStatus === 'paired';
                  return (
                    <button
                      key={method.id}
                      onClick={() => {
                        if (isGoDaddy && !isPaired) {
                          setShowGoDaddyCheckoutWarningModal(true);
                          return;
                        }

                        if (method.name === 'Cash' && isCashChangeCalculatorEnabled) {
                          setShowPaymentMethodSelector(false);
                          setShowCashChangeModal(true);
                          return;
                        }

                        if (isGoDaddy) {
                          processGoDaddyPayment();
                        } else {
                          setShowPaymentMethodSelector(false);
                          triggerSaleCompletion(method.name);
                        }
                      }}
                      className={`w-full py-4 text-sm font-black rounded-xl border flex items-center justify-center gap-2 transition-all active:scale-95 shadow ${isGoDaddy && !isPaired
                          ? 'bg-custom-input border-custom-border text-custom-muted opacity-50 cursor-pointer'
                          : 'bg-custom-primary hover:bg-custom-primary-hover border-transparent text-white cursor-pointer'
                        }`}
                    >
                      {method.name === 'Cash' ? '💵' : method.name === 'Card' ? '💳' : '🏷️'} Pay with {method.name}
                    </button>
                  );
                })}
            </div>

            <div className="bg-custom-header border-t border-custom-border px-6 py-3 flex justify-end">
              <button
                onClick={() => setShowPaymentMethodSelector(false)}
                className="px-4 py-1.5 bg-custom-input hover:bg-custom-border text-custom-muted hover:text-custom-text font-bold text-xs rounded-lg transition-all border border-custom-border"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CASH CHANGE CALCULATOR */}
      {showCashChangeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-200 p-6 space-y-6">
            <div className="flex justify-between items-center pb-3 border-b border-custom-border">
              <h3 className="font-bold text-custom-text text-base flex items-center gap-2">
                💵 Cash Calculator
              </h3>
              <button
                onClick={() => {
                  setShowCashChangeModal(false);
                  setAmountTenderedInput('');
                }}
                className="p-1 hover:bg-custom-primary/20 rounded-lg text-custom-muted hover:text-custom-text transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-custom-input/40 border border-custom-border p-4 rounded-xl flex justify-between items-center">
                <span className="text-xs text-custom-muted font-bold">Total Amount Due:</span>
                <span className="font-mono font-black text-custom-accent text-lg">${finalTotal.toFixed(2)}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-custom-text font-bold uppercase tracking-wider">Amount Tendered</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-custom-muted font-mono text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={amountTenderedInput}
                    onChange={e => setAmountTenderedInput(e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 bg-custom-input border border-custom-border text-custom-text rounded-xl text-base font-mono focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {(() => {
                const tendered = parseFloat(amountTenderedInput) || 0.0;
                const change = tendered - finalTotal;
                return (
                  <div className="bg-custom-input/40 border border-custom-border p-4 rounded-xl flex justify-between items-center">
                    <span className="text-xs text-custom-muted font-bold">Change to Return:</span>
                    <span className={`font-mono font-black text-lg ${change >= 0 ? 'text-emerald-400' : 'text-custom-muted'}`}>
                      {change >= 0 ? `$${change.toFixed(2)}` : '$0.00'}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 justify-end border-t border-custom-border pt-4">
              <button
                onClick={() => {
                  setShowCashChangeModal(false);
                  setAmountTenderedInput('');
                }}
                className="py-2 px-4 bg-custom-input border border-custom-border text-custom-text font-bold text-xs rounded-xl transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                disabled={(parseFloat(amountTenderedInput) || 0.0) < finalTotal}
                onClick={async () => {
                  setShowCashChangeModal(false);
                  setAmountTenderedInput('');
                  await triggerSaleCompletion('Cash');
                }}
                className="py-2.5 px-5 bg-custom-primary hover:bg-custom-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow uppercase tracking-wide"
              >
                Complete Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GODADDY CHECKOUT WARNING */}
      {showGoDaddyCheckoutWarningModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-200 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-custom-border pb-3">
              <AlertTriangle className="h-5 w-5 text-custom-accent animate-pulse" />
              <h3 className="font-extrabold text-custom-text uppercase tracking-wider text-sm">
                GoDaddy Not Paired
              </h3>
            </div>
            <p className="text-xs text-custom-text leading-relaxed font-semibold">
              GoDaddy Terminal Flex is enabled, but the terminal is not paired with this PC. You must pair the terminal to initiate transactions or printing.
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowGoDaddyCheckoutWarningModal(false)}
                className="px-4 py-2 bg-custom-input border border-custom-border text-custom-text font-bold text-xs rounded-xl cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setShowGoDaddyCheckoutWarningModal(false);
                  setShowPaymentMethodSelector(false);
                  if (onNavigateToPairing) {
                    onNavigateToPairing();
                  }
                }}
                className="px-4 py-2 bg-custom-primary hover:bg-custom-primary-hover text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all active:scale-95"
              >
                Go to Pairing Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GODADDY TRANSACTION PROGRESS */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-200">
            <div className="bg-custom-header border-b border-custom-border px-6 py-4">
              <h3 className="font-bold text-custom-text text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-custom-accent animate-pulse" /> Processing Payment
              </h3>
            </div>

            <div className="p-6 flex flex-col items-center justify-center space-y-4 font-sans">
              {isProcessingPayment ? (
                <div className="relative flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-custom-accent"></div>
                  <div className="absolute font-mono text-[10px] text-custom-accent">POS</div>
                </div>
              ) : (
                <div className="text-red-500 text-3xl">⚠️</div>
              )}

              <p className="text-sm font-semibold text-custom-text text-center leading-relaxed">
                {paymentStatusMessage}
              </p>

              {paymentError && (
                <div className="w-full p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-200 font-medium text-center space-y-1">
                  <span className="block font-bold">Transaction Failed</span>
                  <span className="block">{paymentError}</span>
                </div>
              )}

              <div className="w-full bg-custom-input/40 border border-custom-border/40 p-3 rounded-xl flex justify-between items-center text-xs">
                <span className="text-custom-muted">Total Due:</span>
                <span className="font-mono font-black text-custom-text text-sm">${finalTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-custom-header border-t border-custom-border px-6 py-4 flex gap-3">
              {paymentError ? (
                <>
                  <button
                    onClick={() => setShowPaymentModal(false)}
                    className="w-1/2 py-2 bg-custom-input hover:bg-custom-border text-custom-text font-bold text-xs rounded-lg transition-all border border-custom-border active:scale-95"
                  >
                    Close
                  </button>
                  <button
                    onClick={processGoDaddyPayment}
                    className="w-1/2 py-2 bg-custom-primary hover:bg-custom-primary-hover text-white font-bold text-xs rounded-lg transition-all active:scale-95 shadow"
                  >
                    Try Again
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setIsProcessingPayment(false);
                    setShowPaymentModal(false);
                    showNotice('Card transaction aborted.', 'error');
                  }}
                  className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-all active:scale-95 shadow"
                >
                  Cancel Transaction
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default RegisterView;
