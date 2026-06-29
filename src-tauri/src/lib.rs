use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// --- DATA STRUCTURES ---

#[derive(Serialize, Deserialize, Clone)]
struct Item {
    id: i32,
    barcode: String,
    name: String,
    price: f64,
    stock_quantity: Option<i32>,
    notes: Option<String>,
    bulk_price: Option<f64>,
    bulk_barcode: Option<String>,
    bulk_quantity: Option<i32>,
    unit_cost: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Discount {
    id: i32,
    name: String,
    #[serde(rename = "type")]
    discount_type: String, // "percentage" or "fixed"
    value: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct SaleItemInput {
    item_id: i32,
    quantity: i32,
    price_at_sale: f64,
    is_bulk: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SaleItemDetail {
    id: i32,
    sale_id: i32,
    item_id: i32,
    item_name: Option<String>,
    item_barcode: Option<String>,
    quantity: i32,
    price_at_sale: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct Sale {
    id: i32,
    timestamp: String,
    subtotal: f64,
    discount_total: f64,
    tax_total: f64,
    final_total: f64,
    items: Option<Vec<SaleItemDetail>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct YearSummary {
    year: String,
    total_sales: f64,
    subtotal: f64,
    tax_total: f64,
    discount_total: f64,
    ticket_count: i32,
    avg_ticket_value: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct DaySummary {
    date: String,
    total_sales: f64,
    ticket_count: i32,
    avg_ticket_value: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct PriceHistoryEntry {
    item_id: i32,
    item_name: String,
    year: String,
    price: f64,
}

// --- UTILITY PATH RESOLVER ---

fn resolve_db_path() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to find current executable path: {}", e))?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "Failed to get executable directory".to_string())?;
    Ok(exe_dir.join("firework_pos.db"))
}

// --- DATABASE SEEDER & MIGRATOR ---

fn init_db() -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let mut conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open SQLite database: {}", e))?;

    // Check if items table exists and check if stock_quantity is NOT NULL to migrate it to nullable
    let table_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='items')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if table_exists {
        // Query column metadata
        let is_not_null: bool = {
            let mut stmt = conn
                .prepare("PRAGMA table_info(items)")
                .map_err(|e| e.to_string())?;
            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
            let mut not_null = false;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                let name: String = row.get(1).map_err(|e| e.to_string())?;
                let nn: i32 = row.get(3).map_err(|e| e.to_string())?;
                if name == "stock_quantity" && nn == 1 {
                    not_null = true;
                    break;
                }
            }
            not_null
        };

        if is_not_null {
            // Run drops-not-null table migration
            let tx = conn
                .transaction()
                .map_err(|e| format!("Migration failed to start: {}", e))?;
            tx.execute("PRAGMA foreign_keys=OFF", []).ok();

            tx.execute(
                "CREATE TABLE items_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    barcode TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    price REAL NOT NULL,
                    stock_quantity INTEGER,
                    notes TEXT,
                    bulk_price REAL,
                    bulk_barcode TEXT,
                    bulk_quantity INTEGER,
                    unit_cost REAL
                );",
                [],
            )
            .map_err(|e| format!("Migration items_new creation failed: {}", e))?;

            tx.execute(
                "INSERT INTO items_new (id, barcode, name, price, stock_quantity)
                 SELECT id, barcode, name, price, stock_quantity FROM items;",
                [],
            )
            .map_err(|e| format!("Migration data transfer failed: {}", e))?;

            tx.execute("DROP TABLE items;", [])
                .map_err(|e| format!("Migration old table drop failed: {}", e))?;
            tx.execute("ALTER TABLE items_new RENAME TO items;", [])
                .map_err(|e| format!("Migration rename failed: {}", e))?;

            tx.execute("PRAGMA foreign_keys=ON", []).ok();
            tx.commit()
                .map_err(|e| format!("Migration commit failed: {}", e))?;
        }
    }

    // Create Items Table (defaults to optional stock)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barcode TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            stock_quantity INTEGER,
            notes TEXT,
            bulk_price REAL,
            bulk_barcode TEXT,
            bulk_quantity INTEGER,
            unit_cost REAL
        );",
        [],
    )
    .map_err(|e| format!("Schema error (items): {}", e))?;

    // Apply column additions if table was created before updates
    conn.execute("ALTER TABLE items ADD COLUMN notes TEXT", [])
        .ok();
    conn.execute("ALTER TABLE items ADD COLUMN bulk_price REAL", [])
        .ok();
    conn.execute("ALTER TABLE items ADD COLUMN bulk_barcode TEXT", [])
        .ok();
    conn.execute("ALTER TABLE items ADD COLUMN bulk_quantity INTEGER", [])
        .ok();
    conn.execute("ALTER TABLE items ADD COLUMN unit_cost REAL", [])
        .ok();

