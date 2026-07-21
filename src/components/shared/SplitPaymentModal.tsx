import React, { useState } from 'react';
import { CreditCard, X, Check, AlertCircle, Loader2, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { PaymentMethod, SalePaymentDetail, Theme } from '../../types';

interface SplitPaymentModalProps {
  theme: Theme;
  orderSubtotal: number;
  orderTaxTotal: number;
  orderDiscountTotal: number;
  paymentMethods: PaymentMethod[];
  godaddyIp?: string;
  godaddyIsPaired?: boolean;
  onCompleteSale: (payments: SalePaymentDetail[], totalSurcharge: number) => Promise<void>;
  onClose: () => void;
}

export const SplitPaymentModal: React.FC<SplitPaymentModalProps> = ({
  theme,
  orderSubtotal,
  orderTaxTotal,
  orderDiscountTotal,
  paymentMethods,
  godaddyIp,
  godaddyIsPaired,
  onCompleteSale,
  onClose,
}) => {
  // Base pre-tax total for surcharge calculation base (Subtotal + Tax - Discount)
  const baseOrderTotal = Math.max(0, orderSubtotal + orderTaxTotal - orderDiscountTotal);

  const enabledMethods = paymentMethods.filter((m) => m.enabled === 1 && m.status !== 'archived');

  const [appliedTenders, setAppliedTenders] = useState<SalePaymentDetail[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<number>(
    enabledMethods.length > 0 ? enabledMethods[0].id : 1
  );

  const activeMethod = enabledMethods.find((m) => m.id === selectedMethodId) || enabledMethods[0];

  // Calculate current paid base sum (excluding surcharges)
  const paidBaseSum = appliedTenders.reduce((sum, t) => sum + t.amount_tendered, 0);

  // Remaining base balance
  const remainingBaseBalance = Math.max(0, parseFloat((baseOrderTotal - paidBaseSum).toFixed(2)));

  // Tender input state for next line
  const [tenderAmountInput, setTenderAmountInput] = useState<string>(
    remainingBaseBalance > 0 ? remainingBaseBalance.toFixed(2) : '0.00'
  );
  const [cashTenderedInput, setCashTenderedInput] = useState<string>('');
  const [isProcessingCard, setIsProcessingCard] = useState<boolean>(false);
  const [cardStatusText, setCardStatusText] = useState<string>('');
  const [isRefundingOnCancel, setIsRefundingOnCancel] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Helper to calculate fee for a given method and tender portion
  const calculateTenderFee = (method: PaymentMethod, tenderAmount: number) => {
    if (!method || tenderAmount <= 0) return { feeAmount: 0, feeMode: 'deducted' as const };
    const pctFee = (tenderAmount * (method.fee_percentage || 0)) / 100;
    const flatFee = method.fee_flat || 0;
    const feeAmount = parseFloat((pctFee + flatFee).toFixed(2));
    const feeMode = method.fee_mode || 'deducted';
    return { feeAmount, feeMode };
  };

  // Live calculation of surcharge total across all applied tenders
  const totalSurchargeOnTop = appliedTenders.reduce(
    (sum, t) => (t.fee_mode === 'on_top' ? sum + t.fee_amount : sum),
    0
  );

  // Total customer payment target (base + surcharges on top)
  const finalCustomerTargetTotal = baseOrderTotal + totalSurchargeOnTop;

  // Add tender line
  const handleAddTender = async () => {
    setErrorMessage(null);
    const amountNum = parseFloat(tenderAmountInput);

    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMessage('Please enter a valid tender amount greater than $0.00');
      return;
    }

    if (amountNum > remainingBaseBalance + 0.01) {
      setErrorMessage(`Amount tendered cannot exceed remaining balance of $${remainingBaseBalance.toFixed(2)}`);
      return;
    }

    const { feeAmount, feeMode } = calculateTenderFee(activeMethod, amountNum);

    // If GoDaddy / Card terminal is chosen and paired, trigger device check
    const isGoDaddy = activeMethod.name.toLowerCase().includes('godaddy') || activeMethod.name.toLowerCase().includes('terminal');

    if (isGoDaddy) {
      if (!godaddyIp || !godaddyIsPaired) {
        setErrorMessage('GoDaddy Smart Terminal is not paired or configured. Please check terminal settings.');
        return;
      }

      setIsProcessingCard(true);
      setCardStatusText(`Initiating $${(amountNum + (feeMode === 'on_top' ? feeAmount : 0)).toFixed(2)} card payment on GoDaddy terminal...`);

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        // Calculate total to send to terminal (base + surcharge if on_top)
        const chargeAmount = feeMode === 'on_top' ? amountNum + feeAmount : amountNum;
        const res: any = await invoke('godaddy_process_payment', { amount: chargeAmount });

        if (res && res.success) {
          const newTender: SalePaymentDetail = {
            payment_method_id: activeMethod.id,
            payment_method_name: activeMethod.name,
            amount_tendered: amountNum,
            fee_amount: feeAmount,
            fee_mode: feeMode,
            godaddy_trans_id: res.transaction_id || `gd_${Date.now()}`,
          };

          const updated = [...appliedTenders, newTender];
          setAppliedTenders(updated);

          const newRemaining = Math.max(0, parseFloat((baseOrderTotal - updated.reduce((s, t) => s + t.amount_tendered, 0)).toFixed(2)));
          setTenderAmountInput(newRemaining > 0 ? newRemaining.toFixed(2) : '0.00');
        } else {
          setErrorMessage(res?.message || 'GoDaddy card payment was declined or cancelled.');
        }
      } catch (err: any) {
        setErrorMessage(typeof err === 'string' ? err : err.message || 'GoDaddy terminal connection error.');
      } finally {
        setIsProcessingCard(false);
        setCardStatusText('');
      }
      return;
    }

    // Standard cash/custom payment tender
    const newTender: SalePaymentDetail = {
      payment_method_id: activeMethod.id,
      payment_method_name: activeMethod.name,
      amount_tendered: amountNum,
      fee_amount: feeAmount,
      fee_mode: feeMode,
    };

    const updated = [...appliedTenders, newTender];
    setAppliedTenders(updated);

    const newRemaining = Math.max(0, parseFloat((baseOrderTotal - updated.reduce((s, t) => s + t.amount_tendered, 0)).toFixed(2)));
    setTenderAmountInput(newRemaining > 0 ? newRemaining.toFixed(2) : '0.00');
    setCashTenderedInput('');
  };

  // Remove a tender line
  const handleRemoveTender = (index: number) => {
    const updated = appliedTenders.filter((_, i) => i !== index);
    setAppliedTenders(updated);
    const newRemaining = Math.max(0, parseFloat((baseOrderTotal - updated.reduce((s, t) => s + t.amount_tendered, 0)).toFixed(2)));
    setTenderAmountInput(newRemaining > 0 ? newRemaining.toFixed(2) : '0.00');
  };

  // Handle Cancel entire transaction with GoDaddy API auto-refund
  const handleCancelSplitTransaction = async () => {
    const cardTendersToRefund = appliedTenders.filter((t) => t.godaddy_trans_id);

    if (cardTendersToRefund.length > 0) {
      setIsRefundingOnCancel(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        for (const t of cardTendersToRefund) {
          setCardStatusText(`Communicating with GoDaddy Smart Terminal to refund transaction ${t.godaddy_trans_id}... Please wait.`);
          await invoke('godaddy_void_payment', { transactionId: t.godaddy_trans_id });
        }
      } catch (e) {
        console.error('Auto-refund failed:', e);
      } finally {
        setIsRefundingOnCancel(false);
        setCardStatusText('');
      }
    }
    onClose();
  };

  // Finalize Sale
  const handleFinalize = async () => {
    if (remainingBaseBalance > 0.01) {
      setErrorMessage(`Cannot complete sale. Remaining balance of $${remainingBaseBalance.toFixed(2)} is outstanding.`);
      return;
    }
    await onCompleteSale(appliedTenders, totalSurchargeOnTop);
  };

  // Cash change due calculation
  const cashTenderedVal = parseFloat(cashTenderedInput) || 0;
  const currentTenderVal = parseFloat(tenderAmountInput) || 0;
  const changeDue = cashTenderedVal > currentTenderVal ? cashTenderedVal - currentTenderVal : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Loading Modal Overlay when communicating with terminal */}
      {isRefundingOnCancel && (
        <div className="fixed inset-0 z-60 bg-black/80 flex flex-col items-center justify-center p-6 text-center text-white">
          <Loader2 className="w-12 h-12 animate-spin mb-4 text-emerald-400" />
          <h3 className="text-xl font-bold mb-2">Processing Terminal Refund</h3>
          <p className="text-sm opacity-90 max-w-md bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/20">
            {cardStatusText || 'Communicating with GoDaddy Smart Terminal... Please wait.'}
          </p>
        </div>
      )}

      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border transition-all flex flex-col max-h-[90vh]"
        style={{
          backgroundColor: theme.card,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ backgroundColor: theme.header, borderColor: theme.border }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl text-white font-bold"
              style={{ backgroundColor: theme.primary }}
            >
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Split Payment Checkout</h3>
              <p className="text-xs opacity-75" style={{ color: theme.muted }}>
                Split order total across multiple tender methods
              </p>
            </div>
          </div>
          <button
            onClick={handleCancelSplitTransaction}
            className="p-2 rounded-lg hover:bg-black/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Order Summary Bar */}
          <div
            className="grid grid-cols-3 gap-3 p-4 rounded-xl border text-center"
            style={{ backgroundColor: theme.bg, borderColor: theme.border }}
          >
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider block opacity-75" style={{ color: theme.muted }}>
                Order Total
              </span>
              <span className="text-lg font-extrabold">${baseOrderTotal.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider block opacity-75" style={{ color: theme.muted }}>
                Paid Tender
              </span>
              <span className="text-lg font-extrabold text-emerald-500">${paidBaseSum.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider block opacity-75" style={{ color: theme.muted }}>
                Remaining
              </span>
              <span className={`text-lg font-extrabold ${remainingBaseBalance > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                ${remainingBaseBalance.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Applied Tenders List */}
          {appliedTenders.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-80" style={{ color: theme.muted }}>
                Applied Tenders ({appliedTenders.length})
              </h4>
              <div className="space-y-2">
                {appliedTenders.map((t, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl border text-sm font-medium"
                    style={{ backgroundColor: theme.input, borderColor: theme.border }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-500 font-bold flex items-center justify-center text-xs">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-2">
                          <span>{t.payment_method_name}</span>
                          {t.godaddy_trans_id && (
                            <span className="text-[10px] bg-blue-500/20 text-blue-400 font-bold px-1.5 py-0.5 rounded">
                              GoDaddy Verified
                            </span>
                          )}
                        </div>
                        {t.fee_amount > 0 && (
                          <p className="text-xs opacity-75 text-amber-500">
                            {t.fee_mode === 'on_top' ? `+ $${t.fee_amount.toFixed(2)} Surcharge` : `$${t.fee_amount.toFixed(2)} Merchant Fee`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-extrabold text-base">${t.amount_tendered.toFixed(2)}</span>
                      <button
                        onClick={() => handleRemoveTender(idx)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Remove Tender"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Next Tender Section */}
          {remainingBaseBalance > 0.001 && (
            <div className="p-4 rounded-xl border space-y-4" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
              <h4 className="text-xs font-bold uppercase tracking-wider opacity-80" style={{ color: theme.muted }}>
                Add Next Tender
              </h4>

              {/* Payment Method Selector Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {enabledMethods.map((m) => {
                  const isSelected = selectedMethodId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMethodId(m.id)}
                      className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex flex-col justify-between ${
                        isSelected ? 'shadow-md ring-2 ring-emerald-500/50' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: isSelected ? theme.input : theme.card,
                        borderColor: isSelected ? theme.primary : theme.border,
                        color: theme.text,
                      }}
                    >
                      <span className="truncate block mb-1">{m.name}</span>
                      <span className="text-[10px] font-semibold opacity-70">
                        {m.fee_percentage > 0 || m.fee_flat > 0
                          ? `${m.fee_percentage}% fee (${m.fee_mode === 'on_top' ? 'On-Top' : 'Absorbed'})`
                          : 'No fee'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Tender Amount Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label htmlFor="input-tender-amount" className="block text-xs font-semibold mb-1 opacity-90">Tender Amount ($)</label>
                  <input
                    id="input-tender-amount"
                    type="number"
                    step="0.01"
                    value={tenderAmountInput}
                    onChange={(e) => setTenderAmountInput(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border font-mono font-bold text-base focus:outline-none transition-all"
                    style={{
                      backgroundColor: theme.input,
                      borderColor: theme.border,
                      color: theme.text,
                    }}
                  />
                </div>

                {activeMethod.name.toLowerCase() === 'cash' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1 opacity-90">Cash Given (Change Calc)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 50.00"
                      value={cashTenderedInput}
                      onChange={(e) => setCashTenderedInput(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border font-mono font-bold text-base focus:outline-none transition-all"
                      style={{
                        backgroundColor: theme.input,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                    />
                    {changeDue > 0 && (
                      <p className="text-xs font-bold text-emerald-500 mt-1">
                        Change Due: ${changeDue.toFixed(2)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Add Tender Button */}
              <button
                type="button"
                onClick={handleAddTender}
                disabled={isProcessingCard}
                className="w-full py-3 rounded-xl font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
                style={{ backgroundColor: theme.primary }}
              >
                {isProcessingCard ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Card...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Add {activeMethod.name} Tender (${parseFloat(tenderAmountInput || '0').toFixed(2)})</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Surcharge Banner & Final Target Summary */}
          {totalSurchargeOnTop > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center justify-between">
              <span>Combined Surcharges (Applied On-Top):</span>
              <span className="font-extrabold text-sm">+${totalSurchargeOnTop.toFixed(2)}</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t flex items-center justify-between gap-3 shrink-0" style={{ borderColor: theme.border }}>
          <button
            type="button"
            onClick={handleCancelSplitTransaction}
            className="px-5 py-2.5 rounded-xl text-xs font-bold border text-red-500 hover:bg-red-500/10 transition-all flex items-center gap-1.5"
            style={{ borderColor: theme.border }}
          >
            <ShieldAlert className="w-4 h-4" /> Cancel & Refund
          </button>

          <button
            type="button"
            onClick={handleFinalize}
            disabled={remainingBaseBalance > 0.01}
            className="px-8 py-3 rounded-xl text-sm font-extrabold text-white shadow-xl flex items-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.primary }}
          >
            <Check className="w-4 h-4" />
            <span>Complete Split Sale (${finalCustomerTargetTotal.toFixed(2)})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
