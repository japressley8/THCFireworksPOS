/**
 * @file AdminView.tsx
 * @description The comprehensive Administrator Panel and Manager console for inventory auditing and data sync.
 *
 * Core Administrative Tabs:
 * 1. Inventory: Inline CRUD operations on catalogs, wholesale unit costs, and demo video attachments.
 * 2. Discounts & Taxes: Custom promo qualifier rule definitions and tax groupings.
 * 3. Sales Ledger: Reprint receipts, search and void historical invoices.
 * 4. Analytics: Side-by-side SVG graphic comparisons showing daily/yearly margins.
 * 5. Data Management: Google OAuth Client pairing, cloud database syncs, and CSV table imports with duplicate handling policies.
 * 6. Settings & Security: Receipts, device configurations, themes, password hashes, and recovery security questions.
 */

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as XLSX from 'xlsx';
import {
  Package,
  Tag,
  History,
  Trash2,
  Search,
  PlusCircle,
  AlertTriangle,
  Check,
  RefreshCw,
  Archive,
  Eye,
  Barcode,
  X,
  Copy,
  Download,
  FolderOpen,
  TrendingUp,
  Palette,
  Upload,
  Settings,
  Percent,
  Printer,
  ChevronDown,
  ChevronUp,
  CloudSync,
  Video,
  Database,
  Lock,
  Key,
  HelpCircle,
  CloudUpload,
  CloudDownload,
  ShieldCheck,
  Link,
  SquarePen,
  MonitorSmartphone,
  Wallet,
  CheckSquare,
  ShoppingCart,
  Sparkles
} from 'lucide-react';
import { Item, Discount, Sale, Theme, YearSummary, DaySummary, Tax, SaleItemDetail, PaymentMethod } from '../types';
import { getVersion } from '@tauri-apps/api/app';
import { getTheme } from './shared/colorUtils';
import { defaultConfirm, defaultAlert } from './shared/dialogUtils';

interface AdminViewProps {
  scannedBarcode: string;
  onClearScan: () => void;
  activeThemeId: string;
  themes: Theme[];
  onSelectTheme: (id: string) => void;
  onSaveCustomTheme: (theme: Theme) => void;
  onDeleteCustomTheme: (id: string) => void;
  lowStockThreshold: number;
  onThresholdChange: (val: number) => void;
  totalStockCostSpent: number;
  onTotalCostChange: (val: number) => void;
  onTriggerUpdateCheck: () => Promise<boolean>;
  onPlayShowcaseVideo?: (title: string, path: string) => void;
  isAdminUnlocked?: boolean;
  onLockAdmin?: () => void;
  onAdminPasswordConfigChanged?: () => void;
  customConfirm?: (message: string, title?: string, options?: { confirmText?: string; cancelText?: string; isDanger?: boolean }) => Promise<boolean>;
  customAlert?: (message: string, title?: string) => Promise<boolean>;
  subTab?: 'inventory' | 'discounts' | 'taxes' | 'sales' | 'analytics' | 'data' | 'settings' | 'devices' | 'payment_methods';
  onSubTabChange?: (tab: 'inventory' | 'discounts' | 'taxes' | 'sales' | 'analytics' | 'data' | 'settings' | 'devices' | 'payment_methods') => void;
}const generateCodeVerifier = (): string => {
  const array = new Uint8Array(64);
  window.crypto.getRandomValues(array);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let verifier = '';
  for (let i = 0; i < array.length; i++) {
    verifier += chars[array[i] % chars.length];
  }
  return verifier;
};

const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

