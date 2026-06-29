export interface Item {
  id: number;
  barcode: string;
  name: string;
  price: number;
  stock_quantity: number | null; // Null means optional/untracked
  notes?: string;
  bulk_price?: number;
  bulk_barcode?: string;
  bulk_quantity?: number;
  unit_cost?: number;
}

export interface Discount {
  id: number;
  name: string;
  type: 'percentage' | 'fixed';
  value: number;
}

export interface CartItem {
  item: Item;
  quantity: number;
  isBulk?: boolean; // Scanned or selected bulk variant
}

export interface SaleItemDetail {
  id: number;
  sale_id: number;
  item_id: number;
  item_name?: string;     // Hydrated for UI display
  item_barcode?: string;  // Hydrated for UI display
  quantity: number;
  price_at_sale: number;
}

export interface Sale {
  id: number;
  timestamp: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  final_total: number;
  items?: SaleItemDetail[]; // Populated in admin view
}

export interface Theme {
  id: string;
  name: string;
  isCustom?: boolean;
  bg: string;
  card: string;
  text: string;
  muted: string;
  primary: string;
  primaryHover: string;
  accent: string;
  border: string;
  header: string;
  input: string;
}

export interface YearSummary {
  year: string;
  total_sales: number;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  ticket_count: number;
  avg_ticket_value: number;
}

export interface DaySummary {
  date: string;
  total_sales: number;
  ticket_count: number;
  avg_ticket_value: number;
}

export interface PriceHistoryEntry {
  item_id: number;
  item_name: string;
  year: string;
  price: number;
}