    // Create Price History Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS item_price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            year TEXT NOT NULL,
            price REAL NOT NULL,
            UNIQUE(item_id, year),
            FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
        );",
        [],
    )
    .map_err(|e| format!("Schema error (price history): {}", e))?;

    // Create Discounts Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS discounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT CHECK(type IN ('percentage', 'fixed')) NOT NULL,
            value REAL NOT NULL
        );",
        [],
    )
    .map_err(|e| format!("Schema error (discounts): {}", e))?;

    // Create Sales Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            subtotal REAL NOT NULL,
            discount_total REAL NOT NULL,
            tax_total REAL NOT NULL,
            final_total REAL NOT NULL
        );",
        [],
    )
    .map_err(|e| format!("Schema error (sales): {}", e))?;

    // Create Sale Items Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            price_at_sale REAL NOT NULL,
            FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE,
            FOREIGN KEY(item_id) REFERENCES items(id)
        );",
        [],
    )
    .map_err(|e| format!("Schema error (sale_items): {}", e))?;

    Ok(())
}

// --- PRICE LOG HELPER ---

fn record_price_history(
    conn: &Connection,
    item_id: i32,
    price: f64,
) -> Result<(), rusqlite::Error> {
    let year: String = conn
        .query_row("SELECT strftime('%Y', 'now')", [], |r| r.get(0))
        .unwrap_or_else(|_| "2026".to_string());

    let mut stmt =
        conn.prepare("SELECT id FROM item_price_history WHERE item_id = ?1 AND year = ?2")?;
    let exists = stmt.exists(params![item_id, year])?;
    if exists {
        conn.execute(
            "UPDATE item_price_history SET price = ?1 WHERE item_id = ?2 AND year = ?3",
            params![price, item_id, year],
        )?;
    } else {
        conn.execute(
            "INSERT INTO item_price_history (item_id, year, price) VALUES (?1, ?2, ?3)",
            params![item_id, year, price],
        )?;
    }
    Ok(())
}

// --- TAURI EXPOSED COMMANDS ---