export const AdminView: React.FC<AdminViewProps> = ({
  scannedBarcode,
  onClearScan,
  activeThemeId,
  themes,
  onSelectTheme,
  onSaveCustomTheme,
  onDeleteCustomTheme,
  lowStockThreshold,
  onThresholdChange,
  totalStockCostSpent,
  onTotalCostChange,
  onTriggerUpdateCheck,
  onPlayShowcaseVideo,
  isAdminUnlocked = true,
  onAdminPasswordConfigChanged,
  customConfirm,
  customAlert,
  subTab: controlledSubTab,
  onSubTabChange
}) => {
  const handleConfirm = async (message: string, title?: string, isDanger?: boolean): Promise<boolean> => {
    return (customConfirm || defaultConfirm)(message, title, { isDanger });
  };

  const handleAlert = async (message: string, title?: string): Promise<void> => {
    await (customAlert || defaultAlert)(message, title);
  };

  // Runtime app version (read from Tauri binary metadata, which is sourced from Cargo.toml)
  const [appVersion, setAppVersion] = useState<string>('...');

  // Active sub-tab
  const [localSubTab, setLocalSubTab] = useState<'inventory' | 'discounts' | 'taxes' | 'sales' | 'analytics' | 'data' | 'settings' | 'devices' | 'payment_methods'>('inventory');
  const subTab = controlledSubTab || localSubTab;
  const setSubTab = (tab: 'inventory' | 'discounts' | 'taxes' | 'sales' | 'analytics' | 'data' | 'settings' | 'devices' | 'payment_methods') => {
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else {
      setLocalSubTab(tab);
    }
  };

  // Admin Security panel states
  const [isPwdConfigured, setIsPwdConfigured] = useState<boolean>(false);
  const [showSecurityEditPanel, setShowSecurityEditPanel] = useState<boolean>(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState<string>('');
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [newPasswordConfirmInput, setNewPasswordConfirmInput] = useState<string>('');
  const [securityQuestionSelect, setSecurityQuestionSelect] = useState<string>('What was the name of your first pet?');
  const [securityQuestionCustom, setSecurityQuestionCustom] = useState<string>('');
  const [securityAnswerInput, setSecurityAnswerInput] = useState<string>('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState<string>('');
  const [showRecoveryKeyModal, setShowRecoveryKeyModal] = useState<boolean>(false);
  const [securityError, setSecurityError] = useState<string>('');
  const [securityNotice, setSecurityNotice] = useState<string>('');

  const [adminPasswordTimeout, setAdminPasswordTimeout] = useState<number>(5);
  const [activeSecurityQuestion, setActiveSecurityQuestion] = useState<string>('');

  // Changing Password authentication states
  const [verificationMethodChange, setVerificationMethodChange] = useState<'password' | 'question' | 'key'>('password');
  const [verificationAnswerInputChange, setVerificationAnswerInputChange] = useState<string>('');
  const [verificationKeyInputChange, setVerificationKeyInputChange] = useState<string>('');

  // Disabling Password authentication states
  const [verificationMethodDisable, setVerificationMethodDisable] = useState<'password' | 'question' | 'key'>('password');
  const [verificationAnswerInputDisable, setVerificationAnswerInputDisable] = useState<string>('');
  const [verificationKeyInputDisable, setVerificationKeyInputDisable] = useState<string>('');

  // Analytics states
  const [analyticsMode, setAnalyticsMode] = useState<'yearly' | 'daily'>('yearly');
  const [yearlySummaries, setYearlySummaries] = useState<YearSummary[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DaySummary[]>([]);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
  const [isEditingExpenses, setIsEditingExpenses] = useState<boolean>(false);
  const [expensesEditValue, setExpensesEditValue] = useState<string>('');
  const [selectedProfitYear, setSelectedProfitYear] = useState<string>('');

  // Custom theme creator form states
  const theme = getTheme();
  const [customThemeName, setCustomThemeName] = useState<string>('');
  const [customThemeBg, setCustomThemeBg] = useState<string>(theme.bg);
  const [customThemeCard, setCustomThemeCard] = useState<string>(theme.card);
  const [customThemeText, setCustomThemeText] = useState<string>(theme.text);
  const [customThemeMuted, setCustomThemeMuted] = useState<string>(theme.muted);
  const [customThemePrimary, setCustomThemePrimary] = useState<string>(theme.primary);
  const [customThemeAccent, setCustomThemeAccent] = useState<string>(theme.accent);
  const [customThemeBorder, setCustomThemeBorder] = useState<string>(theme.border);
  const [customThemeHeader, setCustomThemeHeader] = useState<string>('#0b1021');
  const [customThemeInput, setCustomThemeInput] = useState<string>('#05080e');

  // Database lists
  const [items, setItems] = useState<Item[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  // Search filter
  const [inventorySearch, setInventorySearch] = useState<string>('');

  // New Item Form State
  const [newItemBarcode, setNewItemBarcode] = useState<string>('');
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemPrice, setNewItemPrice] = useState<string>('');
  const [newItemStock, setNewItemStock] = useState<string>('');
  const [newItemNotes, setNewItemNotes] = useState<string>('');
  const [newItemBulkPrice, setNewItemBulkPrice] = useState<string>('');
  const [newItemBulkBarcode, setNewItemBulkBarcode] = useState<string>('');
  const [newItemBulkQuantity, setNewItemBulkQuantity] = useState<string>('');
  const [newItemVideoPath, setNewItemVideoPath] = useState<string>('');
  const [newItemDiscountTags, setNewItemDiscountTags] = useState<string>('');

  // Unified Discount Form States
  const [editingDiscountId, setEditingDiscountId] = useState<number | null>(null);
  const [discName, setDiscName] = useState<string>('');
  const [discQualifierType, setDiscQualifierType] = useState<'item_quantity' | 'order_total' | 'manual'>('manual');
  const [discQualifierValue, setDiscQualifierValue] = useState<string>('0');
  const [discRewardType, setDiscRewardType] = useState<'item_discount_qty' | 'item_discount_all' | 'lowest_cost_item' | 'items_for_price' | 'order_discount'>('order_discount');
  const [discRewardValue, setDiscRewardValue] = useState<string>('0');
  const [discRewardValueType, setDiscRewardValueType] = useState<'percentage' | 'fixed'>('percentage');
  const [discRewardQuantity, setDiscRewardQuantity] = useState<string>('0');
  const [discRewardTargetItemId, setDiscRewardTargetItemId] = useState<string>('');
  const [discRewardLowestCostLinkedItemId, setDiscRewardLowestCostLinkedItemId] = useState<string>('');
  const [discDiscountTag, setDiscDiscountTag] = useState<string>('');
  const [discMaxLimitPerOrder, setDiscMaxLimitPerOrder] = useState<string>('');
  const [discValueCap, setDiscValueCap] = useState<string>('');
  const [discIsStackable, setDiscIsStackable] = useState<number>(1);
  const [taggedItemIds, setTaggedItemIds] = useState<number[]>([]);



  // Editing state
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemBarcode, setEditItemBarcode] = useState<string>('');
  const [editItemName, setEditItemName] = useState<string>('');
  const [editItemStock, setEditItemStock] = useState<string>('');
  const [editItemPrice, setEditItemPrice] = useState<string>('');
  const [editItemNotes, setEditItemNotes] = useState<string>('');
  const [editItemBulkPrice, setEditItemBulkPrice] = useState<string>('');
  const [editItemBulkBarcode, setEditItemBulkBarcode] = useState<string>('');
  const [editItemBulkQuantity, setEditItemBulkQuantity] = useState<string>('');
  const [editItemTaxId, setEditItemTaxId] = useState<string>('');
  const [editItemVideoPath, setEditItemVideoPath] = useState<string>('');
  const [editItemDiscountTags, setEditItemDiscountTags] = useState<string>('');

  // Taxes states
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [editingTaxId, setEditingTaxId] = useState<number | null>(null);
  const [newTaxName, setNewTaxName] = useState<string>('');
  const [newTaxRate, setNewTaxRate] = useState<string>('');
  const [newTaxScope, setNewTaxScope] = useState<'total' | 'item'>('total');
  const [newItemTaxId, setNewItemTaxId] = useState<string>('');

  // Out of stock oversell state
  const [allowOversell, setAllowOversell] = useState<boolean>(false);
  const [autoPrintReceipts, setAutoPrintReceipts] = useState<boolean>(true);
  const [receiptColumnWidth, setReceiptColumnWidth] = useState<number>(32);
  const [receiptFontSize, setReceiptFontSize] = useState<number>(11);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<string>('58mm');

  // GoDaddy Terminal states
  const [godaddyEnabled, setGodaddyEnabled] = useState<boolean>(true);
  const [godaddyTerminalIp, setGodaddyTerminalIp] = useState<string>('mock');
  const [godaddyPairingStatus, setGodaddyPairingStatus] = useState<string>('unpaired');
  const [godaddyPairingToken, setGodaddyPairingToken] = useState<string>('');
  const [showGodaddyHelp, setShowGodaddyHelp] = useState<boolean>(false);
  const [showGodaddyPairModal, setShowGodaddyPairModal] = useState<boolean>(false);
  const [godaddyPairingCode, setGodaddyPairingCode] = useState<string>('');
  const [godaddyPingStatus, setGodaddyPingStatus] = useState<string | null>(null);
  const [isGodaddyPinging, setIsGodaddyPinging] = useState<boolean>(false);
  const [isGodaddyPairing, setIsGodaddyPairing] = useState<boolean>(false);

  // Discovery and test utility states
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);

  // Payment methods states
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [newPaymentName, setNewPaymentName] = useState<string>('');
  const [newPaymentFeePercentage, setNewPaymentFeePercentage] = useState<string>('');
  const [newPaymentFeeFlat, setNewPaymentFeeFlat] = useState<string>('');
  const [isCashChangeCalculatorEnabled, setIsCashChangeCalculatorEnabled] = useState<boolean>(false);
  const [godaddyConnected, setGodaddyConnected] = useState<boolean | null>(null);
  const [isCheckingGodaddyConnection, setIsCheckingGodaddyConnection] = useState<boolean>(false);
  const [showGoDaddyNotPairedModal, setShowGoDaddyNotPairedModal] = useState<boolean>(false);

  // Date range filters for Sales Ledger
  const [ledgerStartDate, setLedgerStartDate] = useState<string>('');
  const [ledgerEndDate, setLedgerEndDate] = useState<string>('');

  // Sorting state for Sales Ledger
  const [sortColumn, setSortColumn] = useState<keyof Sale | 'payment_method' | 'transaction_fee' | 'godaddy_transaction_id' | 'id'>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Manual logging states
  const [showManualSaleModal, setShowManualSaleModal] = useState<boolean>(false);
  const [manualSaleCart, setManualSaleCart] = useState<{ item: Item; quantity: number; isBulk: boolean }[]>([]);
  const [manualSaleSelectedItemId, setManualSaleSelectedItemId] = useState<string>('');
  const [manualSaleItemQty, setManualSaleItemQty] = useState<number>(1);
  const [manualSaleIsBulk, setManualSaleIsBulk] = useState<boolean>(false);
  const [manualSaleDiscountId, setManualSaleDiscountId] = useState<string>('');
  const [manualSaleTaxId, setManualSaleTaxId] = useState<string>('');
  const [manualSalePaymentMethod, setManualSalePaymentMethod] = useState<string>('Cash');
  const [manualSaleGoDaddyTxId, setManualSaleGoDaddyTxId] = useState<string>('');

  // Delete vs Refund modal states
  const [showDeleteOrRefundModal, setShowDeleteOrRefundModal] = useState<boolean>(false);
  const [selectedSaleForAction, setSelectedSaleForAction] = useState<Sale | null>(null);
  const [showRefundModal, setShowRefundModal] = useState<boolean>(false);
  const [isRestockInventory, setIsRestockInventory] = useState<boolean>(true);
  const [discoveredIps, setDiscoveredIps] = useState<string[]>([]);

  // Receipt reprint in sales ledger states
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [selectedReceiptSale, setSelectedReceiptSale] = useState<Sale | null>(null);

  // Sale deletion confirmation modal states
  const [showSaleDeleteModal, setShowSaleDeleteModal] = useState<boolean>(false);
  const [selectedDeleteSale, setSelectedDeleteSale] = useState<Sale | null>(null);

  // Sizing & Metric states
  const [yearlyChartMetric, setYearlyChartMetric] = useState<'revenue' | 'profit'>('revenue');
  const [showBulkOptions, setShowBulkOptions] = useState<boolean>(false);
  const [organizationName, setOrganizationName] = useState<string>('🎆 THC FIREWORKS 🎆');
  const [receiptMessage, setReceiptMessage] = useState<string>('');

  // Responsive panel collapse states
  const [isNewProductCollapsed, setIsNewProductCollapsed] = useState<boolean>(false);
  const [isCreateThemeCollapsed, setIsCreateThemeCollapsed] = useState<boolean>(false);

  // --- DATA MANAGEMENT TAB STATE ---
  const [dmExportTables, setDmExportTables] = useState<string[]>(['items', 'discounts', 'taxes', 'sales', 'sale_items', 'settings', 'item_price_history']);
  const [dmIsExporting, setDmIsExporting] = useState<boolean>(false);

  const [dmIsImporting, setDmIsImporting] = useState<boolean>(false);
  const [dmCloudStatus, setDmCloudStatus] = useState<{ is_connected: boolean; account_email: string | null; last_backup_at: string | null } | null>(null);
  const [dmCloudSyncFrequency, setDmCloudSyncFrequency] = useState<string>('30m');
  const [dmIsConnectingCloud, setDmIsConnectingCloud] = useState<boolean>(false);
  const [dmIsCloudBackingUp, setDmIsCloudBackingUp] = useState<boolean>(false);
  const [dmIsCloudRestoring, setDmIsCloudRestoring] = useState<boolean>(false);
  const [dmShowGoogleRestoreModal, setDmShowGoogleRestoreModal] = useState<boolean>(false);
  const [dmLocalBackupTime, setDmLocalBackupTime] = useState<string | null>(null);
  const [dmLocalBackupLimit, setDmLocalBackupLimit] = useState<number>(5);
  const [dmCloudBackupLimit, setDmCloudBackupLimit] = useState<number>(5);
  const [dmKeepDailyBackups, setDmKeepDailyBackups] = useState<boolean>(true);
  const [dmLocalBackupsList, setDmLocalBackupsList] = useState<any[]>([]);
  const [dmCloudBackupsList, setDmCloudBackupsList] = useState<any[]>([]);
  const [dmShowLocalRestoreModal, setDmShowLocalRestoreModal] = useState<boolean>(false);
  const [dmIsLoadingLocalBackups, setDmIsLoadingLocalBackups] = useState<boolean>(false);
  const [dmIsLoadingCloudBackups, setDmIsLoadingCloudBackups] = useState<boolean>(false);
  const [selectedLocalBackupPath, setSelectedLocalBackupPath] = useState<string>('');
  const [selectedCloudBackupId, setSelectedCloudBackupId] = useState<string>('');
  const [dmClearSelectedTables, setDmClearSelectedTables] = useState<string[]>([]);
  const [dmShowClearModal, setDmShowClearModal] = useState<boolean>(false);
  const [dmClearConfirmCode, setDmClearConfirmCode] = useState<string>('');
  const [dmClearInputText, setDmClearInputText] = useState<string>('');

  // Bulk linking states
  const [linkingBulkItem, setLinkingBulkItem] = useState<Item | null>(null);
  const [linkTargetSingleItemId, setLinkTargetSingleItemId] = useState<string>('');
  const [linkBulkQuantity, setLinkBulkQuantity] = useState<string>('12');
  const [linkSearchQuery, setLinkSearchQuery] = useState<string>('');

  // --- DEVICES SUB-TAB STATE ---
  const [systemPrinters, setSystemPrinters] = useState<string[]>([]);
  const [systemKeyboards, setSystemKeyboards] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('System Print Dialog (Default)');
  const [selectedPrintMode, setSelectedPrintMode] = useState<'dialog' | 'direct'>('dialog');
  const [isLoadingPrinters, setIsLoadingPrinters] = useState<boolean>(false);
  const [isLoadingKeyboards, setIsLoadingKeyboards] = useState<boolean>(false);
  const [isTestPrinting, setIsTestPrinting] = useState<boolean>(false);
  const [lastScanCode, setLastScanCode] = useState<string>('');
  const [activeFlashDevice, setActiveFlashDevice] = useState<'scanner' | 'keyboard' | null>(null);

  const fetchPrinters = async () => {
    setIsLoadingPrinters(true);
    try {
      const list = await invoke<string[]>('list_system_printers');
      setSystemPrinters(list);
    } catch (e) {
      console.error("Failed to fetch system printers", e);
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  const fetchKeyboards = async () => {
    setIsLoadingKeyboards(true);
    try {
      const list = await invoke<string[]>('list_system_keyboards');
      setSystemKeyboards(list);
    } catch (e) {
      console.error("Failed to fetch system keyboards", e);
    } finally {
      setIsLoadingKeyboards(false);
    }
  };

  const handlePrinterChange = (printer: string) => {
    setSelectedPrinter(printer);
    localStorage.setItem('selected_receipt_printer', printer);
    if (printer !== 'System Print Dialog (Default)') {
      setSelectedPrintMode('direct');
      localStorage.setItem('selected_print_mode', 'direct');
    } else {
      setSelectedPrintMode('dialog');
      localStorage.setItem('selected_print_mode', 'dialog');
    }
  };

  const handlePrintModeChange = (mode: 'dialog' | 'direct') => {
    setSelectedPrintMode(mode);
    localStorage.setItem('selected_print_mode', mode);
  };

  const getPresetId = () => {
    if (receiptFontSize === 9 && receiptColumnWidth === 26 && receiptPaperWidth === '58mm') return 'godaddy';
    if (receiptFontSize === 11 && receiptColumnWidth === 32 && receiptPaperWidth === '58mm') return '58mm';
    if (receiptFontSize === 12 && receiptColumnWidth === 40 && receiptPaperWidth === '80mm') return '80mm';
    return 'custom';
  };
  const activePresetId = getPresetId();

  const handlePresetChange = async (preset: string) => {
    let newSize = receiptFontSize;
    let newWidth = receiptColumnWidth;
    let newPaper = receiptPaperWidth;

    if (preset === 'godaddy') {
      newSize = 9;
      newWidth = 26;
      newPaper = '58mm';
    } else if (preset === '58mm') {
      newSize = 11;
      newWidth = 32;
      newPaper = '58mm';
    } else if (preset === '80mm') {
      newSize = 12;
      newWidth = 40;
      newPaper = '80mm';
    }

    setReceiptFontSize(newSize);
    setReceiptColumnWidth(newWidth);
    setReceiptPaperWidth(newPaper);

    try {
      await invoke('save_setting', { key: 'receipt_font_size', value: newSize.toString() });
      await invoke('save_setting', { key: 'receipt_column_width', value: newWidth.toString() });
      await invoke('save_setting', { key: 'receipt_paper_width', value: newPaper });
      triggerNotice(`Receipt preset updated to ${preset}`, 'success');
    } catch (err) {
      console.error('Failed to save preset settings:', err);
    }
  };

  const handleFontSizeChange = async (size: number) => {
    setReceiptFontSize(size);
    try {
      await invoke('save_setting', { key: 'receipt_font_size', value: size.toString() });
    } catch (err) {
      console.error('Failed to save receipt_font_size:', err);
    }
  };

  const handleColumnWidthChange = async (width: number) => {
    setReceiptColumnWidth(width);
    try {
      await invoke('save_setting', { key: 'receipt_column_width', value: width.toString() });
    } catch (err) {
      console.error('Failed to save receipt_column_width:', err);
    }
  };

  const handlePaperWidthChange = async (paper: '58mm' | '80mm') => {
    setReceiptPaperWidth(paper);
    try {
      await invoke('save_setting', { key: 'receipt_paper_width', value: paper });
    } catch (err) {
      console.error('Failed to save receipt_paper_width:', err);
    }
  };

  const handleTestPrint = async () => {
    const isGoDaddyConnected = godaddyEnabled && godaddyTerminalIp;
    const useGoDaddyPrinter = isGoDaddyConnected && (selectedPrinter === 'GoDaddy Smart Terminal Printer' || selectedPrinter === 'System Print Dialog (Default)');

    // GoDaddy Smart Terminal printer has a physical constraint of 26 characters.
    // If printing via GoDaddy, use a test page formatted exactly for 26 columns.
    const testText = useGoDaddyPrinter
      ? `==========================\n   THC FIREWORKS TEST PAGE\n==========================\nDate: ${new Date().toLocaleString()}\nDevice: GoDaddy Terminal\nStatus: Success\n==========================\n\n\n`
      : `================================\n   THC FIREWORKS TEST PAGE\n================================\nDate: ${new Date().toLocaleString()}\nDevice: ${selectedPrinter}\nMode: Direct Print (PowerShell)\nStatus: Success\n================================\n\n\n`;

    if (useGoDaddyPrinter) {
      setIsTestPrinting(true);
      try {
        await invoke('godaddy_print_receipt', {
          ip: godaddyTerminalIp,
          token: godaddyPairingToken,
          receiptText: testText
        });
        triggerNotice("Test page sent successfully to GoDaddy Terminal!", "success");
      } catch (err) {
        triggerNotice(`Test print failed: ${err}`, "error");
      } finally {
        setIsTestPrinting(false);
      }
    } else if (selectedPrinter === 'System Print Dialog (Default)' || selectedPrintMode === 'dialog') {
      triggerNotice("Opening system print dialog for test page...", "success");
      window.print();
    } else {
      setIsTestPrinting(true);
      try {
        const ok = await invoke<boolean>('print_to_named_printer', {
          printerName: selectedPrinter,
          text: testText
        });
        if (ok) {
          triggerNotice(`Test page sent successfully to ${selectedPrinter}!`, "success");
        } else {
          triggerNotice(`Test print failed to send.`, "error");
        }
      } catch (err) {
        triggerNotice(`Test print failed: ${err}`, "error");
      } finally {
        setIsTestPrinting(false);
      }
    }
  };

  // Load runtime app version from Tauri binary metadata (always matches Cargo.toml)
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('unknown'));
  }, []);

  // Load printer configuration on mount
  useEffect(() => {
    const savedPrinter = localStorage.getItem('selected_receipt_printer');
    if (savedPrinter) setSelectedPrinter(savedPrinter);

    const savedMode = localStorage.getItem('selected_print_mode');
    if (savedMode === 'dialog' || savedMode === 'direct') {
      setSelectedPrintMode(savedMode);
    }
  }, []);

  // Fetch devices when Devices sub-tab becomes active
  useEffect(() => {
    if (subTab === 'devices') {
      fetchPrinters();
      fetchKeyboards();
      checkGodaddyConnection();
    }
  }, [subTab]);

  // Listen for global scanner scans routed via scannedBarcode prop
  useEffect(() => {
    if (scannedBarcode && subTab === 'devices') {
      setLastScanCode(scannedBarcode);
      setActiveFlashDevice('scanner');
      onClearScan();
      const t = setTimeout(() => setActiveFlashDevice(null), 1500);
      return () => clearTimeout(t);
    }
    return;
  }, [scannedBarcode, subTab, onClearScan]);

  // Listen for slow standard keyboard typing
  useEffect(() => {
    if (subTab !== 'devices') return;

    let flashTimeout: any = null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;

      setActiveFlashDevice('keyboard');
      if (flashTimeout) clearTimeout(flashTimeout);
      flashTimeout = setTimeout(() => setActiveFlashDevice(null), 1000);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (flashTimeout) clearTimeout(flashTimeout);
    };
  }, [subTab]);

  // --- NEW SPREADSHEET MAPPING & INVALID ITEMS STATES ---
  const [dmTab, setDmTab] = useState<'backup_restore' | 'data_migration' | 'danger_zone'>('backup_restore');
  const [dmExportFormat, setDmExportFormat] = useState<'xlsx' | 'csv' | 'db'>('xlsx');

  interface ImportSheet {
    name: string;
    targetTable: string;
    headers: string[];
    rows: any[][];
    mappings: Record<string, string>; // maps db field to sheet header
    isCustomMapping: boolean;
    isExpanded: boolean;
    duplicatePolicy: 'skip' | 'overwrite';
    errorCount: number;
    validCount: number;
  }

  interface ImportFile {
    id: string;
    name: string;
    path: string;
    type: 'csv' | 'xlsx';
    sheets: ImportSheet[];
  }

  const [dmImportFiles, setDmImportFiles] = useState<ImportFile[]>([]);

  // --- SPREADSHEET UTILITIES & CONVERTERS ---
  const cleanNumericString = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[$\s,]/g, '');
  };

  const getDbFieldsForTable = (table: string): { field: string; label: string; req: boolean }[] => {
    switch (table) {
      case 'items':
        return [
          { field: 'barcode', label: 'Barcode', req: true },
          { field: 'name', label: 'Product Name', req: true },
          { field: 'price', label: 'Retail Price', req: true },
          { field: 'unit_cost', label: 'Unit Wholesale Cost', req: false },
          { field: 'stock_quantity', label: 'Stock Quantity', req: false },
          { field: 'notes', label: 'Manager Notes', req: false },
          { field: 'bulk_price', label: 'Bulk Wholesale Price', req: false },
          { field: 'bulk_barcode', label: 'Bulk Case Barcode', req: false },
          { field: 'bulk_quantity', label: 'Case Unit Count', req: false },
          { field: 'tax_id', label: 'Tax Preset Link ID', req: false },
          { field: 'video_path', label: 'Showcase Video Link', req: false },
        ];
      case 'discounts':
        return [
          { field: 'name', label: 'Discount Name', req: true },
          { field: 'type', label: 'Discount Type (percentage/fixed)', req: true },
          { field: 'value', label: 'Discount Value', req: true },
        ];
      case 'taxes':
        return [
          { field: 'name', label: 'Tax Name', req: true },
          { field: 'rate', label: 'Tax Rate (%)', req: true },
          { field: 'scope', label: 'Tax Scope (total/item)', req: true },
        ];
      case 'sales':
        return [
          { field: 'id', label: 'Sale ID', req: true },
          { field: 'timestamp', label: 'Timestamp (YYYY-MM-DD...)', req: true },
          { field: 'subtotal', label: 'Subtotal Amount', req: true },
          { field: 'discount_total', label: 'Discount Total', req: true },
          { field: 'tax_total', label: 'Tax Total', req: true },
          { field: 'final_total', label: 'Grand Total Amount', req: true },
        ];
      case 'sale_items':
        return [
          { field: 'id', label: 'Sale Item ID', req: true },
          { field: 'sale_id', label: 'Sale ID', req: true },
          { field: 'item_id', label: 'Item ID', req: true },
          { field: 'quantity', label: 'Quantity Sold', req: true },
          { field: 'price_at_sale', label: 'Price At Sale', req: true },
          { field: 'is_bulk', label: 'Is Bulk (0/1)', req: true },
        ];
      case 'settings':
        return [
          { field: 'key', label: 'Settings Key', req: true },
          { field: 'value', label: 'Settings Value', req: true },
        ];
      case 'item_price_history':
        return [
          { field: 'item_id', label: 'Item ID', req: true },
          { field: 'year', label: 'Year', req: true },
          { field: 'price', label: 'Price', req: true },
        ];
      default:
        return [];
    }
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const base64ToUint8Array = (base64: string): Uint8Array => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const getHeadersForTable = (table: string): string[] => {
    switch (table) {
      case 'items':
        return ['id', 'barcode', 'name', 'price', 'stock_quantity', 'notes', 'bulk_price', 'bulk_barcode', 'bulk_quantity', 'unit_cost', 'tax_id', 'video_path', 'is_invalid', 'missing_fields'];
      case 'discounts':
        return ['id', 'name', 'type', 'value'];
      case 'taxes':
        return ['id', 'name', 'rate', 'scope'];
      case 'sales':
        return ['id', 'timestamp', 'subtotal', 'discount_total', 'tax_total', 'final_total'];
      case 'sale_items':
        return ['id', 'sale_id', 'item_id', 'quantity', 'price_at_sale', 'is_bulk'];
      case 'settings':
        return ['key', 'value'];
      case 'item_price_history':
        return ['id', 'item_id', 'year', 'price'];
      default:
        return [];
    }
  };

  // Helper to extract values by mapped db field
  const getMappedValue = (row: any[], headers: string[], mappings: Record<string, string>, field: string): string => {
    const headerName = mappings[field];
    if (!headerName) return '';
    const idx = headers.indexOf(headerName);
    if (idx === -1) return '';
    const val = row[idx];
    return val !== undefined && val !== null ? String(val).trim() : '';
  };

  // Row validation checking required fields by table
  const validateImportRow = (row: any[], headers: string[], mappings: Record<string, string>, targetTable: string): { isValid: boolean; missingFields: string[] } => {
    const missing: string[] = [];

    const dbFields = getDbFieldsForTable(targetTable);
    dbFields.forEach(item => {
      if (item.req) {
        if (mappings[item.field]) {
          const val = getMappedValue(row, headers, mappings, item.field);
          if (!val) {
            missing.push(item.field);
          } else {
            // Field-specific validation
            if (targetTable === 'items') {
              if (item.field === 'price') {
                const cleaned = cleanNumericString(val);
                const price = parseFloat(cleaned);
                if (isNaN(price) || price < 0) missing.push('price (must be non-negative)');
              }
            } else if (targetTable === 'discounts') {
              if (item.field === 'value') {
                const cleaned = cleanNumericString(val);
                const value = parseFloat(cleaned);
                if (isNaN(value) || value < 0) missing.push('value (must be non-negative)');
              }
            } else if (targetTable === 'taxes') {
              if (item.field === 'rate') {
                const cleaned = cleanNumericString(val);
                const rate = parseFloat(cleaned);
                if (isNaN(rate) || rate < 0) missing.push('rate (must be non-negative)');
              }
            } else if (targetTable === 'sales') {
              if (['subtotal', 'discount_total', 'tax_total', 'final_total'].includes(item.field)) {
                const cleaned = cleanNumericString(val);
                const amt = parseFloat(cleaned);
                if (isNaN(amt) || amt < 0) missing.push(`${item.field} (must be non-negative)`);
              }
            } else if (targetTable === 'sale_items') {
              if (['quantity', 'is_bulk'].includes(item.field)) {
                const cleaned = cleanNumericString(val);
                const intVal = parseInt(cleaned, 10);
                if (isNaN(intVal)) missing.push(`${item.field} (must be integer)`);
              } else if (item.field === 'price_at_sale') {
                const cleaned = cleanNumericString(val);
                const price = parseFloat(cleaned);
                if (isNaN(price) || price < 0) missing.push('price_at_sale (must be non-negative)');
              }
            } else if (targetTable === 'item_price_history') {
              if (item.field === 'price') {
                const cleaned = cleanNumericString(val);
                const price = parseFloat(cleaned);
                if (isNaN(price) || price < 0) missing.push('price (must be non-negative)');
              }
            }
          }
        }
      } else {
        if (mappings[item.field]) {
          const val = getMappedValue(row, headers, mappings, item.field);
          if (val) {
            if (targetTable === 'items') {
              if (item.field === 'unit_cost') {
                const cleaned = cleanNumericString(val);
                const cost = parseFloat(cleaned);
                if (isNaN(cost) || cost < 0) missing.push('unit_cost (must be non-negative)');
              } else if (item.field === 'bulk_price') {
                const cleaned = cleanNumericString(val);
                const price = parseFloat(cleaned);
                if (isNaN(price) || price < 0) missing.push('bulk_price (must be non-negative)');
              } else if (['stock_quantity', 'bulk_quantity', 'tax_id'].includes(item.field)) {
                const cleaned = cleanNumericString(val);
                const intVal = parseInt(cleaned, 10);
                if (isNaN(intVal)) missing.push(`${item.field} (must be integer)`);
              }
            }
          }
        }
      }
    });

    return {
      isValid: missing.length === 0,
      missingFields: missing
    };
  };

  const isMappingComplete = (mappings: Record<string, string>, targetTable: string): boolean => {
    const dbFields = getDbFieldsForTable(targetTable);
    const requiredFields = dbFields.filter(f => f.req).map(f => f.field);
    return requiredFields.every(field => !!mappings[field]);
  };

  // Pick and read import file (XLSX / CSV)
  const handleChooseImportFiles = async () => {
    try {
      const path = await invoke<string | null>('pick_import_file', {
        filterName: 'Spreadsheet or CSV Files',
        filterExt: 'xlsx;*.xls;*.csv'
      });
      if (!path) return;

      const base64Data = await invoke<string>('read_binary_file', { path });
      const bytes = base64ToUint8Array(base64Data);
      const workbook = XLSX.read(bytes, { type: 'array' });

      const parsedSheets: ImportSheet[] = workbook.SheetNames.map(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        // Read cells, default to empty string
        const aoa = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
        if (aoa.length === 0) return null;

        const headers = aoa[0].map(h => String(h).trim()).filter(Boolean);
        const rows = aoa.slice(1);

        // Determine target table mapping
        const tableWhitelist = ['items', 'discounts', 'taxes', 'sales', 'sale_items', 'settings', 'item_price_history'];
        let targetTable = sheetName.toLowerCase();
        const matchedWhitelistTable = tableWhitelist.find(t =>
          targetTable === t || targetTable.startsWith(t + '_') || targetTable.startsWith(t + ' ')
        );
        if (matchedWhitelistTable) {
          targetTable = matchedWhitelistTable;
        } else {
          if (headers.some(h => ['barcode', 'name', 'price'].includes(h.toLowerCase()))) {
            targetTable = 'items';
          } else {
            targetTable = 'items';
          }
        }

        // Pre-mapping logic
        const mappings: Record<string, string> = {};
        const dbFields = getDbFieldsForTable(targetTable);
        const dbColumns = dbFields.map(f => f.field);
        let matchedCount = 0;

        dbColumns.forEach(col => {
          const matchedHeader = headers.find(h =>
            h.toLowerCase() === col.toLowerCase() ||
            h.toLowerCase().replace(/_/g, ' ') === col.toLowerCase().replace(/_/g, ' ')
          );
          if (matchedHeader) {
            mappings[col] = matchedHeader;
            matchedCount++;
          }
        });

        // Determine if it needs mapping adjustment (if headers matched are low)
        const isCustomMapping = matchedCount < dbFields.filter(f => f.req).length;

        // Calculate initial stats
        let errors = 0;
        let valids = 0;
        rows.forEach(r => {
          if (r.length === 0 || r.every((c: any) => c === '')) return;
          const { isValid } = validateImportRow(r, headers, mappings, targetTable);
          if (isValid) valids++;
          else errors++;
        });

        return {
          name: sheetName,
          targetTable,
          headers,
          rows,
          mappings,
          isCustomMapping,
          isExpanded: true,
          duplicatePolicy: 'skip',
          errorCount: errors,
          validCount: valids
        };
      }).filter((s): s is ImportSheet => s !== null);

      if (parsedSheets.length === 0) {
        triggerNotice('No importable sheet data found in this file.', 'error');
        return;
      }

      const fileName = path.split(/[\\/]/).pop() || path;
      const fileId = Math.random().toString(36).substring(2, 9);
      const isXlsx = fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls');

      const newFile: ImportFile = {
        id: fileId,
        name: fileName,
        path,
        type: isXlsx ? 'xlsx' : 'csv',
        sheets: parsedSheets
      };

      setDmImportFiles(prev => [...prev, newFile]);
      triggerNotice(`Successfully parsed file "${fileName}" with ${parsedSheets.length} sheets`, 'success');
    } catch (err) {
      triggerNotice('Failed to read file: ' + err, 'error');
    }
  };

  const handleRemoveImportFile = (id: string) => {
    setDmImportFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleUpdateSheetStats = (fileId: string, sheetName: string, headers: string[], rows: any[][], mappings: Record<string, string>, targetTable: string) => {
    let errors = 0;
    let valids = 0;
    rows.forEach(r => {
      if (r.length === 0 || r.every((c: any) => c === '')) return;
      const { isValid } = validateImportRow(r, headers, mappings, targetTable);
      if (isValid) valids++;
      else errors++;
    });

    setDmImportFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      return {
        ...f,
        sheets: f.sheets.map(s => {
          if (s.name !== sheetName) return s;
          return { ...s, errorCount: errors, validCount: valids };
        })
      };
    }));
  };

  const handleMapColumnHeader = (fileId: string, sheetName: string, headerName: string, dbField: string) => {
    setDmImportFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      return {
        ...f,
        sheets: f.sheets.map(s => {
          if (s.name !== sheetName) return s;
          const updatedMappings = { ...s.mappings };

          // 1. Remove any existing mapping for this headerName
          Object.keys(updatedMappings).forEach(key => {
            if (updatedMappings[key] === headerName) {
              delete updatedMappings[key];
            }
          });

          // 2. If a new dbField is selected, map it to headerName
          if (dbField !== '') {
            // Remove dbField from any other header to prevent multiple columns mapping to the same field
            Object.keys(updatedMappings).forEach(key => {
              if (key === dbField) {
                delete updatedMappings[key];
              }
            });
            updatedMappings[dbField] = headerName;
          }

          // recalculate stats immediately
          setTimeout(() => handleUpdateSheetStats(fileId, sheetName, s.headers, s.rows, updatedMappings, s.targetTable), 0);
          return { ...s, mappings: updatedMappings };
        })
      };
    }));
  };

  const handleEditCell = (fileId: string, sheetName: string, rowIndex: number, colIndex: number, newValue: any) => {
    setDmImportFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      return {
        ...f,
        sheets: f.sheets.map(s => {
          if (s.name !== sheetName) return s;
          const updatedRows = s.rows.map((r, rIdx) => {
            if (rIdx !== rowIndex) return r;
            const updatedRow = [...r];
            updatedRow[colIndex] = newValue;
            return updatedRow;
          });
          setTimeout(() => handleUpdateSheetStats(fileId, sheetName, s.headers, updatedRows, s.mappings, s.targetTable), 0);
          return { ...s, rows: updatedRows };
        })
      };
    }));
  };

  const handleToggleExpandSheet = (fileId: string, sheetName: string) => {
    setDmImportFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      return {
        ...f,
        sheets: f.sheets.map(s => {
          if (s.name !== sheetName) return s;
          return { ...s, isExpanded: !s.isExpanded };
        })
      };
    }));
  };



  const handleUpdateDuplicatePolicy = (fileId: string, sheetName: string, policy: 'skip' | 'overwrite') => {
    setDmImportFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      return {
        ...f,
        sheets: f.sheets.map(s => {
          if (s.name !== sheetName) return s;
          return { ...s, duplicatePolicy: policy };
        })
      };
    }));
  };

  const handleCommitSheetImport = async (fileId: string, sheetName: string) => {
    const file = dmImportFiles.find(f => f.id === fileId);
    if (!file) return;
    const sheet = file.sheets.find(s => s.name === sheetName);
    if (!sheet) return;

    const targetTable = sheet.targetTable;

    setDmIsImporting(true);
    try {
      // Map rows to objects
      const mappedRows: any[] = [];

      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        if (row.length === 0 || row.every(c => c === '')) continue;

        const obj: Record<string, any> = {};

        // Extract values using mappings
        Object.keys(sheet.mappings).forEach(dbField => {
          const headerName = sheet.mappings[dbField];
          const colIdx = sheet.headers.indexOf(headerName);
          if (colIdx !== -1) {
            let val = row[colIdx];
            if (val !== undefined && val !== null) {
              if (typeof val === 'string') val = val.trim();
              obj[dbField] = val;
            }
          }
        });

        const { isValid, missingFields } = validateImportRow(row, sheet.headers, sheet.mappings, targetTable);

        // If target is items, apply validation & missing barcodes generation
        if (targetTable === 'items') {
          obj.is_invalid = !isValid;
          obj.missing_fields = isValid ? null : missingFields.join(', ');

          // If barcode is missing, auto-generate one
          if (!obj.barcode || obj.barcode === '') {
            const uuid = Math.random().toString(36).substring(2, 7).toUpperCase();
            obj.barcode = `INVALID-TEMP-${Date.now()}-${uuid}`;
          }
        }

        // Clean & convert all fields dynamically based on targetTable fields
        const dbFields = getDbFieldsForTable(targetTable);
        dbFields.forEach(dbFieldInfo => {
          const val = obj[dbFieldInfo.field];
          if (val !== undefined && val !== null && val !== '') {
            const isNumeric = ['price', 'unit_cost', 'bulk_price', 'value', 'rate', 'subtotal', 'discount_total', 'tax_total', 'final_total', 'price_at_sale'].includes(dbFieldInfo.field);
            const isInteger = ['stock_quantity', 'bulk_quantity', 'tax_id', 'quantity', 'is_bulk', 'item_id', 'sale_id'].includes(dbFieldInfo.field);

            if (isNumeric) {
              obj[dbFieldInfo.field] = parseFloat(cleanNumericString(val)) || 0.0;
            } else if (isInteger) {
              obj[dbFieldInfo.field] = parseInt(cleanNumericString(val), 10) || 0;
            }
          } else {
            if (dbFieldInfo.field === 'id') {
              delete obj.id;
            } else {
              obj[dbFieldInfo.field] = null;
            }
          }
        });

        mappedRows.push(obj);
      }

      if (mappedRows.length === 0) {
        triggerNotice('No rows to import.', 'error');
        setDmIsImporting(false);
        return;
      }

      // Call batch import
      let result;
      if (targetTable === 'items') {
        result = await invoke<{ imported: number; skipped: number; errors: string[] }>('import_items_batch', {
          items: mappedRows,
          duplicatePolicy: sheet.duplicatePolicy
        });
      } else {
        result = await invoke<{ imported: number; skipped: number; errors: string[] }>('import_table_rows_batch', {
          tableName: targetTable,
          rows: mappedRows,
          duplicatePolicy: sheet.duplicatePolicy
        });
      }

      triggerNotice(`Successfully imported sheet "${sheetName}": ${result.imported} imported, ${result.skipped} skipped`, 'success');
      if (result.errors && result.errors.length > 0) {
        console.error('Warnings during import:', result.errors);
        triggerNotice(`Imported with ${result.errors.length} warnings. See console.`, 'error');
      }

      // Remove this sheet from imported files list
      setDmImportFiles(prev => prev.map(f => {
        if (f.id !== fileId) return f;
        return {
          ...f,
          sheets: f.sheets.filter(s => s.name !== sheetName)
        };
      }).filter(f => f.sheets.length > 0));

      // Reload databases
      loadInventory();
      loadDiscounts();
      loadTaxes();
    } catch (err) {
      triggerNotice('Failed to commit import: ' + err, 'error');
    } finally {
      setDmIsImporting(false);
    }
  };

  const handleXlsxExport = async () => {
    if (dmExportTables.length === 0) return;
    setDmIsExporting(true);
    try {
      const defaultName = `THC_Backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const savePath = await invoke<string | null>('pick_save_file', {
        defaultName,
        filterName: 'Excel Spreadsheet',
        filterExt: 'xlsx'
      });
      if (!savePath) {
        setDmIsExporting(false);
        return;
      }

      const wb = XLSX.utils.book_new();

      for (const table of dmExportTables) {
        const rows = await invoke<any[]>('get_table_rows', { table });

        let ws;
        if (rows.length === 0) {
          const headers = getHeadersForTable(table);
          ws = XLSX.utils.aoa_to_sheet([headers]);
        } else {
          ws = XLSX.utils.json_to_sheet(rows);
        }
        XLSX.utils.book_append_sheet(wb, ws, table);
      }

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const base64Data = arrayBufferToBase64(wbout);

      await invoke('write_binary_file', { path: savePath, base64Data });
      triggerNotice(`Successfully exported all selected tables to Excel: ${savePath}`, 'success');
      loadTableRowCounts();
    } catch (err) {
      triggerNotice('Export failed: ' + err, 'error');
    } finally {
      setDmIsExporting(false);
    }
  };

  const handleDbFileExport = async () => {
    setDmIsExporting(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const defaultName = `thc_fireworks_pos_backup_${dateStr}.db`;
      const savePath = await invoke<string | null>('pick_save_file', {
        defaultName,
        filterName: 'SQLite Database (*.db)',
        filterExt: 'db'
      });
      if (!savePath) return;

      await invoke('export_database_file', { destPath: savePath });
      triggerNotice(`Successfully exported entire database file: ${savePath}`, 'success');
    } catch (err) {
      triggerNotice('Export failed: ' + err, 'error');
    } finally {
      setDmIsExporting(false);
    }
  };

  const handleDbFileImport = async () => {
    if (await handleConfirm(
      "Are you sure you want to restore the database from a local backup file? This will completely overwrite your current database.",
      "Restore Database Backup",
      true
    )) {
      try {
        const path = await invoke<string | null>('pick_import_file', {
          filterName: 'SQLite Database (*.db)',
          filterExt: 'db'
        });
        if (!path) return;

        await invoke('import_database_file', { srcPath: path });
        triggerNotice("Database successfully restored. Reloading application data...", "success");
        // Reload all data
        loadInventory();
        loadDiscounts();
        loadSales();
        loadTaxes();
        loadTableRowCounts();
      } catch (err) {
        triggerNotice("Restore failed: " + err, "error");
      }
    }
  };


  // Initialize collapse states based on screen size on mount
  useEffect(() => {
    const isSkinny = import.meta.env.MODE !== 'test' && window.innerWidth < 1280;
    setIsNewProductCollapsed(isSkinny);
    setIsCreateThemeCollapsed(isSkinny);
  }, []);

  const [tableRowCounts, setTableRowCounts] = useState<Record<string, number>>({});

  const loadTableRowCounts = async () => {
    try {
      const counts: Record<string, number> = {};
      for (const table of ['items', 'discounts', 'taxes', 'sales', 'settings', 'item_price_history']) {
        const rows = await invoke<any[]>('get_table_rows', { table });
        counts[table] = rows.length;
      }
      const saleItems = await invoke<any[]>('get_table_rows', { table: 'sale_items' });
      counts['sale_items'] = saleItems.length;
      setTableRowCounts(counts);
    } catch (err) {
      console.error("Failed to load table row counts:", err);
    }
  };

  const loadCloudBackupStatus = async () => {
    try {
      const status = await invoke<{ is_connected: boolean; account_email: string | null; last_backup_at: string | null }>('get_cloud_backup_status');
      setDmCloudStatus(status);
      const freq = await invoke<string | null>('get_setting', { key: 'cloud_sync_frequency' });
      setDmCloudSyncFrequency(freq || '30m');
      const cloudLimit = await invoke<string | null>('get_setting', { key: 'cloud_backup_limit' });
      if (cloudLimit) {
        setDmCloudBackupLimit(Math.max(2, Math.min(10, parseInt(cloudLimit) || 5)));
      }
    } catch (err) {
      console.error('Failed to load cloud backup status:', err);
    }
  };

  const handleUpdateCloudSyncFrequency = async (val: string) => {
    setDmCloudSyncFrequency(val);
    try {
      await invoke('save_setting', { key: 'cloud_sync_frequency', value: val });
      triggerNotice('Cloud sync frequency updated', 'success');
    } catch (err) {
      triggerNotice('Failed to update frequency: ' + err, 'error');
    }
  };

  const loadLocalBackupTime = async () => {
    try {
      const info = await invoke<{ restored: boolean; restored_at: string | null; local_backup_last_updated: string | null }>('get_backup_restore_info');
      setDmLocalBackupTime(info.local_backup_last_updated);
      const localLimit = await invoke<string | null>('get_setting', { key: 'local_backup_limit' });
      if (localLimit) {
        setDmLocalBackupLimit(Math.max(2, Math.min(10, parseInt(localLimit) || 5)));
      }
      const keepDaily = await invoke<string | null>('get_setting', { key: 'keep_daily_backups_5_days' });
      setDmKeepDailyBackups(keepDaily === null ? true : keepDaily === 'true');
    } catch (err) {
      console.error('Failed to load local backup settings/time:', err);
    }
  };

  const handleUpdateLocalBackupLimit = async (val: number) => {
    setDmLocalBackupLimit(val);
    try {
      await invoke('save_setting', { key: 'local_backup_limit', value: val.toString() });
      triggerNotice('Local backup limit updated', 'success');
    } catch (err) {
      triggerNotice('Failed to update limit: ' + err, 'error');
    }
  };

  const handleUpdateCloudBackupLimit = async (val: number) => {
    setDmCloudBackupLimit(val);
    try {
      await invoke('save_setting', { key: 'cloud_backup_limit', value: val.toString() });
      triggerNotice('Cloud backup limit updated', 'success');
    } catch (err) {
      triggerNotice('Failed to update limit: ' + err, 'error');
    }
  };

  const handleUpdateKeepDailyBackups = async (val: boolean) => {
    setDmKeepDailyBackups(val);
    try {
      await invoke('save_setting', { key: 'keep_daily_backups_5_days', value: val.toString() });
      triggerNotice('Daily backup policy updated', 'success');
    } catch (err) {
      triggerNotice('Failed to update policy: ' + err, 'error');
    }
  };

  const loadLocalBackupsList = async () => {
    setDmIsLoadingLocalBackups(true);
    try {
      const list = await invoke<any[]>('list_local_backups');
      setDmLocalBackupsList(list);
      if (list.length > 0) {
        setSelectedLocalBackupPath(list[0].path);
      }
    } catch (err) {
      triggerNotice('Failed to load local backups: ' + err, 'error');
    } finally {
      setDmIsLoadingLocalBackups(false);
    }
  };

  const loadCloudBackupsList = async () => {
    setDmIsLoadingCloudBackups(true);
    try {
      const list = await invoke<any[]>('list_cloud_backups');
      setDmCloudBackupsList(list);
      if (list.length > 0) {
        setSelectedCloudBackupId(list[0].path);
      }
    } catch (err) {
      triggerNotice('Failed to load cloud backups: ' + err, 'error');
    } finally {
      setDmIsLoadingCloudBackups(false);
    }
  };

  useEffect(() => {
    if (isAdminUnlocked && subTab === 'data') {
      loadCloudBackupStatus();
      loadLocalBackupTime();
      loadTableRowCounts();
    }
  }, [subTab, isAdminUnlocked]);

  const hashStringAdmin = async (input: string): Promise<string> => {
    const msgBuffer = new TextEncoder().encode(input);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const generateRecoveryKey = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) {
        key += '-';
      }
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const checkSecurityConfig = async () => {
    try {
      const val = await invoke<string | null>('get_setting', { key: 'admin_password_hash' });
      setIsPwdConfigured(!!val && val.trim() !== '');

      const q = await invoke<string | null>('get_setting', { key: 'admin_security_question' });
      setActiveSecurityQuestion(q || '');

      const timeoutVal = await invoke<string | null>('get_setting', { key: 'admin_password_timeout' });
      if (timeoutVal) {
        setAdminPasswordTimeout(parseInt(timeoutVal, 10));
      } else {
        setAdminPasswordTimeout(5);
      }
    } catch (e) {
      console.error('Failed to load password setting', e);
    }
  };

  useEffect(() => {
    if (subTab === 'settings') {
      checkSecurityConfig();
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setNewPasswordConfirmInput('');
      setSecurityAnswerInput('');
      setSecurityQuestionCustom('');
      setSecurityError('');
      setSecurityNotice('');

      setVerificationMethodChange('password');
      setVerificationAnswerInputChange('');
      setVerificationKeyInputChange('');
      setVerificationMethodDisable('password');
      setVerificationAnswerInputDisable('');
      setVerificationKeyInputDisable('');
    }
  }, [subTab]);

  const handleEnableSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError('');
    setSecurityNotice('');

    if (!newPasswordInput || !newPasswordConfirmInput) {
      setSecurityError('All password fields are required.');
      return;
    }
    if (newPasswordInput !== newPasswordConfirmInput) {
      setSecurityError('Passwords do not match.');
      return;
    }
    if (newPasswordInput.length < 4) {
      setSecurityError('Password must be at least 4 characters long.');
      return;
    }

    const questionText = securityQuestionSelect === 'custom' ? securityQuestionCustom.trim() : securityQuestionSelect;
    if (!questionText) {
      setSecurityError('Security question is required.');
      return;
    }

    if (!securityAnswerInput.trim()) {
      setSecurityError('Security answer is required.');
      return;
    }

    try {
      const pwdHash = await hashStringAdmin(newPasswordInput);
      const answerHash = await hashStringAdmin(securityAnswerInput.trim().toLowerCase());
      const rawRecoveryKey = generateRecoveryKey();
      const recoveryKeyHash = await hashStringAdmin(rawRecoveryKey.replace(/-/g, ''));

      await invoke('save_setting', { key: 'admin_password_hash', value: pwdHash });
      await invoke('save_setting', { key: 'admin_security_question', value: questionText });
      await invoke('save_setting', { key: 'admin_security_answer_hash', value: answerHash });
      await invoke('save_setting', { key: 'admin_recovery_key_hash', value: recoveryKeyHash });

      setGeneratedRecoveryKey(rawRecoveryKey);
      setShowRecoveryKeyModal(true);

      await checkSecurityConfig();
      onAdminPasswordConfigChanged?.();

      setNewPasswordInput('');
      setNewPasswordConfirmInput('');
      setSecurityAnswerInput('');
      setSecurityQuestionCustom('');
    } catch (err) {
      console.error(err);
      setSecurityError('Failed to save security settings: ' + err);
    }
  };

  const verifyIdentity = async (method: 'password' | 'question' | 'key', answerOrKeyOrPwd: string): Promise<boolean> => {
    if (!answerOrKeyOrPwd.trim()) {
      return false;
    }
    if (method === 'password') {
      const storedHash = await invoke<string | null>('get_setting', { key: 'admin_password_hash' });
      const currentHash = await hashStringAdmin(answerOrKeyOrPwd);
      return currentHash === storedHash;
    } else if (method === 'question') {
      const storedAnswerHash = await invoke<string | null>('get_setting', { key: 'admin_security_answer_hash' });
      const currentAnswerHash = await hashStringAdmin(answerOrKeyOrPwd.trim().toLowerCase());
      return currentAnswerHash === storedAnswerHash;
    } else if (method === 'key') {
      const storedKeyHash = await invoke<string | null>('get_setting', { key: 'admin_recovery_key_hash' });
      const sanitizedKey = answerOrKeyOrPwd.replace(/-/g, '').trim().toUpperCase();
      const currentKeyHash = await hashStringAdmin(sanitizedKey);
      return currentKeyHash === storedKeyHash;
    }
    return false;
  };

  const handleDisableSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError('');
    setSecurityNotice('');

    const verifyVal =
      verificationMethodDisable === 'password'
        ? currentPasswordInput
        : verificationMethodDisable === 'question'
          ? verificationAnswerInputDisable
          : verificationKeyInputDisable;

    if (!verifyVal.trim()) {
      setSecurityError('Verification value is required to disable security.');
      return;
    }

    try {
      const isVerified = await verifyIdentity(verificationMethodDisable, verifyVal);

      if (!isVerified) {
        setSecurityError(`Authentication failed using ${verificationMethodDisable === 'password' ? 'current password' : verificationMethodDisable === 'question' ? 'security question' : 'recovery key'}.`);
        return;
      }

      await invoke('save_setting', { key: 'admin_password_hash', value: '' });
      await invoke('save_setting', { key: 'admin_security_question', value: '' });
      await invoke('save_setting', { key: 'admin_security_answer_hash', value: '' });
      await invoke('save_setting', { key: 'admin_recovery_key_hash', value: '' });

      setSecurityNotice('Admin password protection disabled successfully.');
      setShowSecurityEditPanel(false);
      setCurrentPasswordInput('');
      setVerificationAnswerInputDisable('');
      setVerificationKeyInputDisable('');

      await checkSecurityConfig();
      onAdminPasswordConfigChanged?.();
    } catch (err) {
      console.error(err);
      setSecurityError('Failed to disable security: ' + err);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError('');
    setSecurityNotice('');

    const verifyVal =
      verificationMethodChange === 'password'
        ? currentPasswordInput
        : verificationMethodChange === 'question'
          ? verificationAnswerInputChange
          : verificationKeyInputChange;

    if (!verifyVal.trim()) {
      setSecurityError('Verification value is required to change password.');
      return;
    }

    if (!newPasswordInput || !newPasswordConfirmInput) {
      setSecurityError('All password fields are required.');
      return;
    }
    if (newPasswordInput !== newPasswordConfirmInput) {
      setSecurityError('New passwords do not match.');
      return;
    }
    if (newPasswordInput.length < 4) {
      setSecurityError('New password must be at least 4 characters long.');
      return;
    }

    try {
      const isVerified = await verifyIdentity(verificationMethodChange, verifyVal);

      if (!isVerified) {
        setSecurityError(`Authentication failed using ${verificationMethodChange === 'password' ? 'current password' : verificationMethodChange === 'question' ? 'security question' : 'recovery key'}.`);
        return;
      }

      const newPwdHash = await hashStringAdmin(newPasswordInput);
      await invoke('save_setting', { key: 'admin_password_hash', value: newPwdHash });

      const questionText = securityQuestionSelect === 'custom' ? securityQuestionCustom.trim() : securityQuestionSelect;
      if (questionText && securityAnswerInput.trim()) {
        const answerHash = await hashStringAdmin(securityAnswerInput.trim().toLowerCase());
        await invoke('save_setting', { key: 'admin_security_question', value: questionText });
        await invoke('save_setting', { key: 'admin_security_answer_hash', value: answerHash });
      }

      setSecurityNotice('Admin password changed successfully.');
      setShowSecurityEditPanel(false);
      setCurrentPasswordInput('');
      setVerificationAnswerInputChange('');
      setVerificationKeyInputChange('');
      setNewPasswordInput('');
      setNewPasswordConfirmInput('');
      setSecurityAnswerInput('');
      setSecurityQuestionCustom('');

      await checkSecurityConfig();
      onAdminPasswordConfigChanged?.();
    } catch (err) {
      console.error(err);
      setSecurityError('Failed to change password: ' + err);
    }
  };

  const loadOrgSetting = async () => {
    try {
      const val = await invoke<string | null>('get_setting', { key: 'organization_name' });
      if (val) setOrganizationName(val);
    } catch (err) {
      console.error('Failed to load organization_name setting:', err);
    }
    try {
      const val = await invoke<string | null>('get_setting', { key: 'receipt_message' });
      if (val) setReceiptMessage(val);
    } catch (err) {
      console.error('Failed to load receipt_message setting:', err);
    }

    try {
      const val = await invoke<string | null>('get_setting', { key: 'auto_print_receipts' });
      if (val !== null) setAutoPrintReceipts(val === 'true');
    } catch (err) {
      console.error('Failed to load auto_print_receipts setting:', err);
    }
    try {
      const val = await invoke<string | null>('get_setting', { key: 'receipt_column_width' });
      if (val !== null) setReceiptColumnWidth(parseInt(val, 10) || 32);
    } catch (err) {
      console.error('Failed to load receipt_column_width setting:', err);
    }
    try {
      const val = await invoke<string | null>('get_setting', { key: 'receipt_font_size' });
      if (val !== null) setReceiptFontSize(parseInt(val, 10) || 11);
    } catch (err) {
      console.error('Failed to load receipt_font_size setting:', err);
    }
    try {
      const val = await invoke<string | null>('get_setting', { key: 'receipt_paper_width' });
      if (val !== null) setReceiptPaperWidth(val || '58mm');
    } catch (err) {
      console.error('Failed to load receipt_paper_width setting:', err);
    }
  };

  const generateTextReceipt = (sale: Sale, orgName: string, message: string, colWidth: number = 32) => {
    if (!sale) return "";

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
    text += formatLine(`Sale #: ${sale.id}`, colWidth);
    text += formatLine(`Date: ${new Date(sale.timestamp).toLocaleString()}`, colWidth);
    text += separator;

    // 2. Items
    const saleItems = sale.items || [];
    saleItems.forEach((sItem: SaleItemDetail) => {
      const name = sItem.item_name || `Item ID: ${sItem.item_id}`;
      const priceVal = sItem.price_at_sale;
      const total = `$${(sItem.quantity * priceVal).toFixed(2)}`;

      // Row 1: Name and Total Price
      let namePart = name;
      if (namePart.length > (colWidth - total.length - 1)) {
        namePart = namePart.slice(0, colWidth - total.length - 2) + "…";
      }
      const spaces = colWidth - namePart.length - total.length;
      text += formatLine(`${namePart}${" ".repeat(spaces)}${total}`, colWidth);

      // Row 2: Qty x Unit Price
      text += formatLine(`${sItem.quantity} x $${priceVal.toFixed(2)}`, colWidth);
    });

    text += separator;

    // 3. Totals
    const formatTotalLine = (label: string, val: string): string => {
      const spaces = Math.max(1, colWidth - label.length - val.length);
      return formatLine(label + " ".repeat(spaces) + val, colWidth);
    };

    text += formatTotalLine("Subtotal", `$${sale.subtotal.toFixed(2)}`);

    if (sale.discount_total > 0) {
      text += formatTotalLine("Discount", `-$${sale.discount_total.toFixed(2)}`);
    }

    text += formatTotalLine("Tax", `$${sale.tax_total.toFixed(2)}`);
    text += separator;
    text += formatTotalLine("TOTAL DUE", `$${sale.final_total.toFixed(2)}`);
    text += separator;

    // 4. Footer
    text += centerText("THANK YOU FOR YOUR PATRONAGE!", colWidth);
    text += centerText("Have a safe and happy 4th of July!", colWidth);
    text += "\n\n\n";
    return text;
  };

  const handlePrintReceipt = async () => {
    const savedPrinter = localStorage.getItem('selected_receipt_printer') || 'System Print Dialog (Default)';
    const savedMode = localStorage.getItem('selected_print_mode') || 'dialog';
    const isGoDaddyConnected = godaddyEnabled && godaddyTerminalIp;
    const useGoDaddyPrinter = isGoDaddyConnected && (savedPrinter === 'GoDaddy Smart Terminal Printer' || savedPrinter === 'System Print Dialog (Default)');

    if (useGoDaddyPrinter) {
      if (selectedReceiptSale) {
        try {
          // GoDaddy Smart Terminal built-in printer has a fixed hardware/OS font size and 2" paper width,
          // which fits exactly 26 characters per line. We must force colWidth to 26 to prevent truncation.
          const receiptText = generateTextReceipt(selectedReceiptSale, organizationName, receiptMessage, 26);
          await invoke('godaddy_print_receipt', {
            ip: godaddyTerminalIp,
            token: godaddyPairingToken,
            receiptText: receiptText
          });
          triggerNotice("Receipt printed on GoDaddy Terminal!", 'success');
        } catch (err) {
          console.error("GoDaddy print failed", err);
          triggerNotice(`GoDaddy print failed: ${err}`, 'error');
        }
      } else {
        triggerNotice("No receipt data available to print.", "error");
      }
    } else if (savedPrinter !== 'System Print Dialog (Default)' && savedMode === 'direct') {
      if (selectedReceiptSale) {
        try {
          const receiptText = generateTextReceipt(selectedReceiptSale, organizationName, receiptMessage, receiptColumnWidth);
          const ok = await invoke<boolean>('print_to_named_printer', {
            printerName: savedPrinter,
            text: receiptText
          });
          if (ok) {
            triggerNotice(`Receipt sent to printer ${savedPrinter}!`, 'success');
          } else {
            triggerNotice(`Failed to send receipt to printer.`, 'error');
          }
        } catch (err) {
          console.error("Direct print failed", err);
          triggerNotice(`Direct print failed: ${err}`, 'error');
        }
      } else {
        triggerNotice("No receipt data available to print.", "error");
      }
    } else {
      window.print();
    }
  };


  const loadGodaddySettings = async () => {
    try {
      await invoke('save_setting', { key: 'godaddy_enabled', value: 'true' });
      setGodaddyEnabled(true);
      invoke('godaddy_start_sidecar').catch(err => console.error('Failed to start sidecar on mount:', err));
    } catch (err) {
      console.error('Failed to load godaddy_enabled setting:', err);
    }
    try {
      const ip = await invoke<string | null>('get_setting', { key: 'godaddy_terminal_ip' });
      setGodaddyTerminalIp(ip || 'mock');
    } catch (err) {
      console.error('Failed to load godaddy_terminal_ip setting:', err);
    }
    try {
      const status = await invoke<string | null>('get_setting', { key: 'godaddy_pairing_status' });
      setGodaddyPairingStatus(status || 'unpaired');
    } catch (err) {
      console.error('Failed to load godaddy_pairing_status setting:', err);
    }
    try {
      const token = await invoke<string | null>('get_setting', { key: 'godaddy_pairing_token' });
      setGodaddyPairingToken(token || '');
    } catch (err) {
      console.error('Failed to load godaddy_pairing_token setting:', err);
    }
  };

  const handlePingTerminal = async () => {
    setIsGodaddyPinging(true);
    setGodaddyPingStatus('Connecting...');
    try {
      const ok = await invoke<boolean>('godaddy_ping_terminal', { ip: godaddyTerminalIp });
      if (ok) {
        setGodaddyPingStatus('Success: Connected to terminal port 55555!');
        setGodaddyConnected(true);
      } else {
        setGodaddyPingStatus('Failed to establish local socket connection.');
        setGodaddyConnected(false);
      }
    } catch (err) {
      setGodaddyPingStatus('Failed: ' + err);
      setGodaddyConnected(false);
    } finally {
      setIsGodaddyPinging(false);
    }
  };

  const handlePairTerminal = async (code: string) => {
    if (!code || code.length !== 6) {
      triggerNotice('Pairing code must be 6 digits.', 'error');
      return;
    }
    setIsGodaddyPairing(true);
    try {
      const token = await invoke<string>('godaddy_pair_terminal', { ip: godaddyTerminalIp, pairingCode: code });
      await invoke('save_setting', { key: 'godaddy_pairing_token', value: token });
      await invoke('save_setting', { key: 'godaddy_pairing_status', value: 'paired' });
      setGodaddyPairingToken(token);
      setGodaddyPairingStatus('paired');
      setShowGodaddyPairModal(false);
      setGodaddyPairingCode('');
      triggerNotice('GoDaddy Terminal Paired Successfully!', 'success');

      // Auto-enable GoDaddy Terminal Flex in database
      const methods = await invoke<PaymentMethod[]>('get_payment_methods');
      const godaddyMethod = methods.find(m => m.name === 'GoDaddy Terminal Flex');
      if (godaddyMethod) {
        await invoke('save_payment_method', {
          id: godaddyMethod.id,
          enabled: 1,
          feePercentage: godaddyMethod.fee_percentage,
          feeFlat: godaddyMethod.fee_flat
        });
      }
      await invoke('save_setting', { key: 'godaddy_enabled', value: 'true' });
      setGodaddyEnabled(true);
      loadPaymentMethods();
    } catch (err) {
      triggerNotice('Pairing failed: ' + err, 'error');
    } finally {
      setIsGodaddyPairing(false);
    }
  };

  const handleDiscoverTerminals = async () => {
    setIsDiscovering(true);
    setDiscoveredIps([]);
    try {
      const ips = await invoke<string[]>('godaddy_discover_terminals');
      setDiscoveredIps(ips);
      if (ips.length === 0) {
        triggerNotice('No terminals found on the local network.');
      } else {
        triggerNotice(`Found ${ips.length} terminal(s)!`, 'success');
      }
    } catch (err) {
      triggerNotice('Discovery failed: ' + err, 'error');
    } finally {
      setIsDiscovering(false);
    }
  };

  const selectDiscoveredIp = async (ip: string) => {
    setGodaddyTerminalIp(ip);
    try {
      await invoke('save_setting', { key: 'godaddy_terminal_ip', value: ip });
      triggerNotice(`Terminal IP set to ${ip}`, 'success');
      if (ip) {
        setIsCheckingGodaddyConnection(true);
        try {
          const ok = await invoke<boolean>('godaddy_ping_terminal', { ip });
          setGodaddyConnected(ok);
        } catch (e) {
          setGodaddyConnected(false);
        } finally {
          setIsCheckingGodaddyConnection(false);
        }
      } else {
        setGodaddyConnected(false);
      }
    } catch (err) {
      console.error("Failed to save terminal IP", err);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      const list = await invoke<PaymentMethod[]>('get_payment_methods');
      setPaymentMethods(list || []);
    } catch (err) {
      triggerNotice('Failed to load payment methods: ' + err, 'error');
    }
  };

  const loadChangeCalculatorSetting = async () => {
    try {
      const val = await invoke<string | null>('get_setting', { key: 'cash_change_calculator_enabled' });
      setIsCashChangeCalculatorEnabled(val === 'true');
    } catch (err) {
      console.error('Failed to load change calculator setting:', err);
    }
  };

  const handleToggleChangeCalculator = async (enabled: boolean) => {
    try {
      await invoke('save_setting', { key: 'cash_change_calculator_enabled', value: enabled ? 'true' : 'false' });
      setIsCashChangeCalculatorEnabled(enabled);
      triggerNotice(enabled ? 'Cash change calculator enabled.' : 'Cash change calculator disabled.', 'success');
    } catch (err) {
      triggerNotice('Failed to save change calculator setting: ' + err, 'error');
    }
  };

  const handleTogglePaymentMethod = async (method: PaymentMethod, enabled: boolean) => {
    if (method.name === 'GoDaddy Terminal Flex' && enabled && godaddyPairingStatus !== 'paired') {
      setShowGoDaddyNotPairedModal(true);
    }

    try {
      await invoke('save_payment_method', {
        id: method.id,
        enabled: enabled ? 1 : 0,
        feePercentage: method.fee_percentage,
        feeFlat: method.fee_flat
      });
      triggerNotice(`${method.name} ${enabled ? 'enabled' : 'disabled'}.`, 'success');
      loadPaymentMethods();
    } catch (err) {
      triggerNotice('Failed to toggle payment method: ' + err, 'error');
    }
  };

  const handleUpdatePaymentFee = async (method: PaymentMethod, percentageStr: string, flatStr: string) => {
    const feePercentage = parseFloat(percentageStr) || 0.0;
    const feeFlat = parseFloat(flatStr) || 0.0;

    try {
      await invoke('save_payment_method', {
        id: method.id,
        enabled: method.enabled,
        feePercentage,
        feeFlat
      });
      triggerNotice(`Updated fees for ${method.name}.`, 'success');
      loadPaymentMethods();
    } catch (err) {
      triggerNotice('Failed to update fees: ' + err, 'error');
    }
  };

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPaymentName.trim()) {
      triggerNotice('Payment method name is required.', 'error');
      return;
    }

    const duplicate = paymentMethods.find(
      m => m.name.toLowerCase() === newPaymentName.trim().toLowerCase() && m.status === 'active'
    );
    if (duplicate) {
      triggerNotice('A payment method with this name already exists.', 'error');
      return;
    }

    const feePercentage = parseFloat(newPaymentFeePercentage) || 0.0;
    const feeFlat = parseFloat(newPaymentFeeFlat) || 0.0;

    try {
      await invoke('add_payment_method', {
        name: newPaymentName.trim(),
        enabled: 1,
        feePercentage,
        feeFlat
      });
      triggerNotice(`Added payment method ${newPaymentName.trim()}`, 'success');
      setNewPaymentName('');
      setNewPaymentFeePercentage('');
      setNewPaymentFeeFlat('');
      loadPaymentMethods();
    } catch (err) {
      triggerNotice('Failed to add payment method: ' + err, 'error');
    }
  };

  const handleDeletePaymentMethod = async (method: PaymentMethod) => {
    const confirm = await handleConfirm(
      `Are you sure you want to delete "${method.name}"? If it has transaction history, it will be archived, otherwise it will be permanently deleted.`,
      'Delete Payment Method',
      true
    );
    if (!confirm) return;

    try {
      await invoke('delete_payment_method', { id: method.id });
      triggerNotice(`Deleted ${method.name}.`, 'success');
      loadPaymentMethods();
    } catch (err) {
      triggerNotice('Failed to delete payment method: ' + err, 'error');
    }
  };

  const checkGodaddyConnection = async () => {
    if (!godaddyTerminalIp) {
      setGodaddyConnected(false);
      return;
    }
    setIsCheckingGodaddyConnection(true);
    try {
      const ok = await invoke<boolean>('godaddy_ping_terminal', { ip: godaddyTerminalIp });
      setGodaddyConnected(ok);
    } catch (err) {
      console.error('Failed to ping godaddy terminal: ', err);
      setGodaddyConnected(false);
    } finally {
      setIsCheckingGodaddyConnection(false);
    }
  };

  const handleSort = (column: any) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getFilteredAndSortedSales = () => {
    let result = [...sales];

    if (ledgerStartDate) {
      const startMs = new Date(ledgerStartDate).getTime();
      result = result.filter(sale => new Date(sale.timestamp).getTime() >= startMs);
    }
    if (ledgerEndDate) {
      const endMs = new Date(ledgerEndDate).getTime();
      result = result.filter(sale => new Date(sale.timestamp).getTime() <= endMs);
    }

    result.sort((a: any, b: any) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (sortColumn === 'id') {
        return sortDirection === 'asc' ? (a.id - b.id) : (b.id - a.id);
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortDirection === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
      }
    });

    return result;
  };

  const getManualSaleTotals = () => {
    let subtotal = 0;
    manualSaleCart.forEach(c => {
      const price = c.isBulk && c.item.bulk_price !== null && c.item.bulk_price !== undefined ? c.item.bulk_price : c.item.price;
      subtotal += price * c.quantity;
    });

    let discountTotal = 0;
    if (manualSaleDiscountId) {
      const disc = discounts.find(d => d.id === parseInt(manualSaleDiscountId));
      if (disc) {
        if (disc.type === 'percentage') {
          discountTotal = subtotal * (disc.value / 100);
        } else {
          discountTotal = disc.value;
        }
      }
    }
    if (discountTotal > subtotal) discountTotal = subtotal;

    let taxTotal = 0;
    const taxableAmount = subtotal - discountTotal;
    if (manualSaleTaxId) {
      const tx = taxes.find(t => t.id === parseInt(manualSaleTaxId));
      if (tx) {
        taxTotal = taxableAmount * (tx.rate / 100);
      }
    }

    const finalTotal = taxableAmount + taxTotal;

    let transactionFee = 0;
    const method = paymentMethods.find(m => m.name === manualSalePaymentMethod);
    if (method) {
      transactionFee = (finalTotal * method.fee_percentage / 100) + method.fee_flat;
    }

    return {
      subtotal,
      discountTotal,
      taxTotal,
      finalTotal,
      transactionFee
    };
  };

  const handleAddManualSaleItem = () => {
    if (!manualSaleSelectedItemId) return;
    const item = items.find(i => i.id === parseInt(manualSaleSelectedItemId));
    if (!item) return;

    const existingIndex = manualSaleCart.findIndex(c => c.item.id === item.id && c.isBulk === manualSaleIsBulk);
    if (existingIndex >= 0) {
      const updated = [...manualSaleCart];
      updated[existingIndex].quantity += manualSaleItemQty;
      setManualSaleCart(updated);
    } else {
      setManualSaleCart([...manualSaleCart, { item, quantity: manualSaleItemQty, isBulk: manualSaleIsBulk }]);
    }

    setManualSaleSelectedItemId('');
    setManualSaleItemQty(1);
    setManualSaleIsBulk(false);
  };

  const handleSaveManualSale = async () => {
    if (manualSaleCart.length === 0) {
      triggerNotice('Manual sale cannot be empty.', 'error');
      return;
    }

    const { subtotal, discountTotal, taxTotal, finalTotal, transactionFee } = getManualSaleTotals();
    const itemsPayload = manualSaleCart.map(c => ({
      item_id: c.item.id,
      quantity: c.quantity,
      price_at_sale: c.isBulk && c.item.bulk_price !== null && c.item.bulk_price !== undefined ? c.item.bulk_price : c.item.price,
      is_bulk: c.isBulk
    }));

    try {
      await invoke('complete_sale', {
        items: itemsPayload,
        subtotal,
        discountTotal,
        taxTotal,
        finalTotal,
        paymentMethod: manualSalePaymentMethod,
        godaddyTransactionId: manualSalePaymentMethod === 'GoDaddy Terminal Flex' && manualSaleGoDaddyTxId.trim() ? manualSaleGoDaddyTxId.trim() : null,
        transactionFee
      });

      triggerNotice('Manual sale logged successfully!', 'success');
      setShowManualSaleModal(false);
      setManualSaleCart([]);
      setManualSaleDiscountId('');
      setManualSaleTaxId('');
      setManualSalePaymentMethod('Cash');
      setManualSaleGoDaddyTxId('');
      loadSales();
      loadInventory();
      loadYearlySummary();
    } catch (err) {
      triggerNotice('Failed to log manual sale: ' + err, 'error');
    }
  };

  const generateRefundReceiptText = (sale: Sale, restock: boolean, colWidth: number = 32) => {
    let text = "";
    const separator = "-".repeat(colWidth) + "\n";
    const centerText = (str: string, width: number) => {
      if (str.length >= width) return str + "\n";
      const pad = Math.floor((width - str.length) / 2);
      return " ".repeat(pad) + str + "\n";
    };
    const formatLine = (left: string, right: string) => {
      const space = colWidth - left.length - right.length;
      return left + " ".repeat(Math.max(1, space)) + right + "\n";
    };

    text += centerText(organizationName.toUpperCase(), colWidth);
    text += centerText("REFUND RECEIPT", colWidth);
    text += separator;
    text += formatLine("Refund Date:", new Date().toLocaleString());
    text += formatLine("Original TX:", `#${sale.id}`);
    text += formatLine("Type:", restock ? "Return (Restocked)" : "Refund (Damaged)");
    text += separator;

    if (sale.items) {
      sale.items.forEach(item => {
        text += formatLine(`${item.item_name || 'Item'} x${item.quantity}`, `-$${(item.price_at_sale * item.quantity).toFixed(2)}`);
      });
    }

    text += separator;
    text += formatLine("Subtotal Refunded", `-$${sale.subtotal.toFixed(2)}`);
    text += formatLine("Tax Refunded", `-$${sale.tax_total.toFixed(2)}`);
    text += separator;
    text += formatLine("TOTAL REFUNDED", `-$${sale.final_total.toFixed(2)}`);
    text += separator;
    text += centerText("REFUND COMPLETED", colWidth);
    text += "\n\n\n";
    return text;
  };

  const handlePrintRefundReceipt = async (sale: Sale, restock: boolean) => {
    const savedPrinter = localStorage.getItem('selected_receipt_printer') || 'System Print Dialog (Default)';
    const savedMode = localStorage.getItem('selected_print_mode') || 'direct';
    const isGoDaddyConnected = godaddyEnabled && godaddyTerminalIp;
    const useGoDaddyPrinter = isGoDaddyConnected && (savedPrinter === 'GoDaddy Smart Terminal Printer' || savedPrinter === 'System Print Dialog (Default)');

    if (useGoDaddyPrinter) {
      try {
        const receiptText = generateRefundReceiptText(sale, restock, 26);
        await invoke('godaddy_print_receipt', {
          ip: godaddyTerminalIp,
          token: godaddyPairingToken,
          receiptText: receiptText
        });
        triggerNotice("Refund receipt printed on GoDaddy Terminal!", 'success');
      } catch (err) {
        console.error("GoDaddy print failed", err);
        triggerNotice(`GoDaddy print failed: ${err}`, 'error');
      }
    } else if (savedPrinter !== 'System Print Dialog (Default)' && savedMode === 'direct') {
      try {
        const receiptText = generateRefundReceiptText(sale, restock, receiptColumnWidth);
        const ok = await invoke<boolean>('print_to_named_printer', {
          printerName: savedPrinter,
          text: receiptText
        });
        if (ok) {
          triggerNotice(`Refund receipt sent to printer ${savedPrinter}!`, 'success');
        } else {
          triggerNotice(`Failed to send refund receipt to printer.`, 'error');
        }
      } catch (err) {
        console.error("Direct print failed", err);
        triggerNotice(`Direct print failed: ${err}`, 'error');
      }
    } else {
      triggerNotice("Direct receipt printing is not configured. Print receipt is only supported via GoDaddy or Direct ESC/POS printing.");
    }
  };

  const handleApplyRefund = async () => {
    if (!selectedSaleForAction) return;

    if (
      selectedSaleForAction.payment_method === 'GoDaddy Terminal Flex' &&
      selectedSaleForAction.godaddy_transaction_id
    ) {
      try {
        triggerNotice('Sending refund instruction to GoDaddy Terminal...');
        await invoke('godaddy_refund_transaction', {
          ip: godaddyTerminalIp,
          token: godaddyPairingToken,
          transactionId: selectedSaleForAction.godaddy_transaction_id,
          amountCents: Math.round(selectedSaleForAction.final_total * 100)
        });
        triggerNotice('GoDaddy Terminal refund processed!', 'success');
      } catch (err) {
        const errStr = String(err);
        const isReconError = errStr.includes("111") || errStr.includes("ORDER_TXN_RECON_FAILED");
        const helperNote = isReconError
          ? "\n\n(Note: Error 111 / ORDER_TXN_RECON_FAILED typically indicates this transaction was originally processed on the GoDaddy terminal as a Cash payment, meaning there are no card funds to reverse. You can proceed to log the refund in the database anyway and refund the cash manually.)"
          : "";
        const proceed = await handleConfirm(
          `GoDaddy Terminal refund failed: ${err}.${helperNote}\n\nWould you like to log this refund in the database anyway?`,
          'GoDaddy Refund Error'
        );
        if (!proceed) return;
      }
    }

    try {
      await invoke('refund_sale', {
        saleId: selectedSaleForAction.id,
        restock: isRestockInventory
      });

      triggerNotice(`Transaction #${selectedSaleForAction.id} marked as refunded.`, 'success');
      await handlePrintRefundReceipt(selectedSaleForAction, isRestockInventory);

      setShowRefundModal(false);
      setSelectedSaleForAction(null);
      loadSales();
      loadInventory();
      loadYearlySummary();
    } catch (err) {
      triggerNotice('Failed to complete refund: ' + err, 'error');
    }
  };



  // App Update states
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const hasUpdate = await onTriggerUpdateCheck();
      if (!hasUpdate) {
        await handleAlert('You are running the latest version of THC Fireworks POS!', 'App Update');
      }
    } catch (e) {
      await handleAlert('Update check failed: ' + e, 'App Update Error');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  // Admin configurations & trends
  const [priceHistory, setPriceHistory] = useState<any[]>([]);

  // Expanding sale tickets
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);

  // Status banners
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Auto-fill barcode field in form if active and scannedBarcode is detected
  useEffect(() => {
    if (scannedBarcode && isAdminUnlocked) {
      if (subTab === 'inventory') {
        setNewItemBarcode(scannedBarcode);
        triggerNotice(`Scanned barcode: ${scannedBarcode}`, 'success');
      }
      onClearScan();
    }
  }, [scannedBarcode, isAdminUnlocked]);

  // Load database lists
  useEffect(() => {
    if (isAdminUnlocked) {
      loadInventory();
      loadDiscounts();
      loadSales();
      loadYearlySummary();
      loadTaxes();
      loadOversellSetting();
      loadOrgSetting();
      loadGodaddySettings();
      loadPaymentMethods();
      loadChangeCalculatorSetting();
    }
  }, [isAdminUnlocked]);

  useEffect(() => {
    if (isAdminUnlocked && subTab === 'payment_methods') {
      loadPaymentMethods();
      loadChangeCalculatorSetting();
      checkGodaddyConnection();
    }
  }, [subTab, isAdminUnlocked]);

  useEffect(() => {
    if (isAdminUnlocked && subTab === 'analytics') {
      if (analyticsMode === 'yearly') {
        loadYearlySummary();
      } else {
        loadDailySummary();
      }
      loadPriceHistory();
    }
  }, [subTab, analyticsMode, isAdminUnlocked]);

  const loadPriceHistory = async () => {
    try {
      const history = await invoke<any[]>('get_item_price_history');
      setPriceHistory(history);
    } catch (err) {
      console.error('Failed to load item price history: ', err);
    }
  };

  // Sale deletion confirmation handlers


  const handleApplyDelete = async () => {
    if (!selectedDeleteSale) return;

    try {
      await invoke('delete_sale', { id: selectedDeleteSale.id });
      triggerNotice(`Transaction #${selectedDeleteSale.id} deleted and rolled back`, 'success');
      setShowSaleDeleteModal(false);
      setSelectedDeleteSale(null);
      loadSales();
      loadInventory();
    } catch (err) {
      triggerNotice('Failed to delete transaction: ' + err, 'error');
    }
  };

  const handleThresholdChange = (val: number) => {
    onThresholdChange(val);
  };

  const handleTotalCostChange = (val: number) => {
    onTotalCostChange(val);
  };

  const loadYearlySummary = async () => {
    setIsLoadingSummary(true);
    try {
      const summary = await invoke<YearSummary[]>('get_yearly_sales_summary');
      setYearlySummaries(summary);
    } catch (err) {
      triggerNotice('Failed to load yearly analysis: ' + err, 'error');
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const loadDailySummary = async () => {
    setIsLoadingSummary(true);
    try {
      const summary = await invoke<DaySummary[]>('get_daily_sales_summary');
      setDailySummaries(summary);
    } catch (err) {
      triggerNotice('Failed to load daily analysis: ' + err, 'error');
    } finally {
      setIsLoadingSummary(false);
    }
  };



  const handleCreateCustomTheme = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customThemeName.trim()) {
      triggerNotice('Please specify a theme name', 'error');
      return;
    }
    const themeId = 'custom_' + Date.now();
    const newTheme: Theme = {
      id: themeId,
      name: customThemeName.trim(),
      isCustom: true,
      bg: customThemeBg,
      card: customThemeCard,
      text: customThemeText,
      muted: customThemeMuted,
      primary: customThemePrimary,
      primaryHover: customThemePrimary,
      accent: customThemeAccent,
      border: customThemeBorder,
      header: customThemeHeader,
      input: customThemeInput,
    };
    onSaveCustomTheme(newTheme);
    triggerNotice(`Saved and applied custom theme "${newTheme.name}"`, 'success');
    setCustomThemeName('');
  };



  const triggerNotice = (message: string, type: 'success' | 'error' = 'success') => {
    setNotice({ message, type });
    setTimeout(() => setNotice(null), 3500);
  };

  // API wrappers calling Rust Tauri backend
  const loadInventory = async () => {
    try {
      const list = await invoke<Item[]>('get_items');
      setItems(list);
    } catch (err) {
      triggerNotice('Failed to load items: ' + err, 'error');
    }
  };

  const loadDiscounts = async () => {
    try {
      const list = await invoke<Discount[]>('get_discounts');
      setDiscounts(list);
    } catch (err) {
      triggerNotice('Failed to load discounts: ' + err, 'error');
    }
  };

  const loadSales = async () => {
    try {
      const list = await invoke<Sale[]>('get_sales');
      setSales(list);
    } catch (err) {
      triggerNotice('Failed to load sales: ' + err, 'error');
    }
  };

  // Sale deletion confirmation modal states


  const processShowcaseVideo = async (itemName: string, videoPathInput: string): Promise<string | null> => {
    const val = videoPathInput.trim();
    if (!val) return null;

    const isYoutube = val.includes('youtube.com') || val.includes('youtu.be');
    if (isYoutube) {
      // Store the YouTube URL directly — streams at playback time
      return val;
    } else {
      if (val.endsWith('.mp4') || val.endsWith('.webm') || val.endsWith('.mov') || val.endsWith('.avi') || val.endsWith('.mkv')) {
        if (!val.includes('/') && !val.includes('\\')) {
          // Already a bare filename in showcase storage
          return val;
        }
      }
      try {
        const filename = await invoke<string>('save_showcase_video', { sourcePath: val, itemName });
        triggerNotice('Local video file copied to showcase storage', 'success');
        return filename;
      } catch (err) {
        triggerNotice(`Failed to copy local video file: ${err}`, 'error');
        return null;
      }
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(newItemPrice);
    const stock = newItemStock.trim() === '' ? null : parseInt(newItemStock, 10);
    const bulkPrice = newItemBulkPrice.trim() === '' ? null : parseFloat(newItemBulkPrice);
    const bulkQuantity = newItemBulkQuantity.trim() === '' ? null : parseInt(newItemBulkQuantity, 10);

    if (!newItemBarcode.trim() || !newItemName.trim() || isNaN(price)) {
      triggerNotice('Please fill out barcode, name, and price correctly', 'error');
      return;
    }

    try {
      const resolvedVideoPath = await processShowcaseVideo(newItemName.trim(), newItemVideoPath);

      await invoke('add_item', {
        barcode: newItemBarcode.trim(),
        name: newItemName.trim(),
        price,
        stockQuantity: stock,
        notes: newItemNotes.trim() === '' ? null : newItemNotes.trim(),
        bulkPrice,
        bulkBarcode: newItemBulkBarcode.trim() === '' ? null : newItemBulkBarcode.trim(),
        bulkQuantity,
        unitCost: null,
        taxId: newItemTaxId === '' ? null : parseInt(newItemTaxId, 10),
        videoPath: resolvedVideoPath,
        isInvalid: false,
        missingFields: null,
        discountTags: newItemDiscountTags.trim() === '' ? null : newItemDiscountTags.trim()
      });

      triggerNotice(`Successfully added "${newItemName}"`, 'success');
      setNewItemBarcode('');
      setNewItemName('');
      setNewItemPrice('');
      setNewItemStock('');
      setNewItemNotes('');
      setNewItemBulkPrice('');
      setNewItemBulkBarcode('');
      setNewItemBulkQuantity('');
      setNewItemTaxId('');
      setNewItemVideoPath('');
      setNewItemDiscountTags('');
      loadInventory();
    } catch (err) {
      triggerNotice('Failed to add product: ' + err, 'error');
    }
  };

  const handleUpdateItem = async (itemId: number) => {
    const stock = editItemStock.trim() === '' ? null : parseInt(editItemStock, 10);
    const price = parseFloat(editItemPrice);
    const bulkPrice = editItemBulkPrice.trim() === '' ? null : parseFloat(editItemBulkPrice);
    const bulkQuantity = editItemBulkQuantity.trim() === '' ? null : parseInt(editItemBulkQuantity, 10);

    if (editItemBarcode.trim() === '') {
      triggerNotice('Please enter a valid barcode', 'error');
      return;
    }

    if (editItemName.trim() === '') {
      triggerNotice('Please enter a product name', 'error');
      return;
    }

    if (isNaN(price)) {
      triggerNotice('Please enter a valid price value', 'error');
      return;
    }

    try {
      const resolvedVideoPath = await processShowcaseVideo(editItemName.trim(), editItemVideoPath);

      await invoke('update_item_details', {
        id: itemId,
        barcode: editItemBarcode.trim(),
        name: editItemName.trim(),
        price,
        stockQuantity: stock,
        notes: editItemNotes.trim() === '' ? null : editItemNotes.trim(),
        bulkPrice,
        bulkBarcode: editItemBulkBarcode.trim() === '' ? null : editItemBulkBarcode.trim(),
        bulkQuantity,
        unitCost: null,
        taxId: editItemTaxId === '' ? null : parseInt(editItemTaxId, 10),
        videoPath: resolvedVideoPath,
        isInvalid: false,
        missingFields: null,
        discountTags: editItemDiscountTags.trim() === '' ? null : editItemDiscountTags.trim()
      });

      triggerNotice('Product details updated', 'success');
      setEditingItemId(null);
      setEditItemVideoPath('');
      setEditItemDiscountTags('');
      loadInventory();
    } catch (err) {
      triggerNotice('Update failed: ' + err, 'error');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!await handleConfirm('Are you sure you want to delete this product? This will break reports linking this ID.', 'Delete Product', true)) return;
    try {
      await invoke('delete_item', { id: itemId });
      triggerNotice('Product removed from database', 'success');
      loadInventory();
    } catch (err) {
      triggerNotice('Failed to delete: ' + err, 'error');
    }
  };

  const handleLinkBulkItem = async () => {
    if (!linkingBulkItem) return;
    if (!linkTargetSingleItemId) {
      triggerNotice('Please select a target single item', 'error');
      return;
    }
    const qty = parseInt(linkBulkQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      triggerNotice('Please specify a valid quantity per case (greater than 0)', 'error');
      return;
    }

    try {
      await invoke('link_existing_item_as_bulk', {
        singleItemId: parseInt(linkTargetSingleItemId, 10),
        bulkItemId: linkingBulkItem.id,
        bulkQuantity: qty
      });

      triggerNotice(`Successfully linked and deleted ${linkingBulkItem.name}`, 'success');
      setLinkingBulkItem(null);
      setLinkTargetSingleItemId('');
      setLinkBulkQuantity('12');
      setLinkSearchQuery('');
      loadInventory();
    } catch (err) {
      triggerNotice('Failed to link bulk item: ' + err, 'error');
    }
  };

  const handleSaveDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    const qualifierValue = parseFloat(discQualifierValue) || 0;
    const rewardValue = parseFloat(discRewardValue) || 0;
    const rewardQuantity = parseFloat(discRewardQuantity) || 0;
    const maxLimitPerOrder = discMaxLimitPerOrder.trim() === '' ? null : parseInt(discMaxLimitPerOrder, 10);
    const valueCap = discValueCap.trim() === '' ? null : parseFloat(discValueCap);
    const rewardTargetItemId = discRewardTargetItemId.trim() === '' ? null : parseInt(discRewardTargetItemId, 10);
    const rewardLowestCostLinkedItemId = discRewardLowestCostLinkedItemId.trim() === '' ? null : parseInt(discRewardLowestCostLinkedItemId, 10);

    if (!discName.trim()) {
      triggerNotice('Please specify a valid discount name', 'error');
      return;
    }

    try {
      const legacyType = discRewardValueType;
      const legacyValue = rewardValue;

      const payload = {
        name: discName.trim(),
        discountType: legacyType,
        value: legacyValue,
        qualifierType: discQualifierType,
        qualifierValue,
        rewardType: discRewardType,
        rewardValue,
        rewardValueType: discRewardValueType,
        rewardQuantity,
        rewardTargetItemId,
        rewardLowestCostLinkedItemId,
        discountTag: discDiscountTag.trim(),
        maxLimitPerOrder,
        valueCap,
        isStackable: discIsStackable
      };

      if (editingDiscountId !== null) {
        await invoke('update_discount', { id: editingDiscountId, ...payload });
        triggerNotice(`Updated discount "${discName}"`, 'success');
      } else {
        await invoke('add_discount', payload);
        triggerNotice(`Created discount "${discName}"`, 'success');
      }

      // Update each item in the inventory accordingly if tag is specified
      if (discDiscountTag.trim()) {
        const targetTag = discDiscountTag.trim().toLowerCase();
        
        for (const item of items) {
          const itemTags = parseTags(item.discount_tags);
          const hasTag = itemTags.includes(targetTag);
          const shouldHaveTag = taggedItemIds.includes(item.id);
          
          if (hasTag !== shouldHaveTag) {
            let newTags = [...itemTags];
            if (shouldHaveTag) {
              newTags.push(targetTag);
            } else {
              newTags = newTags.filter(t => t !== targetTag);
            }
            const tagsStr = newTags.join(',');
            
            await invoke('update_item_details', {
              id: item.id,
              barcode: item.barcode,
              name: item.name,
              price: item.price,
              stockQuantity: item.stock_quantity,
              notes: item.notes || null,
              bulkPrice: item.bulk_price || null,
              bulkBarcode: item.bulk_barcode || null,
              bulkQuantity: item.bulk_quantity || null,
              unitCost: null,
              taxId: item.tax_id || null,
              videoPath: item.video_path || null,
              isInvalid: !!item.is_invalid,
              missingFields: item.missing_fields || null,
              discountTags: tagsStr
            });
          }
        }
      }

      // Reset form state
      setEditingDiscountId(null);
      setDiscName('');
      setDiscQualifierType('manual');
      setDiscQualifierValue('0');
      setDiscRewardType('order_discount');
      setDiscRewardValue('0');
      setDiscRewardValueType('percentage');
      setDiscRewardQuantity('0');
      setDiscRewardTargetItemId('');
      setDiscRewardLowestCostLinkedItemId('');
      setDiscDiscountTag('');
      setDiscMaxLimitPerOrder('');
      setDiscValueCap('');
      setDiscIsStackable(1);
      setTaggedItemIds([]);
      loadDiscounts();
      loadInventory();
    } catch (err) {
      triggerNotice('Failed to save discount: ' + err, 'error');
    }
  };

  const parseTags = (tagsStr?: string): string[] => {
    if (!tagsStr) return [];
    return tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
  };

  const handleStartEditDiscount = (disc: Discount) => {
    setEditingDiscountId(disc.id);
    setDiscName(disc.name);
    setDiscQualifierType(disc.qualifier_type || 'manual');
    setDiscQualifierValue(disc.qualifier_value !== undefined ? disc.qualifier_value.toString() : '0');
    setDiscRewardType(disc.reward_type || 'order_discount');
    setDiscRewardValue(disc.reward_value !== undefined ? disc.reward_value.toString() : '0');
    setDiscRewardValueType(disc.reward_value_type || disc.type || 'percentage');
    setDiscRewardQuantity(disc.reward_quantity !== undefined ? disc.reward_quantity.toString() : '0');
    setDiscRewardTargetItemId(disc.reward_target_item_id ? disc.reward_target_item_id.toString() : '');
    setDiscRewardLowestCostLinkedItemId(disc.reward_lowest_cost_linked_item_id ? disc.reward_lowest_cost_linked_item_id.toString() : '');
    setDiscDiscountTag(disc.discount_tag || '');
    setDiscMaxLimitPerOrder(disc.max_limit_per_order ? disc.max_limit_per_order.toString() : '');
    setDiscValueCap(disc.value_cap ? disc.value_cap.toString() : '');
    setDiscIsStackable(disc.is_stackable !== undefined ? disc.is_stackable : 1);

    if (disc.discount_tag) {
      const targetTag = disc.discount_tag.trim().toLowerCase();
      const tagged = items.filter(item => parseTags(item.discount_tags).includes(targetTag)).map(item => item.id);
      setTaggedItemIds(tagged);
    } else {
      setTaggedItemIds([]);
    }
  };

  const handleDeleteDiscount = async (discId: number) => {
    if (!await handleConfirm('Delete this preset discount?', 'Delete Discount', true)) return;
    try {
      await invoke('delete_discount', { id: discId });
      triggerNotice('Discount removed', 'success');
      loadDiscounts();
    } catch (err) {
      triggerNotice('Failed to delete discount: ' + err, 'error');
    }
  };

  const loadTaxes = async () => {
    try {
      const list = await invoke<Tax[]>('get_taxes');
      setTaxes(list || []);
    } catch (err) {
      triggerNotice('Failed to load taxes: ' + err, 'error');
    }
  };

  const loadOversellSetting = async () => {
    try {
      const val = await invoke<string | null>('get_setting', { key: 'allow_oversell' });
      setAllowOversell(val === 'true');
    } catch (err) {
      console.error('Failed to load allow_oversell setting:', err);
    }
  };



  const handleApplyTax = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = parseFloat(newTaxRate);
    if (!newTaxName.trim() || isNaN(rate) || rate < 0) {
      triggerNotice('Please specify a valid tax name and positive rate', 'error');
      return;
    }

    try {
      if (editingTaxId !== null) {
        await invoke('update_tax', {
          id: editingTaxId,
          name: newTaxName.trim(),
          rate,
          scope: newTaxScope
        });
        triggerNotice(`Successfully updated tax "${newTaxName}"`, 'success');
      } else {
        await invoke('add_tax', {
          name: newTaxName.trim(),
          rate,
          scope: newTaxScope
        });
        triggerNotice(`Successfully created tax "${newTaxName}"`, 'success');
      }

      setNewTaxName('');
      setNewTaxRate('');
      setNewTaxScope('total');
      setEditingTaxId(null);
      loadTaxes();
      loadInventory();
    } catch (err) {
      triggerNotice('Failed to save tax: ' + err, 'error');
    }
  };

  // Filter products list
  const filteredItems = items.filter(item => {
    const q = inventorySearch.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.barcode.includes(q);
  });



  // LOGGED-IN ADMIN CONSOLE
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative select-none">
      {/* Notice Banner */}
      {notice && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-6 py-4 rounded-xl shadow-2xl transition-all border ${notice.type === 'error'
          ? 'bg-red-950/95 border-red-500 text-red-100'
          : 'bg-custom-header border-custom-primary text-custom-text'
          }`}>
          <span className="font-semibold text-base">{notice.message}</span>
        </div>
      )}

      {/* Admin Subheader and Navigation */}
      <div className="bg-custom-card border border-custom-border rounded-2xl px-6 py-4 flex flex-col gap-4 mb-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-custom-input text-custom-accent rounded-xl border border-custom-border shadow">
            <ShieldCheck className="h-5.5 w-5.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-custom-text">Manager Admin Console</h2>
            </div>
            <p className="text-xs text-custom-muted font-sans">Configure prices, preset discounts, and audit sales logs</p>
          </div>
        </div>

        {/* Tab switch buttons */}
        <div className="flex flex-nowrap self-end w-fit bg-custom-bg border border-custom-border rounded-xl p-1 shadow-inner gap-1 overflow-x-auto min-w-0 max-w-full">
          <button
            id="btn-admin-tab-inventory"
            onClick={() => setSubTab('inventory')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${subTab === 'inventory'
              ? 'bg-custom-primary text-white shadow-lg'
              : 'text-custom-muted hover:text-custom-text'
              }`}
          >
            <Package className="h-4 w-4" /> Products
          </button>
          <button
            id="btn-admin-tab-discounts"
            onClick={() => setSubTab('discounts')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${subTab === 'discounts'
              ? 'bg-custom-primary text-white shadow-lg'
              : 'text-custom-muted hover:text-custom-text'
              }`}
          >
            <Tag className="h-4 w-4" /> Discounts
          </button>
          <button
            id="btn-admin-tab-taxes"
            onClick={() => setSubTab('taxes')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${subTab === 'taxes'
              ? 'bg-custom-primary text-white shadow-lg'
              : 'text-custom-muted hover:text-custom-text'
              }`}
          >
            <Percent className="h-4 w-4" /> Taxes
          </button>
          <button
            id="btn-admin-tab-sales"
            onClick={() => setSubTab('sales')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${subTab === 'sales'
              ? 'bg-custom-primary text-white shadow-lg'
              : 'text-custom-muted hover:text-custom-text'
              }`}
          >
            <History className="h-4 w-4" /> Sales Ledger
          </button>
          <button
            id="btn-admin-tab-analytics"
            onClick={() => setSubTab('analytics')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${subTab === 'analytics'
              ? 'bg-custom-primary text-white shadow-lg'
              : 'text-custom-muted hover:text-custom-text'
              }`}
          >
            <TrendingUp className="h-4 w-4" /> Analytics
          </button>
          <button
            id="btn-admin-tab-data"
            onClick={() => setSubTab('data')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${subTab === 'data'
              ? 'bg-custom-primary text-white shadow-lg'
              : 'text-custom-muted hover:text-custom-text'
              }`}
          >
            <Database className="h-4 w-4" /> Data Management
          </button>
          <button
            id="btn-admin-tab-payment-methods"
            onClick={() => setSubTab('payment_methods')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${subTab === 'payment_methods'
              ? 'bg-custom-primary text-white shadow-lg'
              : 'text-custom-muted hover:text-custom-text'
              }`}
          >
            <Wallet className="h-4 w-4" /> Payment Methods
          </button>
          <button
            id="btn-admin-tab-devices"
            onClick={() => setSubTab('devices')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${subTab === 'devices'
              ? 'bg-custom-primary text-white shadow-lg'
              : 'text-custom-muted hover:text-custom-text'
              }`}
          >
            <Printer className="h-4 w-4" /> Devices
          </button>
          <button
            id="btn-admin-tab-settings"
            onClick={() => setSubTab('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${subTab === 'settings'
              ? 'bg-custom-primary text-white shadow-lg'
              : 'text-custom-muted hover:text-custom-text'
              }`}
          >
            <Settings className="h-4 w-4" /> Settings
          </button>
        </div>
      </div>

      {/* SUB-PANEL CONTENTS */}
      <div className="flex-1 overflow-hidden min-h-0 p-6">

        {/* SUB-TAB A: PRODUCT INVENTORY MANAGER */}
        {subTab === 'inventory' && (
          <div className="h-full flex flex-col xl:flex-row gap-6 min-h-0 p-6">
            {/* Form Column */}
            <div className="w-full xl:w-[480px] shrink-0 flex flex-col gap-6 overflow-y-auto pr-1 lg:overflow-visible">
              {/* Catalog New Product */}
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg flex flex-col space-y-4">
                <h3
                  className="text-lg font-bold text-custom-text flex items-center justify-between pb-2 border-b border-custom-border cursor-pointer select-none"
                  onClick={() => setIsNewProductCollapsed(!isNewProductCollapsed)}
                >
                  <div className="flex items-center gap-2">
                    <PlusCircle className="h-5 w-5 text-custom-accent" /> Catalog New Product
                  </div>
                  <ChevronDown className={`h-5 w-5 text-custom-muted transition-transform duration-200 ${!isNewProductCollapsed ? 'rotate-180' : ''}`} />
                </h3>

                {!isNewProductCollapsed && (
                  <form onSubmit={handleAddItem} className="space-y-5 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Barcode Scan / Manual Code</label>
                      <div className="relative">
                        <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-custom-muted" />
                        <input
                          id="admin-new-barcode"
                          type="text"
                          placeholder="Scan or type barcode"
                          value={newItemBarcode}
                          onChange={e => setNewItemBarcode(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none focus:ring-1 focus:ring-custom-primary/10 font-mono text-base placeholder:text-custom-muted/50"
                          required
                        />
                      </div>
                      <span className="text-[10px] text-custom-muted mt-1 block font-sans">Zap a package with the scanner to automatically capture barcode.</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Product Name</label>
                      <input
                        id="admin-new-name"
                        type="text"
                        placeholder="e.g. Red White & Boom 16s Aerial"
                        value={newItemName}
                        onChange={e => setNewItemName(e.target.value)}
                        className="w-full px-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-base placeholder:text-custom-muted/50"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Retail Price ($)</label>
                        <input
                          id="admin-new-price"
                          type="number"
                          step="0.01"
                          placeholder="45.00"
                          value={newItemPrice}
                          onChange={e => setNewItemPrice(e.target.value)}
                          className="w-full px-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none font-mono text-base placeholder:text-custom-muted/50"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Initial Stock</label>
                        <input
                          id="admin-new-stock"
                          type="number"
                          placeholder="Unlimited (Optional)"
                          value={newItemStock}
                          onChange={e => setNewItemStock(e.target.value)}
                          className="w-full px-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none font-mono text-base placeholder:text-custom-muted/50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Private Manager Notes</label>
                      <textarea
                        placeholder="Only visible in the back office catalog list..."
                        value={newItemNotes}
                        onChange={e => setNewItemNotes(e.target.value)}
                        className="w-full px-4 py-2.5 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-sm placeholder:text-custom-muted/50 resize-none h-16"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Sales Tax Category</label>
                      <select
                        id="admin-new-tax-id"
                        value={newItemTaxId}
                        onChange={e => setNewItemTaxId(e.target.value)}
                        className="w-full px-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-sm cursor-pointer"
                      >
                        <option value="">Use Total Taxes (Default)</option>
                        <option value="-1">Tax Exempt (0%)</option>
                        {(taxes || []).filter(t => t.scope === 'item').map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Discount Tags (comma-separated)</label>
                      <input
                        id="admin-new-discount-tags"
                        type="text"
                        placeholder="e.g. sparklers, buy-3-get-1, aerials"
                        value={newItemDiscountTags}
                        onChange={e => setNewItemDiscountTags(e.target.value)}
                        className="w-full px-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-sm placeholder:text-custom-muted/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Showcase Video (YouTube Link or Local File)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="https://youtube.com/... or Pick File"
                          value={newItemVideoPath}
                          onChange={e => setNewItemVideoPath(e.target.value)}
                          className="flex-1 px-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-sm placeholder:text-custom-muted/50"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const path = await invoke<string | null>('select_local_video');
                              if (path) setNewItemVideoPath(path);
                            } catch (err) {
                              triggerNotice('Failed to open file dialog: ' + err, 'error');
                            }
                          }}
                          className="px-4 py-3 bg-custom-input border border-custom-border hover:bg-custom-primary/10 text-custom-text rounded-xl text-xs font-bold cursor-pointer transition-all shrink-0"
                        >
                          Pick File
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-custom-border/40 pt-3.5 space-y-3">
                      <button
                        type="button"
                        onClick={() => setShowBulkOptions(!showBulkOptions)}
                        className="w-full flex justify-between items-center text-left py-1 text-custom-accent hover:text-custom-accent/80 transition-all font-bold text-xs select-none"
                      >
                        <span className="text-[10px] font-extrabold uppercase tracking-wider">Bulk Options</span>
                        {showBulkOptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      {showBulkOptions && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[9px] font-bold uppercase text-custom-muted mb-1">Bulk Barcode (UPC)</label>
                              <input
                                type="text"
                                placeholder="e.g. 1002422"
                                value={newItemBulkBarcode}
                                onChange={e => setNewItemBulkBarcode(e.target.value)}
                                className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg focus:outline-none placeholder:text-custom-muted/40 font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold uppercase text-custom-muted mb-1">Bulk Price ($)</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="e.g. 99.99"
                                value={newItemBulkPrice}
                                onChange={e => setNewItemBulkPrice(e.target.value)}
                                className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg focus:outline-none placeholder:text-custom-muted/40 font-mono"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold uppercase text-custom-muted mb-1">Items Per Case</label>
                            <input
                              type="number"
                              placeholder="e.g. 24"
                              value={newItemBulkQuantity}
                              onChange={e => setNewItemBulkQuantity(e.target.value)}
                              className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg focus:outline-none placeholder:text-custom-muted/40 font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      id="btn-admin-add-item-submit"
                      type="submit"
                      className="w-full py-4 bg-custom-primary hover:bg-custom-primary-hover active:scale-97 text-white font-extrabold text-base rounded-xl transition-all shadow border border-custom-border mt-6"
                    >
                      Add Product to Catalog
                    </button>
                  </form>
                )}
              </div>

              {/* Redirect to Data Management Import */}
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg flex flex-col space-y-3 bg-custom-card/50">
                <h3 className="text-base font-bold text-custom-text flex items-center gap-2 pb-2 border-b border-custom-border">
                  <Download className="h-4 w-4 text-custom-accent" /> Import Inventory Data
                </h3>
                <p className="text-xs text-custom-muted leading-relaxed">
                  Import inventory and other data from spreadsheet files. Use the Data Management tab to select tables, choose a folder, and run the import.
                </p>
                <button
                  type="button"
                  onClick={() => setSubTab('data')}
                  className="px-4 py-2.5 bg-custom-primary hover:bg-custom-primary-hover text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 self-start cursor-pointer"
                >
                  Go to Data Management &rarr;
                </button>
              </div>
            </div>

            {/* List/Table Column */}
            <div className="flex-1 glass-panel border-custom-border rounded-2xl shadow-lg flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 bg-custom-header border-b border-custom-border flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-custom-muted" />
                  <input
                    id="admin-inventory-search"
                    type="text"
                    placeholder="Quick filter catalog..."
                    value={inventorySearch}
                    onChange={e => setInventorySearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-custom-input border border-custom-border text-custom-text rounded-xl text-sm focus:outline-none transition-all placeholder:text-custom-muted/50"
                  />
                </div>
                <button
                  id="btn-refresh-inventory"
                  onClick={loadInventory}
                  className="p-3 bg-custom-input hover:bg-custom-input/80 border border-custom-border text-custom-muted hover:text-custom-text rounded-xl transition-all active:scale-90"
                  title="Reload inventory list"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>

              {/* Data Table */}
              <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-custom-input text-custom-muted border-b border-custom-border uppercase text-xs font-extrabold select-none">
                      <th className="py-4 px-6">Barcode</th>
                      <th className="py-4 px-6">Product Title</th>
                      <th className="py-4 px-6 text-right">Price</th>
                      <th className="py-4 px-6 text-right">Stock</th>
                      <th className="py-4 px-6 text-center w-40">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-custom-border font-medium">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-custom-muted">
                          <Archive className="h-8 w-8 mx-auto mb-3 text-custom-muted/50" />
                          No products found matching filters
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map(item => {
                        const isEditing = editingItemId === item.id;
                        const isLowStock = item.stock_quantity !== null && item.stock_quantity <= lowStockThreshold;
                        return (
                          <tr key={item.id} className="hover:bg-custom-primary/10 text-custom-text border-b border-custom-border/30 align-top">
                            <td className="py-4 px-6 font-mono text-xs text-custom-muted">
                              <div className="flex items-center gap-1.5 group/copy">
                                <span>{item.barcode}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.barcode);
                                    triggerNotice('Barcode copied to clipboard', 'success');
                                  }}
                                  className="p-1 hover:bg-custom-primary/20 rounded text-custom-muted hover:text-custom-text transition-all cursor-pointer opacity-0 group-hover/copy:opacity-100 focus:opacity-100"
                                  title="Copy barcode"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="py-4 px-6 font-bold text-custom-text text-base">
                              {isEditing ? (
                                <div className="space-y-2.5 mt-2 p-3 bg-custom-input border border-custom-border rounded-xl text-xs font-semibold max-w-sm">
                                  <div>
                                    <label className="block text-[9px] uppercase tracking-wider text-custom-muted mb-1 font-bold">Barcode (UPC)</label>
                                    <input
                                      type="text"
                                      value={editItemBarcode}
                                      onChange={e => setEditItemBarcode(e.target.value)}
                                      placeholder="Scan or type barcode"
                                      className="w-full px-3 py-1.5 bg-custom-card border border-custom-border rounded-lg text-custom-text font-mono focus:outline-none font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] uppercase tracking-wider text-custom-muted mb-1">Product Title</label>
                                    <input
                                      type="text"
                                      value={editItemName}
                                      onChange={e => setEditItemName(e.target.value)}
                                      placeholder="Product Name"
                                      className="w-full px-3 py-1.5 bg-custom-card border border-custom-border rounded-lg text-custom-text focus:outline-none font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] uppercase tracking-wider text-custom-muted mb-1">Private Manager Notes</label>
                                    <input
                                      type="text"
                                      value={editItemNotes}
                                      onChange={e => setEditItemNotes(e.target.value)}
                                      placeholder="Only visible to admins..."
                                      className="w-full px-3 py-1.5 bg-custom-card border border-custom-border rounded-lg text-custom-text focus:outline-none"
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[9px] uppercase tracking-wider text-custom-muted mb-1">Bulk UPC</label>
                                      <input
                                        type="text"
                                        value={editItemBulkBarcode}
                                        onChange={e => setEditItemBulkBarcode(e.target.value)}
                                        placeholder="e.g. 100242"
                                        className="w-full px-3 py-1.5 bg-custom-card border border-custom-border rounded-lg text-custom-text font-mono focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9px] uppercase tracking-wider text-custom-muted mb-1">Bulk Price ($)</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={editItemBulkPrice}
                                        onChange={e => setEditItemBulkPrice(e.target.value)}
                                        placeholder="e.g. 99.99"
                                        className="w-full px-3 py-1.5 bg-custom-card border border-custom-border rounded-lg text-custom-text font-mono focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] uppercase tracking-wider text-custom-muted mb-1">Qty Per Case</label>
                                    <input
                                      type="number"
                                      value={editItemBulkQuantity}
                                      onChange={e => setEditItemBulkQuantity(e.target.value)}
                                      placeholder="e.g. 24"
                                      className="w-full px-3 py-1.5 bg-custom-card border border-custom-border rounded-lg text-custom-text font-mono focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] uppercase tracking-wider text-custom-muted mb-1">Showcase Video (YouTube Link / Local File)</label>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        value={editItemVideoPath}
                                        onChange={e => setEditItemVideoPath(e.target.value)}
                                        placeholder="YouTube Link or Pick File"
                                        className="flex-1 px-3 py-1.5 bg-custom-card border border-custom-border rounded-lg text-custom-text focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          try {
                                            const path = await invoke<string | null>('select_local_video');
                                            if (path) setEditItemVideoPath(path);
                                          } catch (err) {
                                            triggerNotice('Failed to open file dialog: ' + err, 'error');
                                          }
                                        }}
                                        className="px-3 py-1.5 bg-custom-card border border-custom-border hover:bg-custom-primary/20 text-custom-text rounded-lg text-[10px] font-bold cursor-pointer shrink-0"
                                      >
                                        Pick File
                                      </button>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] uppercase tracking-wider text-custom-muted mb-1">Sales Tax Category</label>
                                    <select
                                      value={editItemTaxId}
                                      onChange={e => setEditItemTaxId(e.target.value)}
                                      className="w-full px-3 py-1.5 bg-custom-card border border-custom-border rounded-lg text-custom-text focus:outline-none font-bold"
                                    >
                                      <option value="">Use Total Taxes (Default)</option>
                                      <option value="-1">Tax Exempt (0%)</option>
                                      {(taxes || []).filter(t => t.scope === 'item').map(t => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] uppercase tracking-wider text-custom-muted mb-1">Discount Tags (comma-separated)</label>
                                    <input
                                      type="text"
                                      value={editItemDiscountTags}
                                      onChange={e => setEditItemDiscountTags(e.target.value)}
                                      placeholder="e.g. sparklers, buy-3-get-1"
                                      className="w-full px-3 py-1.5 bg-custom-card border border-custom-border rounded-lg text-custom-text focus:outline-none"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    {item.is_invalid && <span title="Invalid Product"><AlertTriangle className="h-4 w-4 shrink-0 text-red-500" /></span>}
                                    <span>{item.name}</span>
                                  </div>
                                  {item.notes && (
                                    <span className="block text-[10px] text-custom-accent italic mt-1.5 bg-custom-accent/10 px-2.5 py-1 rounded w-max border border-custom-accent/10 font-normal">
                                      Notes: {item.notes}
                                    </span>
                                  )}
                                  {item.is_invalid && (
                                    <span className="block text-[10px] text-red-500 font-semibold mt-1.5 bg-red-500/10 px-2.5 py-1 rounded w-max border border-red-500/20 flex items-center gap-1 font-normal">
                                      Missing required fields: {item.missing_fields}
                                    </span>
                                  )}
                                  {item.bulk_barcode && (
                                    <span className="block text-[10px] text-custom-muted/90 mt-1 font-sans font-normal">
                                      Bulk Case: {item.bulk_quantity} units at ${item.bulk_price?.toFixed(2)} (UPC: {item.bulk_barcode})
                                    </span>
                                  )}
                                  {(item.tax_id !== null && item.tax_id !== undefined) && (
                                    <span className="block text-[10px] text-custom-muted mt-1 font-sans font-normal">
                                      Tax: {item.tax_id === -1 ? 'Tax Exempt (0%)' : ((taxes || []).find(t => t.id === item.tax_id)?.name ? `${(taxes || []).find(t => t.id === item.tax_id)?.name} (${(taxes || []).find(t => t.id === item.tax_id)?.rate}%)` : 'Item Tax Preset')}
                                    </span>
                                  )}
                                  {item.discount_tags && (
                                    <span className="block text-[10px] text-custom-primary mt-1 font-sans font-normal">
                                      Discount Tags: {item.discount_tags}
                                    </span>
                                  )}
                                </>
                              )}
                            </td>

                            {/* Price field */}
                            <td className="py-4 px-6 text-right font-mono text-base text-custom-accent">
                              {isEditing ? (
                                <input
                                  id={`admin-edit-price-${item.id}`}
                                  type="number"
                                  step="0.01"
                                  value={editItemPrice}
                                  onChange={e => setEditItemPrice(e.target.value)}
                                  className="w-20 px-2 py-1 bg-custom-input border border-custom-border text-custom-text font-mono text-sm rounded focus:outline-none text-right"
                                />
                              ) : (
                                `$${item.price.toFixed(2)}`
                              )}
                            </td>

                            {/* Stock field */}
                            <td className="py-4 px-6 text-right font-mono text-base">
                              {isEditing ? (
                                <input
                                  id={`admin-edit-stock-${item.id}`}
                                  type="number"
                                  value={editItemStock}
                                  placeholder="Unlimited"
                                  onChange={e => setEditItemStock(e.target.value)}
                                  className="w-20 px-2 py-1 bg-custom-input border border-custom-border text-custom-text font-mono text-sm rounded focus:outline-none text-right"
                                />
                              ) : item.stock_quantity !== null ? (
                                <span className={isLowStock ? 'text-red-405 font-extrabold flex items-center justify-end gap-1.5' : ''}>
                                  {isLowStock && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-450" />}
                                  {item.stock_quantity}
                                </span>
                              ) : (
                                <span className="text-custom-muted/70 italic text-xs">Untracked</span>
                              )}
                            </td>

                            {/* Action Operations */}
                            <td className="py-4 px-6 text-center select-none">
                              {isEditing ? (
                                <div className="flex justify-center gap-1.5">
                                  <button
                                    id={`btn-save-edit-${item.id}`}
                                    onClick={() => handleUpdateItem(item.id)}
                                    className="p-2 bg-custom-primary/20 border border-custom-primary text-custom-primary hover:bg-custom-primary hover:text-white rounded-lg transition-all"
                                    title="Save Changes"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    id={`btn-cancel-edit-${item.id}`}
                                    onClick={() => setEditingItemId(null)}
                                    className="p-2 bg-custom-input border border-custom-border text-custom-muted hover:text-custom-text rounded-lg transition-all"
                                    title="Cancel"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-center gap-1.5">
                                  {item.video_path && (
                                    <button
                                      onClick={() => onPlayShowcaseVideo?.(item.name, item.video_path!)}
                                      className="p-2 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-accent hover:text-custom-text rounded-lg transition-all cursor-pointer flex items-center justify-center"
                                      title="Play Showcase Video"
                                    >
                                      <Video className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button
                                    id={`btn-edit-item-${item.id}`}
                                    onClick={() => {
                                      setEditingItemId(item.id);
                                      setEditItemBarcode(item.barcode);
                                      setEditItemName(item.name);
                                      setEditItemStock(item.stock_quantity !== null && item.stock_quantity !== undefined ? item.stock_quantity.toString() : '');
                                      setEditItemPrice(item.price.toFixed(2));
                                      setEditItemNotes(item.notes || '');
                                      setEditItemBulkBarcode(item.bulk_barcode || '');
                                      setEditItemBulkPrice(item.bulk_price !== null && item.bulk_price !== undefined ? item.bulk_price.toString() : '');
                                      setEditItemBulkQuantity(item.bulk_quantity !== null && item.bulk_quantity !== undefined ? item.bulk_quantity.toString() : '');
                                      setEditItemTaxId(item.tax_id !== null && item.tax_id !== undefined ? item.tax_id.toString() : '');
                                      setEditItemVideoPath(item.video_path || '');
                                      setEditItemDiscountTags(item.discount_tags || '');
                                    }}
                                    className="px-3.5 py-2 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-text text-xs font-bold rounded-lg transition-all"
                                  >
                                    <SquarePen className="h-4 w-4" />
                                  </button>
                                  <button
                                    id={`btn-link-bulk-${item.id}`}
                                    onClick={() => {
                                      setLinkingBulkItem(item);
                                      setLinkTargetSingleItemId('');
                                      setLinkBulkQuantity('12');
                                      setLinkSearchQuery('');
                                    }}
                                    className="px-3.5 py-2 bg-custom-input border border-custom-border hover:bg-custom-accent/20 text-custom-text text-xs font-bold rounded-lg transition-all"
                                    title="Link as bulk variant of another item"
                                  >
                                    <Link className="h-4 w-4" />
                                  </button>
                                  <button
                                    id={`btn-delete-item-${item.id}`}
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="p-2 bg-custom-input border border-custom-border hover:bg-red-950/60 text-custom-muted hover:text-red-400 rounded-lg transition-all"
                                    title="Delete product"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB B: PRESET DISCOUNT CONFIG */}
        {subTab === 'discounts' && (
          <div className="h-full flex flex-col xl:flex-row gap-6 min-h-0 p-6 overflow-y-auto lg:overflow-visible">
            {/* Discount Creator */}
            <div className="w-full xl:w-[420px] shrink-0">
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg flex flex-col space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-custom-border">
                  <h3 className="text-lg font-bold text-custom-text flex items-center gap-2">
                    <Tag className="h-5 w-5 text-custom-accent" /> {editingDiscountId !== null ? 'Edit Discount Preset' : 'Create Preset Discount'}
                  </h3>
                  {editingDiscountId !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDiscountId(null);
                        setDiscName('');
                        setDiscQualifierType('manual');
                        setDiscQualifierValue('0');
                        setDiscRewardType('order_discount');
                        setDiscRewardValue('0');
                        setDiscRewardValueType('percentage');
                        setDiscRewardQuantity('0');
                        setDiscRewardTargetItemId('');
                        setDiscRewardLowestCostLinkedItemId('');
                        setDiscDiscountTag('');
                        setDiscMaxLimitPerOrder('');
                        setDiscValueCap('');
                        setDiscIsStackable(1);
                        setTaggedItemIds([]);
                      }}
                      className="text-xs text-custom-accent hover:underline font-bold"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveDiscount} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Discount Name</label>
                    <input
                      id="admin-disc-name"
                      type="text"
                      placeholder="e.g. BOGO Fireworks"
                      value={discName}
                      onChange={e => setDiscName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-sm placeholder:text-custom-muted/50"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Stackability</label>
                      <select
                        value={discIsStackable}
                        onChange={e => setDiscIsStackable(parseInt(e.target.value, 10))}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-xs font-bold cursor-pointer"
                      >
                        <option value="1">Stackable (Multiple)</option>
                        <option value="0">Unstackable (Limit 1)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Qualifier Type</label>
                      <select
                        value={discQualifierType}
                        onChange={e => setDiscQualifierType(e.target.value as any)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-xs font-bold cursor-pointer"
                      >
                        <option value="manual">Manual Cashier Button</option>
                        <option value="order_total">Order Subtotal Threshold</option>
                        <option value="item_quantity">Item Quantity (Mix & Match)</option>
                      </select>
                    </div>
                  </div>

                  {discQualifierType !== 'manual' && (
                    <div className="grid grid-cols-2 gap-3 p-3 bg-custom-input/40 border border-custom-border rounded-xl">
                      {discQualifierType === 'order_total' && (
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold uppercase text-custom-muted mb-1">Min Subtotal Threshold ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={discQualifierValue}
                            onChange={e => setDiscQualifierValue(e.target.value)}
                            className="w-full px-3 py-2 bg-custom-card border border-custom-border text-custom-text font-mono text-xs rounded-lg focus:outline-none"
                            required
                          />
                        </div>
                      )}
                      {discQualifierType === 'item_quantity' && (
                        <>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-custom-muted mb-1">Required Quantity</label>
                            <input
                              type="number"
                              value={discQualifierValue}
                              onChange={e => setDiscQualifierValue(e.target.value)}
                              className="w-full px-3 py-2 bg-custom-card border border-custom-border text-custom-text font-mono text-xs rounded-lg focus:outline-none"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-custom-muted mb-1">Qualifier Tag Name</label>
                            <input
                              type="text"
                              placeholder="e.g. sparkler"
                              value={discDiscountTag}
                              onChange={e => setDiscDiscountTag(e.target.value)}
                              className="w-full px-3 py-2 bg-custom-card border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none placeholder:text-custom-muted/40"
                              required
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="space-y-3 p-3 bg-custom-input/20 border border-custom-border rounded-xl">
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted">Reward Details</label>
                    
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-custom-muted mb-1">Reward Action</label>
                      <select
                        value={discRewardType}
                        onChange={e => setDiscRewardType(e.target.value as any)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-xs font-bold cursor-pointer"
                      >
                        <option value="order_discount">Discount off Entire Order</option>
                        <option value="item_discount_qty">Discount off specific Item Qty</option>
                        <option value="item_discount_all">Discount off all specific Item variants</option>
                        <option value="lowest_cost_item">Discount off cheapest tagged item</option>
                        <option value="items_for_price">X Items for Y Package price</option>
                      </select>
                    </div>

                    {discRewardType === 'order_discount' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase text-custom-muted mb-1">Value Type</label>
                          <select
                            value={discRewardValueType}
                            onChange={e => setDiscRewardValueType(e.target.value as any)}
                            className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs"
                          >
                            <option value="percentage">Percentage (%)</option>
                            <option value="fixed">Flat Dollar ($)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase text-custom-muted mb-1">Amount</label>
                          <input
                            type="number"
                            step="0.01"
                            value={discRewardValue}
                            onChange={e => setDiscRewardValue(e.target.value)}
                            className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {(discRewardType === 'item_discount_qty' || discRewardType === 'item_discount_all') && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[9px] uppercase text-custom-muted mb-1">Target Catalog Item</label>
                          <select
                            value={discRewardTargetItemId}
                            onChange={e => setDiscRewardTargetItemId(e.target.value)}
                            className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs font-bold"
                            required
                          >
                            <option value="">-- Select Product --</option>
                            {items.map(i => (
                              <option key={i.id} value={i.id}>{i.name} (${i.price.toFixed(2)})</option>
                            ))}
                          </select>
                        </div>
                        {discRewardType === 'item_discount_qty' && (
                          <div>
                            <label className="block text-[9px] uppercase text-custom-muted mb-1">Max Units Discounted</label>
                            <input
                              type="number"
                              value={discRewardQuantity}
                              onChange={e => setDiscRewardQuantity(e.target.value)}
                              className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg"
                              required
                            />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[9px] uppercase text-custom-muted mb-1">Discount Unit Value</label>
                            <select
                              value={discRewardValueType}
                              onChange={e => setDiscRewardValueType(e.target.value as any)}
                              className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs"
                            >
                              <option value="percentage">Percent Off (%)</option>
                              <option value="fixed">Dollar Off ($)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase text-custom-muted mb-1">Rate / Value</label>
                            <input
                              type="number"
                              step="0.01"
                              value={discRewardValue}
                              onChange={e => setDiscRewardValue(e.target.value)}
                              className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {discRewardType === 'lowest_cost_item' && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[9px] uppercase text-custom-muted mb-1">Discount Tag Name</label>
                          <input
                            type="text"
                            placeholder="e.g. sparkler"
                            value={discDiscountTag}
                            onChange={e => setDiscDiscountTag(e.target.value)}
                            className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[9px] uppercase text-custom-muted mb-1">Cheapest Off Value</label>
                            <select
                              value={discRewardValueType}
                              onChange={e => setDiscRewardValueType(e.target.value as any)}
                              className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs"
                            >
                              <option value="percentage">Percent Off (%)</option>
                              <option value="fixed">Dollar Off ($)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase text-custom-muted mb-1">Rate / Value</label>
                            <input
                              type="number"
                              step="0.01"
                              value={discRewardValue}
                              onChange={e => setDiscRewardValue(e.target.value)}
                              className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg"
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase text-custom-muted mb-1">Cheapest Under Linked Price (Optional)</label>
                          <select
                            value={discRewardLowestCostLinkedItemId}
                            onChange={e => setDiscRewardLowestCostLinkedItemId(e.target.value)}
                            className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs"
                          >
                            <option value="">No link (Use Manual Reward Value above as Max Threshold)</option>
                            {items.map(i => (
                              <option key={i.id} value={i.id}>{i.name} (${i.price.toFixed(2)})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {discRewardType === 'items_for_price' && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[9px] uppercase text-custom-muted mb-1">Discount Tag Name</label>
                          <input
                            type="text"
                            placeholder="e.g. sparkler"
                            value={discDiscountTag}
                            onChange={e => setDiscDiscountTag(e.target.value)}
                            className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[9px] uppercase text-custom-muted mb-1">Items Group Quantity</label>
                            <input
                              type="number"
                              value={discRewardQuantity}
                              onChange={e => setDiscRewardQuantity(e.target.value)}
                              className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase text-custom-muted mb-1">Package Price ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={discRewardValue}
                              onChange={e => setDiscRewardValue(e.target.value)}
                              className="w-full px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-custom-muted mb-1">Max Limit Per Order</label>
                      <input
                        type="number"
                        placeholder="Unlimited"
                        value={discMaxLimitPerOrder}
                        onChange={e => setDiscMaxLimitPerOrder(e.target.value)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg focus:outline-none placeholder:text-custom-muted/40"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-custom-muted mb-1">Value Cap Per Order ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="No Cap"
                        value={discValueCap}
                        onChange={e => setDiscValueCap(e.target.value)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg focus:outline-none placeholder:text-custom-muted/40"
                      />
                    </div>
                  </div>

                  {discDiscountTag.trim().length > 0 && (
                    <div className="space-y-2 border-t border-custom-border/40 pt-3">
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1">
                        Map Catalog Items to Tag "{discDiscountTag.trim()}"
                      </label>
                      <div className="max-h-[160px] overflow-y-auto border border-custom-border rounded-xl p-2 bg-custom-input/40 space-y-1.5">
                        {items.map(item => {
                          const isChecked = taggedItemIds.includes(item.id);
                          return (
                            <label key={item.id} className="flex items-center gap-2 text-xs font-semibold text-custom-text cursor-pointer hover:bg-custom-primary/5 p-1 rounded transition-all">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setTaggedItemIds(prev => prev.filter(id => id !== item.id));
                                  } else {
                                    setTaggedItemIds(prev => [...prev, item.id]);
                                  }
                                }}
                                className="rounded border-custom-border text-custom-primary focus:ring-custom-primary/20 h-4 w-4 cursor-pointer"
                              />
                              <span className="truncate">{item.name} (${item.price.toFixed(2)})</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    id="btn-admin-add-discount-submit"
                    type="submit"
                    className="w-full py-4 bg-custom-primary hover:bg-custom-primary-hover active:scale-97 text-white font-extrabold text-base rounded-xl transition-all shadow border border-custom-border"
                  >
                    {editingDiscountId !== null ? 'Save Changes' : 'Add Discount Preset'}
                  </button>
                </form>
              </div>
            </div>

            {/* Discounts List */}
            <div className="flex-1 glass-panel border-custom-border rounded-2xl shadow-lg flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 bg-custom-header border-b border-custom-border flex items-center justify-between">
                <span className="font-bold text-custom-text">Active Presets</span>
                <span className="text-xs bg-custom-input text-custom-muted border border-custom-border px-2 py-0.5 rounded font-bold font-mono">
                  {discounts.length} Presets Available
                </span>
              </div>

              <div className="flex-1 overflow-auto p-6 space-y-3 max-w-2xl">
                {discounts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-custom-muted py-16">
                    <Tag className="h-8 w-8 text-custom-muted mb-3" />
                    No preset discounts defined
                  </div>
                ) : (
                  discounts.map(disc => {
                    const valType = disc.reward_value_type || disc.type || 'percentage';
                    const val = (disc.reward_value !== undefined && disc.reward_value !== null) ? disc.reward_value : (disc.value || 0);

                    return (
                      <div
                        key={disc.id}
                        className="bg-custom-input/40 border border-custom-border rounded-xl p-4 flex items-center justify-between shadow shadow-black/20"
                      >
                        <div className="min-w-0 pr-4 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="font-bold text-custom-text text-base truncate">{disc.name}</span>
                            <span className="text-[10px] text-custom-muted mt-1 font-sans">
                              {disc.qualifier_type === 'manual' && 'Manual Trigger'}
                              {disc.qualifier_type === 'order_total' && `If order total >= $${disc.qualifier_value}`}
                              {disc.qualifier_type === 'item_quantity' && `Buy ${disc.qualifier_value} tagged "${disc.discount_tag}"`}
                              {` | `}
                              {disc.reward_type === 'order_discount' && 'Discount order'}
                              {disc.reward_type === 'item_discount_qty' && 'Discount item qty'}
                              {disc.reward_type === 'item_discount_all' && 'Discount all item variants'}
                              {disc.reward_type === 'lowest_cost_item' && 'Cheapest item free/disc'}
                              {disc.reward_type === 'items_for_price' && 'Package bundle price'}
                            </span>
                          </div>
                          <span className="text-sm font-mono font-bold text-custom-accent bg-custom-input border border-custom-border px-3 py-1 rounded w-max select-all">
                            {valType === 'percentage' ? `${val}% OFF` : `$${val.toFixed(2)} OFF`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            id={`btn-edit-discount-${disc.id}`}
                            onClick={() => handleStartEditDiscount(disc)}
                            className="p-3 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-muted hover:text-custom-text rounded-xl transition-all shrink-0"
                            title="Edit Preset"
                          >
                            <SquarePen className="h-4.5 w-4.5" />
                          </button>
                          <button
                            id={`btn-delete-discount-${disc.id}`}
                            onClick={() => handleDeleteDiscount(disc.id)}
                            className="p-3 bg-custom-input border border-custom-border hover:bg-red-900/30 text-custom-muted hover:text-red-400 rounded-xl transition-all shrink-0"
                            title="Delete Preset"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB TAXES CONFIG */}
        {subTab === 'taxes' && (
          <div className="h-full flex flex-col xl:flex-row gap-6 min-h-0 p-6">
            {/* Tax Creator */}
            <div className="w-full xl:w-96 shrink-0">
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg flex flex-col space-y-4">
                <h3 className="text-lg font-bold text-custom-text flex items-center justify-between pb-2 border-b border-custom-border">
                  <span className="flex items-center gap-2">
                    <Percent className="h-5 w-5 text-custom-accent" /> {editingTaxId !== null ? 'Edit Tax Rate' : 'Create Tax Rate'}
                  </span>
                  {editingTaxId !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTaxId(null);
                        setNewTaxName('');
                        setNewTaxRate('');
                        setNewTaxScope('total');
                      }}
                      className="text-xs text-custom-muted hover:text-custom-text underline font-bold"
                    >
                      Cancel Edit
                    </button>
                  )}
                </h3>

                <form onSubmit={handleApplyTax} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Tax Name</label>
                    <input
                      id="admin-tax-name"
                      type="text"
                      placeholder="e.g. State Sales Tax"
                      value={newTaxName}
                      onChange={e => setNewTaxName(e.target.value)}
                      className="w-full px-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-base placeholder:text-custom-muted/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Tax Rate (%)</label>
                    <input
                      id="admin-tax-rate"
                      type="number"
                      step="0.01"
                      placeholder="e.g. 7.00"
                      value={newTaxRate}
                      onChange={e => setNewTaxRate(e.target.value)}
                      className="w-full px-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none font-mono text-base placeholder:text-custom-muted/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-2">Tax Scope</label>
                    <div className="grid grid-cols-2 gap-2 bg-custom-input border border-custom-border rounded-xl p-1 shadow-inner">
                      <button
                        id="admin-tax-scope-total"
                        type="button"
                        onClick={() => setNewTaxScope('total')}
                        className={`py-2 text-center rounded-lg font-bold text-sm transition-all ${newTaxScope === 'total'
                          ? 'bg-custom-primary text-white shadow shadow-black/20'
                          : 'text-custom-muted hover:text-custom-text'
                          }`}
                      >
                        Total (All Items)
                      </button>
                      <button
                        id="admin-tax-scope-item"
                        type="button"
                        onClick={() => setNewTaxScope('item')}
                        className={`py-2 text-center rounded-lg font-bold text-sm transition-all ${newTaxScope === 'item'
                          ? 'bg-custom-primary text-white shadow shadow-black/20'
                          : 'text-custom-muted hover:text-custom-text'
                          }`}
                      >
                        Per-Item Only
                      </button>
                    </div>
                  </div>

                  <button
                    id="btn-admin-add-tax-submit"
                    type="submit"
                    className="w-full py-4 bg-custom-primary hover:bg-custom-primary-hover active:scale-97 text-white font-extrabold text-base rounded-xl transition-all shadow border border-custom-border"
                  >
                    {editingTaxId !== null ? 'Save Changes' : 'Add Tax Preset'}
                  </button>
                </form>
              </div>
            </div>

            {/* Taxes List */}
            <div className="flex-1 glass-panel border-custom-border rounded-2xl shadow-lg flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 bg-custom-header border-b border-custom-border flex items-center justify-between">
                <span className="font-bold text-custom-text">Active Taxes</span>
                <span className="text-xs bg-custom-input text-custom-muted border border-custom-border px-2 py-0.5 rounded font-bold font-mono">
                  {(taxes || []).length} Presets Available
                </span>
              </div>

              <div className="flex-1 overflow-auto p-6 space-y-3 max-w-2xl">
                {(taxes || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-custom-muted py-16">
                    <Percent className="h-8 w-8 text-custom-muted mb-3" />
                    No tax rates defined
                  </div>
                ) : (
                  (taxes || []).map(tax => (
                    <div
                      key={tax.id}
                      className="bg-custom-input/40 border border-custom-border rounded-xl p-4 flex items-center justify-between shadow shadow-black/20"
                    >
                      <div className="min-w-0 pr-4 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <span className="font-bold text-custom-text text-base block">{tax.name}</span>
                          <span className="text-xs text-custom-muted uppercase tracking-wider font-semibold">
                            Scope: {tax.scope === 'total' ? 'Total (All Items)' : 'Per-Item Only'}
                          </span>
                        </div>
                        <span className="text-sm font-mono font-bold text-custom-accent bg-custom-input border border-custom-border px-3 py-1 rounded w-max select-all">
                          {tax.rate}% TAX
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          id={`btn-edit-tax-${tax.id}`}
                          onClick={() => {
                            setEditingTaxId(tax.id);
                            setNewTaxName(tax.name);
                            setNewTaxRate(tax.rate.toString());
                            setNewTaxScope(tax.scope);
                          }}
                          className={`p-3 border rounded-xl transition-all shrink-0 ${
                            editingTaxId === tax.id
                              ? 'bg-custom-primary/20 border-custom-primary text-custom-accent font-bold shadow'
                              : 'bg-custom-input border-custom-border text-custom-muted hover:text-custom-text hover:bg-custom-primary/10'
                          }`}
                          title="Edit Preset"
                        >
                          <SquarePen className="h-4.5 w-4.5" />
                        </button>
                        <button
                          id={`btn-delete-tax-${tax.id}`}
                          onClick={async () => {
                            if (await handleConfirm(`Delete tax preset "${tax.name}"?`, 'Delete Tax Preset', true)) {
                              try {
                                await invoke('delete_tax', { id: tax.id });
                                triggerNotice(`Deleted tax preset "${tax.name}"`, 'success');
                                if (editingTaxId === tax.id) {
                                  setEditingTaxId(null);
                                  setNewTaxName('');
                                  setNewTaxRate('');
                                  setNewTaxScope('total');
                                }
                                loadTaxes();
                                loadInventory();
                              } catch (err) {
                                triggerNotice('Failed to delete tax: ' + err, 'error');
                              }
                            }
                          }}
                          className="p-3 bg-custom-input border border-custom-border hover:bg-red-900/30 text-custom-muted hover:text-red-400 rounded-xl transition-all shrink-0"
                          title="Delete Preset"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB C: SALES LEDGER AUDITING */}
        {subTab === 'sales' && (
          <div className="h-full glass-panel border-custom-border rounded-2xl shadow-lg flex flex-col min-h-0 overflow-hidden">
            <div className="p-4 bg-custom-header border-b border-custom-border flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-custom-text text-base">Historical Transaction Ledger</span>
                <span className="text-xs bg-custom-input text-custom-accent border border-custom-border px-2.5 py-0.5 rounded-full font-bold">
                  Total Sales Count: {sales.length}
                </span>
              </div>

              {/* Date filters and actions */}
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                <div className="flex items-center gap-2 text-xs font-bold text-custom-muted">
                  <span>From:</span>
                  <input
                    type="datetime-local"
                    value={ledgerStartDate}
                    onChange={e => setLedgerStartDate(e.target.value)}
                    className="px-2 py-1 bg-custom-input border border-custom-border text-custom-text rounded focus:outline-none focus:border-custom-primary cursor-pointer font-mono"
                  />
                  <span>To:</span>
                  <input
                    type="datetime-local"
                    value={ledgerEndDate}
                    onChange={e => setLedgerEndDate(e.target.value)}
                    className="px-2 py-1 bg-custom-input border border-custom-border text-custom-text rounded focus:outline-none focus:border-custom-primary cursor-pointer font-mono"
                  />
                  {(ledgerStartDate || ledgerEndDate) && (
                    <button
                      onClick={() => { setLedgerStartDate(''); setLedgerEndDate(''); }}
                      className="px-2 py-1 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-muted hover:text-custom-text rounded transition-all cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setShowManualSaleModal(true)}
                  className="px-3.5 py-1.5 bg-custom-primary hover:bg-custom-primary-hover text-white text-xs font-bold rounded-lg transition-all active:scale-95 flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <PlusCircle className="h-4 w-4" /> Log Sale
                </button>

                <button
                  id="btn-refresh-sales"
                  onClick={loadSales}
                  className="p-2 bg-custom-input hover:bg-custom-input/80 border border-custom-border text-custom-muted hover:text-custom-text rounded-lg transition-all active:scale-90"
                  title="Reload Ledger"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto min-h-0">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-custom-input text-custom-muted border-b border-custom-border uppercase text-xs font-extrabold select-none">
                    <th className="py-4 px-6 w-20 cursor-pointer hover:text-custom-text" onClick={() => handleSort('id')}>
                      Sale ID {sortColumn === 'id' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="py-4 px-6 cursor-pointer hover:text-custom-text" onClick={() => handleSort('timestamp')}>
                      Timestamp {sortColumn === 'timestamp' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="py-4 px-6 text-right cursor-pointer hover:text-custom-text" onClick={() => handleSort('subtotal')}>
                      Subtotal {sortColumn === 'subtotal' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="py-4 px-6 text-right cursor-pointer hover:text-custom-text" onClick={() => handleSort('discount_total')}>
                      Discounts {sortColumn === 'discount_total' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="py-4 px-6 text-right cursor-pointer hover:text-custom-text" onClick={() => handleSort('tax_total')}>
                      Sales Tax {sortColumn === 'tax_total' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="py-4 px-6 text-right cursor-pointer hover:text-custom-text" onClick={() => handleSort('final_total')}>
                      Grand Total {sortColumn === 'final_total' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="py-4 px-6 cursor-pointer hover:text-custom-text" onClick={() => handleSort('payment_method')}>
                      Payment Method {sortColumn === 'payment_method' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="py-4 px-6 text-right cursor-pointer hover:text-custom-text" onClick={() => handleSort('transaction_fee')}>
                      Fee {sortColumn === 'transaction_fee' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="py-4 px-6 text-center w-24">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-custom-border">
                  {getFilteredAndSortedSales().length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-custom-muted">
                        <History className="h-8 w-8 mx-auto mb-3 text-custom-muted/50" />
                        No transactions registered in this ledger database
                      </td>
                    </tr>
                  ) : (
                    getFilteredAndSortedSales().map(sale => {
                      const isExpanded = expandedSaleId === sale.id;
                      const isRefunded = sale.status === 'refunded';
                      return (
                        <React.Fragment key={sale.id}>
                          <tr className={`hover:bg-custom-primary/10 text-custom-text transition-colors ${isExpanded ? 'bg-custom-primary/5' : ''} ${isRefunded ? 'opacity-60 bg-red-950/5' : ''}`}>
                            <td className="py-4 px-6 font-mono text-xs text-custom-muted">#{sale.id}</td>
                            <td className="py-4 px-6 font-semibold">
                              <div className="flex flex-col">
                                <span>{new Date(sale.timestamp).toLocaleString()}</span>
                                {isRefunded && (
                                  <span className="text-[10px] text-red-400 font-extrabold uppercase mt-0.5">
                                    [Refunded / Returned]
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right font-mono">${sale.subtotal.toFixed(2)}</td>
                            <td className="py-4 px-6 text-right font-mono text-red-400">
                              {sale.discount_total > 0 ? `-$${sale.discount_total.toFixed(2)}` : '$0.00'}
                            </td>
                            <td className="py-4 px-6 text-right font-mono">${sale.tax_total.toFixed(2)}</td>
                            <td className="py-4 px-6 text-right font-mono text-base font-bold text-custom-accent">
                              ${sale.final_total.toFixed(2)}
                            </td>
                            <td className="py-4 px-6 font-semibold">
                              <div className="flex flex-col">
                                <select
                                  disabled={isRefunded}
                                  value={sale.payment_method || 'Cash'}
                                  onChange={async (e) => {
                                    const newMethodName = e.target.value;
                                    const method = paymentMethods.find(m => m.name === newMethodName);
                                    const feeRatePercentage = method ? method.fee_percentage : 0;
                                    const feeFlat = method ? method.fee_flat : 0;
                                    const newFee = (sale.final_total * feeRatePercentage / 100) + feeFlat;
                                    try {
                                      await invoke('update_sale_payment', {
                                        saleId: sale.id,
                                        paymentMethod: newMethodName,
                                        transactionFee: newFee
                                      });
                                      triggerNotice('Payment method updated successfully!', 'success');
                                      loadSales();
                                      loadYearlySummary();
                                    } catch (err) {
                                      triggerNotice('Failed to update payment method: ' + err, 'error');
                                    }
                                  }}
                                  className="bg-custom-input border border-custom-border text-custom-text text-xs rounded px-1.5 py-0.5 focus:outline-none focus:border-custom-primary cursor-pointer font-bold disabled:opacity-50"
                                >
                                  {(paymentMethods || [])
                                    .filter(m => m && (m.status === 'active' || m.name === sale.payment_method))
                                    .map(m => (
                                      <option key={m.id} value={m.name}>{m.name}</option>
                                    ))}
                                </select>
                                {sale.godaddy_transaction_id && (
                                  <span className="text-[9px] text-custom-muted font-mono mt-1">
                                    ID: {sale.godaddy_transaction_id}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right font-mono text-red-400">
                              -${(sale.transaction_fee || 0).toFixed(2)}
                            </td>
                            <td className="py-4 px-6 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  id={`btn-toggle-sale-details-${sale.id}`}
                                  onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                                  className={`p-2 rounded-lg border transition-all ${isExpanded
                                    ? 'bg-custom-primary/20 border-custom-primary text-custom-text'
                                    : 'bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-muted hover:text-custom-text'
                                    }`}
                                  title="Inspect sold items"
                                >
                                  <Eye className="h-4.5 w-4.5" />
                                </button>
                                <button
                                  id={`btn-delete-sale-${sale.id}`}
                                  onClick={() => {
                                    setSelectedSaleForAction(sale);
                                    setShowDeleteOrRefundModal(true);
                                  }}
                                  className="p-2 bg-custom-input border border-custom-border hover:bg-red-950/60 text-custom-muted hover:text-red-400 rounded-lg transition-all"
                                  title="Delete / Refund transaction"
                                >
                                  <Trash2 className="h-4.5 w-4.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expansion drawer showing individual sale items */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={9} className="bg-custom-input/40 px-8 py-4 border-b border-custom-border">
                                <div className="border border-custom-border rounded-xl overflow-hidden max-w-2xl shadow-inner">
                                  <div className="bg-custom-header px-4 py-2 border-b border-custom-border text-xs font-bold text-custom-muted uppercase tracking-wider flex items-center justify-between">
                                    <span>Sold Items Receipt Detail</span>
                                    <button
                                      id={`btn-ledger-print-receipt-${sale.id}`}
                                      onClick={() => {
                                        setSelectedReceiptSale(sale);
                                        setShowReceiptModal(true);
                                      }}
                                      className="px-2.5 py-1 bg-custom-primary hover:bg-custom-primary-hover text-white text-[10px] font-extrabold rounded flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                                    >
                                      <Printer className="h-3 w-3" /> View & Print Receipt
                                    </button>
                                  </div>
                                  <table className="w-full text-left text-xs font-semibold">
                                    <thead>
                                      <tr className="bg-custom-input text-custom-muted border-b border-custom-border uppercase text-[10px]">
                                        <th className="py-2.5 px-4">Product Name</th>
                                        <th className="py-2.5 px-4 text-center">Quantity</th>
                                        <th className="py-2.5 px-4 text-right">Price at Sale</th>
                                        <th className="py-2.5 px-4 text-right">Subtotal</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-custom-border text-custom-text">
                                      {sale.items && sale.items.map(sItem => (
                                        <tr key={sItem.id} className="hover:bg-custom-primary/10">
                                          <td className="py-2 px-4">
                                            <span className="block font-bold text-custom-text">{sItem.item_name || `Unknown ID: ${sItem.item_id}`}</span>
                                            {sItem.item_barcode && <span className="block text-[9px] text-custom-muted font-mono mt-0.5">{sItem.item_barcode}</span>}
                                          </td>
                                          <td className="py-2 px-4 text-center font-mono text-custom-text font-bold">{sItem.quantity}</td>
                                          <td className="py-2 px-4 text-right font-mono">${sItem.price_at_sale.toFixed(2)}</td>
                                          <td className="py-2 px-4 text-right font-mono text-custom-text">${(sItem.price_at_sale * sItem.quantity).toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Delete / Refund dialog */}
              {showDeleteOrRefundModal && selectedSaleForAction && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="relative w-full max-w-md mx-4 bg-custom-card border border-custom-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-6 space-y-6">
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-custom-primary" />
                    <div className="flex justify-between items-center pb-3 border-b border-custom-border">
                      <h3 className="font-extrabold text-custom-text uppercase tracking-wider text-sm">
                        Manage Sale #{selectedSaleForAction.id}
                      </h3>
                      <button
                        onClick={() => { setShowDeleteOrRefundModal(false); setSelectedSaleForAction(null); }}
                        className="p-1 hover:bg-custom-primary/20 rounded text-custom-muted hover:text-custom-text transition-all"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="text-xs text-custom-text leading-relaxed font-semibold">
                      Would you like to process a **Refund / Return** (mark as refunded in the ledger, with optional inventory restock) or permanently **Delete** this transaction (revert inventory and remove from DB)?
                    </p>

                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => {
                          setShowDeleteOrRefundModal(false);
                          setShowRefundModal(true);
                          setIsRestockInventory(true);
                        }}
                        className="w-full py-3 bg-custom-primary hover:bg-custom-primary-hover text-white rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wide shadow"
                      >
                        Refund / Return Transaction
                      </button>
                      <button
                        onClick={() => {
                          setShowDeleteOrRefundModal(false);
                          setSelectedDeleteSale(selectedSaleForAction);
                          setShowSaleDeleteModal(true);
                        }}
                        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wide shadow"
                      >
                        <AlertTriangle className="h-4 w-4" /> Hard Delete Transaction
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Refund confirmation modal */}
              {showRefundModal && selectedSaleForAction && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="relative w-full max-w-md mx-4 bg-custom-card border border-custom-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-6 space-y-6">
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-emerald-500" />
                    <div className="flex justify-between items-center pb-3 border-b border-custom-border">
                      <h3 className="font-extrabold text-custom-text uppercase tracking-wider text-sm flex items-center gap-2">
                        <Sparkles className="h-4.5 w-4.5 text-emerald-400 animate-pulse" /> Refund / Return Sale #{selectedSaleForAction.id}
                      </h3>
                      <button
                        onClick={() => { setShowRefundModal(false); setSelectedSaleForAction(null); }}
                        className="p-1 hover:bg-custom-primary/20 rounded text-custom-muted hover:text-custom-text transition-all"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-custom-input/40 border border-custom-border p-4 rounded-xl flex justify-between items-center">
                        <span className="text-xs text-custom-muted font-bold">Total Refund Amount:</span>
                        <span className="font-mono font-black text-custom-accent text-lg">${selectedSaleForAction.final_total.toFixed(2)}</span>
                      </div>

                      <div className="space-y-2">
                        <span className="block text-xs font-bold text-custom-text">Select Inventory Return Policy:</span>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setIsRestockInventory(true)}
                            className={`py-2 px-3 border rounded-xl text-xs font-bold transition-all ${
                              isRestockInventory
                                ? 'bg-custom-primary border-custom-primary text-white'
                                : 'bg-custom-input border-custom-border text-custom-muted hover:text-custom-text'
                            }`}
                          >
                            Return &amp; Restock
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsRestockInventory(false)}
                            className={`py-2 px-3 border rounded-xl text-xs font-bold transition-all ${
                              !isRestockInventory
                                ? 'bg-custom-primary border-custom-primary text-white'
                                : 'bg-custom-input border-custom-border text-custom-muted hover:text-custom-text'
                            }`}
                          >
                            Refund (No Restock)
                          </button>
                        </div>
                        <span className="block text-[10px] text-custom-muted mt-1 leading-relaxed">
                          {isRestockInventory
                            ? 'Sellable goods. Items in this transaction will be added back to inventory stock.'
                            : 'Damaged or unsellable goods. Inventory stock quantities will NOT be altered.'}
                        </span>
                      </div>

                      {selectedSaleForAction.payment_method === 'GoDaddy Terminal Flex' && (
                        <div className="p-3 bg-custom-accent/10 border border-custom-accent/30 rounded-xl text-xs text-custom-text space-y-1">
                          <span className="font-extrabold block text-[10px] uppercase tracking-wider text-custom-accent">GoDaddy Integration</span>
                          <span>This transaction was processed via GoDaddy. Clicking confirm will trigger a refund request directly to the terminal port.</span>
                          {!selectedSaleForAction.godaddy_transaction_id && (
                            <span className="block font-black text-red-400 text-[10px] uppercase mt-1">
                              Warning: No GoDaddy transaction ID found. Terminal refund cannot be completed automatically. Refund manually on device!
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 justify-end border-t border-custom-border pt-4 bg-custom-header/10 -mx-6 -mb-6 p-6">
                      <button
                        onClick={() => { setShowRefundModal(false); setSelectedSaleForAction(null); }}
                        className="py-2.5 px-4 bg-custom-input border border-custom-border text-custom-text font-bold text-xs rounded-xl transition-all active:scale-95"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleApplyRefund}
                        className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow uppercase tracking-wide"
                      >
                        Confirm &amp; Print Receipt
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* GoDaddy Not Paired warning modal */}
              {showGoDaddyNotPairedModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="relative w-full max-w-sm mx-4 bg-custom-card border border-custom-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-6 space-y-4">
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-custom-accent" />
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
                        onClick={() => setShowGoDaddyNotPairedModal(false)}
                        className="px-4 py-2 bg-custom-input border border-custom-border text-custom-text font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => {
                          setShowGoDaddyNotPairedModal(false);
                          setSubTab('devices');
                        }}
                        className="px-4 py-2 bg-custom-primary hover:bg-custom-primary-hover text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all active:scale-95"
                      >
                        Go to Pairing Page
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Log Manual Sale modal */}
              {showManualSaleModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="relative w-full max-w-2xl mx-4 bg-custom-card border border-custom-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-custom-primary" />
                    
                    <div className="bg-custom-header px-6 py-4 flex items-center justify-between border-b border-custom-border mt-1 shrink-0">
                      <h3 className="text-base font-bold text-custom-text flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5 text-custom-primary" /> Log Manual Sale
                      </h3>
                      <button
                        onClick={() => { setShowManualSaleModal(false); setManualSaleCart([]); }}
                        className="p-1 hover:bg-custom-primary/20 rounded text-custom-muted hover:text-custom-text transition-all"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1 space-y-6">
                      <div className="bg-custom-input/30 border border-custom-border rounded-xl p-4 space-y-3">
                        <span className="block text-xs font-bold text-custom-text uppercase tracking-wider">Add Item to Sale</span>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                          <div className="flex flex-col gap-1 md:col-span-2">
                            <label className="text-[10px] text-custom-muted font-bold uppercase">Product</label>
                            <select
                              value={manualSaleSelectedItemId}
                              onChange={e => setManualSaleSelectedItemId(e.target.value)}
                              className="px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs font-semibold focus:outline-none focus:border-custom-primary cursor-pointer"
                            >
                              <option value="">-- Choose Product --</option>
                              {items.map(i => (
                                <option key={i.id} value={i.id}>{i.name} (${i.price.toFixed(2)})</option>
                              ))}
                            </select>
                          </div>
                          
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-custom-muted font-bold uppercase">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={manualSaleItemQty}
                              onChange={e => setManualSaleItemQty(parseInt(e.target.value) || 1)}
                              className="px-2 py-1 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs font-mono text-center focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-4 justify-between h-9 pb-1">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                id="manual-sale-bulk"
                                checked={manualSaleIsBulk}
                                onChange={e => setManualSaleIsBulk(e.target.checked)}
                                className="rounded bg-custom-input border-custom-border text-custom-primary"
                              />
                              <label htmlFor="manual-sale-bulk" className="text-[10px] text-custom-muted uppercase font-bold cursor-pointer">
                                Case (Bulk)
                              </label>
                            </div>
                            <button
                              type="button"
                              onClick={handleAddManualSaleItem}
                              disabled={!manualSaleSelectedItemId}
                              className="px-3.5 py-1.5 bg-custom-accent hover:bg-custom-accent/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition-all shadow cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="border border-custom-border rounded-xl overflow-hidden bg-custom-input/10">
                        <table className="w-full text-left text-xs font-semibold">
                          <thead>
                            <tr className="bg-custom-header text-custom-muted border-b border-custom-border uppercase text-[10px]">
                              <th className="py-2.5 px-4">Item</th>
                              <th className="py-2.5 px-4 text-center">Qty</th>
                              <th className="py-2.5 px-4 text-right">Price</th>
                              <th className="py-2.5 px-4 text-right">Subtotal</th>
                              <th className="py-2.5 px-4 text-center w-12">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-custom-border text-custom-text">
                            {manualSaleCart.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-8 text-center text-custom-muted">No items in manual cart</td>
                              </tr>
                            ) : (
                              manualSaleCart.map((c, idx) => {
                                const price = c.isBulk && c.item.bulk_price !== null && c.item.bulk_price !== undefined ? c.item.bulk_price : c.item.price;
                                return (
                                  <tr key={idx} className="hover:bg-custom-primary/5">
                                    <td className="py-2 px-4">
                                      <span className="font-bold">{c.item.name}</span>
                                      {c.isBulk && <span className="text-[9px] text-custom-accent uppercase font-black ml-1">[Bulk Case]</span>}
                                    </td>
                                    <td className="py-2 px-4 text-center font-mono">{c.quantity}</td>
                                    <td className="py-2 px-4 text-right font-mono">${price.toFixed(2)}</td>
                                    <td className="py-2 px-4 text-right font-mono">${(price * c.quantity).toFixed(2)}</td>
                                    <td className="py-2 px-4 text-center">
                                      <button
                                        type="button"
                                        onClick={() => setManualSaleCart(manualSaleCart.filter((_, i) => i !== idx))}
                                        className="text-red-400 hover:text-red-500 font-extrabold cursor-pointer"
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        <div className="space-y-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-custom-muted font-bold uppercase tracking-wider">Apply Discount</label>
                            <select
                              value={manualSaleDiscountId}
                              onChange={e => setManualSaleDiscountId(e.target.value)}
                              className="px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs font-semibold focus:outline-none cursor-pointer"
                            >
                              <option value="">None</option>
                              {discounts.map(d => (
                                <option key={d.id} value={d.id}>{d.name} ({d.type === 'percentage' ? `${d.value}%` : `$${d.value.toFixed(2)}`})</option>
                              ))}
                            </select>
                          </div>
                          
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-custom-muted font-bold uppercase tracking-wider">Apply Sales Tax</label>
                            <select
                              value={manualSaleTaxId}
                              onChange={e => setManualSaleTaxId(e.target.value)}
                              className="px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs font-semibold focus:outline-none cursor-pointer"
                            >
                              <option value="">None / 0% Tax</option>
                              {taxes.map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-custom-muted font-bold uppercase tracking-wider">Payment Method</label>
                            <select
                              value={manualSalePaymentMethod}
                              onChange={e => setManualSalePaymentMethod(e.target.value)}
                              className="px-2 py-1.5 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs font-semibold focus:outline-none cursor-pointer"
                            >
                              {paymentMethods
                                .filter(m => m.status === 'active')
                                .map(m => (
                                  <option key={m.id} value={m.name}>{m.name}</option>
                                ))}
                            </select>
                          </div>

                          {manualSalePaymentMethod === 'GoDaddy Terminal Flex' && (
                            <div className="flex flex-col gap-1 animate-in fade-in duration-200">
                              <label className="text-[10px] text-custom-muted font-bold uppercase tracking-wider">GoDaddy Transaction ID (Optional)</label>
                              <input
                                type="text"
                                placeholder="e.g. TX_888999"
                                value={manualSaleGoDaddyTxId}
                                onChange={e => setManualSaleGoDaddyTxId(e.target.value)}
                                className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text rounded-xl text-xs font-mono focus:outline-none"
                              />
                            </div>
                          )}
                        </div>

                        {(() => {
                          const { subtotal, discountTotal, taxTotal, finalTotal, transactionFee } = getManualSaleTotals();
                          return (
                            <div className="bg-custom-input/40 border border-custom-border rounded-xl p-4 space-y-2 text-xs">
                              <span className="block font-bold text-[10px] text-custom-muted uppercase tracking-wider mb-2">Calculated Invoice Summary</span>
                              <div className="flex justify-between">
                                <span className="text-custom-muted">Subtotal:</span>
                                <span className="font-mono text-custom-text font-bold">${subtotal.toFixed(2)}</span>
                              </div>
                              {discountTotal > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-custom-muted">Discounts:</span>
                                  <span className="font-mono text-red-400 font-bold">-${discountTotal.toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-custom-muted">Sales Tax:</span>
                                <span className="font-mono text-custom-text font-bold">${taxTotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between border-t border-custom-border/20 pt-2 text-sm font-extrabold text-custom-accent">
                                <span>Grand Total Due:</span>
                                <span className="font-mono font-black">${finalTotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] border-t border-custom-border/20 pt-2 text-custom-muted">
                                <span>Transaction Fee:</span>
                                <span className="font-mono">-${transactionFee.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="bg-custom-header border-t border-custom-border px-6 py-4 flex gap-3 justify-end shrink-0">
                      <button
                        onClick={() => { setShowManualSaleModal(false); setManualSaleCart([]); }}
                        className="py-2.5 px-4 bg-custom-input border border-custom-border text-custom-text font-bold text-xs rounded-xl transition-all active:scale-95"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveManualSale}
                        disabled={manualSaleCart.length === 0}
                        className="py-2.5 px-5 bg-custom-primary hover:bg-custom-primary-hover active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl transition-all shadow uppercase tracking-wide cursor-pointer"
                      >
                        Save Transaction
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Original hard-delete modal */}
              {showSaleDeleteModal && selectedDeleteSale && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="relative w-full max-w-md mx-4 bg-custom-card border border-custom-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-6 space-y-6">
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-red-500" />
                    <div className="flex justify-between items-center pb-3 border-b border-custom-border">
                      <h3 className="font-extrabold text-custom-text uppercase tracking-wider text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4.5 w-4.5 text-red-500 animate-bounce" /> Delete Sale Transaction
                      </h3>
                      <button
                        onClick={() => { setShowSaleDeleteModal(false); setSelectedDeleteSale(null); }}
                        className="p-1 hover:bg-custom-primary/20 rounded text-custom-muted hover:text-custom-text transition-all"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-col gap-1 border border-custom-border p-4 rounded-xl bg-custom-input/40">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-custom-muted font-bold">Transaction Reference:</span>
                          <span className="font-mono text-custom-text font-bold">#{selectedDeleteSale.id}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs mt-2">
                          <span className="text-custom-muted font-bold">Timestamp:</span>
                          <span className="font-mono text-custom-text font-bold">{new Date(selectedDeleteSale.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs mt-2 border-t border-custom-border/20 pt-2">
                          <span className="text-custom-muted font-bold">Total Sales Value:</span>
                          <span className="font-mono text-custom-accent font-black text-sm">${selectedDeleteSale.final_total.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl flex gap-3 text-red-400">
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        <div className="text-xs leading-relaxed font-semibold">
                          <p className="font-black uppercase tracking-wider">Warning: Critical Action</p>
                          <p className="mt-1">DANGER: This action will permanently remove the sale record. All inventory changes will be rolled back, and sold items will be added back to stock as if the purchase never happened. This cannot be undone.</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button
                        id="btn-delete-sale-cancel"
                        onClick={() => { setShowSaleDeleteModal(false); setSelectedDeleteSale(null); }}
                        className="flex-1 py-3 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text rounded-xl font-bold text-xs transition-all active:scale-95 shadow"
                      >
                        Cancel
                      </button>
                      <button
                        id="btn-apply-delete-sale"
                        onClick={handleApplyDelete}
                        className="flex-1 py-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white shadow-lg active:scale-95 border border-white/10"
                      >
                        <Trash2 className="h-4 w-4" /> Delete Transaction
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* SUB-TAB D: SALES ANALYTICS (YoY COMPARISON & DAILY SUMMARY) */}
        {subTab === 'analytics' && (
          <div className="h-full overflow-y-auto pr-1 pb-6 space-y-6 min-h-0 select-none">

            {/* Profit Calculations Summary Card */}
            <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-custom-border pb-3 mb-4">
                <h3 className="text-base font-bold text-custom-text flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-custom-accent" /> Profit Calculations
                </h3>
                {yearlySummaries.length > 0 && (
                  <select
                    id="select-profit-year"
                    value={selectedProfitYear || [...yearlySummaries].sort((a, b) => String(b.year).localeCompare(String(a.year)))[0]?.year || ''}
                    onChange={e => setSelectedProfitYear(e.target.value)}
                    className="px-3 py-1.5 bg-custom-input border border-custom-border text-custom-text text-xs font-bold rounded-lg focus:outline-none focus:border-custom-primary cursor-pointer"
                  >
                    {[...yearlySummaries]
                      .sort((a, b) => String(b.year).localeCompare(String(a.year)))
                      .map(s => (
                        <option key={s.year} value={s.year}>{s.year}</option>
                      ))}
                  </select>
                )}
              </div>
              {(() => {
                const grandTotalRevenue = yearlySummaries.reduce((sum, s) => sum + s.total_sales, 0);
                const totalCogsInDb = yearlySummaries.reduce((sum, s) => sum + (s.total_sales - s.profit - (s.total_fees || 0)), 0);
                const activeYear = selectedProfitYear || [...yearlySummaries].sort((a, b) => String(b.year).localeCompare(String(a.year)))[0]?.year || '';
                const yearData = yearlySummaries.find(s => String(s.year) === String(activeYear));
                const yearRevenue = yearData ? yearData.total_sales : 0;
                const yearFees = yearData ? (yearData.total_fees || 0) : 0;
                const yearStockExpense = totalStockCostSpent > 0
                  ? (totalCogsInDb === 0
                    ? (grandTotalRevenue > 0 ? (yearRevenue / grandTotalRevenue) * totalStockCostSpent : 0)
                    : (yearData ? yearData.total_sales - yearData.profit - yearFees : 0))
                  : 0;
                const yearProfit = yearRevenue - yearStockExpense - yearFees;
                const appliedCost = totalStockCostSpent;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-custom-input/40 border border-custom-border rounded-xl p-4 text-center">
                      <span className="block text-xs text-custom-muted uppercase font-bold">Total Sales Revenue (Gross)</span>
                      <span className="block font-mono text-xl font-bold text-custom-accent mt-1">${yearRevenue.toFixed(2)}</span>
                    </div>
                    <div className="bg-custom-input/40 border border-custom-border rounded-xl p-4 text-center">
                      <span className="block text-xs text-custom-muted uppercase font-bold">Total Transaction Fees</span>
                      <span className="block font-mono text-xl font-bold text-red-400 mt-1">-${yearFees.toFixed(2)}</span>
                    </div>
                    <div className="bg-custom-input/40 border border-custom-border rounded-xl p-4 text-center relative">
                      <span className="block text-xs text-custom-muted uppercase font-bold">Total Stock Expenses</span>
                      {isEditingExpenses ? (
                        <div className="flex items-center justify-center gap-1.5 mt-2">
                          <span className="text-red-400 font-mono font-bold text-lg">$</span>
                          <input
                            id="analytics-expenses-input"
                            type="number"
                            min="0"
                            step="0.01"
                            autoFocus
                            value={expensesEditValue}
                            onChange={e => setExpensesEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const val = parseFloat(expensesEditValue) || 0;
                                handleTotalCostChange(val);
                                setIsEditingExpenses(false);
                              } else if (e.key === 'Escape') {
                                setIsEditingExpenses(false);
                              }
                            }}
                            className="w-28 px-2 py-1 bg-custom-input border border-custom-border text-red-400 font-mono text-lg rounded-lg focus:outline-none text-center font-bold"
                          />
                          <button
                            id="btn-analytics-expenses-save"
                            onClick={() => {
                              const val = parseFloat(expensesEditValue) || 0;
                              handleTotalCostChange(val);
                              setIsEditingExpenses(false);
                            }}
                            className="p-1.5 bg-custom-primary/20 border border-custom-primary text-custom-primary hover:bg-custom-primary hover:text-white rounded-lg transition-all"
                            title="Save"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            id="btn-analytics-expenses-cancel"
                            onClick={() => setIsEditingExpenses(false)}
                            className="p-1.5 bg-custom-input border border-custom-border text-custom-muted hover:text-custom-text rounded-lg transition-all"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 mt-1">
                          <span className="font-mono text-xl font-bold text-red-400">${yearStockExpense > 0 ? yearStockExpense.toFixed(2) : appliedCost.toFixed(2)}</span>
                          <button
                            id="btn-analytics-expenses-edit"
                            onClick={() => {
                              setExpensesEditValue(appliedCost > 0 ? appliedCost.toFixed(2) : '');
                              setIsEditingExpenses(true);
                            }}
                            className="p-1.5 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-muted hover:text-custom-text rounded-lg transition-all"
                            title="Edit Total Stock Expenses"
                          >
                            <SquarePen className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <span className="block text-[10px] text-custom-muted/70 mt-1">Leave 0 to disable profit tracking.</span>
                    </div>
                    <div className="bg-custom-input/40 border border-custom-border rounded-xl p-4 text-center">
                      <span className="block text-xs text-custom-muted uppercase font-bold">Net Booth Profit</span>
                      <span className={`block font-mono text-xl font-bold mt-1 ${(totalStockCostSpent > 0 ? yearProfit : (yearRevenue - yearFees)) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${(totalStockCostSpent > 0 ? yearProfit : (yearRevenue - yearFees)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Top Revenue Summary Block */}
            <div className="flex flex-col xl:flex-row gap-6">
              {/* Analytics Table Panel */}
              <div className="flex-1 flex flex-col glass-panel rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between pb-4 border-b border-custom-border mb-4 shrink-0">
                  <div>
                    <h3 className="text-lg font-bold text-custom-text flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-custom-accent" /> Sales Analytics Dashboard
                    </h3>
                    <p className="text-xs text-custom-muted mt-0.5">
                      {analyticsMode === 'yearly' ? 'Year-over-Year (YoY) comparison of church booth sales' : 'Daily break-down of transaction volumes and revenue'}
                    </p>
                  </div>

                  {/* Viewing Option Toggle */}
                  <div className="flex bg-custom-input border border-custom-border rounded-xl p-1 shadow-inner select-none shrink-0">
                    <button
                      id="btn-analytics-toggle-yearly"
                      onClick={() => setAnalyticsMode('yearly')}
                      className={`px-4 py-2 rounded-lg font-bold text-xs transition-all active:scale-95 ${analyticsMode === 'yearly'
                        ? 'bg-custom-primary text-white shadow-md'
                        : 'text-custom-muted hover:text-custom-text'
                        }`}
                    >
                      Yearly YoY
                    </button>
                    <button
                      id="btn-analytics-toggle-daily"
                      onClick={() => setAnalyticsMode('daily')}
                      className={`px-4 py-2 rounded-lg font-bold text-xs transition-all active:scale-95 ${analyticsMode === 'daily'
                        ? 'bg-custom-primary text-white shadow-md'
                        : 'text-custom-muted hover:text-custom-text'
                        }`}
                    >
                      Daily Summary
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-custom-border bg-custom-input/20">
                  {isLoadingSummary ? (
                    <div className="flex items-center justify-center h-48 text-custom-muted font-bold text-sm">
                      Querying Ledger Statistics...
                    </div>
                  ) : analyticsMode === 'yearly' ? (
                    (yearlySummaries || []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                        <p className="text-custom-muted text-sm font-semibold">No yearly sales data found in the database.</p>
                      </div>
                    ) : (() => {
                      const grandTotalRevenue = yearlySummaries.reduce((sum, s) => sum + s.total_sales, 0);
                      const totalCogsInDb = yearlySummaries.reduce((sum, s) => sum + (s.total_sales - s.profit - (s.total_fees || 0)), 0);
                      const sortedYearly = [...(yearlySummaries || [])].sort((a, b) => String(a.year).localeCompare(String(b.year)));
                      return (
                        <table className="w-full text-left border-collapse text-xs font-semibold">
                          <thead>
                            <tr className="bg-custom-header text-custom-muted border-b border-custom-border uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4">Sales Year</th>
                              <th className="py-3 px-4 text-right">Sales Completed</th>
                              <th className="py-3 px-4 text-right">Subtotal Revenue</th>
                              <th className="py-3 px-4 text-right">Discounts Applied</th>
                              <th className="py-3 px-4 text-right">Tax Collected</th>
                              <th className="py-3 px-4 text-right">Grand Total Sales</th>
                              <th className="py-3 px-4 text-right">Transaction Fees</th>
                              {totalStockCostSpent > 0 && <th className="py-3 px-4 text-right">Stock Expenses</th>}
                              <th className="py-3 px-4 text-right">Net Profit</th>
                              <th className="py-3 px-4 text-right">Avg Sale Size</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-custom-border text-custom-text">
                            {sortedYearly.map((summary) => {
                              const yearExpenses = totalStockCostSpent > 0 && totalCogsInDb === 0
                                ? (grandTotalRevenue > 0 ? (summary.total_sales / grandTotalRevenue) * totalStockCostSpent : 0)
                                : (summary.total_sales - summary.profit - (summary.total_fees || 0));
                              return (
                                <tr key={summary.year} className="hover:bg-white/5 transition-colors">
                                  <td className="py-3.5 px-4 font-bold text-sm text-custom-accent">{summary.year}</td>
                                  <td className="py-3.5 px-4 text-right font-mono">{summary.ticket_count}</td>
                                  <td className="py-3.5 px-4 text-right font-mono">${(summary.subtotal || 0).toFixed(2)}</td>
                                  <td className="py-3.5 px-4 text-right font-mono text-red-400">-${(summary.discount_total || 0).toFixed(2)}</td>
                                  <td className="py-3.5 px-4 text-right font-mono">${(summary.tax_total || 0).toFixed(2)}</td>
                                  <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-bold text-sm">${(summary.total_sales || 0).toFixed(2)}</td>
                                  <td className="py-3.5 px-4 text-right font-mono text-red-400">-${(summary.total_fees || 0).toFixed(2)}</td>
                                  {totalStockCostSpent > 0 && <td className="py-3.5 px-4 text-right font-mono text-red-400">-${yearExpenses.toFixed(2)}</td>}
                                  <td className="py-3.5 px-4 text-right font-mono text-[#10b981] font-bold text-sm">${(summary.profit || 0).toFixed(2)}</td>
                                  <td className="py-3.5 px-4 text-right font-mono">${(summary.avg_ticket_value || 0).toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()
                  ) : (
                    (dailySummaries || []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                        <p className="text-custom-muted text-sm font-semibold">No daily sales data found in the database.</p>
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-xs font-semibold">
                        <thead>
                          <tr className="bg-custom-header text-custom-muted border-b border-custom-border uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Sales Date</th>
                            <th className="py-3 px-4 text-right">Sales Completed</th>
                            <th className="py-3 px-4 text-right">Grand Total Sales</th>
                            <th className="py-3 px-4 text-right">Avg Sale Size</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-custom-border text-custom-text">
                          {(dailySummaries || []).map((summary) => (
                            <tr key={summary.date} className="hover:bg-white/5 transition-colors">
                              <td className="py-3.5 px-4 font-bold text-sm text-custom-accent font-mono">{summary.date}</td>
                              <td className="py-3.5 px-4 text-right font-mono">{summary.ticket_count}</td>
                              <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-bold text-sm">${summary.total_sales.toFixed(2)}</td>
                              <td className="py-3.5 px-4 text-right font-mono">${summary.avg_ticket_value.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}
                </div>
              </div>

              {/* Visual SVG Chart Column */}
              {((analyticsMode === 'yearly' && (yearlySummaries || []).length > 0) || (analyticsMode === 'daily' && (dailySummaries || []).length > 0)) && (
                <div className="w-full xl:w-96 glass-panel rounded-2xl p-5 shadow-lg shrink-0 flex flex-col justify-center">
                  <div className="flex justify-between items-center mb-4 border-b border-custom-border pb-3 shrink-0">
                    <h3 className="text-base font-bold text-custom-text flex items-center gap-2">
                      <Archive className="h-4.5 w-4.5 text-custom-accent" /> {analyticsMode === 'yearly' ? (yearlyChartMetric === 'revenue' ? 'Revenue Graph' : 'Profit Graph') : 'Revenue Graph'}
                    </h3>
                    {analyticsMode === 'yearly' && (
                      <div className="flex bg-custom-input border border-custom-border rounded-lg p-0.5 shadow-inner select-none">
                        <button
                          type="button"
                          onClick={() => setYearlyChartMetric('revenue')}
                          className={`px-2.5 py-1 text-center rounded-md font-bold text-[9px] uppercase transition-all cursor-pointer ${yearlyChartMetric === 'revenue'
                            ? 'bg-custom-primary text-white shadow shadow-black/20'
                            : 'text-custom-muted hover:text-custom-text'
                            }`}
                        >
                          Revenue
                        </button>
                        <button
                          type="button"
                          onClick={() => setYearlyChartMetric('profit')}
                          className={`px-2.5 py-1 text-center rounded-md font-bold text-[9px] uppercase transition-all cursor-pointer ${yearlyChartMetric === 'profit'
                            ? 'bg-custom-primary text-white shadow shadow-black/20'
                            : 'text-custom-muted hover:text-custom-text'
                            }`}
                        >
                          Profit
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Inline SVG Chart */}
                  <div className="bg-custom-input/20 rounded-xl border border-custom-border p-4 flex flex-col justify-center items-center">
                    <svg width="100%" height="240" viewBox="0 0 320 240" className="overflow-visible">
                      {/* Y Axis line */}
                      <line x1="45" y1="20" x2="45" y2="190" stroke="var(--color-border)" strokeWidth="1.5" />
                      {/* X Axis line */}
                      <line x1="45" y1="190" x2="300" y2="190" stroke="var(--color-border)" strokeWidth="1.5" />

                      {/* Chart Bars */}
                      {(() => {
                        if (analyticsMode === 'yearly') {
                          const isRev = yearlyChartMetric === 'revenue';
                          const grandTotalRevenue = yearlySummaries.reduce((sum, s) => sum + s.total_sales, 0);

                          const getProfitVal = (summary: any) => {
                            const dbProfit = summary.profit;
                            const totalCogsInDb = yearlySummaries.reduce((sum, s) => sum + (s.total_sales - s.profit), 0);
                            if (totalCogsInDb === 0 && totalStockCostSpent > 0) {
                              return summary.total_sales - (grandTotalRevenue > 0 ? (summary.total_sales / grandTotalRevenue) * totalStockCostSpent : 0);
                            }
                            return dbProfit;
                          };

                          const sortedForChart = [...yearlySummaries].sort((a, b) => String(a.year).localeCompare(String(b.year)));
                          const maxVal = Math.max(...sortedForChart.map(s => isRev ? s.total_sales : Math.max(0, getProfitVal(s))), 1);
                          return sortedForChart.map((summary, idx) => {
                            const val = isRev ? summary.total_sales : Math.max(0, getProfitVal(summary));
                            const barHeight = (val / maxVal) * 150;
                            const gap = 80;
                            const startX = 70;
                            const x = startX + (idx * gap);
                            const y = 190 - barHeight;

                            return (
                              <g key={idx} className="group">
                                <rect
                                  x={x - 10}
                                  y={y}
                                  width="20"
                                  height={barHeight}
                                  fill={isRev ? "var(--color-primary)" : "#10b981"}
                                  rx="3"
                                  className="transition-all duration-300 hover:opacity-85"
                                />
                                <text
                                  x={x}
                                  y={y - 6}
                                  textAnchor="middle"
                                  fill={isRev ? "var(--color-accent)" : "#10b981"}
                                  className="font-mono text-[8px] font-bold"
                                >
                                  ${Math.round(val)}
                                </text>
                                <text
                                  x={x}
                                  y="208"
                                  textAnchor="middle"
                                  fill="var(--color-text)"
                                  className="text-[9px] font-bold font-mono"
                                >
                                  {summary.year}
                                </text>
                              </g>
                            );
                          });
                        } else {
                          const chartData = [...(dailySummaries || [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
                          const maxVal = Math.max(...chartData.map(s => s.total_sales), 1);
                          return chartData.map((summary, idx) => {
                            const barHeight = (summary.total_sales / maxVal) * 150;
                            const gap = chartData.length > 3 ? 45 : 80;
                            const startX = chartData.length > 3 ? 55 : 80;
                            const x = startX + (idx * gap);
                            const y = 190 - barHeight;
                            const label = summary.date.slice(5);

                            return (
                              <g key={idx} className="group">
                                <rect
                                  x={x}
                                  y={y}
                                  width={chartData.length > 3 ? "24" : "40"}
                                  height={barHeight}
                                  fill="var(--color-primary)"
                                  rx="4"
                                  className="transition-all duration-300 hover:opacity-85"
                                />
                                <text
                                  x={x + (chartData.length > 3 ? 12 : 20)}
                                  y={y - 8}
                                  textAnchor="middle"
                                  fill="var(--color-accent)"
                                  className="font-mono text-[8px] font-bold"
                                >
                                  ${Math.round(summary.total_sales)}
                                </text>
                                <text
                                  x={x + (chartData.length > 3 ? 12 : 20)}
                                  y="208"
                                  textAnchor="middle"
                                  fill="var(--color-text)"
                                  className="text-[9px] font-bold font-mono"
                                >
                                  {label}
                                </text>
                              </g>
                            );
                          });
                        }
                      })()}
                    </svg>
                    {analyticsMode === 'yearly' && (
                      <div className="flex justify-center gap-6 mt-4 select-none text-[10px] font-bold">
                        <div className="flex items-center gap-1.5">
                          <div className={`h-3 w-3 rounded ${yearlyChartMetric === 'revenue' ? 'bg-custom-primary' : 'bg-zinc-650'}`}></div>
                          <span className={`${yearlyChartMetric === 'revenue' ? 'text-custom-text' : 'text-custom-muted'}`}>Total Revenue</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-3 w-3 rounded ${yearlyChartMetric === 'profit' ? 'bg-[#10b981]' : 'bg-zinc-650'}`}></div>
                          <span className={`${yearlyChartMetric === 'profit' ? 'text-custom-text' : 'text-custom-muted'}`}>Net Profit</span>
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-custom-muted/80 text-center mt-3 font-semibold uppercase tracking-wider">
                      {analyticsMode === 'yearly' ? (yearlyChartMetric === 'revenue' ? 'YoY Sales Revenue totals' : 'YoY Net Profit totals') : 'Last 5 active sales days revenue comparison'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Price Changes Tracker Pivot */}
            <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-4 mt-6">
              <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                <TrendingUp className="h-4.5 w-4.5 text-custom-accent" /> Year-to-Year Retail Price Tracker
              </h3>
              {priceHistory.length === 0 ? (
                <div className="text-center py-10 text-xs text-custom-muted font-medium">No price change logs found. Adjust catalog items price to record.</div>
              ) : (() => {
                const yearsSet = new Set<string>();
                const itemPriceMap = new Map<string, { [year: string]: number }>();

                priceHistory.forEach(entry => {
                  yearsSet.add(entry.year);
                  if (!itemPriceMap.has(entry.item_name)) {
                    itemPriceMap.set(entry.item_name, {});
                  }
                  itemPriceMap.get(entry.item_name)![entry.year] = entry.price;
                });

                const sortedYears = Array.from(yearsSet).sort();

                return (
                  <div className="overflow-auto max-h-52 border border-custom-border rounded-xl bg-custom-input/20">
                    <table className="w-full text-left text-xs font-semibold">
                      <thead>
                        <tr className="bg-custom-header text-custom-muted uppercase tracking-wider text-[9px] border-b border-custom-border">
                          <th className="py-2.5 px-4 font-extrabold">Product Title</th>
                          {sortedYears.map(yr => (
                            <th key={yr} className="py-2.5 px-4 text-right font-extrabold">{yr} Price</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-custom-border/40 text-custom-text">
                        {Array.from(itemPriceMap.entries()).map(([name, priceByYear]) => (
                          <tr key={name} className="hover:bg-white/5 transition-colors">
                            <td className="py-2.5 px-4 font-bold text-custom-text truncate max-w-[150px]">{name}</td>
                            {sortedYears.map(yr => (
                              <td key={yr} className="py-2.5 px-4 text-right font-mono text-custom-accent font-bold">
                                {priceByYear[yr] !== undefined ? `$${priceByYear[yr].toFixed(2)}` : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

          </div>
        )}

        {/* SUB-TAB: DATA MANAGEMENT */}
        {subTab === 'data' && (
          <div className="h-full flex flex-col gap-6 overflow-y-auto pb-6 pr-1 select-none">

            {/* Glossy Sub-tab Switcher */}
            <div className="flex gap-2 p-1.5 bg-custom-input/40 border border-custom-border rounded-2xl w-max self-start shadow-inner">
              {[
                { id: 'backup_restore', label: 'Backup & Restore', icon: RefreshCw },
                { id: 'danger_zone', label: 'Selective Data Clearing', icon: AlertTriangle }
              ].map(tabItem => {
                const Icon = tabItem.icon;
                const isActive = dmTab === tabItem.id;
                return (
                  <button
                    key={tabItem.id}
                    type="button"
                    onClick={() => setDmTab(tabItem.id as any)}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer border-0 ${isActive
                      ? 'bg-custom-primary text-white shadow-md'
                      : 'text-custom-muted hover:text-custom-text hover:bg-custom-input/50'
                      }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tabItem.label}
                  </button>
                );
              })}
            </div>

            {/* TAB 1: BACKUP & RESTORE */}
            {dmTab === 'backup_restore' && (
              <div className="space-y-6 animate-in fade-in duration-200">

                {/* Upper Grid: Export and Local/Cloud Sync */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Left Card: Export Data */}
                  <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-4 bg-custom-card/50 flex flex-col justify-between">
                    <div className="space-y-4">
                      <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                        <Upload className="h-4.5 w-4.5 text-custom-accent" /> Export Data
                      </h3>
                      <p className="text-xs text-custom-muted leading-relaxed">
                        Select database tables to export. Save them as a single multi-sheet Excel workbook or individual CSV files.
                      </p>

                      {/* Export Format Chooser */}
                      <div className="flex flex-col gap-2 p-3 bg-custom-input/20 border border-custom-border/20 rounded-xl">
                        <span className="text-[10px] font-black uppercase text-custom-muted tracking-wider block mb-1">Export File Format</span>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 text-xs text-custom-text cursor-pointer select-none font-semibold">
                            <input
                              type="radio"
                              name="export_format"
                              checked={dmExportFormat === 'xlsx'}
                              onChange={() => setDmExportFormat('xlsx')}
                              className="accent-custom-primary cursor-pointer h-4 w-4"
                            />
                            Excel Workbook (.xlsx)
                          </label>
                          <label className="flex items-center gap-2 text-xs text-custom-text cursor-pointer select-none font-semibold">
                            <input
                              type="radio"
                              name="export_format"
                              checked={dmExportFormat === 'csv'}
                              onChange={() => setDmExportFormat('csv')}
                              className="accent-custom-primary cursor-pointer h-4 w-4"
                            />
                            CSV Spreadsheets (.csv)
                          </label>
                          <label className="flex items-center gap-2 text-xs text-custom-text cursor-pointer select-none font-semibold">
                            <input
                              type="radio"
                              name="export_format"
                              checked={dmExportFormat === 'db'}
                              onChange={() => setDmExportFormat('db')}
                              className="accent-custom-primary cursor-pointer h-4 w-4"
                            />
                            SQLite Database (.db)
                          </label>
                        </div>
                      </div>

                      {/* Tables Checklist with row counts */}
                      <div className={`space-y-2 transition-opacity ${dmExportFormat === 'db' ? 'opacity-40 pointer-events-none' : ''}`}>
                        <span className="text-[10px] font-black uppercase text-custom-muted tracking-wider block">Tables to Include</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 bg-custom-input/20 border border-custom-border/20 rounded-xl max-h-48 overflow-y-auto">
                          {['items', 'discounts', 'taxes', 'sales', 'sale_items', 'settings', 'item_price_history'].map(table => {
                            const count = tableRowCounts[table] ?? 0;
                            return (
                              <label key={table} className="flex items-center justify-between gap-2 text-xs text-custom-text cursor-pointer select-none hover:bg-custom-input/30 p-1.5 rounded-lg">
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={dmExportTables.includes(table)}
                                    onChange={e => setDmExportTables(prev => e.target.checked ? [...prev, table] : prev.filter(t => t !== table))}
                                    className="accent-custom-primary cursor-pointer h-3.5 w-3.5 rounded border-custom-border"
                                  />
                                  <span className="capitalize">{table.replace(/_/g, ' ')}</span>
                                </span>
                                <span className="text-[10px] font-mono bg-custom-accent/15 px-2 py-0.5 rounded text-custom-accent font-bold">
                                  {count} rows
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className={`flex gap-3 transition-opacity ${dmExportFormat === 'db' ? 'opacity-40 pointer-events-none' : ''}`}>
                        <button type="button" onClick={() => setDmExportTables(['items', 'discounts', 'taxes', 'sales', 'sale_items', 'settings', 'item_price_history'])} className="text-[10px] text-custom-primary hover:underline font-bold bg-transparent border-0 cursor-pointer">Select All</button>
                        <button type="button" onClick={() => setDmExportTables([])} className="text-[10px] text-custom-muted hover:underline font-bold bg-transparent border-0 cursor-pointer">Deselect All</button>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={dmIsExporting || (dmExportFormat !== 'db' && dmExportTables.length === 0)}
                      onClick={
                        dmExportFormat === 'xlsx'
                          ? handleXlsxExport
                          : dmExportFormat === 'db'
                            ? handleDbFileExport
                            : async () => {
                              setDmIsExporting(true);
                              try {
                                const folder = await invoke<string | null>('pick_export_folder');
                                if (!folder) return;
                                const files = await invoke<string[]>('export_tables_to_csv', { folderPath: folder, tables: dmExportTables });
                                triggerNotice(`Exported ${files.length} CSV files to: ${folder}`, 'success');
                                loadTableRowCounts();
                              } catch (err) {
                                triggerNotice('Export failed: ' + err, 'error');
                              } finally {
                                setDmIsExporting(false);
                              }
                            }
                      }
                      className="w-full py-2.5 bg-custom-primary hover:bg-custom-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 border-0 mt-2"
                    >
                      {dmIsExporting ? 'Exporting...' : (dmExportFormat === 'xlsx' ? 'Save Excel File...' : dmExportFormat === 'db' ? 'Export Entire Database File...' : 'Choose Folder & Export CSVs')}
                    </button>
                  </div>

                  {/* Right Card: Backup Status Sync */}
                  <div className="space-y-6 flex flex-col justify-between">
                    {/* Local automatic backup */}
                    <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg bg-custom-card/50 flex flex-col justify-between">
                      <div className="space-y-4">
                        <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                          <RefreshCw className="h-4.5 w-4.5 text-custom-accent" /> Local Auto Database Backup
                        </h3>
                        <p className="text-xs text-custom-muted leading-relaxed">
                          The database is automatically backed up locally to your device storage after changes are saved.
                        </p>

                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between p-3.5 bg-custom-input/20 border border-custom-border/20 rounded-xl">
                            <label htmlFor="input-local-backup-limit" className="text-[10px] font-black uppercase text-custom-muted tracking-wider">
                              Keep Local Backups:
                            </label>
                            <div className="flex items-center gap-2 select-none">
                              <input
                                id="input-local-backup-limit"
                                type="range"
                                min={2}
                                max={10}
                                value={dmLocalBackupLimit}
                                onChange={(e) => handleUpdateLocalBackupLimit(parseInt(e.target.value))}
                                className="w-24 accent-custom-primary cursor-pointer h-1 rounded"
                              />
                              <span className="text-xs font-bold text-custom-text font-mono w-4 text-right">
                                {dmLocalBackupLimit}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-3.5 bg-custom-input/20 border border-custom-border/20 rounded-xl select-none">
                            <label htmlFor="input-keep-daily-backups" className="text-[10px] font-black uppercase text-custom-muted tracking-wider">
                              Keep Daily Backups (5 days):
                            </label>
                            <input
                              id="input-keep-daily-backups"
                              type="checkbox"
                              checked={dmKeepDailyBackups}
                              onChange={(e) => handleUpdateKeepDailyBackups(e.target.checked)}
                              className="accent-custom-primary cursor-pointer h-4 w-4 rounded"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-custom-input/20 border border-custom-border/20 rounded-2xl flex items-center justify-between mt-4">
                        <span className="text-[10px] font-black uppercase text-custom-muted tracking-wider">Last Sync Time:</span>
                        <span className="font-mono text-xs text-custom-accent font-black">{dmLocalBackupTime ?? 'No sync registered'}</span>
                      </div>

                      <div className="flex flex-col gap-2 mt-4 select-none">
                        <button
                          type="button"
                          onClick={async () => {
                            await loadLocalBackupsList();
                            setDmShowLocalRestoreModal(true);
                          }}
                          className="w-full py-2 bg-custom-primary/10 hover:bg-custom-primary/20 border border-custom-primary/20 text-custom-primary text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Restore From Local Backups...
                        </button>
                        <button
                          type="button"
                          onClick={handleDbFileImport}
                          className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Download className="h-3.5 w-3.5" /> Restore From External File (.db)
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await invoke('open_logs_dir');
                            } catch (e) {
                              alert('Failed to open logs folder: ' + e);
                            }
                          }}
                          className="w-full py-2 bg-custom-accent/10 hover:bg-custom-accent/20 border border-custom-accent/20 text-custom-accent text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <FolderOpen className="h-3.5 w-3.5" /> Open Logs Folder
                        </button>
                      </div>
                    </div>

                    {/* Google Drive Cloud backup */}
                    <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg bg-custom-card/50 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                          <CloudSync className="h-4.5 w-4.5 text-custom-accent" /> Google Drive Cloud Sync
                        </h3>

                        {!dmCloudStatus?.is_connected ? (
                          <div className="space-y-3 pt-3">
                            <p className="text-xs text-custom-muted leading-relaxed">
                              Connect your Google Drive account to sync backups to the cloud automatically.
                            </p>
                            <button
                              type="button"
                              disabled={dmIsConnectingCloud}
                              onClick={async () => {
                                setDmIsConnectingCloud(true);
                                try {
                                  const verifier = generateCodeVerifier();
                                  const challenge = await generateCodeChallenge(verifier);
                                  const code = await invoke<string>('connect_google_account_pkce', { codeChallenge: challenge, port: 9876 });
                                  const email = await invoke<string>('exchange_google_code_pkce', { code, codeVerifier: verifier, port: 9876 });
                                  triggerNotice(`Connected account: ${email}`, 'success');
                                  await loadCloudBackupStatus();
                                } catch (err) {
                                  triggerNotice('Cloud auth failed: ' + err, 'error');
                                } finally {
                                  setDmIsConnectingCloud(false);
                                }
                              }}
                              className="px-4 py-2.5 bg-custom-primary hover:bg-custom-primary-hover disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow border-0"
                            >
                              {dmIsConnectingCloud ? 'Authorize in browser...' : 'Link Google Account'}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-4 pt-3">
                            <div className="flex items-center justify-between p-3 bg-custom-input/40 border border-custom-border/40 rounded-xl">
                              <div>
                                <span className="text-xs font-black text-custom-text block">{dmCloudStatus.account_email}</span>
                                <span className="text-[10px] text-custom-muted block mt-0.5">Last Sync: <strong className="font-mono text-custom-accent">{dmCloudStatus.last_backup_at ?? 'Never synced'}</strong></span>
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await invoke('disconnect_google_account');
                                    triggerNotice('Account disconnected.', 'success');
                                    await loadCloudBackupStatus();
                                  } catch (err) {
                                    triggerNotice('Failed: ' + err, 'error');
                                  }
                                }}
                                className="text-[10px] text-red-500 hover:underline font-bold bg-transparent border-0 cursor-pointer"
                              >
                                Disconnect
                              </button>
                            </div>

                            {/* Cloud Sync Frequency Selection */}
                            <div className="space-y-1.5 p-3.5 bg-custom-input/20 border border-custom-border/20 rounded-xl">
                              <label htmlFor="select-cloud-sync-frequency" className="block text-[10px] font-black uppercase text-custom-muted tracking-wider">
                                Cloud Sync Frequency:
                              </label>
                              <select
                                id="select-cloud-sync-frequency"
                                value={dmCloudSyncFrequency}
                                onChange={(e) => handleUpdateCloudSyncFrequency(e.target.value)}
                                className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary cursor-pointer font-bold"
                              >
                                <option value="after_change">After every change</option>
                                <option value="5m">5 Minutes</option>
                                <option value="10m">10 Minutes</option>
                                <option value="15m">15 Minutes</option>
                                <option value="30m">30 Minutes</option>
                                <option value="1h">1 Hour</option>
                                <option value="manual">Only manually</option>
                              </select>
                            </div>

                            {/* Cloud Backup Limit Selection */}
                            <div className="flex items-center justify-between p-3.5 bg-custom-input/20 border border-custom-border/20 rounded-xl select-none">
                              <label htmlFor="input-cloud-backup-limit" className="text-[10px] font-black uppercase text-custom-muted tracking-wider">
                                Keep Cloud Backups:
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  id="input-cloud-backup-limit"
                                  type="range"
                                  min={2}
                                  max={10}
                                  value={dmCloudBackupLimit}
                                  onChange={(e) => handleUpdateCloudBackupLimit(parseInt(e.target.value))}
                                  className="w-24 accent-custom-primary cursor-pointer h-1 rounded"
                                />
                                <span className="text-xs font-bold text-custom-text font-mono w-4 text-right">
                                  {dmCloudBackupLimit}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={dmIsCloudBackingUp}
                                onClick={async () => {
                                  setDmIsCloudBackingUp(true);
                                  try {
                                    const ts = await invoke<string>('trigger_cloud_backup_now');
                                    triggerNotice('Backup uploaded: ' + ts, 'success');
                                    await loadCloudBackupStatus();
                                  } catch (err) {
                                    triggerNotice('Sync failed: ' + err, 'error');
                                  } finally {
                                    setDmIsCloudBackingUp(false);
                                  }
                                }}
                                className="px-3.5 py-2 bg-custom-input border border-custom-border hover:border-custom-primary text-custom-text text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                              >
                                <CloudUpload className="h-3.5 w-3.5 text-custom-accent" /> {dmIsCloudBackingUp ? 'Uploading...' : 'Sync Cloud Now'}
                              </button>

                              <button
                                type="button"
                                onClick={async () => {
                                  await loadCloudBackupsList();
                                  setDmShowGoogleRestoreModal(true);
                                }}
                                className="px-3.5 py-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-500 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <CloudDownload className="h-3.5 w-3.5" /> Restore From Cloud Backup
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                </div>

                {/* Lower Section: Import Data */}
                {/* File picker drop area */}
                <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-4 bg-custom-card/50">
                  <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                    <Download className="h-4.5 w-4.5 text-custom-accent" /> Import Data
                  </h3>

                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handleChooseImportFiles}
                      className="px-4 py-2.5 bg-custom-primary hover:bg-custom-primary-hover text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md border-0 flex items-center gap-1.5"
                    >
                      <PlusCircle className="h-4 w-4" /> Load CSV or Excel File...
                    </button>

                    <span className="text-xs text-custom-muted">
                      Select spreadsheet backup folders or generic Excel/CSV sheets from other inventory systems.
                    </span>
                  </div>
                </div>

                {/* Import Files Accordions */}
                {dmImportFiles.length === 0 ? (
                  <div className="border border-dashed border-custom-border/50 rounded-2xl py-12 flex flex-col items-center justify-center text-center space-y-2 bg-custom-card/10">
                    <Download className="h-10 w-10 text-custom-muted/40 animate-pulse" />
                    <span className="text-sm font-bold text-custom-text">No spreadsheets loaded</span>
                    <p className="text-xs text-custom-muted max-w-xs">
                      Choose an inventory file to preview, map target columns, resolve issues, and import it into the POS database.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {dmImportFiles.map(file => (
                      <div key={file.id} className="glass-panel border-custom-border rounded-2xl overflow-hidden shadow-lg bg-custom-card/40 border border-custom-border">
                        {/* File Header Panel */}
                        <div className="px-5 py-4 bg-custom-input/40 flex justify-between items-center border-b border-custom-border select-none">
                          <div className="flex items-center gap-2.5">
                            <span className={`p-1.5 rounded-lg text-white text-[10px] font-bold ${file.type === 'xlsx' ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                              {file.type.toUpperCase()}
                            </span>
                            <div>
                              <span className="text-sm font-bold text-custom-text block">{file.name}</span>
                              <span className="text-[10px] text-custom-muted font-mono block tracking-tight mt-0.5">{file.path}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveImportFile(file.id)}
                            className="p-1.5 hover:bg-red-500/10 hover:text-red-500 text-custom-muted rounded-xl transition-all cursor-pointer border-0"
                            title="Remove file"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Sheets list inside file */}
                        <div className="divide-y divide-custom-border/60">
                          {file.sheets.map(sheet => {
                            const isExpanded = sheet.isExpanded;
                            const hasErrors = sheet.errorCount > 0;
                            return (
                              <div key={sheet.name} className="p-5 space-y-4">

                                {/* Accordion Header */}
                                <div
                                  onClick={() => handleToggleExpandSheet(file.id, sheet.name)}
                                  className="flex items-center justify-between cursor-pointer select-none"
                                >
                                  <div className="flex items-center gap-3">
                                    <button type="button" className="bg-transparent border-0 text-custom-muted cursor-pointer flex items-center justify-center p-0.5">
                                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </button>
                                    <span className="text-xs font-bold text-custom-text flex items-center gap-1.5">
                                      <Package className="h-4 w-4 text-custom-accent" /> Sheet: {sheet.name}
                                    </span>

                                    {/* Stats Badges */}
                                    <span className="text-[10px] bg-custom-input border border-custom-border/40 px-2 py-0.5 rounded text-custom-text font-bold">
                                      {sheet.rows.length} rows
                                    </span>

                                    <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-emerald-500 font-bold">
                                      {sheet.validCount} valid rows
                                    </span>

                                    {hasErrors && (
                                      <span className="text-[10px] bg-red-500/15 border border-red-500/25 px-2 py-0.5 rounded text-red-500 font-bold flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" /> {sheet.errorCount} invalid rows
                                      </span>
                                    )}
                                  </div>

                                  {/* Right actions: policy and import */}
                                  <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                                    <select
                                      value={sheet.duplicatePolicy}
                                      onChange={e => handleUpdateDuplicatePolicy(file.id, sheet.name, e.target.value as any)}
                                      className="px-2.5 py-1.5 bg-custom-input border border-custom-border text-custom-text text-[10px] rounded-lg focus:outline-none focus:ring-1 focus:ring-custom-primary cursor-pointer font-bold"
                                    >
                                      <option value="skip">Skip duplicates</option>
                                      <option value="overwrite">Overwrite duplicates</option>
                                    </select>

                                    <button
                                      type="button"
                                      disabled={dmIsImporting || sheet.rows.length === 0 || !isMappingComplete(sheet.mappings, sheet.targetTable)}
                                      onClick={() => handleCommitSheetImport(file.id, sheet.name)}
                                      className="px-3.5 py-1.5 bg-custom-accent text-custom-text hover:bg-custom-accent/80 font-bold text-[11px] rounded-xl transition-all cursor-pointer border-0 shadow-sm flex items-center gap-1"
                                    >
                                      {dmIsImporting ? 'Importing...' : 'Commit Import'}
                                    </button>
                                  </div>
                                </div>

                                {/* Accordion Body */}
                                {isExpanded && (
                                  <div className="space-y-4 pt-3 border-t border-custom-border/20 animate-in slide-in-from-top-1 duration-200">

                                    {/* Unmapped required fields warning banner */}
                                    {!isMappingComplete(sheet.mappings, sheet.targetTable) && (
                                      <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-semibold flex items-center gap-2">
                                        <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-red-500" />
                                        <span>
                                          <strong>Mapping Incomplete:</strong> Please map the required fields (<strong>{getDbFieldsForTable(sheet.targetTable).filter(f => f.req).map(f => f.label).join(', ')}</strong>) to enable importing.
                                        </span>
                                      </div>
                                    )}

                                    {/* Data Preview Table with Inline Editor */}
                                    <div className="space-y-2">
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <span className="text-[10px] font-black uppercase text-custom-muted tracking-wider block">
                                          Data Preview (Scroll horizontally, double-click or edit cells directly)
                                        </span>
                                        <span className="text-[10px] font-bold text-custom-muted uppercase bg-custom-input/40 px-2 py-0.5 rounded border border-custom-border/50">
                                          <strong>Bold Column Title/Dropdown</strong> = Required Field
                                        </span>
                                      </div>

                                      <div className="border border-custom-border rounded-xl overflow-auto max-h-96 w-full shadow-sm">
                                        <table className="min-w-full border-collapse text-left table-auto">
                                          <thead>
                                            <tr className="bg-custom-input/60 border-b border-custom-border text-[10px] font-extrabold tracking-wider text-custom-text uppercase select-none">
                                              <th className="py-2 px-3 text-center border-r border-custom-border/30 w-12 shrink-0 min-w-[60px]">Row</th>

                                              {sheet.headers.map((header, colIdx) => {
                                                // Find if this header matches any DB column mapping
                                                const mappedDbField = Object.keys(sheet.mappings).find(key => sheet.mappings[key] === header);
                                                const isMapped = !!mappedDbField;
                                                const requiredFieldsList = getDbFieldsForTable(sheet.targetTable).filter(f => f.req).map(f => f.field);
                                                const isRequiredField = isMapped && requiredFieldsList.includes(mappedDbField);

                                                return (
                                                  <th
                                                    key={header}
                                                    className={`py-2 px-3 border-r border-custom-border/30 font-sans tracking-normal normal-case text-xs transition-colors group min-w-[180px] ${isMapped
                                                      ? isRequiredField
                                                        ? 'bg-custom-accent/15 text-custom-accent border-b-2 border-b-custom-accent'
                                                        : 'bg-custom-accent/5 text-custom-accent/80 border-b-2 border-b-custom-accent/40'
                                                      : 'text-custom-muted hover:bg-custom-input/40'
                                                      }`}
                                                  >
                                                    <div className="flex flex-col gap-1.5 py-1">
                                                      {/* Dropdown for mapping */}
                                                      <select
                                                        value={mappedDbField || ''}
                                                        onChange={e => handleMapColumnHeader(file.id, sheet.name, header, e.target.value)}
                                                        className={`w-full px-1.5 py-1 bg-custom-input border border-custom-border text-[10px] rounded focus:outline-none focus:ring-1 focus:ring-custom-primary cursor-pointer ${isRequiredField
                                                          ? 'font-black text-custom-text border-custom-primary/50'
                                                          : isMapped
                                                            ? 'font-normal text-custom-text/80'
                                                            : 'font-normal text-custom-muted/70'
                                                          }`}
                                                      >
                                                        <option value="">-- Unmapped --</option>
                                                        {getDbFieldsForTable(sheet.targetTable).map(item => (
                                                          <option
                                                            key={item.field}
                                                            value={item.field}
                                                            className={item.req ? 'font-bold' : 'font-normal'}
                                                          >
                                                            {item.label}{item.req ? ' (Required)' : ''}
                                                          </option>
                                                        ))}
                                                      </select>

                                                      {/* Header Title Metadata */}
                                                      <div className="flex flex-col gap-0.5">
                                                        <span className="font-mono text-[9px] uppercase font-black text-custom-muted tracking-tight">Col {colIdx + 1}</span>
                                                        <span className={`truncate max-w-[170px] ${isRequiredField ? 'font-black text-custom-text' : 'font-semibold text-custom-text/90'
                                                          }`}>
                                                          {header}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </th>
                                                );
                                              })}
                                            </tr>
                                          </thead>

                                          <tbody className="divide-y divide-custom-border/40 bg-custom-card/10 text-xs">
                                            {sheet.rows.map((row, rowIdx) => {
                                              if (row.length === 0 || row.every(c => c === '')) return null;
                                              const { isValid, missingFields } = validateImportRow(row, sheet.headers, sheet.mappings, sheet.targetTable);

                                              return (
                                                <tr key={rowIdx} className={`hover:bg-custom-input/10 font-mono text-[11px] ${!isValid ? 'bg-red-500/[0.02]' : ''}`}>
                                                  {/* Validation indicator cell */}
                                                  <td className="py-1 px-2 border-r border-custom-border/20 text-center text-custom-muted select-none w-12 flex-shrink-0 flex items-center justify-center gap-1 bg-custom-input/20">
                                                    {!isValid ? (
                                                      <span className="text-red-500" title={`Missing required fields: ${missingFields.join(', ')}`}>
                                                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                                      </span>
                                                    ) : (
                                                      <span>{rowIdx + 1}</span>
                                                    )}
                                                  </td>

                                                  {/* Row cell editors */}
                                                  {sheet.headers.map((header, colIdx) => {
                                                    const mappedField = Object.keys(sheet.mappings).find(k => sheet.mappings[k] === header);
                                                    const cellValue = row[colIdx] !== undefined ? String(row[colIdx]) : '';

                                                    // Validate this cell specifically if mapped & required
                                                    let isCellInvalid = false;
                                                    if (mappedField) {
                                                      const dbFieldsList = getDbFieldsForTable(sheet.targetTable);
                                                      const fieldInfo = dbFieldsList.find(f => f.field === mappedField);
                                                      if (fieldInfo) {
                                                        if (fieldInfo.req && !cellValue) {
                                                          isCellInvalid = true;
                                                        } else if (cellValue) {
                                                          const isNumeric = ['price', 'unit_cost', 'bulk_price', 'value', 'rate', 'subtotal', 'discount_total', 'tax_total', 'final_total', 'price_at_sale'].includes(mappedField);
                                                          const isInteger = ['stock_quantity', 'bulk_quantity', 'tax_id', 'quantity', 'is_bulk', 'item_id', 'sale_id'].includes(mappedField);
                                                          if (isNumeric) {
                                                            const cleaned = cleanNumericString(cellValue);
                                                            if (isNaN(parseFloat(cleaned)) || parseFloat(cleaned) < 0) isCellInvalid = true;
                                                          } else if (isInteger) {
                                                            const cleaned = cleanNumericString(cellValue);
                                                            if (isNaN(parseInt(cleaned, 10))) isCellInvalid = true;
                                                          }
                                                        }
                                                      }
                                                    }

                                                    return (
                                                      <td
                                                        key={colIdx}
                                                        className={`py-1.5 px-3 border-r border-custom-border/20 max-w-[150px] min-w-[80px] ${isCellInvalid ? 'bg-red-500/10 border border-red-500/40 text-red-500' : ''
                                                          }`}
                                                      >
                                                        <input
                                                          type="text"
                                                          value={cellValue}
                                                          onChange={e => handleEditCell(file.id, sheet.name, rowIdx, colIdx, e.target.value)}
                                                          className={`bg-transparent border-0 focus:outline-none text-xs w-full text-custom-text p-0.5 focus:bg-custom-input focus:ring-1 focus:ring-custom-primary rounded ${isCellInvalid ? 'text-red-500 placeholder-red-500/50' : ''
                                                            }`}
                                                          placeholder={isCellInvalid ? 'MISSING' : ''}
                                                        />
                                                      </td>
                                                    );
                                                  })}
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                  </div>
                                )}

                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SELECTIVE DATA CLEARING */}
            {dmTab === 'danger_zone' && (
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-4 bg-custom-card/50 flex flex-col justify-between relative overflow-hidden animate-in fade-in duration-200">
                {/* Danger zone header branding band */}
                <div className="absolute top-0 left-0 w-full h-[4px] bg-red-600" />

                <div className="space-y-4">
                  <h3 className="text-base font-bold text-red-500 flex items-center gap-2 border-b border-custom-border pb-3 mt-1 select-none">
                    <AlertTriangle className="h-4.5 w-4.5 text-red-500 animate-pulse" /> Selective Database Purge (Danger Zone)
                  </h3>
                  <p className="text-xs text-custom-muted leading-relaxed">
                    Permanently delete records from selected SQLite tables. This process will wipe all catalog and transaction logs, and cannot be undone.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-custom-input/20 border border-custom-border/20 rounded-xl max-w-lg">
                    {[
                      { label: 'Catalog Products (items)', value: 'items' },
                      { label: 'Preset Discounts (discounts)', value: 'discounts' },
                      { label: 'Custom Taxes (taxes)', value: 'taxes' },
                      { label: 'Sales Ledger Logs (sales)', value: 'sales' },
                      { label: 'App Settings Config (settings)', value: 'settings' },
                    ].map(({ label, value }) => (
                      <label key={value} className="flex items-center gap-2 text-xs text-custom-text cursor-pointer select-none hover:bg-red-500/[0.02] p-1 rounded">
                        <input
                          type="checkbox"
                          checked={dmClearSelectedTables.includes(value)}
                          onChange={e => {
                            if (e.target.checked) {
                              const toAdd = value === 'items' ? [value, 'item_price_history', 'sale_items'] : [value];
                              setDmClearSelectedTables(prev => [...new Set([...prev, ...toAdd])]);
                            } else {
                              setDmClearSelectedTables(prev => prev.filter(t => t !== value && t !== (value === 'items' ? 'item_price_history' : '') && t !== (value === 'items' ? 'sale_items' : '')));
                            }
                          }}
                          className="accent-red-600 cursor-pointer h-3.5 w-3.5 rounded"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>

                  {dmClearSelectedTables.includes('items') && (
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/20 dark:border-amber-900/30 p-2.5 rounded-lg font-bold leading-normal flex items-start gap-2 max-w-lg">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                      <span>Note: Purging the Catalog Products will also delete all sale item details and product price history records due to relational constraints.</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={dmClearSelectedTables.length === 0}
                  onClick={() => {
                    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
                    setDmClearConfirmCode(code);
                    setDmClearInputText('');
                    setDmShowClearModal(true);
                  }}
                  className="w-48 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all border border-white/10 cursor-pointer shadow-lg active:scale-98 mt-2"
                >
                  Clear Selected Tables...
                </button>
              </div>
            )}

          </div>
        )}

        {/* SUB-TAB D2: DEVICES CONFIGURATION PANEL */}
        {subTab === 'devices' && (
          <div className="h-full flex flex-col gap-6 min-h-0 overflow-y-auto pb-6 pr-1 animate-in fade-in duration-200 relative">
            {/* Loading overlay — shown while device lists are fetching (including first load) */}
            {(isLoadingPrinters || isLoadingKeyboards) && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-custom-bg/70 backdrop-blur-sm rounded-xl animate-in fade-in duration-200">
                <div className="flex flex-col items-center gap-4 p-8 bg-custom-card border border-custom-border rounded-2xl shadow-2xl">
                  <div className="relative h-12 w-12">
                    <div className="absolute inset-0 rounded-full border-4 border-custom-border" />
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-custom-primary animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-custom-text">Scanning for Devices</p>
                    <p className="text-xs text-custom-muted mt-1">Querying connected printers and input devices...</p>
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* GoDaddy Terminal Integration Panel */}
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-4">
                <h3 className="text-base font-bold text-custom-text flex items-center justify-between border-b border-custom-border pb-3">
                  <div className="flex items-center gap-2">
                    <MonitorSmartphone className="h-4 w-4 text-custom-accent" /> GoDaddy Terminal Integration
                    {godaddyPairingStatus === 'paired' && (
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ml-2 ${
                        godaddyConnected === true
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : godaddyConnected === false
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : 'bg-custom-input/60 text-custom-muted border border-custom-border/40'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          godaddyConnected === true
                            ? 'bg-emerald-400 animate-pulse'
                            : godaddyConnected === false
                            ? 'bg-red-400'
                            : 'bg-custom-muted'
                        }`} />
                        {godaddyConnected === true ? 'Online' : godaddyConnected === false ? 'Offline' : 'Checking...'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowGodaddyHelp(true)}
                    className="p-1 text-custom-muted hover:text-custom-primary transition-colors focus:outline-none"
                    title="Setup Help"
                  >
                    <HelpCircle className="h-5 w-5" />
                  </button>
                </h3>

                 <div className="space-y-4">
                  <div className="space-y-4 pt-1 transition-all">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">
                        Terminal IP Address
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. 192.168.1.150 (or 'mock' to test)"
                          value={godaddyTerminalIp}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setGodaddyTerminalIp(val);
                            try {
                              await invoke('save_setting', { key: 'godaddy_terminal_ip', value: val });
                            } catch (err) {
                              console.error("Failed to save terminal IP", err);
                            }
                          }}
                          className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text rounded-lg focus:outline-none text-sm font-mono"
                        />
                        <button
                          type="button"
                          onClick={handlePingTerminal}
                          disabled={isGodaddyPinging}
                          className="px-3 py-2 bg-custom-input hover:bg-custom-border text-custom-text border border-custom-border font-bold text-xs rounded-lg transition-all shrink-0 active:scale-95 disabled:opacity-50"
                        >
                          {isGodaddyPinging ? 'Pinging...' : 'Test'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDiscoverTerminals}
                          disabled={isDiscovering}
                          className="px-3 py-2 bg-custom-primary hover:bg-custom-primary-hover text-white border border-custom-primary/20 font-bold text-xs rounded-lg transition-all shrink-0 active:scale-95 disabled:opacity-50"
                        >
                          {isDiscovering ? 'Scanning...' : 'Scan LAN'}
                        </button>
                      </div>
                      {godaddyPingStatus && (
                        <span className={`text-[10px] mt-1 block font-semibold ${godaddyPingStatus.includes('Success') ? 'text-emerald-400' : 'text-red-400'}`}>
                          {godaddyPingStatus}
                        </span>
                      )}
                      {discoveredIps.length > 0 && (
                        <div className="mt-2.5 p-2.5 bg-custom-input border border-custom-border/60 rounded-xl space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                          <span className="text-[10px] uppercase font-extrabold text-custom-muted block tracking-wider">Discovered Terminals:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {discoveredIps.map((ip) => (
                              <button
                                type="button"
                                key={ip}
                                onClick={() => selectDiscoveredIp(ip)}
                                className="px-2 py-1 bg-custom-primary/10 hover:bg-custom-primary/20 text-custom-primary border border-custom-primary/30 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95 cursor-pointer"
                              >
                                {ip}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-3 bg-custom-input/40 border border-custom-border/40 rounded-xl">
                      <div>
                        <span className="block text-xs font-bold text-custom-text">Pairing Status</span>
                        <span className={`text-xs font-bold uppercase ${godaddyPairingStatus === 'paired' ? 'text-emerald-400' : 'text-custom-accent'}`}>
                          {godaddyPairingStatus === 'paired' ? 'Paired & Authorized' : 'Not Paired'}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setGodaddyPairingCode('');
                          setShowGodaddyPairModal(true);
                        }}
                        className="px-3 py-1.5 bg-custom-primary hover:bg-custom-primary-hover active:scale-95 text-white font-extrabold text-xs rounded-lg transition-all shadow"
                      >
                        {godaddyPairingStatus === 'paired' ? 'Re-Pair Terminal' : 'Pair Terminal'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Receipt Printers Panel */}
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-4">
                <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                  <Printer className="h-4 w-4 text-custom-accent" /> Receipt Printers
                </h3>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="select-printer-device" className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">
                      Select Printer Device
                    </label>
                    <div className="flex gap-2">
                      <select
                        id="select-printer-device"
                        value={selectedPrinter}
                        onChange={(e) => handlePrinterChange(e.target.value)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text rounded-lg focus:outline-none text-sm font-sans"
                      >
                        <option value="System Print Dialog (Default)">
                          {godaddyEnabled && godaddyTerminalIp
                            ? "System Print Dialog (Default - Bypassed by GoDaddy)"
                            : "System Print Dialog (Default)"}
                        </option>
                        {godaddyEnabled && godaddyTerminalIp && (
                          <option value="GoDaddy Smart Terminal Printer">GoDaddy Smart Terminal Printer (Connected)</option>
                        )}
                        {systemPrinters.map((pr, idx) => (
                          <option key={idx} value={pr}>{pr}</option>
                        ))}
                      </select>
                      <button
                        onClick={fetchPrinters}
                        disabled={isLoadingPrinters}
                        className="px-3 py-2 bg-custom-input hover:bg-custom-border text-custom-text border border-custom-border font-bold text-xs rounded-lg transition-all shrink-0 active:scale-95 font-sans"
                      >
                        {isLoadingPrinters ? 'Refreshing...' : 'Refresh List'}
                      </button>
                    </div>
                  </div>

                  {selectedPrinter === 'GoDaddy Smart Terminal Printer' && (
                    <div className="pt-3 border-t border-custom-border/20 transition-all animate-in fade-in">
                      <div className="p-3 bg-custom-primary/10 border border-custom-primary/20 rounded-xl text-xs space-y-1">
                        <span className="block font-extrabold text-custom-text">GoDaddy Terminal Bridge Connection</span>
                        <span className="block text-custom-muted leading-relaxed">
                          Receipts are routed directly to the built-in printer on the paired GoDaddy Smart Terminal device.
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedPrinter !== 'System Print Dialog (Default)' && selectedPrinter !== 'GoDaddy Smart Terminal Printer' && (
                    <div className="space-y-3 pt-3 border-t border-custom-border/20 transition-all animate-in fade-in">
                      <span className="block text-xs font-bold uppercase tracking-wider text-custom-text">Print Mode Preference</span>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handlePrintModeChange('dialog')}
                          className={`px-3 py-2 border rounded-xl font-bold text-xs flex flex-col gap-1 transition-all text-left ${selectedPrintMode === 'dialog'
                            ? 'border-custom-primary bg-custom-primary/10 text-custom-primary shadow-lg'
                            : 'border-custom-border/40 bg-custom-input/20 text-custom-muted hover:text-custom-text'
                            }`}
                        >
                          <span className="block font-extrabold text-custom-text">System Print Dialog</span>
                          <span className="text-[10px] font-normal leading-normal text-custom-muted">Shows preview, supports PDF and print layout styles</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePrintModeChange('direct')}
                          className={`px-3 py-2 border rounded-xl font-bold text-xs flex flex-col gap-1 transition-all text-left ${selectedPrintMode === 'direct'
                            ? 'border-custom-primary bg-custom-primary/10 text-custom-primary shadow-lg'
                            : 'border-custom-border/40 bg-custom-input/20 text-custom-muted hover:text-custom-text'
                            }`}
                        >
                          <span className="block font-extrabold text-custom-text">Direct Spool Printing</span>
                          <span className="text-[10px] font-normal leading-normal text-custom-muted">Bypasses dialog, prints plain text receipt instantly</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Automatic printing toggle */}
                  <div className="flex items-center justify-between gap-4 pt-3 border-t border-custom-border/20">
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-custom-text">Automatic Receipt Printing</span>
                      <span className="text-[10px] text-custom-muted mt-0.5 block">Automatically print receipts upon completing checkouts.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoPrintReceipts}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setAutoPrintReceipts(val);
                          try {
                            await invoke('save_setting', { key: 'auto_print_receipts', value: val.toString() });
                            triggerNotice('Automatic printing preference updated', 'success');
                          } catch (err) {
                            triggerNotice('Failed to save settings: ' + err, 'error');
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-custom-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-custom-accent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-custom-muted peer-checked:after:bg-custom-accent after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-custom-primary border border-custom-border"></div>
                    </label>
                  </div>

                  {/* Preset Selector & Sliders */}
                  <div className="pt-3 border-t border-custom-border/20 space-y-3">
                    <div>
                      <label htmlFor="select-receipt-preset" className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">
                        Receipt Format Preset
                      </label>
                      <select
                        id="select-receipt-preset"
                        value={activePresetId}
                        onChange={(e) => handlePresetChange(e.target.value)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text rounded-lg focus:outline-none text-sm cursor-pointer"
                      >
                        <option value="godaddy">GoDaddy Smart Terminal (58mm - 26 chars)</option>
                        <option value="58mm">Standard 58mm Thermal (32 chars)</option>
                        <option value="80mm">Standard 80mm Thermal (40 chars)</option>
                        <option value="custom">Custom Format...</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Font Size slider */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] uppercase font-bold tracking-wider text-custom-muted">Font Size</label>
                          <span className="text-[10px] font-mono font-bold text-custom-accent">{receiptFontSize}px</span>
                        </div>
                        <input
                          type="range"
                          min="8"
                          max="24"
                          value={receiptFontSize}
                          onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
                          className="w-full h-1.5 bg-custom-input rounded-lg appearance-none cursor-pointer accent-custom-primary border border-custom-border/40"
                        />
                      </div>

                      {/* Receipt Width (character columns) slider */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] uppercase font-bold tracking-wider text-custom-muted">Column Width</label>
                          <span className="text-[10px] font-mono font-bold text-custom-accent">{receiptColumnWidth} chars</span>
                        </div>
                        <input
                          type="range"
                          min="20"
                          max="60"
                          value={receiptColumnWidth}
                          onChange={(e) => handleColumnWidthChange(parseInt(e.target.value, 10))}
                          className="w-full h-1.5 bg-custom-input rounded-lg appearance-none cursor-pointer accent-custom-primary border border-custom-border/40"
                        />
                      </div>
                    </div>

                    {/* Paper Width select */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] uppercase font-bold tracking-wider text-custom-muted">Paper Width Style</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handlePaperWidthChange('58mm')}
                          className={`py-1.5 border rounded-lg text-xs font-bold transition-all ${receiptPaperWidth === '58mm'
                            ? 'border-custom-primary bg-custom-primary/10 text-custom-primary font-extrabold shadow'
                            : 'border-custom-border/40 bg-custom-input/20 text-custom-muted hover:text-custom-text'
                          }`}
                        >
                          58mm Width
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePaperWidthChange('80mm')}
                          className={`py-1.5 border rounded-lg text-xs font-bold transition-all ${receiptPaperWidth === '80mm'
                            ? 'border-custom-primary bg-custom-primary/10 text-custom-primary font-extrabold shadow'
                            : 'border-custom-border/40 bg-custom-input/20 text-custom-muted hover:text-custom-text'
                          }`}
                        >
                          80mm Width
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-custom-border/20 flex gap-2">
                    <button
                      onClick={handleTestPrint}
                      disabled={isTestPrinting}
                      className="w-full px-4 py-2.5 bg-custom-primary hover:bg-custom-primary-hover active:scale-95 text-white font-extrabold text-xs rounded-xl transition-all shadow flex items-center justify-center gap-1.5"
                    >
                      <Printer className="h-4 w-4" />
                      {isTestPrinting ? 'Printing Test...' : 'Print Test Page'}
                    </button>
                  </div>
                </div>
                {/* Barcode Scanners Panel */}
                <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-4 lg:col-span-2">
                  <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                    <Barcode className="h-4 w-4 text-custom-accent" /> Barcode Scanners
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-custom-text mb-2">Detected Hardware Keyboards & Scanners</span>
                      <p className="text-[10px] text-custom-muted mb-3">
                        Type on your keyboard or pull the trigger on a barcode scanner gun to test input classification. The corresponding active device will blink.
                      </p>
                      {isLoadingKeyboards ? (
                        <span className="text-xs text-custom-muted">Refreshing keyboards...</span>
                      ) : systemKeyboards.length === 0 ? (
                        <span className="text-xs text-custom-muted">No keyboards detected.</span>
                      ) : (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {systemKeyboards.map((kb, idx) => {
                            const isScanner = kb.toLowerCase().includes('scanner') || kb.toLowerCase().includes('barcode');
                            const isKeyboard = !isScanner;
                            const isFlashing = (isScanner && activeFlashDevice === 'scanner') || (isKeyboard && activeFlashDevice === 'keyboard');

                            return (
                              <div
                                key={idx}
                                className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-mono transition-all duration-300 ${isFlashing
                                  ? (isScanner
                                    ? 'border-emerald-500 bg-emerald-950/30 text-white animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.2)] font-bold'
                                    : 'border-sky-500 bg-sky-950/30 text-white animate-pulse shadow-[0_0_10px_rgba(14,165,233,0.2)] font-bold')
                                  : 'border-custom-border/40 bg-custom-input/40 text-custom-text'
                                  }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isFlashing
                                  ? (isScanner ? 'bg-emerald-400 animate-ping' : 'bg-sky-400 animate-ping')
                                  : 'bg-emerald-400'
                                  }`}></span>
                                {kb}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
                        <button
                          onClick={fetchKeyboards}
                          disabled={isLoadingKeyboards}
                          className="px-3 py-1.5 bg-custom-input hover:bg-custom-border text-custom-text border border-custom-border font-bold text-xs rounded-lg transition-all shrink-0 active:scale-95 font-sans"
                        >
                          Refresh List
                        </button>

                        {lastScanCode && (
                          <div className="px-3 py-1.5 bg-custom-input/60 border border-custom-border rounded-xl flex items-center gap-2 text-xs animate-in slide-in-from-bottom-2">
                            <span className="text-custom-muted">Last Intercepted Value:</span>
                            <span className="font-mono font-bold text-custom-accent">{lastScanCode}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>       </div>
            </div>
          </div>
        )}

        {subTab === 'payment_methods' && (
          <div className="h-full flex flex-col xl:flex-row gap-6 min-h-0 overflow-y-auto pb-6 pr-1 animate-in fade-in duration-200">
            <div className="flex-1 flex flex-col gap-6">
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-custom-text flex items-center gap-2">
                    <CheckSquare className="h-4.5 w-4.5 text-custom-accent" /> Cash Change Calculator
                  </h4>
                  <p className="text-xs text-custom-muted mt-1 leading-relaxed">
                    Prompts register operators to enter the cash amount tendered by customers and shows change to return.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleChangeCalculator(!isCashChangeCalculatorEnabled)}
                  className={`w-12 h-6 rounded-full transition-all duration-200 focus:outline-none flex items-center p-1 cursor-pointer ${
                    isCashChangeCalculatorEnabled ? 'bg-custom-primary justify-end' : 'bg-custom-input justify-start border border-custom-border'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                </button>
              </div>

              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg flex-1 flex flex-col min-h-0">
                <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3 mb-4 shrink-0">
                  <Wallet className="h-4.5 w-4.5 text-custom-primary" /> Active Payment Options
                </h3>
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {paymentMethods
                    .filter(m => m.status === 'active')
                    .map(method => {
                      const isGoDaddy = method.name === 'GoDaddy Terminal Flex';
                      return (
                        <div
                          key={method.id}
                          className="bg-custom-input/30 border border-custom-border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:bg-custom-primary/5"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 bg-custom-input rounded-xl border border-custom-border shrink-0 text-lg">
                              {method.name.toLowerCase().includes('cash') ? '💵' : method.name.toLowerCase().includes('card') ? '💳' : '🏷️'}
                            </div>
                            <div>
                              <h4 className="font-bold text-custom-text text-sm flex items-center gap-2">
                                {method.name}
                                {isGoDaddy && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-black bg-custom-primary/20 text-custom-primary uppercase tracking-wide">
                                    Integrated
                                  </span>
                                )}
                              </h4>
                              {isGoDaddy && (
                                <div className="flex items-center gap-1.5 mt-1 text-[10px] font-bold">
                                  <span className={godaddyPairingStatus === 'paired' ? 'text-emerald-400' : 'text-custom-accent'}>
                                    {godaddyPairingStatus === 'paired' ? 'Paired' : 'Not Paired'}
                                  </span>
                                  {godaddyPairingStatus === 'paired' && (
                                    <>
                                      <span className="text-custom-muted">•</span>
                                      <span className={`w-2 h-2 rounded-full ${godaddyConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                      <span className={godaddyConnected ? 'text-emerald-400' : 'text-red-400'}>
                                        {godaddyConnected ? 'Online' : 'Offline'}
                                      </span>
                                      <button
                                        onClick={checkGodaddyConnection}
                                        disabled={isCheckingGodaddyConnection}
                                        className="p-1 bg-custom-input border border-custom-border text-custom-muted hover:text-custom-text rounded-md transition-all cursor-pointer"
                                        title="Re-check connection"
                                      >
                                        <RefreshCw className={`h-2.5 w-2.5 ${isCheckingGodaddyConnection ? 'animate-spin' : ''}`} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                              <span className="block text-[10px] text-custom-muted mt-0.5">
                                {method.is_custom === 0 ? 'System default method.' : 'Custom merchant-defined option.'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] text-custom-muted font-bold uppercase tracking-wider">Fee %</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    defaultValue={method.fee_percentage}
                                    id={`input-fee-pct-${method.id}`}
                                    className="w-16 px-2 py-1 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs font-mono text-center focus:outline-none"
                                  />
                                </div>
                              </div>
                              <span className="text-custom-muted text-xs font-mono mt-4">+</span>
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] text-custom-muted font-bold uppercase tracking-wider">Fee Flat ($)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={method.fee_flat}
                                  id={`input-fee-flat-${method.id}`}
                                  className="w-20 px-2 py-1 bg-custom-input border border-custom-border text-custom-text rounded-lg text-xs font-mono text-center focus:outline-none"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const pct = (document.getElementById(`input-fee-pct-${method.id}`) as HTMLInputElement)?.value;
                                  const flat = (document.getElementById(`input-fee-flat-${method.id}`) as HTMLInputElement)?.value;
                                  handleUpdatePaymentFee(method, pct, flat);
                                }}
                                className="px-2.5 py-1 bg-custom-primary hover:bg-custom-primary-hover text-white font-bold text-[10px] rounded-lg mt-4 shadow cursor-pointer transition-all active:scale-95"
                              >
                                Save Fee
                              </button>
                            </div>

                            <div className="flex items-center gap-3 border-l border-custom-border/20 pl-4 h-full">
                              <div className="flex flex-col gap-1 items-center">
                                <span className="text-[9px] text-custom-muted font-bold uppercase tracking-wider">Status</span>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePaymentMethod(method, method.enabled === 0)}
                                  className={`w-10 h-5 rounded-full transition-all duration-200 focus:outline-none flex items-center p-0.5 cursor-pointer ${
                                    method.enabled === 1 ? 'bg-custom-accent justify-end' : 'bg-custom-input justify-start border border-custom-border'
                                  }`}
                                >
                                  <div className="w-3.5 h-3.5 rounded-full bg-white shadow-md" />
                                </button>
                              </div>

                              {method.is_custom === 1 && (
                                <button
                                  onClick={() => handleDeletePaymentMethod(method)}
                                  className="p-1.5 bg-custom-input border border-custom-border hover:bg-red-950/60 text-custom-muted hover:text-red-400 rounded-lg transition-all mt-4 cursor-pointer"
                                  title="Delete payment option"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="w-full xl:w-[360px] shrink-0">
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg flex flex-col space-y-4">
                <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                  <PlusCircle className="h-5 w-5 text-custom-accent" /> Add Custom Payment
                </h3>
                <form onSubmit={handleAddPaymentMethod} className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-custom-text font-bold uppercase tracking-wider">Method Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Venmo, check, store credit"
                      value={newPaymentName}
                      onChange={e => setNewPaymentName(e.target.value)}
                      className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text rounded-xl text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-custom-text font-bold uppercase tracking-wider">Fee Percentage</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0.0%"
                        value={newPaymentFeePercentage}
                        onChange={e => setNewPaymentFeePercentage(e.target.value)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text rounded-xl text-xs font-mono text-center focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-custom-text font-bold uppercase tracking-wider">Fee Flat ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="$0.00"
                        value={newPaymentFeeFlat}
                        onChange={e => setNewPaymentFeeFlat(e.target.value)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text rounded-xl text-xs font-mono text-center focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-custom-primary hover:bg-custom-primary-hover active:scale-95 text-white font-extrabold text-xs rounded-xl transition-all shadow cursor-pointer uppercase tracking-wider"
                  >
                    Add Option
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB E: SETTINGS & THEMES CONFIGURATION PANEL */}
        {subTab === 'settings' && (
          <div className="h-full flex flex-col xl:flex-row gap-6 min-h-0 overflow-y-auto pb-6 pr-1 p-6">

            {/* Left Column: General Settings & Updates */}
            <div className="w-full xl:w-96 shrink-0 flex flex-col gap-6">

              {/* Configuration panel */}
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-5">
                <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                  <Settings className="h-4 w-4 text-custom-accent" /> App Configuration
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">
                      Low Stock Alert Threshold
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={lowStockThreshold}
                      onChange={e => handleThresholdChange(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text font-mono rounded-lg focus:outline-none text-sm"
                    />
                    <span className="text-[10px] text-custom-muted/80 mt-1 block">Trigger alert notices at volunteer checkouts.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">
                      Organization Name
                    </label>
                    <input
                      type="text"
                      placeholder="🎆 THC FIREWORKS 🎆"
                      value={organizationName}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setOrganizationName(val);
                        try {
                          await invoke('save_setting', { key: 'organization_name', value: val });
                        } catch (err) {
                          console.error("Failed to save organization_name setting", err);
                        }
                      }}
                      className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text rounded-lg focus:outline-none text-sm"
                    />
                    <span className="text-[10px] text-custom-muted/80 mt-1 block">Reflected at the top of printed receipts.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">
                      Receipt Message
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Thanks for supporting our youth fundraiser!"
                      value={receiptMessage}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setReceiptMessage(val);
                        try {
                          await invoke('save_setting', { key: 'receipt_message', value: val });
                        } catch (err) {
                          console.error("Failed to save receipt_message setting", err);
                        }
                      }}
                      className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text rounded-lg focus:outline-none text-sm"
                    />
                    <span className="text-[10px] text-custom-muted/80 mt-1 block">Printed below the organization name on receipts.</span>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-4 border-t border-custom-border/20">
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-custom-text">Allow Out-of-Stock Sales</span>
                      <span className="text-[10px] text-custom-muted mt-0.5 block">Allow register terminals to sell items even when stock count is 0.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={allowOversell}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setAllowOversell(val);
                          try {
                            await invoke('save_setting', { key: 'allow_oversell', value: val.toString() });
                            triggerNotice('Overselling preference updated', 'success');
                          } catch (err) {
                            triggerNotice('Failed to save settings: ' + err, 'error');
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-custom-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-custom-accent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-custom-muted peer-checked:after:bg-custom-accent after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-custom-primary border border-custom-border"></div>
                    </label>
                  </div>


                </div>
              </div>



              {/* Admin Security settings panel */}
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-4">
                <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                  <Lock className="h-4 w-4 text-custom-accent" /> Admin Security Settings
                </h3>

                {securityNotice && (
                  <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-xs text-emerald-200 font-semibold">
                    {securityNotice}
                  </div>
                )}
                {securityError && (
                  <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-xs text-red-200 font-semibold">
                    {securityError}
                  </div>
                )}

                {isPwdConfigured ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-custom-input/40 border border-custom-border/40 p-3.5 rounded-xl">
                      <div>
                        <span className="block text-xs font-bold text-emerald-400">Security Active</span>
                        <span className="text-[10px] text-custom-muted mt-0.5 block">Console is password protected.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSecurityEditPanel(!showSecurityEditPanel)}
                        className="px-3.5 py-1.5 bg-custom-primary hover:bg-custom-primary-hover text-white text-xs font-bold rounded-lg transition-all border-0 cursor-pointer shadow"
                      >
                        {showSecurityEditPanel ? 'Hide Panel' : 'Edit Security'}
                      </button>
                    </div>

                    {/* Auto-Lock Inactivity Timeout */}
                    <div className="p-3.5 bg-custom-input/20 border border-custom-border/20 rounded-xl space-y-1.5">
                      <label className="block text-[10px] font-black uppercase text-custom-muted tracking-wider">Change Admin Timeout:</label>
                      <select
                        value={adminPasswordTimeout}
                        onChange={async (e) => {
                          const val = parseInt(e.target.value, 10);
                          setAdminPasswordTimeout(val);
                          try {
                            await invoke('save_setting', { key: 'admin_password_timeout', value: val.toString() });
                            triggerNotice('Admin lock timeout preference updated', 'success');
                            onAdminPasswordConfigChanged?.();
                          } catch (err) {
                            triggerNotice('Failed to save timeout: ' + err, 'error');
                          }
                        }}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary cursor-pointer font-bold"
                      >
                        <option value="-1">Every time the admin page is clicked off of</option>
                        <option value="1">1 Minute</option>
                        <option value="5">5 Minutes</option>
                        <option value="15">15 Minutes</option>
                        <option value="30">30 Minutes</option>
                        <option value="60">1 Hour</option>
                        <option value="0">Only on app close</option>
                      </select>
                    </div>

                    {showSecurityEditPanel && (
                      <div className="space-y-4 pt-2 border-t border-custom-border/20">
                        {/* Change Password Form */}
                        <form onSubmit={handleChangePassword} className="space-y-3">
                          <span className="block text-[10px] font-black uppercase text-custom-muted tracking-wider">Change Admin Password:</span>

                          {/* Verification Options for Change Password */}
                          <div className="space-y-2 p-3 bg-custom-input/20 border border-custom-border/20 rounded-xl">
                            <label className="block text-[9px] font-black uppercase text-custom-muted tracking-wider">Confirm Identity Via:</label>
                            <div className="flex gap-2">
                              {['password', 'question', 'key'].map((method) => (
                                <button
                                  key={method}
                                  type="button"
                                  onClick={() => setVerificationMethodChange(method as any)}
                                  className={`flex-1 py-1 px-2 border text-[10px] font-bold rounded-lg transition-all ${verificationMethodChange === method
                                    ? 'bg-custom-primary text-white border-custom-primary'
                                    : 'bg-custom-input border-custom-border text-custom-muted hover:text-custom-text'
                                    }`}
                                >
                                  {method === 'password' ? 'Password' : method === 'question' ? 'Question' : 'Recovery Key'}
                                </button>
                              ))}
                            </div>

                            {verificationMethodChange === 'password' && (
                              <input
                                type="password"
                                placeholder="Current Password"
                                value={currentPasswordInput}
                                onChange={(e) => setCurrentPasswordInput(e.target.value)}
                                className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                              />
                            )}

                            {verificationMethodChange === 'question' && (
                              <div className="space-y-1">
                                <span className="block text-[10px] text-custom-muted font-bold">Security Question: <strong className="text-custom-text">{activeSecurityQuestion || 'What was the name of your first pet?'}</strong></span>
                                <input
                                  type="text"
                                  placeholder="Answer"
                                  value={verificationAnswerInputChange}
                                  onChange={(e) => setVerificationAnswerInputChange(e.target.value)}
                                  className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                                />
                              </div>
                            )}

                            {verificationMethodChange === 'key' && (
                              <input
                                type="text"
                                placeholder="Recovery Key (XXXX-XXXX-XXXX)"
                                value={verificationKeyInputChange}
                                onChange={(e) => setVerificationKeyInputChange(e.target.value)}
                                className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary font-mono uppercase"
                              />
                            )}
                          </div>

                          <div>
                            <input
                              type="password"
                              placeholder="New Password"
                              value={newPasswordInput}
                              onChange={(e) => setNewPasswordInput(e.target.value)}
                              className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                            />
                          </div>
                          <div>
                            <input
                              type="password"
                              placeholder="Confirm New Password"
                              value={newPasswordConfirmInput}
                              onChange={(e) => setNewPasswordConfirmInput(e.target.value)}
                              className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                            />
                          </div>

                          <div className="space-y-2 pt-1 border-t border-custom-border/10">
                            <span className="block text-[9px] font-black uppercase text-custom-muted tracking-wider">Update Security Question (Optional):</span>
                            <select
                              value={securityQuestionSelect}
                              onChange={(e) => setSecurityQuestionSelect(e.target.value)}
                              className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary animate-none"
                            >
                              <option value="What was the name of your first pet?">What was the name of your first pet?</option>
                              <option value="What is the name of the school you attended for sixth grade?">What is the name of the school you attended for sixth grade?</option>
                              <option value="In what city or town did your parents meet?">In what city or town did your parents meet?</option>
                              <option value="What was the make and model of your first car?">What was the make and model of your first car?</option>
                              <option value="custom">Custom Question...</option>
                            </select>
                            {securityQuestionSelect === 'custom' && (
                              <input
                                type="text"
                                placeholder="Enter custom security question"
                                value={securityQuestionCustom}
                                onChange={(e) => setSecurityQuestionCustom(e.target.value)}
                                className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                              />
                            )}
                            <input
                              type="text"
                              placeholder="Security Answer"
                              value={securityAnswerInput}
                              onChange={(e) => setSecurityAnswerInput(e.target.value)}
                              className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full py-2 bg-custom-primary text-white text-xs font-bold rounded-lg hover:bg-custom-primary-hover transition-all border-0 cursor-pointer shadow-md mt-1"
                          >
                            Update Security Details
                          </button>
                        </form>

                        {/* Disable Password Button */}
                        <form onSubmit={handleDisableSecurity} className="pt-3 border-t border-custom-border/20 space-y-3">
                          <span className="block text-[10px] font-black uppercase text-custom-muted tracking-wider text-red-400">Disable Password Protection:</span>

                          <div className="space-y-2 p-3 bg-custom-input/20 border border-custom-border/20 rounded-xl">
                            <label className="block text-[9px] font-black uppercase text-custom-muted tracking-wider">Confirm Identity Via:</label>
                            <div className="flex gap-2">
                              {['password', 'question', 'key'].map((method) => (
                                <button
                                  key={method}
                                  type="button"
                                  onClick={() => setVerificationMethodDisable(method as any)}
                                  className={`flex-1 py-1 px-2 border text-[10px] font-bold rounded-lg transition-all ${verificationMethodDisable === method
                                    ? 'bg-custom-primary text-white border-custom-primary'
                                    : 'bg-custom-input border-custom-border text-custom-muted hover:text-custom-text'
                                    }`}
                                >
                                  {method === 'password' ? 'Password' : method === 'question' ? 'Question' : 'Recovery Key'}
                                </button>
                              ))}
                            </div>

                            <div className="flex gap-2 items-end">
                              <div className="flex-1">
                                {verificationMethodDisable === 'password' && (
                                  <input
                                    type="password"
                                    placeholder="Enter Current Password"
                                    value={currentPasswordInput}
                                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                                    className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                                  />
                                )}

                                {verificationMethodDisable === 'question' && (
                                  <div className="space-y-1">
                                    <span className="block text-[10px] text-custom-muted font-bold">Security Question: <strong className="text-custom-text">{activeSecurityQuestion || 'What was the name of your first pet?'}</strong></span>
                                    <input
                                      type="text"
                                      placeholder="Answer"
                                      value={verificationAnswerInputDisable}
                                      onChange={(e) => setVerificationAnswerInputDisable(e.target.value)}
                                      className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                                    />
                                  </div>
                                )}

                                {verificationMethodDisable === 'key' && (
                                  <input
                                    type="text"
                                    placeholder="Recovery Key"
                                    value={verificationKeyInputDisable}
                                    onChange={(e) => setVerificationKeyInputDisable(e.target.value)}
                                    className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary font-mono uppercase"
                                  />
                                )}
                              </div>
                              <button
                                type="submit"
                                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-all border-0 cursor-pointer shadow h-[38px] shrink-0"
                              >
                                Disable
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                ) : (
                  // Password setup form
                  <form onSubmit={handleEnableSecurity} className="space-y-3">
                    <span className="block text-[10px] font-black uppercase text-custom-muted tracking-wider">Set Admin Password:</span>
                    <div>
                      <input
                        type="password"
                        placeholder="Admin Password"
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                      />
                    </div>
                    <div>
                      <input
                        type="password"
                        placeholder="Confirm Password"
                        value={newPasswordConfirmInput}
                        onChange={(e) => setNewPasswordConfirmInput(e.target.value)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                      />
                    </div>

                    <div className="space-y-2 pt-2 border-t border-custom-border/10">
                      <span className="block text-[9px] font-black uppercase text-custom-muted tracking-wider">Security Question (For Recovery):</span>
                      <select
                        value={securityQuestionSelect}
                        onChange={(e) => setSecurityQuestionSelect(e.target.value)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                      >
                        <option value="What was the name of your first pet?">What was the name of your first pet?</option>
                        <option value="What is the name of the school you attended for sixth grade?">What is the name of the school you attended for sixth grade?</option>
                        <option value="In what city or town did your parents meet?">In what city or town did your parents meet?</option>
                        <option value="What was the make and model of your first car?">What was the make and model of your first car?</option>
                        <option value="custom">Custom Question...</option>
                      </select>
                      {securityQuestionSelect === 'custom' && (
                        <input
                          type="text"
                          placeholder="Enter custom security question"
                          value={securityQuestionCustom}
                          onChange={(e) => setSecurityQuestionCustom(e.target.value)}
                          className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                        />
                      )}
                      <input
                        type="text"
                        placeholder="Answer (Be precise)"
                        value={securityAnswerInput}
                        onChange={(e) => setSecurityAnswerInput(e.target.value)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:border-custom-primary"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-custom-primary text-white text-xs font-bold rounded-lg hover:bg-custom-primary-hover transition-all border-0 cursor-pointer shadow-md mt-1"
                    >
                      Enable Password Security
                    </button>
                  </form>
                )}
              </div>

              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-4">
                <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                  <CloudSync className="h-4 w-4 text-custom-accent" /> App Updates
                </h3>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-custom-text">Current Version</span>
                    <span className="text-[10px] text-custom-muted mt-0.5 block">{appVersion}</span>
                    <span className="text-[10px] text-custom-muted mt-1 block">
                      Updates are applied automatically with one click — no manual download needed.
                    </span>
                  </div>
                  <button
                    id="btn-admin-check-update"
                    onClick={handleCheckUpdate}
                    disabled={isCheckingUpdate}
                    className="px-4 py-2 bg-custom-primary hover:bg-custom-primary-hover active:scale-95 text-white font-extrabold text-xs rounded-lg transition-all shadow disabled:opacity-50 shrink-0"
                  >
                    {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
                  </button>
                </div>

                <div className="border-t border-custom-border/40 pt-3">
                  <button
                    id="btn-admin-view-releases"
                    onClick={async () => {
                      try {
                        const { openUrl } = await import('@tauri-apps/plugin-opener');
                        await openUrl('https://github.com/japressley8/THCFireworksPOS/releases');
                      } catch (err) {
                        await handleAlert('Failed to open releases page: ' + err, 'Error');
                      }
                    }}
                    className="flex items-center gap-1.5 text-[10px] text-custom-muted hover:text-custom-accent underline underline-offset-2 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                    View release history on GitHub
                  </button>
                </div>
              </div>
            </div>

            {/* Themes Selection Cards Grid */}
            <div className="flex-1 glass-panel rounded-2xl p-5 shadow-lg overflow-y-auto flex flex-col min-h-[300px] max-h-[500px] xl:max-h-none">
              <h3 className="text-lg font-bold text-custom-text mb-1 flex items-center gap-2 shrink-0">
                <Palette className="h-5 w-5 text-custom-accent" /> Available Themes
              </h3>
              <p className="text-xs text-custom-muted mb-4 border-b border-custom-border pb-3 shrink-0">Select a color scheme to skin your volunteer terminals</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {themes.map(t => {
                  const isActive = t.id === activeThemeId;
                  return (
                    <div
                      key={t.id}
                      onClick={() => onSelectTheme(t.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between h-36 ${isActive
                        ? 'bg-custom-primary/10 border-custom-primary shadow-glow shadow-custom-primary/5'
                        : 'bg-custom-bg/60 border-custom-border hover:border-custom-primary/50'
                        }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-custom-text text-sm">{t.name}</h4>
                          <p className="text-[9px] text-custom-muted/70 uppercase tracking-widest mt-0.5">
                            {t.isCustom ? 'Custom Saved' : 'Built-in Starter'}
                          </p>
                        </div>
                        {isActive && (
                          <span className="bg-custom-primary/20 text-custom-primary border border-custom-primary/30 px-2 py-0.5 rounded text-[9px] font-bold">
                            Active
                          </span>
                        )}
                      </div>

                      {/* Swatch color bubble indicators */}
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-1.5 bg-custom-input/40 px-2.5 py-1.5 rounded-lg border border-custom-border/40">
                          {/* Background swatch */}
                          <div className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: t.bg }} title="Background" />
                          {/* Card swatch */}
                          <div className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: t.card }} title="Cards" />
                          {/* Primary swatch */}
                          <div className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: t.primary }} title="Primary" />
                          {/* Accent swatch */}
                          <div className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: t.accent }} title="Accent" />
                          {/* Text swatch */}
                          <div className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: t.text }} title="Text" />
                        </div>

                        {t.isCustom && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (await handleConfirm(`Are you sure you want to delete custom theme "${t.name}"?`, 'Delete Custom Theme', true)) {
                                onDeleteCustomTheme(t.id);
                              }
                            }}
                            className="p-1.5 text-xs font-semibold bg-red-955/40 hover:bg-red-900 border border-red-900/30 hover:border-red-600 text-red-400 hover:text-white rounded-lg transition-all"
                            title="Delete Theme"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Theme Creator Form Panel */}
            <div className="w-full xl:w-96 glass-panel rounded-2xl p-5 shadow-lg shrink-0 flex flex-col min-h-0">
              <h3
                className="text-base font-bold text-custom-text mb-1 flex items-center justify-between border-b border-custom-border pb-3 shrink-0 cursor-pointer select-none"
                onClick={() => setIsCreateThemeCollapsed(!isCreateThemeCollapsed)}
              >
                <div className="flex items-center gap-2">
                  <PlusCircle className="h-4.5 w-4.5 text-custom-accent" /> Custom Theme Builder
                </div>
                <ChevronDown className={`h-5 w-5 text-custom-muted transition-transform duration-200 ${!isCreateThemeCollapsed ? 'rotate-180' : ''}`} />
              </h3>

              {!isCreateThemeCollapsed && (
                <form onSubmit={handleCreateCustomTheme} className="space-y-4 pt-3 flex-1 flex flex-col justify-between animate-in fade-in duration-150">
                  <div className="space-y-4">
                    {/* Theme Name input */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Theme Identifier Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Volunteer Teal / Christmas Theme"
                        value={customThemeName}
                        onChange={e => setCustomThemeName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-sm"
                        required
                      />
                    </div>

                    {/* Swatch pickers grid */}
                    <div className="grid grid-cols-2 gap-3.5 bg-custom-input/40 p-3 rounded-xl border border-custom-border/50">
                      <div>
                        <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Background</label>
                        <div className="flex items-center gap-2 bg-custom-input/50 p-1.5 rounded-lg border border-custom-border/40">
                          <input type="color" value={customThemeBg} onChange={e => setCustomThemeBg(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                          <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeBg}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Cards</label>
                        <div className="flex items-center gap-2 bg-custom-input/50 p-1.5 rounded-lg border border-custom-border/40">
                          <input type="color" value={customThemeCard} onChange={e => setCustomThemeCard(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                          <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeCard}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Text Color</label>
                        <div className="flex items-center gap-2 bg-custom-input/50 p-1.5 rounded-lg border border-custom-border/40">
                          <input type="color" value={customThemeText} onChange={e => setCustomThemeText(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                          <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeText}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Muted Text</label>
                        <div className="flex items-center gap-2 bg-custom-input/50 p-1.5 rounded-lg border border-custom-border/40">
                          <input type="color" value={customThemeMuted} onChange={e => setCustomThemeMuted(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                          <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeMuted}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Primary Btn</label>
                        <div className="flex items-center gap-2 bg-custom-input/50 p-1.5 rounded-lg border border-custom-border/40">
                          <input type="color" value={customThemePrimary} onChange={e => setCustomThemePrimary(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                          <span className="font-mono text-[10px] text-custom-text uppercase">{customThemePrimary}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Accent Accent</label>
                        <div className="flex items-center gap-2 bg-custom-input/50 p-1.5 rounded-lg border border-custom-border/40">
                          <input type="color" value={customThemeAccent} onChange={e => setCustomThemeAccent(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                          <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeAccent}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Border Line</label>
                        <div className="flex items-center gap-2 bg-custom-input/50 p-1.5 rounded-lg border border-custom-border/40">
                          <input type="color" value={customThemeBorder} onChange={e => setCustomThemeBorder(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                          <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeBorder}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Header Bar</label>
                        <div className="flex items-center gap-2 bg-custom-input/50 p-1.5 rounded-lg border border-custom-border/40">
                          <input type="color" value={customThemeHeader} onChange={e => setCustomThemeHeader(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                          <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeHeader}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Input Fields</label>
                        <div className="flex items-center gap-2 bg-custom-input/50 p-1.5 rounded-lg border border-custom-border/40">
                          <input type="color" value={customThemeInput} onChange={e => setCustomThemeInput(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                          <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeInput}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-6 py-3 bg-custom-primary hover:bg-custom-primary-hover text-white font-extrabold text-sm rounded-xl transition-all border border-white/10 active:scale-95"
                  >
                    Save & Apply Theme
                  </button>
                </form>
              )}
            </div>

          </div>
        )}

      </div>



      {/* MODAL: SALES LEDGER TRANSACTION RECEIPT REPRINT */}
      {showReceiptModal && selectedReceiptSale && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-200">
            {/* Modal Actions */}
            <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between no-print">
              <h3 className="font-bold text-custom-text text-lg flex items-center gap-2">
                <History className="h-5.5 w-5.5 text-custom-primary" /> View/Reprint Receipt
              </h3>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="p-2 hover:bg-custom-primary/20 rounded-xl text-custom-muted hover:text-custom-text transition-all border border-custom-border"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Receipt Preview Body (Scoped for printable styles) */}
            <div className="p-6 bg-custom-input/40 overflow-y-auto max-h-[400px] flex justify-center items-start no-print">
              <div
                className={`${receiptPaperWidth === '58mm' ? 'w-[52mm]' : 'w-[72mm]'} bg-white text-black p-5 font-mono leading-relaxed shadow-lg rounded border border-slate-300 animate-in zoom-in-95 duration-200 h-fit`}
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
                  <p className="text-[9px] text-left mt-2">Sale #: {selectedReceiptSale.id}</p>
                  <p className="text-[9px] text-left">Date: {new Date(selectedReceiptSale.timestamp).toLocaleString()}</p>
                </div>

                <div className="space-y-2 border-b border-dashed border-black pb-3 mb-3">
                  {selectedReceiptSale.items?.map(sItem => (
                    <div key={sItem.id} className="flex justify-between text-left">
                      <div className="pr-2">
                        <span className="font-bold">{sItem.item_name || `Item ID: ${sItem.item_id}`}</span>
                        <span className="block text-[10px] text-zinc-600 font-normal">
                          {sItem.quantity} x ${sItem.price_at_sale.toFixed(2)}
                        </span>
                      </div>
                      <span className="font-bold shrink-0">${(sItem.price_at_sale * sItem.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 text-right font-bold">
                  <div className="flex justify-between font-normal text-zinc-600">
                    <span>Subtotal</span>
                    <span>${selectedReceiptSale.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedReceiptSale.discount_total > 0 && (
                    <div className="flex justify-between font-normal text-zinc-800">
                      <span>Discount</span>
                      <span>-${selectedReceiptSale.discount_total.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-normal text-zinc-600">
                    <span>Tax</span>
                    <span>${selectedReceiptSale.tax_total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-dotted border-black pt-1.5 text-xs text-black font-extrabold uppercase">
                    <span>Total Paid</span>
                    <span>${selectedReceiptSale.final_total.toFixed(2)}</span>
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
                  <p style={{ margin: '0' }}>Sale #: {selectedReceiptSale.id}</p>
                  <p style={{ margin: '0' }}>Date: {new Date(selectedReceiptSale.timestamp).toLocaleString()}</p>
                </div>
              </div>

              <div style={{ paddingBottom: '8px', marginBottom: '8px', borderBottom: '1px dashed black' }}>
                {selectedReceiptSale.items?.map(sItem => (
                  <div key={sItem.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ paddingRight: '10px' }}>
                      <p style={{ margin: '0', fontWeight: 'bold' }}>{sItem.item_name || `Item ID: ${sItem.item_id}`}</p>
                      <p style={{ margin: '0', fontSize: '10px', color: '#333' }}>
                        {sItem.quantity} x ${sItem.price_at_sale.toFixed(2)}
                      </p>
                    </div>
                    <span style={{ fontWeight: 'bold' }}>${(sItem.price_at_sale * sItem.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div style={{ textAlign: 'right', fontWeight: 'bold' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', color: '#555' }}>
                  <span>Subtotal</span>
                  <span>${selectedReceiptSale.subtotal.toFixed(2)}</span>
                </div>
                {selectedReceiptSale.discount_total > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', color: '#222' }}>
                    <span>Discount</span>
                    <span>-${selectedReceiptSale.discount_total.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', color: '#555' }}>
                  <span>Tax</span>
                  <span>${selectedReceiptSale.tax_total.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dotted black', paddingTop: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                  <span>TOTAL PAID</span>
                  <span>${selectedReceiptSale.final_total.toFixed(2)}</span>
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
                onClick={handlePrintReceipt}
                className="flex-1 py-3 bg-custom-primary hover:bg-custom-primary-hover text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-97 border border-custom-border cursor-pointer"
              >
                <Printer className="h-5 w-5" /> Print Receipt
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-6 py-3 bg-custom-input hover:bg-custom-primary/20 text-custom-text font-semibold rounded-xl transition-all border border-custom-border active:scale-97"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GOOGLE DRIVE RESTORE LIST & SELECTION */}
      {dmShowGoogleRestoreModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-custom-card border border-custom-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header branding band */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-red-600" />

            <div className="bg-custom-header px-6 py-4 flex items-center justify-between border-b border-custom-border mt-1">
              <h3 className="text-base font-black text-custom-text flex items-center gap-2.5 uppercase tracking-tight">
                <CloudDownload className="h-5 w-5 text-custom-accent" /> Restore From Cloud Backup
              </h3>
              <button
                type="button"
                onClick={() => setDmShowGoogleRestoreModal(false)}
                className="p-1.5 bg-custom-input hover:bg-custom-primary/20 border border-custom-border rounded-lg transition-all text-custom-muted hover:text-custom-text cursor-pointer border-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <p className="text-xs text-custom-muted leading-relaxed font-semibold">
                Select a point-in-time backup from Google Drive. <strong className="text-red-500">This will completely overwrite current local data.</strong>
              </p>

              {dmIsLoadingCloudBackups ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-2 select-none">
                  <RefreshCw className="h-6 w-6 text-custom-accent animate-spin" />
                  <span className="text-xs text-custom-muted font-bold">Fetching cloud backups...</span>
                </div>
              ) : dmCloudBackupsList.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-custom-border rounded-xl">
                  <span className="text-xs text-custom-muted font-bold block">No cloud backups found on Google Drive.</span>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 border border-custom-border rounded-xl p-2 bg-custom-input/10">
                  {dmCloudBackupsList.map((backup, idx) => {
                    const isSelected = selectedCloudBackupId === backup.path;
                    const isNewest = idx === 0;
                    const sizeMB = (backup.size / (1024 * 1024)).toFixed(2);

                    return (
                      <div
                        key={backup.path}
                        onClick={() => setSelectedCloudBackupId(backup.path)}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-custom-primary/10 border-custom-primary/50 text-custom-text'
                            : 'bg-custom-input/30 border-custom-border/40 hover:border-custom-border/80 text-custom-muted hover:text-custom-text'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="cloud-backup-select"
                            checked={isSelected}
                            onChange={() => setSelectedCloudBackupId(backup.path)}
                            className="accent-custom-primary cursor-pointer h-4 w-4"
                          />
                          <div>
                            <span className="font-mono text-xs font-black block text-custom-text">
                              {backup.timestamp}
                            </span>
                            <span className="text-[10px] text-custom-muted block mt-0.5 font-mono">
                              File ID: {backup.path.substring(0, 12)}...
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isNewest && (
                            <span className="text-[9px] bg-custom-accent/25 text-custom-accent px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                              Newest
                            </span>
                          )}
                          <span className="font-mono text-xs font-black text-custom-text">
                            {sizeMB} MB
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-4 flex gap-3 justify-end border-t border-custom-border bg-custom-header">
              <button
                type="button"
                onClick={() => setDmShowGoogleRestoreModal(false)}
                className="flex-1 py-2.5 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={dmIsCloudRestoring || !selectedCloudBackupId}
                onClick={async () => {
                  if (await handleConfirm(
                    "Are you absolutely sure you want to restore from this cloud backup? All current sales, inventory, and settings will be overwritten.",
                    "Confirm Cloud Restore",
                    true
                  )) {
                    setDmIsCloudRestoring(true);
                    try {
                      const ts = await invoke<string>('restore_from_google_backup_file', { fileId: selectedCloudBackupId });
                      triggerNotice(`Database restored from cloud backup dated ${ts}. Please restart the app.`, 'success');
                      setDmShowGoogleRestoreModal(false);
                      await loadCloudBackupStatus();
                      loadInventory();
                      loadDiscounts();
                      loadTaxes();
                      loadSales();
                      loadTableRowCounts();
                    } catch (err) {
                      triggerNotice('Restore failed: ' + err, 'error');
                    } finally {
                      setDmIsCloudRestoring(false);
                    }
                  }
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer active:scale-95 border-0 shadow-lg flex items-center justify-center gap-1.5"
              >
                <CloudDownload className="h-3.5 w-3.5" />
                {dmIsCloudRestoring ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LOCAL RESTORE LIST & SELECTION */}
      {dmShowLocalRestoreModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-custom-card border border-custom-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header branding band */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-custom-primary" />

            <div className="bg-custom-header px-6 py-4 flex items-center justify-between border-b border-custom-border mt-1">
              <h3 className="text-base font-black text-custom-text flex items-center gap-2.5 uppercase tracking-tight">
                <RefreshCw className="h-5 w-5 text-custom-accent animate-spin-once" /> Restore From Saved Local Backup
              </h3>
              <button
                type="button"
                onClick={() => setDmShowLocalRestoreModal(false)}
                className="p-1.5 bg-custom-input hover:bg-custom-primary/20 border border-custom-border rounded-lg transition-all text-custom-muted hover:text-custom-text cursor-pointer border-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <p className="text-xs text-custom-muted leading-relaxed font-semibold">
                Select a local backup copy to restore. <strong className="text-red-500">This will completely overwrite current POS data.</strong>
              </p>

              {dmIsLoadingLocalBackups ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-2 select-none">
                  <RefreshCw className="h-6 w-6 text-custom-accent animate-spin" />
                  <span className="text-xs text-custom-muted font-bold">Loading local backups...</span>
                </div>
              ) : dmLocalBackupsList.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-custom-border rounded-xl">
                  <span className="text-xs text-custom-muted font-bold block">No saved local backups found.</span>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 border border-custom-border rounded-xl p-2 bg-custom-input/10">
                  {dmLocalBackupsList.map((backup, idx) => {
                    const isSelected = selectedLocalBackupPath === backup.path;
                    const isNewest = idx === 0;
                    const sizeMB = (backup.size / (1024 * 1024)).toFixed(2);

                    return (
                      <div
                        key={backup.path}
                        onClick={() => setSelectedLocalBackupPath(backup.path)}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-custom-primary/10 border-custom-primary/50 text-custom-text'
                            : 'bg-custom-input/30 border-custom-border/40 hover:border-custom-border/80 text-custom-muted hover:text-custom-text'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="local-backup-select"
                            checked={isSelected}
                            onChange={() => setSelectedLocalBackupPath(backup.path)}
                            className="accent-custom-primary cursor-pointer h-4 w-4"
                          />
                          <div>
                            <span className="font-mono text-xs font-black block text-custom-text">
                              {backup.timestamp}
                            </span>
                            <span className="text-[10px] text-custom-muted block mt-0.5 font-mono">
                              File: {backup.name}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isNewest && (
                            <span className="text-[9px] bg-custom-accent/25 text-custom-accent px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                              Newest
                            </span>
                          )}
                          <span className="font-mono text-xs font-black text-custom-text">
                            {sizeMB} MB
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-4 flex gap-3 justify-end border-t border-custom-border bg-custom-header">
              <button
                type="button"
                onClick={() => setDmShowLocalRestoreModal(false)}
                className="flex-1 py-2.5 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={dmIsImporting || !selectedLocalBackupPath}
                onClick={async () => {
                  if (await handleConfirm(
                    "Are you absolutely sure you want to restore from this local backup copy? All current sales, inventory, and settings will be overwritten.",
                    "Confirm Local Restore",
                    true
                  )) {
                    setDmIsImporting(true);
                    try {
                      await invoke('restore_from_local_backup_file', { path: selectedLocalBackupPath });
                      triggerNotice("Database successfully restored from local backup copy. Reloading app data...", "success");
                      setDmShowLocalRestoreModal(false);
                      loadInventory();
                      loadDiscounts();
                      loadTaxes();
                      loadSales();
                      loadTableRowCounts();
                    } catch (err) {
                      triggerNotice('Restore failed: ' + err, 'error');
                    } finally {
                      setDmIsImporting(false);
                    }
                  }
                }}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer active:scale-95 border-0 shadow-lg flex items-center justify-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                {dmIsImporting ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CLEAR DATA CONFIRMATION */}
      {dmShowClearModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-custom-card border border-custom-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header branding band */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-red-600" />

            <div className="bg-custom-header px-6 py-4 flex items-center justify-between border-b border-custom-border mt-1">
              <h3 className="text-lg font-black text-custom-text flex items-center gap-2.5 uppercase tracking-tight">
                <Trash2 className="h-5 w-5 text-red-500 animate-pulse" /> Confirm Data Deletion
              </h3>
              <button
                type="button"
                onClick={() => { setDmShowClearModal(false); setDmClearInputText(''); }}
                className="p-1.5 bg-custom-input hover:bg-custom-primary/20 border border-custom-border rounded-lg transition-all text-custom-muted hover:text-custom-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-custom-text">The following tables will be permanently cleared:</p>
              <ul className="text-xs text-red-400 font-bold list-disc list-inside space-y-0.5 p-3 bg-red-950/10 border border-red-900/20 rounded-xl">
                {dmClearSelectedTables.map(t => <li key={t} className="capitalize">{t.replace(/_/g, ' ')}</li>)}
              </ul>

              <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-xl text-center">
                <span className="block text-[10px] uppercase font-bold text-red-400">Type this code to confirm:</span>
                <span className="block font-mono text-sm font-black text-custom-text tracking-widest mt-1 select-all">{dmClearConfirmCode}</span>
              </div>

              <input
                type="text"
                value={dmClearInputText}
                onChange={e => setDmClearInputText(e.target.value.toUpperCase())}
                placeholder="Enter code above"
                className="w-full px-4 py-3 bg-custom-input border border-custom-border text-custom-text font-mono text-center rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500 tracking-widest placeholder:text-custom-muted/45 text-sm font-bold animate-none"
              />
            </div>

            <div className="px-6 py-4 flex gap-3 justify-end border-t border-custom-border bg-custom-header">
              <button
                type="button"
                onClick={() => { setDmShowClearModal(false); setDmClearInputText(''); }}
                className="flex-1 py-3 bg-custom-input hover:bg-custom-primary/10 border border-custom-border text-custom-text rounded-xl font-bold text-xs transition-all active:scale-95 shadow"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={dmClearInputText !== dmClearConfirmCode}
                onClick={async () => {
                  try {
                    await invoke('clear_selected_tables', { tables: dmClearSelectedTables });
                    triggerNotice('Selected tables cleared successfully.', 'success');
                    setDmShowClearModal(false);
                    setDmClearSelectedTables([]);
                    loadInventory();
                    loadDiscounts();
                    loadTaxes();
                    loadSales();
                  } catch (err) {
                    triggerNotice('Clear failed: ' + err, 'error');
                  }
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl transition-all border border-white/10 cursor-pointer disabled:cursor-not-allowed active:scale-95 shadow-lg"
              >
                Confirm Clear
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Admin Password Recovery Key Modal */}
      {showRecoveryKeyModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-emerald-500" />

            <div className="flex items-center gap-3.5 mb-5 mt-2 text-emerald-400">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                <Key className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-custom-text uppercase tracking-tight">Admin Recovery Key</h3>
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Save This Securely</p>
              </div>
            </div>

            <p className="text-xs text-custom-muted leading-relaxed mb-6 font-sans">
              This recovery key can be used to bypass the admin password prompt if you forget it. It will NOT be shown again. Please write this key down or save it somewhere secure:
            </p>

            <div
              id="admin-generated-recovery-key"
              className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl text-center select-all cursor-pointer font-mono font-black text-xl text-emerald-400 tracking-widest mb-6"
            >
              {generatedRecoveryKey}
            </div>

            <div className="flex">
              <button
                type="button"
                id="btn-close-recovery-modal"
                onClick={() => {
                  setShowRecoveryKeyModal(false);
                  setGeneratedRecoveryKey('');
                }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 shadow border border-white/10"
              >
                I Have Saved the Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GODADDY SETUP HELP / INSTRUCTIONS */}
      {showGodaddyHelp && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-200">
            <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-custom-text text-lg flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-custom-accent" /> GoDaddy Terminal Setup
              </h3>
              <button
                onClick={() => setShowGodaddyHelp(false)}
                className="p-2 hover:bg-custom-primary/20 rounded-xl text-custom-muted hover:text-custom-text transition-all border border-custom-border"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto font-sans text-xs text-custom-muted leading-relaxed">
              <p>Follow these steps to connect your GoDaddy Smart Terminal Flex v1 over the local network:</p>

              <ol className="list-decimal list-inside space-y-3">
                <li>
                  <strong className="text-custom-text">Same WiFi Subnet:</strong> Connect both this computer and the GoDaddy Smart Terminal to the <span className="underline text-custom-accent">exact same WiFi network</span>.
                </li>
                <li>
                  <strong className="text-custom-text">Open POS Bridge:</strong> On the GoDaddy terminal screen, find and launch the app named <strong className="text-custom-text">POS Bridge</strong>.
                </li>
                <li>
                  <strong className="text-custom-text">Enter Terminal IP:</strong> In the POS Bridge app, note the displayed local IP address (e.g. <code className="bg-custom-input border border-custom-border px-1 py-0.5 rounded font-mono text-[10px]">192.168.1.150</code>). Type this IP in the field on this settings screen. (If you just want to test without a real device, type <code className="bg-custom-input border border-custom-border px-1 py-0.5 rounded font-mono text-[10px]">mock</code>).
                </li>
                <li>
                  <strong className="text-custom-text">Get Pairing Code:</strong> Tap the <strong className="text-custom-text">"Connect Manually"</strong> button in the terminal's POS Bridge app to display a unique 6-digit code.
                </li>
                <li>
                  <strong className="text-custom-text">Pair on PC:</strong> Click the <strong className="text-custom-text">"Pair Terminal"</strong> button on this PC, enter the 6-digit pairing code, and submit.
                </li>
                <li>
                  <strong className="text-custom-text">Approve Prompt:</strong> Tap <strong className="text-custom-text">"Approve"</strong> on the GoDaddy terminal screen within 30 seconds when the confirmation request pops up.
                </li>
              </ol>

              <div className="p-3 bg-custom-input/40 border border-custom-border/40 rounded-xl mt-2 text-[11px]">
                <strong className="text-custom-accent block mb-1">💡 Pro-Tip for Tents:</strong> Configure your WiFi router to assign a <strong className="text-custom-text">static IP</strong> address to the GoDaddy terminal. Otherwise, its IP may change when restarted, requiring you to update settings again.
              </div>
            </div>

            <div className="bg-custom-header border-t border-custom-border px-6 py-4 flex justify-end">
              <button
                onClick={() => setShowGodaddyHelp(false)}
                className="px-4 py-2 bg-custom-primary hover:bg-custom-primary-hover active:scale-95 text-white font-bold text-xs rounded-lg transition-all shadow"
              >
                Close instructions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GODADDY PAIRING HANDSHAKE INPUT */}
      {showGodaddyPairModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-200">
            <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-custom-text text-lg flex items-center gap-2">
                <Key className="h-5 w-5 text-custom-primary" /> Pair Smart Terminal
              </h3>
              <button
                onClick={() => setShowGodaddyPairModal(false)}
                className="p-2 hover:bg-custom-primary/20 rounded-xl text-custom-muted hover:text-custom-text transition-all border border-custom-border"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-2 text-center">
                  Enter 6-Digit Pairing Code
                </label>
                <p className="text-[10px] text-custom-muted text-center mb-4">
                  From the POS Bridge "Connect Manually" screen on the terminal.
                </p>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 123456"
                  value={godaddyPairingCode}
                  onChange={(e) => setGodaddyPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  className="w-full px-4 py-3 bg-custom-input border border-custom-border text-custom-text rounded-xl focus:outline-none text-center text-2xl font-mono tracking-widest"
                />
              </div>
            </div>

            <div className="bg-custom-header border-t border-custom-border px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={() => setShowGodaddyPairModal(false)}
                className="w-1/2 py-2.5 bg-custom-input hover:bg-custom-border text-custom-text font-bold text-xs rounded-lg transition-all border border-custom-border active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGodaddyPairing || godaddyPairingCode.length !== 6}
                onClick={() => handlePairTerminal(godaddyPairingCode)}
                className="w-1/2 py-2.5 bg-custom-primary hover:bg-custom-primary-hover disabled:opacity-50 text-white font-extrabold text-xs rounded-lg transition-all active:scale-95 shadow shrink-0"
              >
                {isGodaddyPairing ? 'Pairing...' : 'Submit Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LINK TO BULK CASE */}
      {linkingBulkItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" id="modal-link-bulk">
          <div className="w-full max-w-lg bg-custom-card border border-custom-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-200">
            {/* Modal Header */}
            <div className="bg-custom-header border-b border-custom-border px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-custom-text text-lg flex items-center gap-2">
                <Archive className="h-5.5 w-5.5 text-custom-accent" /> Link as Bulk Case
              </h3>
              <button
                id="btn-close-link-bulk-modal"
                onClick={() => setLinkingBulkItem(null)}
                className="p-2 hover:bg-custom-primary/20 rounded-xl text-custom-muted hover:text-custom-text transition-all border border-custom-border"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
              <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-xs text-red-200/90 leading-relaxed">
                <AlertTriangle className="h-4 w-4 text-red-500 inline mr-2 align-text-bottom shrink-0" />
                <strong>Warning:</strong> The product <span className="font-bold font-mono bg-red-950/40 px-1 rounded text-red-400">{linkingBulkItem.name}</span> will be <strong>deleted</strong> from the database. Its attributes will be converted into a bulk variant of the single item you select below. Bulk stock will be ignored.
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-black text-custom-muted tracking-wider block">Bulk Product Details</span>
                <div className="grid grid-cols-2 gap-3 bg-custom-input/20 border border-custom-border/40 p-3 rounded-xl text-xs font-mono">
                  <div>
                    <span className="text-custom-muted block text-[10px]">Barcode/UPC:</span>
                    <span className="text-custom-text font-bold">{linkingBulkItem.barcode}</span>
                  </div>
                  <div>
                    <span className="text-custom-muted block text-[10px]">Bulk Price (Wholesale Cost):</span>
                    <span className="text-custom-accent font-extrabold">
                      ${(linkingBulkItem.unit_cost !== null && linkingBulkItem.unit_cost !== undefined && linkingBulkItem.unit_cost > 0)
                        ? linkingBulkItem.unit_cost.toFixed(2)
                        : linkingBulkItem.price.toFixed(2)}
                      {linkingBulkItem.unit_cost !== null && linkingBulkItem.unit_cost !== undefined && linkingBulkItem.unit_cost > 0 ? ' (Wholesale Cost)' : ' (Retail Price fallback)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quantity Per Case */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-black text-custom-muted tracking-wider">
                  Case Unit Count (Quantity per Case) <strong className="text-red-500 font-extrabold">*</strong>
                </label>
                <input
                  id="link-bulk-qty-input"
                  type="number"
                  value={linkBulkQuantity}
                  onChange={(e) => setLinkBulkQuantity(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full px-3.5 py-2 bg-custom-input border border-custom-border text-custom-text rounded-xl focus:outline-none font-bold font-mono text-sm"
                />
              </div>

              {/* Select Single Item with Search */}
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-black text-custom-muted tracking-wider">
                  Select Single Product <strong className="text-red-500 font-extrabold">*</strong>
                </label>

                {/* Search field */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-custom-muted" />
                  <input
                    id="link-bulk-search-input"
                    type="text"
                    placeholder="Search by name or barcode..."
                    value={linkSearchQuery}
                    onChange={(e) => setLinkSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-custom-input border border-custom-border text-custom-text rounded-xl focus:outline-none text-xs"
                  />
                </div>

                {/* Scroller list */}
                <div className="border border-custom-border rounded-xl bg-custom-input/20 max-h-48 overflow-y-auto divide-y divide-custom-border/30">
                  {items
                    .filter(i => i.id !== linkingBulkItem.id) // exclude the bulk item itself
                    .filter(i => {
                      if (!linkSearchQuery.trim()) return true;
                      const q = linkSearchQuery.toLowerCase();
                      return i.name.toLowerCase().includes(q) || i.barcode.toLowerCase().includes(q);
                    })
                    .map(item => {
                      const isSelected = linkTargetSingleItemId === String(item.id);
                      return (
                        <button
                          id={`btn-select-target-${item.id}`}
                          key={item.id}
                          type="button"
                          onClick={() => setLinkTargetSingleItemId(String(item.id))}
                          className={`w-full text-left px-4 py-2 text-xs flex justify-between items-center transition-all ${isSelected
                            ? 'bg-custom-primary/20 text-custom-text border-l-4 border-custom-primary font-bold'
                            : 'hover:bg-custom-input/40 text-custom-muted hover:text-custom-text'
                            }`}
                        >
                          <div>
                            <span className="block font-bold">{item.name}</span>
                            <span className="block text-[10px] text-custom-muted/80 font-mono">UPC: {item.barcode}</span>
                          </div>
                          <span className="font-mono text-custom-accent font-bold">${item.price.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  {items.filter(i => i.id !== linkingBulkItem.id).filter(i => {
                    if (!linkSearchQuery.trim()) return true;
                    const q = linkSearchQuery.toLowerCase();
                    return i.name.toLowerCase().includes(q) || i.barcode.toLowerCase().includes(q);
                  }).length === 0 && (
                      <div className="p-4 text-center text-xs text-custom-muted italic">
                        No matching products found.
                      </div>
                    )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-custom-header border-t border-custom-border px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={() => setLinkingBulkItem(null)}
                className="w-1/2 py-2.5 bg-custom-input hover:bg-custom-border text-custom-text font-bold text-xs rounded-lg transition-all border border-custom-border active:scale-95"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-link-bulk"
                type="button"
                onClick={handleLinkBulkItem}
                disabled={!linkTargetSingleItemId || !linkBulkQuantity}
                className="w-1/2 py-2.5 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs rounded-lg transition-all active:scale-95 shadow disabled:opacity-50 shrink-0"
              >
                Link &amp; Delete Bulk Item
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default AdminView;
