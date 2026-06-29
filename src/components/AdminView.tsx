import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  Package, 
  Tag, 
  History, 
  Unlock, 
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
  TrendingUp,
  Palette,
  Upload,
  Settings
} from 'lucide-react';
import { Item, Discount, Sale, Theme, YearSummary, DaySummary } from '../types';

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
}

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
  onTotalCostChange
}) => {
  // Security
  const [isAdminUnlocked] = useState<boolean>(true);

  // Active sub-tab
  const [subTab, setSubTab] = useState<'inventory' | 'discounts' | 'sales' | 'analytics' | 'themes'>('inventory');

  // Analytics states
  const [analyticsMode, setAnalyticsMode] = useState<'yearly' | 'daily'>('yearly');
  const [yearlySummaries, setYearlySummaries] = useState<YearSummary[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DaySummary[]>([]);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);

  // Custom theme creator form states
  const [customThemeName, setCustomThemeName] = useState<string>('');
  const [customThemeBg, setCustomThemeBg] = useState<string>('#0b1329');
  const [customThemeCard, setCustomThemeCard] = useState<string>('rgba(13, 23, 49, 0.8)');
  const [customThemeText, setCustomThemeText] = useState<string>('#ffffff');
  const [customThemeMuted, setCustomThemeMuted] = useState<string>('#94a3b8');
  const [customThemePrimary, setCustomThemePrimary] = useState<string>('#ef4444');
  const [customThemeAccent, setCustomThemeAccent] = useState<string>('#f59e0b');
  const [customThemeBorder, setCustomThemeBorder] = useState<string>('rgba(239, 68, 68, 0.3)');
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

  // New Discount Form State
  const [newDiscName, setNewDiscName] = useState<string>('');
  const [newDiscType, setNewDiscType] = useState<'percentage' | 'fixed'>('percentage');
  const [newDiscValue, setNewDiscValue] = useState<string>('');

  // CSV Import wizard states
  const [parsedCSVItems, setParsedCSVItems] = useState<any[]>([]);
  const [importDefaultStock, setImportDefaultStock] = useState<string>(''); // Stock is now optional
  const [importDuplicatePolicy, setImportDuplicatePolicy] = useState<'skip' | 'overwrite'>('skip');
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Editing state
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState<string>('');
  const [editItemStock, setEditItemStock] = useState<string>('');
  const [editItemPrice, setEditItemPrice] = useState<string>('');
  const [editItemNotes, setEditItemNotes] = useState<string>('');
  const [editItemBulkPrice, setEditItemBulkPrice] = useState<string>('');
  const [editItemBulkBarcode, setEditItemBulkBarcode] = useState<string>('');
  const [editItemBulkQuantity, setEditItemBulkQuantity] = useState<string>('');

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
    }
  }, [isAdminUnlocked]);

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

  const handleCSVFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let itemsList = [];
        if (isXlsx) {
          const XLSX = await import('xlsx');
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
          itemsList = parseXLSXRows(rows);
        } else {
          const text = event.target?.result as string;
          itemsList = parseCSVText(text);
        }

        if (itemsList.length === 0) {
          triggerNotice('No items parsed from the file.', 'error');
        } else {
          setParsedCSVItems(itemsList);
          triggerNotice(`Successfully parsed ${itemsList.length} items!`, 'success');
        }
      } catch (err: any) {
        triggerNotice(err.message || 'Failed to parse file.', 'error');
      }
    };

    if (isXlsx) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    e.target.value = ''; // Reset file input
  };

  const parseXLSXRows = (rows: any[][]) => {
    if (rows.length === 0) return [];
    
    // Read headers from row 0
    const headers = rows[0].map(h => String(h || '').trim().toUpperCase());
    
    const descIdx = headers.findIndex(h => h.includes('DESCRIPTION') || h.includes('NAME'));
    const upcIdx = headers.findIndex(h => h.includes('UPC') || h.includes('BARCODE'));
    const priceIdx = headers.findIndex(h => h.includes('RETAIL') || h.includes('PRICE'));
    
    if (descIdx === -1 || upcIdx === -1 || priceIdx === -1) {
      throw new Error("Missing required columns. The sheet must have headers for 'DESCRIPTION', 'UPC', and 'RETAIL'.");
    }
    
    const importedItems = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const name = String(row[descIdx] || '').trim();
      const barcode = String(row[upcIdx] || '').trim();
      const priceStr = String(row[priceIdx] || '').trim().replace(/[^0-9.]/g, '');
      const price = parseFloat(priceStr);
      
      if (name && barcode && !isNaN(price)) {
        importedItems.push({
          barcode,
          name,
          price
        });
      }
    }
    return importedItems;
  };

  const parseCSVText = (text: string) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    
    // Read headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toUpperCase());
    
    const descIdx = headers.findIndex(h => h.includes('DESCRIPTION') || h.includes('NAME'));
    const upcIdx = headers.findIndex(h => h.includes('UPC') || h.includes('BARCODE'));
    const priceIdx = headers.findIndex(h => h.includes('RETAIL') || h.includes('PRICE'));
    
    if (descIdx === -1 || upcIdx === -1 || priceIdx === -1) {
      throw new Error("Missing required columns. The CSV must have headers for 'DESCRIPTION', 'UPC', and 'RETAIL'.");
    }
    
    const importedItems = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV line handling quotes
      const cols = [];
      let current = '';
      let inQuotes = false;
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cols.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      cols.push(current.trim());
      
      if (cols.length <= Math.max(descIdx, upcIdx, priceIdx)) continue;
      
      const name = cols[descIdx].replace(/^["']|["']$/g, '');
      const barcode = cols[upcIdx].replace(/^["']|["']$/g, '');
      const priceStr = cols[priceIdx].replace(/^["']|["']$/g, '').replace(/[^0-9.]/g, '');
      const price = parseFloat(priceStr);
      
      if (name && barcode && !isNaN(price)) {
        importedItems.push({
          barcode,
          name,
          price
        });
      }
    }
    return importedItems;
  };

  const executeCSVImport = async () => {
    setIsImporting(true);
    let successCount = 0;
    let skipCount = 0;
    
    try {
      const existingItems = await invoke<Item[]>('get_items');
      const stockVal = importDefaultStock.trim() === '' ? null : parseInt(importDefaultStock, 10);
      
      for (const item of parsedCSVItems) {
        const existing = existingItems.find(i => i.barcode === item.barcode);
        
        if (existing) {
          if (importDuplicatePolicy === 'skip') {
            skipCount++;
            continue;
          } else {
            await invoke('update_item_details', {
              id: existing.id,
              name: existing.name,
              price: item.price,
              stockQuantity: stockVal,
              notes: existing.notes || null,
              bulkPrice: existing.bulk_price !== undefined ? existing.bulk_price : null,
              bulkBarcode: existing.bulk_barcode || null,
              bulkQuantity: existing.bulk_quantity !== undefined ? existing.bulk_quantity : null,
              unitCost: null
            });
            successCount++;
          }
        } else {
          await invoke('add_item', {
            barcode: item.barcode,
            name: item.name,
            price: item.price,
            stockQuantity: stockVal,
            notes: null,
            bulkPrice: null,
            bulkBarcode: null,
            bulkQuantity: null,
            unitCost: null
          });
          successCount++;
        }
      }
      
      triggerNotice(`Import finished! ${successCount} items imported/updated, ${skipCount} items skipped.`, 'success');
      loadInventory();
      setParsedCSVItems([]);
    } catch (err: any) {
      triggerNotice('Import failed during commit: ' + err, 'error');
    } finally {
      setIsImporting(false);
    }
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
      await invoke('add_item', {
        barcode: newItemBarcode.trim(),
        name: newItemName.trim(),
        price,
        stockQuantity: stock,
        notes: newItemNotes.trim() === '' ? null : newItemNotes.trim(),
        bulkPrice,
        bulkBarcode: newItemBulkBarcode.trim() === '' ? null : newItemBulkBarcode.trim(),
        bulkQuantity,
        unitCost: null
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

    if (editItemName.trim() === '') {
      triggerNotice('Please enter a product name', 'error');
      return;
    }

    if (isNaN(price)) {
      triggerNotice('Please enter a valid price value', 'error');
      return;
    }

    try {
      await invoke('update_item_details', {
        id: itemId,
        name: editItemName.trim(),
        price,
        stockQuantity: stock,
        notes: editItemNotes.trim() === '' ? null : editItemNotes.trim(),
        bulkPrice,
        bulkBarcode: editItemBulkBarcode.trim() === '' ? null : editItemBulkBarcode.trim(),
        bulkQuantity,
        unitCost: null
      });

      triggerNotice('Product details updated', 'success');
      setEditingItemId(null);
      loadInventory();
    } catch (err) {
      triggerNotice('Update failed: ' + err, 'error');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm('Are you sure you want to delete this product? This will break reports linking this ID.')) return;
    try {
      await invoke('delete_item', { id: itemId });
      triggerNotice('Product removed from database', 'success');
      loadInventory();
    } catch (err) {
      triggerNotice('Failed to delete: ' + err, 'error');
    }
  };

  const handleAddDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newDiscValue);

    if (!newDiscName.trim() || isNaN(val) || val <= 0) {
      triggerNotice('Please specify a valid name and positive value', 'error');
      return;
    }

    try {
      await invoke('add_discount', {
        name: newDiscName.trim(),
        discountType: newDiscType,
        value: val
      });

      triggerNotice(`Created discount "${newDiscName}"`, 'success');
      setNewDiscName('');
      setNewDiscValue('');
      loadDiscounts();
    } catch (err) {
      triggerNotice('Failed to create discount: ' + err, 'error');
    }
  };

  const handleDeleteDiscount = async (discId: number) => {
    if (!confirm('Delete this preset discount?')) return;
    try {
      await invoke('delete_discount', { id: discId });
      triggerNotice('Discount removed', 'success');
      loadDiscounts();
    } catch (err) {
      triggerNotice('Failed to delete discount: ' + err, 'error');
    }
  };

  // Filter products list
  const filteredItems = items.filter(item => {
    const q = inventorySearch.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.barcode.includes(q);
  });



  // LOGGED-IN ADMIN CONSOLE
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-2 relative select-none">
      {/* Notice Banner */}
      {notice && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-6 py-4 rounded-xl shadow-2xl transition-all border ${
          notice.type === 'error' 
            ? 'bg-red-950/95 border-red-500 text-red-100' 
            : 'bg-custom-header border-custom-primary text-custom-text'
        }`}>
          <span className="font-semibold text-base">{notice.message}</span>
        </div>
      )}

      {/* Admin Subheader and Navigation */}
      <div className="bg-custom-card border border-custom-border rounded-2xl px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-custom-input text-custom-accent rounded-xl border border-custom-border shadow">
            <Unlock className="h-5.5 w-5.5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-custom-text">Manager Admin Console</h2>
            <p className="text-xs text-custom-muted font-sans">Configure prices, preset discounts, and audit sales logs</p>
          </div>
        </div>

        {/* Tab switch buttons */}
        <div className="flex bg-custom-bg border border-custom-border rounded-xl p-1 shrink-0 shadow-inner flex-wrap gap-1">
          <button
            id="btn-admin-tab-inventory"
            onClick={() => setSubTab('inventory')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${
              subTab === 'inventory' 
                ? 'bg-custom-primary text-white shadow-lg' 
                : 'text-custom-muted hover:text-custom-text'
            }`}
          >
            <Package className="h-4 w-4" /> Products
          </button>
          <button
            id="btn-admin-tab-discounts"
            onClick={() => setSubTab('discounts')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${
              subTab === 'discounts' 
                ? 'bg-custom-primary text-white shadow-lg' 
                : 'text-custom-muted hover:text-custom-text'
            }`}
          >
            <Tag className="h-4 w-4" /> Discounts
          </button>
          <button
            id="btn-admin-tab-sales"
            onClick={() => setSubTab('sales')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${
              subTab === 'sales' 
                ? 'bg-custom-primary text-white shadow-lg' 
                : 'text-custom-muted hover:text-custom-text'
            }`}
          >
            <History className="h-4 w-4" /> Sales Ledger
          </button>
          <button
            id="btn-admin-tab-analytics"
            onClick={() => setSubTab('analytics')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${
              subTab === 'analytics' 
                ? 'bg-custom-primary text-white shadow-lg' 
                : 'text-custom-muted hover:text-custom-text'
            }`}
          >
            <TrendingUp className="h-4 w-4" /> Analytics
          </button>
          <button
            id="btn-admin-tab-themes"
            onClick={() => setSubTab('themes')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${
              subTab === 'themes' 
                ? 'bg-custom-primary text-white shadow-lg' 
                : 'text-custom-muted hover:text-custom-text'
            }`}
          >
            <Palette className="h-4 w-4" /> Themes
          </button>
        </div>
      </div>

      {/* SUB-PANEL CONTENTS */}
      <div className="flex-1 overflow-hidden min-h-0">
        
        {/* SUB-TAB A: PRODUCT INVENTORY MANAGER */}
        {subTab === 'inventory' && (
          <div className="h-full flex flex-col xl:flex-row gap-6 min-h-0">
            {/* Form Column */}
            <div className="w-full xl:w-96 shrink-0 flex flex-col gap-6 overflow-y-auto pr-1">
              {/* Catalog New Product */}
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg flex flex-col space-y-4">
                <h3 className="text-lg font-bold text-custom-text flex items-center gap-2 pb-2 border-b border-custom-border">
                  <PlusCircle className="h-5 w-5 text-custom-accent" /> Catalog New Product
                </h3>

                <form onSubmit={handleAddItem} className="space-y-4.5">
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

                  <div className="border-t border-custom-border/40 pt-3.5 space-y-3">
                    <span className="block text-[10px] font-extrabold uppercase tracking-wider text-custom-accent">Optional Bulk Selling</span>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold uppercase text-custom-muted mb-1">Bulk Barcode (UPC)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. 1002422"
                          value={newItemBulkBarcode}
                          onChange={e => setNewItemBulkBarcode(e.target.value)}
                          className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg focus:outline-none placeholder:text-custom-muted/40"
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
                          className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg focus:outline-none placeholder:text-custom-muted/40"
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
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg focus:outline-none placeholder:text-custom-muted/40"
                      />
                    </div>
                  </div>

                  <button 
                    id="btn-admin-add-item-submit"
                    type="submit"
                    className="w-full py-4 bg-custom-primary hover:bg-custom-primary-hover active:scale-97 text-white font-extrabold text-base rounded-xl transition-all shadow border border-custom-border"
                  >
                    Add Product to Catalog
                  </button>
                </form>
              </div>

              {/* CSV / Excel Import Wizard Card */}
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg flex flex-col space-y-4 bg-custom-card/50">
                <h3 className="text-lg font-bold text-custom-text flex items-center gap-2 pb-2 border-b border-custom-border">
                  <Upload className="h-5 w-5 text-custom-accent" /> CSV / Excel Inventory Import Wizard
                </h3>

                <div className="space-y-4.5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">
                      Select Inventory CSV or Excel File
                    </label>
                    <input
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      onChange={handleCSVFileSelect}
                      className="w-full text-xs text-custom-text file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-custom-primary/20 file:text-custom-primary hover:file:bg-custom-primary/30 file:cursor-pointer"
                    />
                    <p className="text-[10px] text-custom-muted mt-1.5">
                      Expects headers: <code className="font-mono text-custom-accent">DESCRIPTION</code>, <code className="font-mono text-custom-accent">UPC</code>, and <code className="font-mono text-custom-accent">RETAIL</code> (or <code className="font-mono text-custom-accent">PRICE</code>).
                    </p>
                  </div>

                  {parsedCSVItems.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-custom-border/55">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-custom-text font-bold">{parsedCSVItems.length} Products Parsed</span>
                        <button 
                          type="button" 
                          onClick={() => setParsedCSVItems([])}
                          className="text-[10px] text-red-400 hover:underline"
                        >
                          Clear
                        </button>
                      </div>

                      {/* Default Stock Input */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-custom-muted mb-1">
                          Default Stock Qty (Optional)
                        </label>
                        <input
                          type="number"
                          placeholder="Unlimited (Leave blank)"
                          value={importDefaultStock}
                          onChange={e => setImportDefaultStock(e.target.value)}
                          className="w-full px-3 py-1.5 bg-custom-input border border-custom-border text-custom-text font-mono text-xs rounded-lg"
                        />
                      </div>

                      {/* Duplicate policy */}
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-custom-muted mb-1">
                          Duplicate Barcodes
                        </label>
                        <select
                          value={importDuplicatePolicy}
                          onChange={e => setImportDuplicatePolicy(e.target.value as 'skip' | 'overwrite')}
                          className="w-full px-3 py-1.5 bg-custom-input border border-custom-border text-custom-text text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-custom-primary"
                        >
                          <option value="skip">Skip import (Keep existing)</option>
                          <option value="overwrite">Overwrite existing details</option>
                        </select>
                      </div>

                      {/* Preview table */}
                      <div className="max-h-24 overflow-y-auto text-[10px] bg-black/20 rounded-lg p-2 border border-custom-border/30">
                        {parsedCSVItems.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="flex justify-between border-b border-custom-border/20 py-1 last:border-0">
                            <span className="truncate max-w-[120px] font-semibold text-custom-text">{item.name}</span>
                            <span className="font-mono text-custom-accent">${item.price.toFixed(2)}</span>
                          </div>
                        ))}
                        {parsedCSVItems.length > 3 && (
                          <div className="text-center pt-1 text-[9px] text-custom-muted">
                            + {parsedCSVItems.length - 3} more items...
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={executeCSVImport}
                        disabled={isImporting}
                        className="w-full py-3 bg-custom-primary hover:bg-custom-primary-hover text-white text-xs font-bold rounded-xl shadow active:scale-95 transition-all flex items-center justify-center gap-1.5"
                      >
                        {isImporting ? 'Importing...' : 'Commit Import To Database'}
                      </button>
                    </div>
                  )}
                </div>
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
                  <RefreshCw className="h-4.5 w-4.5" />
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
                            <td className="py-4.5 px-6 font-mono text-xs text-custom-muted">{item.barcode}</td>
                            <td className="py-4.5 px-6 font-bold text-custom-text text-base">
                              {isEditing ? (
                                <div className="space-y-2.5 mt-2 p-3 bg-custom-input border border-custom-border rounded-xl text-xs font-semibold max-w-sm">
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
                                </div>
                              ) : (
                                <>
                                  {item.name}
                                  {item.notes && (
                                    <span className="block text-[10px] text-custom-accent italic mt-1.5 bg-custom-accent/10 px-2.5 py-1 rounded w-max border border-custom-accent/10 font-normal">
                                      Notes: {item.notes}
                                    </span>
                                  )}
                                  {item.bulk_barcode && (
                                    <span className="block text-[10px] text-custom-muted/90 mt-1 font-sans font-normal">
                                      Bulk Case: {item.bulk_quantity} units at ${item.bulk_price?.toFixed(2)} (UPC: {item.bulk_barcode})
                                    </span>
                                  )}
                                </>
                              )}
                            </td>
                            
                            {/* Price field */}
                            <td className="py-4.5 px-6 text-right font-mono text-base text-custom-accent">
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
                            <td className="py-4.5 px-6 text-right font-mono text-base">
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
                            <td className="py-4.5 px-6 text-center select-none">
                              {isEditing ? (
                                <div className="flex justify-center gap-1.5">
                                  <button
                                    id={`btn-save-edit-${item.id}`}
                                    onClick={() => handleUpdateItem(item.id)}
                                    className="p-2 bg-emerald-900/30 border border-emerald-700 text-emerald-400 hover:text-white rounded-lg transition-all"
                                    title="Save Changes"
                                  >
                                    <Check className="h-4.5 w-4.5" />
                                  </button>
                                  <button
                                    id={`btn-cancel-edit-${item.id}`}
                                    onClick={() => setEditingItemId(null)}
                                    className="p-2 bg-custom-input border border-custom-border text-custom-muted hover:text-custom-text rounded-lg transition-all"
                                    title="Cancel"
                                  >
                                    <X className="h-4.5 w-4.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-center gap-1.5">
                                  <button
                                    id={`btn-edit-item-${item.id}`}
                                    onClick={() => {
                                      setEditingItemId(item.id);
                                      setEditItemName(item.name);
                                      setEditItemStock(item.stock_quantity !== null && item.stock_quantity !== undefined ? item.stock_quantity.toString() : '');
                                      setEditItemPrice(item.price.toFixed(2));
                                      setEditItemNotes(item.notes || '');
                                      setEditItemBulkBarcode(item.bulk_barcode || '');
                                      setEditItemBulkPrice(item.bulk_price !== null && item.bulk_price !== undefined ? item.bulk_price.toString() : '');
                                      setEditItemBulkQuantity(item.bulk_quantity !== null && item.bulk_quantity !== undefined ? item.bulk_quantity.toString() : '');
                                    }}
                                    className="px-3.5 py-2 bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-text text-xs font-bold rounded-lg transition-all"
                                  >
                                    Edit
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
          <div className="h-full flex flex-col xl:flex-row gap-6 min-h-0">
            {/* Discount Creator */}
            <div className="w-full xl:w-96 shrink-0">
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg flex flex-col space-y-4">
                <h3 className="text-lg font-bold text-custom-text flex items-center gap-2 pb-2 border-b border-custom-border">
                  <Tag className="h-5 w-5 text-custom-accent" /> Create Preset Discount
                </h3>

                <form onSubmit={handleAddDiscount} className="space-y-4.5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Discount Name</label>
                    <input 
                      id="admin-disc-name"
                      type="text"
                      placeholder="e.g. Volunteer Discount"
                      value={newDiscName}
                      onChange={e => setNewDiscName(e.target.value)}
                      className="w-full px-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-base placeholder:text-custom-muted/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-2">Discount Type</label>
                    <div className="grid grid-cols-2 gap-2 bg-custom-input border border-custom-border rounded-xl p-1 shadow-inner">
                      <button
                        id="admin-disc-type-percent"
                        type="button"
                        onClick={() => setNewDiscType('percentage')}
                        className={`py-2 text-center rounded-lg font-bold text-sm transition-all ${
                          newDiscType === 'percentage' 
                            ? 'bg-custom-primary text-white shadow' 
                            : 'text-custom-muted hover:text-custom-text'
                        }`}
                      >
                        Percentage (%)
                      </button>
                      <button
                        id="admin-disc-type-fixed"
                        type="button"
                        onClick={() => setNewDiscType('fixed')}
                        className={`py-2 text-center rounded-lg font-bold text-sm transition-all ${
                          newDiscType === 'fixed' 
                            ? 'bg-custom-primary text-white shadow' 
                            : 'text-custom-muted hover:text-custom-text'
                        }`}
                      >
                        Flat Dollar ($)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">
                      {newDiscType === 'percentage' ? 'Percentage Rate (%)' : 'Fixed Discount Amount ($)'}
                    </label>
                    <input 
                      id="admin-disc-value"
                      type="number"
                      step="0.01"
                      placeholder={newDiscType === 'percentage' ? '10' : '5.00'}
                      value={newDiscValue}
                      onChange={e => setNewDiscValue(e.target.value)}
                      className="w-full px-4 py-3 bg-custom-input border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none font-mono text-base placeholder:text-custom-muted/50"
                      required
                    />
                  </div>

                  <button 
                    id="btn-admin-add-discount-submit"
                    type="submit"
                    className="w-full py-4.5 bg-custom-primary hover:bg-custom-primary-hover active:scale-97 text-white font-extrabold text-base rounded-xl transition-all shadow border border-custom-border"
                  >
                    Add Discount Preset
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
                  discounts.map(disc => (
                    <div 
                      key={disc.id} 
                      className="bg-custom-input/40 border border-custom-border rounded-xl p-4 flex items-center justify-between shadow shadow-black/20"
                    >
                      <div className="min-w-0 pr-4 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="font-bold text-custom-text text-base truncate">{disc.name}</span>
                        <span className="text-sm font-mono font-bold text-custom-accent bg-custom-input border border-custom-border px-3 py-1 rounded w-max select-all">
                          {disc.type === 'percentage' ? `${disc.value}% OFF` : `$${disc.value.toFixed(2)} OFF`}
                        </span>
                      </div>
                      <button
                        id={`btn-delete-discount-${disc.id}`}
                        onClick={() => handleDeleteDiscount(disc.id)}
                        className="p-3 bg-custom-input border border-custom-border hover:bg-red-900/30 text-custom-muted hover:text-red-400 rounded-xl transition-all shrink-0 ml-2"
                        title="Delete Preset"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
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
            <div className="p-4 bg-custom-header border-b border-custom-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-custom-text text-base">Historical Transaction Ledger</span>
                <span className="text-xs bg-custom-input text-custom-accent border border-custom-border px-2.5 py-0.5 rounded-full font-bold">
                  Total Ticket Count: {sales.length}
                </span>
              </div>
              <button 
                id="btn-refresh-sales"
                onClick={loadSales}
                className="p-3 bg-custom-input hover:bg-custom-input/80 border border-custom-border text-custom-muted hover:text-custom-text rounded-xl transition-all active:scale-90"
                title="Reload Ledger"
              >
                <RefreshCw className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto min-h-0">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-custom-input text-custom-muted border-b border-custom-border uppercase text-xs font-extrabold select-none">
                    <th className="py-4 px-6 w-20">Ticket</th>
                    <th className="py-4 px-6">Timestamp</th>
                    <th className="py-4 px-6 text-right">Subtotal</th>
                    <th className="py-4 px-6 text-right">Discounts</th>
                    <th className="py-4 px-6 text-right">Sales Tax</th>
                    <th className="py-4 px-6 text-right">Grand Total</th>
                    <th className="py-4 px-6 text-center w-24">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-custom-border">
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-custom-muted">
                        <History className="h-8 w-8 mx-auto mb-3 text-custom-muted/50" />
                        No transactions registered in this ledger database
                      </td>
                    </tr>
                  ) : (
                    sales.map(sale => {
                      const isExpanded = expandedSaleId === sale.id;
                      return (
                        <React.Fragment key={sale.id}>
                          <tr className={`hover:bg-custom-primary/10 text-custom-text transition-colors ${isExpanded ? 'bg-custom-primary/5' : ''}`}>
                            <td className="py-4 px-6 font-mono text-xs text-custom-muted">#{sale.id}</td>
                            <td className="py-4 px-6 font-semibold">{new Date(sale.timestamp).toLocaleString()}</td>
                            <td className="py-4 px-6 text-right font-mono">${sale.subtotal.toFixed(2)}</td>
                            <td className="py-4 px-6 text-right font-mono text-red-400">
                              {sale.discount_total > 0 ? `-$${sale.discount_total.toFixed(2)}` : '$0.00'}
                            </td>
                            <td className="py-4 px-6 text-right font-mono">${sale.tax_total.toFixed(2)}</td>
                            <td className="py-4 px-6 text-right font-mono text-base font-bold text-custom-accent">
                              ${sale.final_total.toFixed(2)}
                            </td>
                            <td className="py-4 px-6 text-center">
                              <button
                                id={`btn-toggle-sale-details-${sale.id}`}
                                onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                                className={`p-2 rounded-lg border transition-all ${
                                  isExpanded 
                                    ? 'bg-custom-primary/20 border-custom-primary text-custom-text' 
                                    : 'bg-custom-input border border-custom-border hover:bg-custom-primary/20 text-custom-muted hover:text-custom-text'
                                }`}
                                title="Inspect sold items"
                              >
                                <Eye className="h-4.5 w-4.5" />
                              </button>
                            </td>
                          </tr>

                          {/* Expansion drawer showing individual sale items */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="bg-custom-input/40 px-8 py-4 border-b border-custom-border">
                                <div className="border border-custom-border rounded-xl overflow-hidden max-w-2xl shadow-inner">
                                  <div className="bg-custom-header px-4 py-2 border-b border-custom-border text-xs font-bold text-custom-muted uppercase tracking-wider">
                                    Sold Items Receipt Detail
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
            </div>
          </div>
        )}

        {/* SUB-TAB D: SALES ANALYTICS (YoY COMPARISON & DAILY SUMMARY) */}
        {subTab === 'analytics' && (
          <div className="h-full overflow-y-auto pr-1 pb-6 space-y-6 min-h-0 select-none">
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
                      className={`px-4.5 py-2 rounded-lg font-bold text-xs transition-all active:scale-95 ${
                        analyticsMode === 'yearly'
                          ? 'bg-custom-primary text-white shadow-md'
                          : 'text-custom-muted hover:text-custom-text'
                      }`}
                    >
                      Yearly YoY
                    </button>
                    <button
                      id="btn-analytics-toggle-daily"
                      onClick={() => setAnalyticsMode('daily')}
                      className={`px-4.5 py-2 rounded-lg font-bold text-xs transition-all active:scale-95 ${
                        analyticsMode === 'daily'
                          ? 'bg-custom-primary text-white shadow-md'
                          : 'text-custom-muted hover:text-custom-text'
                      }`}
                    >
                      Daily Summary
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-custom-border bg-black/20">
                  {isLoadingSummary ? (
                    <div className="flex items-center justify-center h-48 text-custom-muted font-bold text-sm">
                      Querying Ledger Statistics...
                    </div>
                  ) : analyticsMode === 'yearly' ? (
                    (yearlySummaries || []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                        <p className="text-custom-muted text-sm font-semibold">No yearly sales data found in the database.</p>
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-xs font-semibold">
                        <thead>
                          <tr className="bg-black/40 text-custom-muted border-b border-custom-border uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Sales Year</th>
                            <th className="py-3 px-4 text-right">Tickets Issued</th>
                            <th className="py-3 px-4 text-right">Subtotal Revenue</th>
                            <th className="py-3 px-4 text-right">Discounts Applied</th>
                            <th className="py-3 px-4 text-right">Tax Collected</th>
                            <th className="py-3 px-4 text-right">Grand Total Sales</th>
                            <th className="py-3 px-4 text-right">Avg Ticket Size</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-custom-border text-custom-text">
                          {(yearlySummaries || []).map((summary) => (
                            <tr key={summary.year} className="hover:bg-white/5 transition-colors">
                              <td className="py-3.5 px-4 font-bold text-sm text-custom-accent">{summary.year}</td>
                              <td className="py-3.5 px-4 text-right font-mono">{summary.ticket_count}</td>
                              <td className="py-3.5 px-4 text-right font-mono">${summary.subtotal.toFixed(2)}</td>
                              <td className="py-3.5 px-4 text-right font-mono text-red-400">-${summary.discount_total.toFixed(2)}</td>
                              <td className="py-3.5 px-4 text-right font-mono">${summary.tax_total.toFixed(2)}</td>
                              <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-bold text-sm">${summary.total_sales.toFixed(2)}</td>
                              <td className="py-3.5 px-4 text-right font-mono">${summary.avg_ticket_value.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : (
                    (dailySummaries || []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                        <p className="text-custom-muted text-sm font-semibold">No daily sales data found in the database.</p>
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-xs font-semibold">
                        <thead>
                          <tr className="bg-black/40 text-custom-muted border-b border-custom-border uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Sales Date</th>
                            <th className="py-3 px-4 text-right">Tickets Issued</th>
                            <th className="py-3 px-4 text-right">Grand Total Sales</th>
                            <th className="py-3 px-4 text-right">Avg Ticket Size</th>
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
                  <h3 className="text-base font-bold text-custom-text mb-4 border-b border-custom-border pb-3 flex items-center gap-2 shrink-0">
                    <Archive className="h-4.5 w-4.5 text-custom-accent" /> Revenue Comparison Graph
                  </h3>

                  {/* Inline SVG Chart */}
                  <div className="bg-black/35 rounded-xl border border-custom-border p-4 flex flex-col justify-center items-center">
                    <svg width="100%" height="240" viewBox="0 0 320 240" className="overflow-visible">
                      {/* Y Axis line */}
                      <line x1="45" y1="20" x2="45" y2="190" stroke="var(--color-border)" strokeWidth="1.5" />
                      {/* X Axis line */}
                      <line x1="45" y1="190" x2="300" y2="190" stroke="var(--color-border)" strokeWidth="1.5" />

                      {/* Chart Bars */}
                      {(() => {
                        const chartData = analyticsMode === 'yearly' 
                          ? (yearlySummaries || []) 
                          : (dailySummaries || []).slice(0, 5).reverse();
                        
                        const maxVal = Math.max(...chartData.map(s => s.total_sales), 1);
                        return chartData.map((summary, idx) => {
                          const barHeight = (summary.total_sales / maxVal) * 150;
                          const gap = chartData.length > 3 ? 45 : 80;
                          const startX = chartData.length > 3 ? 55 : 80;
                          const x = startX + (idx * gap);
                          const y = 190 - barHeight;
                          const label = analyticsMode === 'yearly' 
                            ? (summary as YearSummary).year 
                            : (summary as DaySummary).date.slice(5); // Show MM-DD for daily

                          return (
                            <g key={idx} className="group">
                              {/* Bar segment */}
                              <rect
                                x={x}
                                y={y}
                                width={chartData.length > 3 ? "24" : "40"}
                                height={barHeight}
                                fill="var(--color-primary)"
                                rx="4"
                                className="transition-all duration-300 hover:opacity-85"
                              />
                              {/* Value label */}
                              <text
                                x={x + (chartData.length > 3 ? 12 : 20)}
                                y={y - 8}
                                textAnchor="middle"
                                fill="var(--color-accent)"
                                className="font-mono text-[8px] font-bold"
                              >
                                ${Math.round(summary.total_sales)}
                              </text>
                              {/* Axis Label */}
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
                      })()}
                    </svg>
                    <p className="text-[10px] text-custom-muted/80 text-center mt-3 font-semibold uppercase tracking-wider">
                      {analyticsMode === 'yearly' ? 'YoY Sales Revenue totals in USD' : 'Last 5 active sales days revenue comparison'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Configuration & Price Tracking Panel */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Settings, Cost & Profit Calculations */}
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-5">
                <h3 className="text-base font-bold text-custom-text flex items-center gap-2 border-b border-custom-border pb-3">
                  <Settings className="h-4.5 w-4.5 text-custom-accent" /> Ledger Configuration & Profit margins
                </h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
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
                        Total Stock Cost Spent ($)
                      </label>
                      <input 
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Manual cost override"
                        value={totalStockCostSpent || ''}
                        onChange={e => handleTotalCostChange(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-custom-input border border-custom-border text-custom-text font-mono rounded-lg focus:outline-none text-sm"
                      />
                      <span className="text-[10px] text-custom-muted/80 mt-1 block">Leave 0 to disable profit tracking.</span>
                    </div>
                  </div>

                  {/* Profit Margins breakdown */}
                  {(() => {
                    const grandTotalRevenue = yearlySummaries.reduce((sum, s) => sum + s.total_sales, 0);
                    const appliedCost = totalStockCostSpent;
                    const profit = grandTotalRevenue - appliedCost;
                    return (
                      <div className="bg-custom-input/40 border border-custom-border rounded-xl p-4.5 grid grid-cols-3 gap-3 text-center">
                        <div>
                          <span className="block text-[10px] text-custom-muted uppercase font-bold">Total Sales</span>
                          <span className="block font-mono text-base font-bold text-custom-accent mt-0.5">${grandTotalRevenue.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-custom-muted uppercase font-bold">Stock Expenses</span>
                          <span className="block font-mono text-base font-bold text-red-400 mt-0.5">
                            ${appliedCost.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-custom-muted uppercase font-bold">Net Profit</span>
                          <span className={`block font-mono text-base font-bold mt-0.5 ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            ${profit.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Price Changes Tracker Pivot */}
              <div className="glass-panel border-custom-border rounded-2xl p-5 shadow-lg space-y-4">
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
                    <div className="overflow-auto max-h-52 border border-custom-border rounded-xl bg-black/10">
                      <table className="w-full text-left text-xs font-semibold">
                        <thead>
                          <tr className="bg-custom-input text-custom-muted uppercase tracking-wider text-[9px] border-b border-custom-border">
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

          </div>
        )}

        {/* SUB-TAB E: THEMES CONFIGURATION PANEL */}
        {subTab === 'themes' && (
          <div className="h-full flex flex-col xl:flex-row gap-6 min-h-0 overflow-hidden">
            
            {/* Themes Selection Cards Grid */}
            <div className="flex-1 glass-panel rounded-2xl p-5 shadow-lg overflow-y-auto flex flex-col min-h-0">
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
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between h-36 ${
                        isActive
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
                        <div className="flex items-center gap-1.5 bg-black/25 px-2.5 py-1.5 rounded-lg border border-custom-border/40">
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
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Are you sure you want to delete custom theme "${t.name}"?`)) {
                                onDeleteCustomTheme(t.id);
                              }
                            }}
                            className="p-1.5 text-xs font-semibold bg-red-950/40 hover:bg-red-900 border border-red-900/30 hover:border-red-600 text-red-400 hover:text-white rounded-lg transition-all"
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
            <div className="w-full xl:w-96 glass-panel rounded-2xl p-5 shadow-lg shrink-0 flex flex-col min-h-0 overflow-y-auto">
              <h3 className="text-base font-bold text-custom-text mb-1 flex items-center gap-2 border-b border-custom-border pb-3 shrink-0">
                <PlusCircle className="h-4.5 w-4.5 text-custom-accent" /> Custom Theme Builder
              </h3>

              <form onSubmit={handleCreateCustomTheme} className="space-y-4 pt-3 flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Theme Name input */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-custom-muted mb-1.5">Theme Identifier Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Volunteer Teal / Christmas Theme"
                      value={customThemeName}
                      onChange={e => setCustomThemeName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-black/30 border border-custom-border focus:border-custom-primary text-custom-text rounded-xl focus:outline-none text-sm"
                      required
                    />
                  </div>

                  {/* Swatch pickers grid */}
                  <div className="grid grid-cols-2 gap-3.5 bg-black/15 p-3 rounded-xl border border-custom-border/50">
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Background</label>
                      <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-custom-border/40">
                        <input type="color" value={customThemeBg} onChange={e => setCustomThemeBg(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                        <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeBg}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Cards</label>
                      <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-custom-border/40">
                        <input type="color" value={customThemeCard} onChange={e => setCustomThemeCard(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                        <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeCard}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Text Color</label>
                      <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-custom-border/40">
                        <input type="color" value={customThemeText} onChange={e => setCustomThemeText(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                        <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeText}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Muted Text</label>
                      <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-custom-border/40">
                        <input type="color" value={customThemeMuted} onChange={e => setCustomThemeMuted(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                        <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeMuted}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Primary Btn</label>
                      <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-custom-border/40">
                        <input type="color" value={customThemePrimary} onChange={e => setCustomThemePrimary(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                        <span className="font-mono text-[10px] text-custom-text uppercase">{customThemePrimary}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Accent Accent</label>
                      <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-custom-border/40">
                        <input type="color" value={customThemeAccent} onChange={e => setCustomThemeAccent(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                        <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeAccent}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Border Line</label>
                      <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-custom-border/40">
                        <input type="color" value={customThemeBorder} onChange={e => setCustomThemeBorder(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                        <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeBorder}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Header Bar</label>
                      <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-custom-border/40">
                        <input type="color" value={customThemeHeader} onChange={e => setCustomThemeHeader(e.target.value)} className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent" />
                        <span className="font-mono text-[10px] text-custom-text uppercase">{customThemeHeader}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-custom-muted mb-1">Input Fields</label>
                      <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-custom-border/40">
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
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
export default AdminView;
