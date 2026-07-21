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
  tax_id?: number | null;
  video_path?: string | null;
  is_invalid?: boolean;
  missing_fields?: string;
  discount_tags?: string;
}

export interface Tax {
  id: number;
  name: string;
  rate: number; // e.g. 7.0 for 7%
  scope: 'total' | 'item';
}

export interface Discount {
  id: number;
  name: string;
  type: 'percentage' | 'fixed'; // Keep for backwards compatibility
  value: number;                // Keep for backwards compatibility
  qualifier_type: 'item_quantity' | 'order_total' | 'manual';
  qualifier_value: number;
  reward_type: 'item_discount_qty' | 'item_discount_all' | 'lowest_cost_item' | 'items_for_price' | 'order_discount';
  reward_value: number;
  reward_value_type: 'percentage' | 'fixed';
  reward_quantity: number;
  reward_target_item_id?: number | null;
  reward_lowest_cost_linked_item_id?: number | null;
  discount_tag: string;
  max_limit_per_order?: number | null;
  value_cap?: number | null;
  is_stackable: number; // 0 = false, 1 = true
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

export interface DeleteSaleConfirmation {
  saleId: number;
  timestamp: string;
  finalTotal: number;
}

export interface SalePaymentDetail {
  id?: number;
  sale_id?: number;
  payment_method_id?: number | null;
  payment_method_name: string;
  amount_tendered: number;
  fee_amount: number;
  fee_mode: 'deducted' | 'on_top';
  godaddy_trans_id?: string | null;
}

export interface Sale {
  id: number;
  timestamp: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  final_total: number;
  items?: SaleItemDetail[]; // Populated in admin view
  payments?: SalePaymentDetail[]; // Populated for split / detailed payments
  payment_method?: string;
  godaddy_transaction_id?: string;
  transaction_fee?: number;
  status?: string;
}

export interface PaymentMethod {
  id: number;
  name: string;
  enabled: number;
  fee_percentage: number;
  fee_flat: number;
  is_custom: number;
  status: string;
  fee_mode?: 'deducted' | 'on_top';
}

export interface ParkedCart {
  id: number;
  label: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  cart_json: string; // Serialized CartItem[]
  subtotal: number;
  tax_total: number;
  discount_total: number;
  final_total: number;
  created_at: string;
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
  profit: number;
  total_fees: number;
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

export type ExportableTable =
  | 'items'
  | 'discounts'
  | 'taxes'
  | 'sales'
  | 'sale_items'
  | 'settings'
  | 'item_price_history'
  | 'payment_methods'
  | 'parked_carts'
  | 'sale_payments';

export interface BackupRestoreInfo {
  restored: boolean;
  restored_at: string | null;
  local_backup_last_updated: string | null;
}

export interface CloudBackupStatus {
  is_connected: boolean;
  account_email: string | null;
  last_backup_at: string | null;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface DbStatus {
  custom_db_path: string | null;
  is_temp: boolean;
  original_custom_path: string | null;
  primary_path_exists: boolean;
  resolved_db_path: string;
}