#[tauri::command]
fn get_db_path() -> Result<String, String> {
    let path = resolve_db_path()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_items() -> Result<Vec<Item>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost FROM items ORDER BY name ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Item {
                id: row.get(0)?,
                barcode: row.get(1)?,
                name: row.get(2)?,
                price: row.get(3)?,
                stock_quantity: row.get(4)?,
                notes: row.get(5)?,
                bulk_price: row.get(6)?,
                bulk_barcode: row.get(7)?,
                bulk_quantity: row.get(8)?,
                unit_cost: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
fn get_item_by_barcode(barcode: String) -> Result<Option<Item>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost FROM items WHERE barcode = ?1 OR bulk_barcode = ?1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map(params![barcode], |row| {
            Ok(Item {
                id: row.get(0)?,
                barcode: row.get(1)?,
                name: row.get(2)?,
                price: row.get(3)?,
                stock_quantity: row.get(4)?,
                notes: row.get(5)?,
                bulk_price: row.get(6)?,
                bulk_barcode: row.get(7)?,
                bulk_quantity: row.get(8)?,
                unit_cost: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next() {
        let item = row.map_err(|e| e.to_string())?;
        Ok(Some(item))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn add_item(
    barcode: String,
    name: String,
    price: f64,
    stock_quantity: Option<i32>,
    notes: Option<String>,
    bulk_price: Option<f64>,
    bulk_barcode: Option<String>,
    bulk_quantity: Option<i32>,
    unit_cost: Option<f64>,
) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO items (barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost],
    )
    .map_err(|e| format!("Failed to add product (Barcode might already exist): {}", e))?;

    let item_id = conn.last_insert_rowid() as i32;
    record_price_history(&conn, item_id, price).ok();

    Ok(())
}

#[tauri::command]
fn update_item_stock(id: i32, stock_quantity: Option<i32>) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE items SET stock_quantity = ?1 WHERE id = ?2",
        params![stock_quantity, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn update_item_details(
    id: i32,
    price: f64,
    stock_quantity: Option<i32>,
    notes: Option<String>,
    bulk_price: Option<f64>,
    bulk_barcode: Option<String>,
    bulk_quantity: Option<i32>,
    unit_cost: Option<f64>,
) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE items SET price = ?1, stock_quantity = ?2, notes = ?3, bulk_price = ?4, bulk_barcode = ?5, bulk_quantity = ?6, unit_cost = ?7 WHERE id = ?8",
        params![price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, id],
    )
    .map_err(|e| e.to_string())?;

    record_price_history(&conn, id, price).ok();

    Ok(())
}

#[tauri::command]
fn delete_item(id: i32) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_discounts() -> Result<Vec<Discount>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, type, value FROM discounts ORDER BY value ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Discount {
                id: row.get(0)?,
                name: row.get(1)?,
                discount_type: row.get(2)?,
                value: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
fn add_discount(name: String, discount_type: String, value: f64) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO discounts (name, type, value) VALUES (?1, ?2, ?3)",
        params![name, discount_type, value],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_discount(id: i32) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM discounts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn complete_sale(
    items: Vec<SaleItemInput>,
    subtotal: f64,
    discount_total: f64,
    tax_total: f64,
    final_total: f64,
) -> Result<i64, String> {
    let db_path = resolve_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 1. Log sale record
    tx.execute(
        "INSERT INTO sales (subtotal, discount_total, tax_total, final_total) VALUES (?1, ?2, ?3, ?4)",
        params![subtotal, discount_total, tax_total, final_total],
    )
    .map_err(|e| format!("Failed to insert sale record: {}", e))?;

    let sale_id = tx.last_insert_rowid();

    // 2. Iterate items, deduct inventory levels and add ledger details
    for target in items {
        // Query stock level
        let (stock, bulk_qty): (Option<i32>, Option<i32>) = tx
            .query_row(
                "SELECT stock_quantity, bulk_quantity FROM items WHERE id = ?1",
                params![target.item_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| format!("Item ID {} query error: {}", target.item_id, e))?;

        if let Some(stock_val) = stock {
            let qty_to_deduct = if target.is_bulk.unwrap_or(false) {
                target.quantity * bulk_qty.unwrap_or(1)
            } else {
                target.quantity
            };

            if stock_val < qty_to_deduct {
                return Err(format!(
                    "Transaction canceled. Insufficient inventory for Item ID {}. Available: {}, Requested: {}",
                    target.item_id, stock_val, qty_to_deduct
                ));
            }

            // Deduct
            tx.execute(
                "UPDATE items SET stock_quantity = stock_quantity - ?1 WHERE id = ?2",
                params![qty_to_deduct, target.item_id],
            )
            .map_err(|e| {
                format!(
                    "Inventory update error for Item ID {}: {}",
                    target.item_id, e
                )
            })?;
        }

        // Record sale details
        tx.execute(
            "INSERT INTO sale_items (sale_id, item_id, quantity, price_at_sale) VALUES (?1, ?2, ?3, ?4)",
            params![sale_id, target.item_id, target.quantity, target.price_at_sale],
        )
        .map_err(|e| format!("Failed to insert sale detail log: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Transaction commit failure: {}", e))?;

    Ok(sale_id)
}

#[tauri::command]
fn get_sales() -> Result<Vec<Sale>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, timestamp, subtotal, discount_total, tax_total, final_total FROM sales ORDER BY id DESC")
        .map_err(|e| e.to_string())?;

    let sale_rows = stmt
        .query_map([], |row| {
            Ok(Sale {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                subtotal: row.get(2)?,
                discount_total: row.get(3)?,
                tax_total: row.get(4)?,
                final_total: row.get(5)?,
                items: None,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut sales_list = Vec::new();
    for sale_res in sale_rows {
        let mut sale = sale_res.map_err(|e| e.to_string())?;

        let mut items_stmt = conn
            .prepare(
                "SELECT si.id, si.sale_id, si.item_id, i.name, i.barcode, si.quantity, si.price_at_sale
                 FROM sale_items si
                 LEFT JOIN items i ON si.item_id = i.id
                 WHERE si.sale_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let item_rows = items_stmt
            .query_map(params![sale.id], |row| {
                Ok(SaleItemDetail {
                    id: row.get(0)?,
                    sale_id: row.get(1)?,
                    item_id: row.get(2)?,
                    item_name: row.get(3)?,
                    item_barcode: row.get(4)?,
                    quantity: row.get(5)?,
                    price_at_sale: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut items_vec = Vec::new();
        for item_res in item_rows {
            items_vec.push(item_res.map_err(|e| e.to_string())?);
        }

        sale.items = Some(items_vec);
        sales_list.push(sale);
    }

    Ok(sales_list)
}

#[tauri::command]
fn get_yearly_sales_summary() -> Result<Vec<YearSummary>, String> {
    let db_path = resolve_db_path()?;
    let conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open SQLite database: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT 
                strftime('%Y', timestamp) as yr,
                SUM(final_total) as tot_sales,
                SUM(subtotal) as sub,
                SUM(tax_total) as tax,
                SUM(discount_total) as disc,
                COUNT(id) as tk_count,
                AVG(final_total) as avg_tk
             FROM sales
             GROUP BY yr
             ORDER BY yr DESC;",
        )
        .map_err(|e| format!("Failed to prepare SQL query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let year: String = row.get(0)?;
            let total_sales: f64 = row.get(1).unwrap_or(0.0);
            let subtotal: f64 = row.get(2).unwrap_or(0.0);
            let tax_total: f64 = row.get(3).unwrap_or(0.0);
            let discount_total: f64 = row.get(4).unwrap_or(0.0);
            let ticket_count: i32 = row.get(5).unwrap_or(0);
            let avg_ticket_value: f64 = row.get(6).unwrap_or(0.0);

            Ok(YearSummary {
                year,
                total_sales,
                subtotal,
                tax_total,
                discount_total,
                ticket_count,
                avg_ticket_value,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut summary = Vec::new();
    for row_res in rows {
        summary.push(row_res.map_err(|e| e.to_string())?);
    }

    Ok(summary)
}

#[tauri::command]
fn seed_historical_sales() -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let mut conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open SQLite database: {}", e))?;

    conn.execute(
        "DELETE FROM sales WHERE timestamp LIKE '2024%' OR timestamp LIKE '2025%'",
        [],
    )
    .ok();

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    let sales_2024 = vec![
        ("2024-07-02 12:30:00", 120.00, 0.00, 0.00, 120.00),
        ("2024-07-03 14:15:00", 250.00, 25.00, 0.00, 225.00),
        ("2024-07-04 16:45:00", 980.00, 50.00, 0.00, 930.00),
        ("2024-07-05 11:20:00", 410.00, 0.00, 0.00, 410.00),
        ("2024-07-06 18:10:00", 1850.00, 100.00, 0.00, 1750.00),
    ];

    for (ts, sub, disc, tax, final_val) in sales_2024 {
        tx.execute(
            "INSERT INTO sales (timestamp, subtotal, discount_total, tax_total, final_total) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![ts, sub, disc, tax, final_val],
        ).map_err(|e| format!("Failed to insert 2024 sale: {}", e))?;
    }

    let sales_2025 = vec![
        ("2025-07-02 11:45:00", 350.00, 10.00, 0.00, 340.00),
        ("2025-07-03 15:20:00", 820.00, 50.00, 0.00, 770.00),
        ("2025-07-04 17:30:00", 2400.00, 150.00, 0.00, 2250.00),
        ("2025-07-05 13:10:00", 1250.00, 0.00, 0.00, 1250.00),
        ("2025-07-06 19:40:00", 550.00, 40.00, 0.00, 510.00),
    ];

    for (ts, sub, disc, tax, final_val) in sales_2025 {
        tx.execute(
            "INSERT INTO sales (timestamp, subtotal, discount_total, tax_total, final_total) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![ts, sub, disc, tax, final_val],
        ).map_err(|e| format!("Failed to insert 2025 sale: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit historical seeds: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_daily_sales_summary() -> Result<Vec<DaySummary>, String> {
    let db_path = resolve_db_path()?;
    let conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open SQLite database: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT 
                date(timestamp) as dt,
                SUM(final_total) as tot_sales,
                COUNT(id) as tk_count,
                AVG(final_total) as avg_tk
             FROM sales
             GROUP BY dt
             ORDER BY dt DESC;",
        )
        .map_err(|e| format!("Failed to prepare SQL query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let date: String = row.get(0)?;
            let total_sales: f64 = row.get(1).unwrap_or(0.0);
            let ticket_count: i32 = row.get(2).unwrap_or(0);
            let avg_ticket_value: f64 = row.get(3).unwrap_or(0.0);

            Ok(DaySummary {
                date,
                total_sales,
                ticket_count,
                avg_ticket_value,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut summary = Vec::new();
    for row_res in rows {
        summary.push(row_res.map_err(|e| e.to_string())?);
    }

    Ok(summary)
}

#[tauri::command]
fn get_item_price_history() -> Result<Vec<PriceHistoryEntry>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT iph.item_id, i.name, iph.year, iph.price
             FROM item_price_history iph
             JOIN items i ON iph.item_id = i.id
             ORDER BY i.name ASC, iph.year ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(PriceHistoryEntry {
                item_id: row.get(0)?,
                item_name: row.get(1)?,
                year: row.get(2)?,
                price: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

// --- MODULE INVOCATION ENTRY ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize DB schema and seed starting mock entries
    if let Err(e) = init_db() {
        eprintln!("Database initialization failed critical check: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_db_path,
            get_items,
            get_item_by_barcode,
            add_item,
            update_item_stock,
            update_item_details,
            delete_item,
            get_discounts,
            add_discount,
            delete_discount,
            complete_sale,
            get_sales,
            get_yearly_sales_summary,
            get_daily_sales_summary,
            seed_historical_sales,
            get_item_price_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// --- AUTOMATED DATABASE TESTS ---
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // Helper to erase testing artifacts after verification runs
    fn cleanup_test_db() {
        if let Ok(path) = resolve_db_path() {
            if path.exists() {
                let _ = fs::remove_file(path);
            }
        }
    }

    #[test]
    fn test_db_operations() {
        cleanup_test_db();

        assert!(init_db().is_ok());

        {
            let db_path = resolve_db_path().unwrap();
            let conn = Connection::open(&db_path).unwrap();
            conn.execute(
                "INSERT INTO items (barcode, name, price, stock_quantity) VALUES (?1, ?2, ?3, ?4)",
                params!["1001", "Red Hot Sparklers (10-pack)", 4.99, 150],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (barcode, name, price, stock_quantity) VALUES (?1, ?2, ?3, ?4)",
                params!["1002", "Roman Candle (8-shot)", 9.99, 80],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO discounts (name, type, value) VALUES (?1, ?2, ?3)",
                params!["Church Member", "percentage", 10.0],
            )
            .unwrap();
        }

        let items = get_items().expect("Failed to query catalog");
        assert!(!items.is_empty());

        let sparkler = get_item_by_barcode("1001".to_string())
            .expect("Database query failed")
            .expect("Mock item 1001 was not seeded");
        assert_eq!(sparkler.name, "Red Hot Sparklers (10-pack)");
        assert_eq!(sparkler.price, 4.99);

        // 3. Verify creating a new item
        assert!(add_item(
            "9999".to_string(),
            "Mega Blast Aerial".to_string(),
            49.99,
            Some(10),
            None,
            None,
            None,
            None,
            None
        )
        .is_ok());

        let custom_item = get_item_by_barcode("9999".to_string())
            .expect("Database query failed")
            .expect("Inserted item 9999 not found");
        assert_eq!(custom_item.name, "Mega Blast Aerial");
        assert_eq!(custom_item.stock_quantity, Some(10));

        // 4. Verify editing stock count and retail prices
        assert!(update_item_details(
            custom_item.id,
            54.99,
            Some(25),
            None,
            None,
            None,
            None,
            None
        )
        .is_ok());

        let updated_item = get_item_by_barcode("9999".to_string())
            .expect("Query failed")
            .expect("Item details missing");
        assert_eq!(updated_item.price, 54.99);
        assert_eq!(updated_item.stock_quantity, Some(25));

        // 5. Verify seeded discount presets
        let discounts = get_discounts().expect("Failed to get discounts");
        assert!(!discounts.is_empty());

        // 6. Verify successful sale transaction
        let cart = vec![SaleItemInput {
            item_id: updated_item.id,
            quantity: 5,
            price_at_sale: updated_item.price,
            is_bulk: None,
        }];

        let subtotal = updated_item.price * 5.0;
        let sale_id = complete_sale(cart, subtotal, 0.0, 0.0, subtotal)
            .expect("Sale transaction failed to complete");
        assert!(sale_id > 0);

        let sold_item = get_item_by_barcode("9999".to_string())
            .expect("Query failed")
            .expect("Item missing");
        assert_eq!(sold_item.stock_quantity, Some(20));

        // 7. Verify transaction rollback on stock depletion
        let bad_cart = vec![SaleItemInput {
            item_id: sold_item.id,
            quantity: 30,
            price_at_sale: sold_item.price,
            is_bulk: None,
        }];

        let bad_subtotal = sold_item.price * 30.0;
        let checkout_result = complete_sale(bad_cart, bad_subtotal, 0.0, 0.0, bad_subtotal);
        assert!(checkout_result.is_err());

        // 8. Verify historical seeder
        assert!(seed_historical_sales().is_ok());
        let summary = get_yearly_sales_summary().expect("Failed to get yearly sales summary");
        assert!(summary.len() >= 3);

        let has_2024 = summary.iter().any(|s| s.year == "2024");
        let has_2025 = summary.iter().any(|s| s.year == "2025");
        assert!(has_2024);
        assert!(has_2025);

        cleanup_test_db();
    }
}
