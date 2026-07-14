//! # THC Fireworks POS — Tauri Backend Library
//!
//! This crate contains the core backend services, SQLite command wrappers, and device bridge
//! integrations for the portable Point of Sale application.
//!
//! ## Core Subsystems
//!
//! ### 1. SQLite Database & Self-Healing Backup Sync
//! - **Local Storage**: Data is saved to an embedded SQLite database (`firework_pos.db`).
//! - **USB Drive Portability**: Database path is resolved dynamically relative to the running binary via `resolve_db_path()`.
//! - **Auto Backup Sync**: Every data-mutating transaction triggers a copy of the database to be written to `%LOCALAPPDATA%\THCFireworksPOS\` to protect against sudden USB ejection or file corruption.
//! - **Self-Healing Recovery**: If the database file is missing on startup, `init_db()` automatically restores the most recent local AppData backup file, writing a confirmation entry to Settings.
//!
//! ### 2. Poynt / GoDaddy Smart Terminal Bridge
//! - Launches a localized sidecar proxy process (`PoyntPOSBridge.dll`) and establishes parent-child stdio streams.
//! - Handles device pairing keys, card checkout requests, voids, and refunds.
//!
//! ### 3. Offline Video Downloader (yt-dlp)
//! - Leverages local `yt-dlp` executable streams to pull high-definition YouTube videos.
//! - Stores files in a local assets cache folder next to the executable, allowing showcase clips to play offline.
//!
//! ### 4. Cloud Integration
//! - Authenticates with Google Drive using Google OAuth2 token exchanges.
//! - Syncs the SQLite database to Google Drive at periodic intervals (default: 30 minutes) and supports manual backups and restores.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::{PathBuf, Path};
use tauri::{Manager, Listener};
use base64::{Engine as _, engine::general_purpose};
use std::io::Read;
use tauri_plugin_opener::OpenerExt;

// GoDaddy Terminal Bridge Sidecar process execution imports
use std::process::{Child, Command, Stdio};
use std::io::{BufRead, BufReader, Write};
use std::sync::Mutex;
use std::sync::OnceLock;



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
    tax_id: Option<i32>,
    video_path: Option<String>,
    is_invalid: Option<bool>,
    missing_fields: Option<String>,
    discount_tags: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Tax {
    id: i32,
    name: String,
    rate: f64,
    scope: String, // "total" or "item"
}

#[derive(Serialize, Deserialize, Clone)]
struct Discount {
    id: i32,
    name: String,
    #[serde(rename = "type")]
    discount_type: String, // "percentage" or "fixed"
    value: f64,
    qualifier_type: Option<String>,
    qualifier_value: Option<f64>,
    reward_type: Option<String>,
    reward_value: Option<f64>,
    reward_value_type: Option<String>,
    reward_quantity: Option<f64>,
    reward_target_item_id: Option<i32>,
    reward_lowest_cost_linked_item_id: Option<i32>,
    discount_tag: Option<String>,
    max_limit_per_order: Option<i32>,
    value_cap: Option<f64>,
    is_stackable: Option<i32>,
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
    is_bulk: Option<bool>,
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
    payment_method: Option<String>,
    godaddy_transaction_id: Option<String>,
    transaction_fee: Option<f64>,
    status: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct PaymentMethod {
    id: i32,
    name: String,
    enabled: i32,
    fee_percentage: f64,
    fee_flat: f64,
    is_custom: i32,
    status: String,
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
    profit: f64,
    total_fees: f64,
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

// --- DATA MANAGEMENT TYPES ---

#[derive(Serialize, Deserialize, Clone)]
struct CloudBackupStatus {
    is_connected: bool,
    account_email: Option<String>,
    last_backup_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ImportResult {
    imported: i32,
    skipped: i32,
    errors: Vec<String>,
}



#[derive(Deserialize, Default)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Deserialize, Default)]
struct UserInfo {
    email: Option<String>,
}

#[derive(Deserialize, Default)]
struct DriveFileList {
    files: Vec<DriveFile>,
}

#[derive(Deserialize, Default, Clone)]
struct DriveFile {
    id: String,
    name: Option<String>,
    size: Option<String>,
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

fn resolve_backup_dir() -> Option<PathBuf> {
    #[cfg(test)]
    {
        if let Ok(mut path) = std::env::current_dir() {
            path.push("target");
            return Some(path);
        }
        return None;
    }
    #[cfg(not(test))]
    {
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            let mut path = PathBuf::from(local_appdata);
            path.push("THCFireworksPOS");
            return Some(path);
        }
        None
    }
}

fn resolve_backup_path() -> Option<PathBuf> {
    resolve_backup_dir().map(|mut p| {
        #[cfg(test)]
        p.push("firework_pos_test_backup.db");
        #[cfg(not(test))]
        p.push("firework_pos_backup.db");
        p
    })
}

fn format_filename_timestamp_to_iso(ts: &str) -> String {
    if ts.len() == 15 && ts.chars().nth(8) == Some('_') {
        let year = &ts[0..4];
        let month = &ts[4..6];
        let day = &ts[6..8];
        let hour = &ts[9..11];
        let min = &ts[11..13];
        let sec = &ts[13..15];
        format!("{}-{}-{}T{}:{}:{}Z", year, month, day, hour, min, sec)
    } else {
        "Unknown".to_string()
    }
}

struct BackupFile {
    path: PathBuf,
    date: String,      // YYYYMMDD
    timestamp: String, // YYYYMMDD_HHMMSS
}

fn prune_local_backups(conn: &Connection, backup_dir: &Path) -> Result<(), String> {
    let local_limit: usize = conn.query_row(
        "SELECT value FROM settings WHERE key = 'local_backup_limit'",
        [],
        |row| row.get::<_, String>(0)
    )
    .optional()
    .map_err(|e| e.to_string())?
    .and_then(|v| v.parse::<usize>().ok())
    .unwrap_or(5);
    let local_limit = local_limit.clamp(2, 10);

    let keep_daily: bool = conn.query_row(
        "SELECT value FROM settings WHERE key = 'keep_daily_backups_5_days'",
        [],
        |row| row.get::<_, String>(0)
    )
    .optional()
    .map_err(|e| e.to_string())?
    .map(|v| v == "true")
    .unwrap_or(true);

    let today: String = conn.query_row("SELECT strftime('%Y%m%d', 'now')", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let mut past_days = Vec::new();
    for i in 1..=5 {
        let day: String = conn.query_row(
            &format!("SELECT strftime('%Y%m%d', 'now', '-{} day')", i),
            [],
            |r| r.get(0)
        ).map_err(|e| e.to_string())?;
        past_days.push(day);
    }

    let mut backup_files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(backup_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                if name.starts_with("firework_pos_backup_") && name.ends_with(".db") && name.len() == 38 {
                    let date = name[20..28].to_string();
                    let timestamp = name[20..35].to_string();
                    backup_files.push(BackupFile {
                        path,
                        date,
                        timestamp,
                    });
                }
            }
        }
    }

    backup_files.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    use std::collections::HashMap;
    let mut grouped: HashMap<String, Vec<BackupFile>> = HashMap::new();
    for file in backup_files {
        grouped.entry(file.date.clone()).or_default().push(file);
    }

    for (date, files) in grouped {
        if date == today {
            if files.len() > local_limit {
                let to_delete_count = files.len() - local_limit;
                for i in 0..to_delete_count {
                    let _ = std::fs::remove_file(&files[i].path);
                }
            }
        } else if keep_daily && past_days.contains(&date) {
            if files.len() > 1 {
                for i in 0..(files.len() - 1) {
                    let _ = std::fs::remove_file(&files[i].path);
                }
            }
        } else {
            for file in files {
                let _ = std::fs::remove_file(&file.path);
            }
        }
    }

    Ok(())
}

fn migrate_legacy_backup() {
    if let Some(backup_dir) = resolve_backup_dir() {
        let legacy_path = backup_dir.join("firework_pos_backup.db");
        if legacy_path.exists() {
            let mtime_str = if let Ok(metadata) = std::fs::metadata(&legacy_path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let secs = duration.as_secs();
                        if let Ok(db_path) = resolve_db_path() {
                            if let Ok(conn) = Connection::open(&db_path) {
                                conn.query_row(
                                    "SELECT strftime('%Y%m%d_%H%M%S', datetime(?, 'unixepoch'))",
                                    params![secs],
                                    |row| row.get::<_, String>(0)
                                ).ok()
                            } else { None }
                        } else { None }
                    } else { None }
                } else { None }
            } else { None };

            let final_timestamp = mtime_str.unwrap_or_else(|| "20260706_000000".to_string());
            let new_name = format!("firework_pos_backup_{}.db", final_timestamp);
            let new_path = backup_dir.join(new_name);
            if !new_path.exists() {
                let _ = std::fs::rename(&legacy_path, &new_path);
            } else {
                let _ = std::fs::remove_file(&legacy_path);
            }
        }
    }
}

fn backup_db() {
    if let Ok(db_path) = resolve_db_path() {
        if db_path.exists() {
            let mut file_timestamp = "20260706_000000".to_string();

            if let Ok(conn) = Connection::open(&db_path) {
                conn.execute(
                    "CREATE TABLE IF NOT EXISTS backup_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
                    [],
                ).ok();

                let iso_timestamp: String = conn.query_row(
                    "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
                    [],
                    |row| row.get(0),
                ).unwrap_or_else(|_| "2026-07-06T00:00:00Z".to_string());

                file_timestamp = conn.query_row(
                    "SELECT strftime('%Y%m%d_%H%M%S', 'now')",
                    [],
                    |row| row.get(0),
                ).unwrap_or_else(|_| "20260706_000000".to_string());

                conn.execute(
                    "INSERT OR REPLACE INTO backup_metadata (key, value) VALUES (?, ?)",
                    params!["local_backup_last_updated", iso_timestamp],
                ).ok();
            }

            if let Some(backup_dir) = resolve_backup_dir() {
                std::fs::create_dir_all(&backup_dir).ok();
                let file_name = format!("firework_pos_backup_{}.db", file_timestamp);
                let backup_path = backup_dir.join(file_name);
                if std::fs::copy(&db_path, &backup_path).is_ok() {
                    if let Ok(conn) = Connection::open(&db_path) {
                        let _ = prune_local_backups(&conn, &backup_dir);
                    }
                }
            }
        }
    }
}

#[derive(Serialize)]
struct BackupItem {
    name: String,
    path: String,
    timestamp: String,
    size: u64,
}

// HOW TO ADD A FUTURE MIGRATION:
// 1. Increment CURRENT_SCHEMA_VERSION by 1.
// 2. Add `fn migrate_vN_to_vN1(conn: &mut Connection) -> Result<(), String>`.
// 3. Add `if current < N+1 { migrate_vN_to_vN1(conn)?; set_schema_version(conn, N+1); }` in run_migrations().
// 4. For new columns on existing tables also add a fallback ALTER TABLE ADD COLUMN in init_db().

const GOOGLE_CLIENT_ID: &str = match option_env!("GOOGLE_CLIENT_ID") {
    Some(id) => id,
    None => "515783768484-s1si27t2p0j03eau66k0u0hcqnf32gro.apps.googleusercontent.com",
};
const GOOGLE_CLIENT_SECRET_DEFAULT: Option<&str> = option_env!("GOOGLE_CLIENT_SECRET");

fn get_schema_version(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'schema_version'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(0)
}

fn set_schema_version(conn: &Connection, v: i64) {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('schema_version', ?1) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![v.to_string()],
    )
    .ok();
}

/// Migration v0 â†’ v1: make stock_quantity nullable (old schema had NOT NULL).
fn migrate_v0_to_v1(conn: &mut Connection) -> Result<(), String> {
    let table_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='items')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if table_exists {
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
            let tx = conn
                .transaction()
                .map_err(|e| format!("v0â†’v1 migration failed to start: {}", e))?;
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
            .map_err(|e| format!("v0â†’v1: items_new creation failed: {}", e))?;
            tx.execute(
                "INSERT INTO items_new (id, barcode, name, price, stock_quantity) \
                 SELECT id, barcode, name, price, stock_quantity FROM items;",
                [],
            )
            .map_err(|e| format!("v0â†’v1: data transfer failed: {}", e))?;
            tx.execute("DROP TABLE items;", [])
                .map_err(|e| format!("v0â†’v1: old table drop failed: {}", e))?;
            tx.execute("ALTER TABLE items_new RENAME TO items;", [])
                .map_err(|e| format!("v0â†’v1: rename failed: {}", e))?;
            tx.execute("PRAGMA foreign_keys=ON", []).ok();
            tx.commit()
                .map_err(|e| format!("v0â†’v1: commit failed: {}", e))?;
        }
    }
    Ok(())
}

/// Migration v1 â†’ v2: no structural DB changes needed for the Data Management feature.
/// Future column/table additions go here.
fn migrate_v1_to_v2(_conn: &mut Connection) -> Result<(), String> {
    Ok(())
}

/// Migration v2 -> v3: Add backup_metadata table
fn migrate_v2_to_v3(conn: &mut Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS backup_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
        [],
    )
    .map_err(|e| format!("v2->v3: backup_metadata creation failed: {}", e))?;
    
    // Add is_bulk column to sale_items table if upgrading
    conn.execute("ALTER TABLE sale_items ADD COLUMN is_bulk INTEGER DEFAULT 0", []).ok();
    
    Ok(())
}

/// Migration v3 -> v4: Add payment columns to sales and create payment_methods table
fn migrate_v3_to_v4(conn: &mut Connection) -> Result<(), String> {
    conn.execute("ALTER TABLE sales ADD COLUMN payment_method TEXT DEFAULT 'Cash'", []).ok();
    conn.execute("ALTER TABLE sales ADD COLUMN godaddy_transaction_id TEXT", []).ok();
    conn.execute("ALTER TABLE sales ADD COLUMN transaction_fee REAL DEFAULT 0.0", []).ok();
    conn.execute("ALTER TABLE sales ADD COLUMN status TEXT DEFAULT 'completed'", []).ok();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS payment_methods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            enabled INTEGER DEFAULT 1,
            fee_percentage REAL DEFAULT 0.0,
            fee_flat REAL DEFAULT 0.0,
            is_custom INTEGER DEFAULT 1,
            status TEXT DEFAULT 'active'
        );",
        [],
    )
    .map_err(|e| format!("v3->v4: payment_methods creation failed: {}", e))?;

    // Seed default payment methods if not exists
    conn.execute(
        "INSERT OR IGNORE INTO payment_methods (name, enabled, fee_percentage, fee_flat, is_custom, status)
         VALUES ('Cash', 1, 0.0, 0.0, 0, 'active')",
        [],
    ).ok();
    conn.execute(
        "INSERT OR IGNORE INTO payment_methods (name, enabled, fee_percentage, fee_flat, is_custom, status)
         VALUES ('Card', 1, 0.0, 0.0, 0, 'active')",
        [],
    ).ok();
    conn.execute(
        "INSERT OR IGNORE INTO payment_methods (name, enabled, fee_percentage, fee_flat, is_custom, status)
         VALUES ('GoDaddy Terminal Flex', 0, 0.0, 0.0, 0, 'active')",
        [],
    ).ok();

    Ok(())
}

/// Run all pending migrations sequentially up to CURRENT_SCHEMA_VERSION.
fn run_migrations(conn: &mut Connection) -> Result<(), String> {
    let current = get_schema_version(conn);

    if current < 1 {
        migrate_v0_to_v1(conn)?;
        set_schema_version(conn, 1);
    }
    if current < 2 {
        migrate_v1_to_v2(conn)?;
        set_schema_version(conn, 2);
    }
    if current < 3 {
        migrate_v2_to_v3(conn)?;
        set_schema_version(conn, 3);
    }
    if current < 4 {
        migrate_v3_to_v4(conn)?;
        set_schema_version(conn, 4);
    }

    Ok(())
}

// --- DATABASE INITIALIZER ---

fn init_db() -> Result<(), String> {
    let db_path = resolve_db_path()?;

    // Migrate legacy local backup if it exists
    migrate_legacy_backup();

    // Auto-restore local backup if database file is missing (local only — cloud restore is manual).
    if !db_path.exists() {
        if let Some(backup_dir) = resolve_backup_dir() {
            if let Ok(entries) = std::fs::read_dir(&backup_dir) {
                let mut backups = Vec::new();
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("firework_pos_backup_") && name.ends_with(".db") && name.len() == 38 {
                        backups.push(entry.path());
                    }
                }
                backups.sort();
                if let Some(newest_backup) = backups.last() {
                    if let Some(parent) = db_path.parent() {
                        std::fs::create_dir_all(parent).ok();
                    }
                    if std::fs::copy(newest_backup, &db_path).is_ok() {
                        if let Ok(main_conn) = Connection::open(&db_path) {
                            let timestamp: String = main_conn.query_row(
                                "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
                                [],
                                |row| row.get(0),
                            ).unwrap_or_else(|_| "2026-07-06T00:00:00Z".to_string());

                            main_conn.execute(
                                "INSERT OR REPLACE INTO settings (key, value) VALUES ('restored_from_backup', 'true')",
                                [],
                            ).ok();
                            main_conn.execute(
                                "INSERT OR REPLACE INTO settings (key, value) VALUES ('restored_at', ?1)",
                                params![timestamp],
                            ).ok();
                        }
                    }
                }
            }
        }
    }

    let mut conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open SQLite database: {}", e))?;

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
            unit_cost REAL,
            tax_id INTEGER,
            video_path TEXT,
            is_invalid INTEGER DEFAULT 0,
            missing_fields TEXT,
            discount_tags TEXT DEFAULT ''
        );",
        [],
    )
    .map_err(|e| format!("Schema error (items): {}", e))?;

    // Apply column additions if table was created before updates
    conn.execute("ALTER TABLE items ADD COLUMN notes TEXT", []).ok();
    conn.execute("ALTER TABLE items ADD COLUMN bulk_price REAL", []).ok();
    conn.execute("ALTER TABLE items ADD COLUMN bulk_barcode TEXT", []).ok();
    conn.execute("ALTER TABLE items ADD COLUMN bulk_quantity INTEGER", []).ok();
    conn.execute("ALTER TABLE items ADD COLUMN unit_cost REAL", []).ok();
    conn.execute("ALTER TABLE items ADD COLUMN tax_id INTEGER", []).ok();
    conn.execute("ALTER TABLE items ADD COLUMN video_path TEXT", []).ok();
    conn.execute("ALTER TABLE items ADD COLUMN is_invalid INTEGER DEFAULT 0", []).ok();
    conn.execute("ALTER TABLE items ADD COLUMN missing_fields TEXT", []).ok();
    conn.execute("ALTER TABLE items ADD COLUMN discount_tags TEXT DEFAULT ''", []).ok();

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
            value REAL NOT NULL,
            qualifier_type TEXT DEFAULT 'manual',
            qualifier_value REAL DEFAULT 0.0,
            reward_type TEXT DEFAULT 'order_discount',
            reward_value REAL DEFAULT 0.0,
            reward_value_type TEXT DEFAULT 'percentage',
            reward_quantity REAL DEFAULT 0.0,
            reward_target_item_id INTEGER,
            reward_lowest_cost_linked_item_id INTEGER,
            discount_tag TEXT DEFAULT '',
            max_limit_per_order INTEGER,
            value_cap REAL,
            is_stackable INTEGER DEFAULT 1
        );",
        [],
    )
    .map_err(|e| format!("Schema error (discounts): {}", e))?;

    // Apply column additions if table was created before updates
    conn.execute("ALTER TABLE discounts ADD COLUMN qualifier_type TEXT DEFAULT 'manual'", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN qualifier_value REAL DEFAULT 0.0", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN reward_type TEXT DEFAULT 'order_discount'", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN reward_value REAL DEFAULT 0.0", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN reward_value_type TEXT DEFAULT 'percentage'", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN reward_quantity REAL DEFAULT 0.0", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN reward_target_item_id INTEGER", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN reward_lowest_cost_linked_item_id INTEGER", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN discount_tag TEXT DEFAULT ''", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN max_limit_per_order INTEGER", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN value_cap REAL", []).ok();
    conn.execute("ALTER TABLE discounts ADD COLUMN is_stackable INTEGER DEFAULT 1", []).ok();

    // Create Taxes Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS taxes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rate REAL NOT NULL,
            scope TEXT CHECK(scope IN ('total', 'item')) NOT NULL
        );",
        [],
    )
    .map_err(|e| format!("Schema error (taxes): {}", e))?;

    // Create Sales Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            subtotal REAL NOT NULL,
            discount_total REAL NOT NULL,
            tax_total REAL NOT NULL,
            final_total REAL NOT NULL,
            payment_method TEXT DEFAULT 'Cash',
            godaddy_transaction_id TEXT,
            transaction_fee REAL DEFAULT 0.0,
            status TEXT DEFAULT 'completed',
            customer_identifier TEXT DEFAULT ''
        );",
        [],
    )
    .map_err(|e| format!("Schema error (sales): {}", e))?;

    // Apply column additions if table was created before updates
    conn.execute("ALTER TABLE sales ADD COLUMN payment_method TEXT DEFAULT 'Cash'", []).ok();
    conn.execute("ALTER TABLE sales ADD COLUMN godaddy_transaction_id TEXT", []).ok();
    conn.execute("ALTER TABLE sales ADD COLUMN transaction_fee REAL DEFAULT 0.0", []).ok();
    conn.execute("ALTER TABLE sales ADD COLUMN status TEXT DEFAULT 'completed'", []).ok();
    conn.execute("ALTER TABLE sales ADD COLUMN customer_identifier TEXT DEFAULT ''", []).ok();

    // Create Payment Methods Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS payment_methods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            enabled INTEGER DEFAULT 1,
            fee_percentage REAL DEFAULT 0.0,
            fee_flat REAL DEFAULT 0.0,
            is_custom INTEGER DEFAULT 1,
            status TEXT DEFAULT 'active'
        );",
        [],
    )
    .map_err(|e| format!("Schema error (payment_methods): {}", e))?;

    // Seed default payment methods if not exists
    conn.execute(
        "INSERT OR IGNORE INTO payment_methods (name, enabled, fee_percentage, fee_flat, is_custom, status)
         VALUES ('Cash', 1, 0.0, 0.0, 0, 'active')",
        [],
    ).ok();
    conn.execute(
        "INSERT OR IGNORE INTO payment_methods (name, enabled, fee_percentage, fee_flat, is_custom, status)
         VALUES ('Card', 1, 0.0, 0.0, 0, 'active')",
        [],
    ).ok();
    conn.execute(
        "INSERT OR IGNORE INTO payment_methods (name, enabled, fee_percentage, fee_flat, is_custom, status)
         VALUES ('GoDaddy Terminal Flex', 0, 0.0, 0.0, 0, 'active')",
        [],
    ).ok();

    // Create Sale Items Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            price_at_sale REAL NOT NULL,
            is_bulk INTEGER DEFAULT 0,
            FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE,
            FOREIGN KEY(item_id) REFERENCES items(id)
        );",
        [],
    )
    .map_err(|e| format!("Schema error (sale_items): {}", e))?;

    // Fallback: Add is_bulk column to sale_items if it doesn't exist
    conn.execute("ALTER TABLE sale_items ADD COLUMN is_bulk INTEGER DEFAULT 0", []).ok();

    // Create Settings Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
        [],
    )
    .map_err(|e| format!("Schema error (settings): {}", e))?;

    // Ensure backup_metadata table exists.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS backup_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
        [],
    )
    .map_err(|e| format!("v2->v3: backup_metadata creation failed: {}", e))?;

    // Run migrations.
    run_migrations(&mut conn)?;

    backup_db();

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
        .prepare("SELECT id, barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path, is_invalid, missing_fields, discount_tags FROM items ORDER BY name ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let is_invalid_val: Option<i32> = row.get(12)?;
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
                tax_id: row.get(10)?,
                video_path: row.get(11)?,
                is_invalid: is_invalid_val.map(|v| v != 0),
                missing_fields: row.get(13)?,
                discount_tags: row.get(14)?,
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
        .prepare("SELECT id, barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path, is_invalid, missing_fields, discount_tags FROM items WHERE barcode = ?1 OR bulk_barcode = ?1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map(params![barcode], |row| {
            let is_invalid_val: Option<i32> = row.get(12)?;
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
                tax_id: row.get(10)?,
                video_path: row.get(11)?,
                is_invalid: is_invalid_val.map(|v| v != 0),
                missing_fields: row.get(13)?,
                discount_tags: row.get(14)?,
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
    tax_id: Option<i32>,
    video_path: Option<String>,
    is_invalid: Option<bool>,
    missing_fields: Option<String>,
    discount_tags: Option<String>,
) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let is_invalid_val = if is_invalid.unwrap_or(false) { 1 } else { 0 };

    conn.execute(
        "INSERT INTO items (barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path, is_invalid, missing_fields, discount_tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path, is_invalid_val, missing_fields, discount_tags.unwrap_or_default()],
    )
    .map_err(|e| format!("Failed to add product (Barcode might already exist): {}", e))?;

    let item_id = conn.last_insert_rowid() as i32;
    record_price_history(&conn, item_id, price).ok();
    backup_db();

    log_app_event("info", &format!("[DB] Added item '{}' (ID {}) with barcode '{}' and price ${:.2}", name, item_id, barcode, price));

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
    backup_db();

    log_app_event("info", &format!("[DB] Updated item ID {} stock to {:?}", id, stock_quantity));

    Ok(())
}

#[tauri::command]
fn update_item_details(
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
    tax_id: Option<i32>,
    video_path: Option<String>,
    is_invalid: Option<bool>,
    missing_fields: Option<String>,
    discount_tags: Option<String>,
) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let existing_item = conn.query_row(
        "SELECT name, video_path FROM items WHERE id = ?1",
        params![id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
    ).ok();

    let mut updated_video_path = video_path.clone();

    if let Some((old_name, Some(old_vid))) = existing_item {
        if old_name != name {
            if !old_vid.starts_with("http://") && !old_vid.starts_with("https://") {
                if let Ok(videos_dir) = resolve_videos_dir() {
                    let old_file_path = videos_dir.join(&old_vid);
                    if old_file_path.exists() {
                        let ext = std::path::Path::new(&old_vid)
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("mp4");
                        
                        let new_filename = format!("{}_showcase_video.{}", sanitize_filename(&name), ext);
                        let new_file_path = videos_dir.join(&new_filename);
                        
                        if let Err(err) = std::fs::rename(&old_file_path, &new_file_path) {
                            eprintln!("Failed to rename showcase video: {}", err);
                        } else {
                            updated_video_path = Some(new_filename);
                        }
                    }
                }
            }
        }
    }

    let is_invalid_val = if is_invalid.unwrap_or(false) { 1 } else { 0 };

    conn.execute(
        "UPDATE items SET name = ?1, price = ?2, stock_quantity = ?3, notes = ?4, bulk_price = ?5, bulk_barcode = ?6, bulk_quantity = ?7, unit_cost = ?8, tax_id = ?9, video_path = ?10, barcode = ?11, is_invalid = ?12, missing_fields = ?13, discount_tags = ?14 WHERE id = ?15",
        params![name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, updated_video_path, barcode, is_invalid_val, missing_fields, discount_tags.unwrap_or_default(), id],
    )
    .map_err(|e| e.to_string())?;

    record_price_history(&conn, id, price).ok();
    backup_db();

    log_app_event("info", &format!("[DB] Updated item details for ID {}: '{}' (price ${:.2}, stock {:?})", id, name, price, stock_quantity));

    Ok(())
}

#[tauri::command]
fn delete_item(id: i32) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    backup_db();

    log_app_event("info", &format!("[DB] Deleted item ID {}", id));

    Ok(())
}

#[tauri::command]
fn link_existing_item_as_bulk(
    single_item_id: i32,
    bulk_item_id: i32,
    bulk_quantity: i32,
) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;

    // 1. Query barcode, price, unit_cost of bulk_item_id
    let (bulk_barcode, bulk_price, bulk_unit_cost): (String, f64, Option<f64>) = tx
        .query_row(
            "SELECT barcode, price, unit_cost FROM items WHERE id = ?1",
            params![bulk_item_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Failed to query bulk item: {}", e))?;

    // Determine bulk price value (use unit_cost if > 0, fallback to price)
    let bulk_price_value = if let Some(cost) = bulk_unit_cost {
        if cost > 0.0 {
            cost
        } else {
            bulk_price
        }
    } else {
        bulk_price
    };

    // 2. Update the single item with bulk information
    tx.execute(
        "UPDATE items SET bulk_barcode = ?1, bulk_price = ?2, bulk_quantity = ?3 WHERE id = ?4",
        params![bulk_barcode, bulk_price_value, bulk_quantity, single_item_id],
    )
    .map_err(|e| format!("Failed to update single item: {}", e))?;

    // 3. Delete the bulk item
    tx.execute("DELETE FROM items WHERE id = ?1", params![bulk_item_id])
        .map_err(|e| format!("Failed to delete bulk item: {}", e))?;

    tx.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;
    backup_db();

    Ok(())
}


#[tauri::command]
fn get_discounts() -> Result<Vec<Discount>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, type, value, qualifier_type, qualifier_value, reward_type, reward_value, reward_value_type, reward_quantity, reward_target_item_id, reward_lowest_cost_linked_item_id, discount_tag, max_limit_per_order, value_cap, is_stackable FROM discounts ORDER BY name ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Discount {
                id: row.get(0)?,
                name: row.get(1)?,
                discount_type: row.get(2)?,
                value: row.get(3)?,
                qualifier_type: row.get(4)?,
                qualifier_value: row.get(5)?,
                reward_type: row.get(6)?,
                reward_value: row.get(7)?,
                reward_value_type: row.get(8)?,
                reward_quantity: row.get(9)?,
                reward_target_item_id: row.get(10)?,
                reward_lowest_cost_linked_item_id: row.get(11)?,
                discount_tag: row.get(12)?,
                max_limit_per_order: row.get(13)?,
                value_cap: row.get(14)?,
                is_stackable: row.get(15)?,
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
fn add_discount(
    name: String,
    discount_type: String,
    value: f64,
    qualifier_type: Option<String>,
    qualifier_value: Option<f64>,
    reward_type: Option<String>,
    reward_value: Option<f64>,
    reward_value_type: Option<String>,
    reward_quantity: Option<f64>,
    reward_target_item_id: Option<i32>,
    reward_lowest_cost_linked_item_id: Option<i32>,
    discount_tag: Option<String>,
    max_limit_per_order: Option<i32>,
    value_cap: Option<f64>,
    is_stackable: Option<i32>,
) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO discounts (
            name, type, value, qualifier_type, qualifier_value, reward_type, reward_value,
            reward_value_type, reward_quantity, reward_target_item_id, reward_lowest_cost_linked_item_id,
            discount_tag, max_limit_per_order, value_cap, is_stackable
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            name,
            discount_type,
            value,
            qualifier_type.unwrap_or_else(|| "manual".to_string()),
            qualifier_value.unwrap_or(0.0),
            reward_type.unwrap_or_else(|| "order_discount".to_string()),
            reward_value.unwrap_or(0.0),
            reward_value_type.unwrap_or_else(|| "percentage".to_string()),
            reward_quantity.unwrap_or(0.0),
            reward_target_item_id,
            reward_lowest_cost_linked_item_id,
            discount_tag.unwrap_or_default(),
            max_limit_per_order,
            value_cap,
            is_stackable.unwrap_or(1),
        ],
    )
    .map_err(|e| e.to_string())?;
    backup_db();
    log_app_event("info", &format!("[DB] Added discount '{}' of type '{}' with value {:.2}", name, discount_type, value));

    Ok(())
}

#[tauri::command]
fn update_discount(
    id: i32,
    name: String,
    discount_type: String,
    value: f64,
    qualifier_type: Option<String>,
    qualifier_value: Option<f64>,
    reward_type: Option<String>,
    reward_value: Option<f64>,
    reward_value_type: Option<String>,
    reward_quantity: Option<f64>,
    reward_target_item_id: Option<i32>,
    reward_lowest_cost_linked_item_id: Option<i32>,
    discount_tag: Option<String>,
    max_limit_per_order: Option<i32>,
    value_cap: Option<f64>,
    is_stackable: Option<i32>,
) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE discounts SET
            name = ?1, type = ?2, value = ?3, qualifier_type = ?4, qualifier_value = ?5,
            reward_type = ?6, reward_value = ?7, reward_value_type = ?8, reward_quantity = ?9,
            reward_target_item_id = ?10, reward_lowest_cost_linked_item_id = ?11,
            discount_tag = ?12, max_limit_per_order = ?13, value_cap = ?14, is_stackable = ?15
         WHERE id = ?16",
        params![
            name,
            discount_type,
            value,
            qualifier_type.unwrap_or_else(|| "manual".to_string()),
            qualifier_value.unwrap_or(0.0),
            reward_type.unwrap_or_else(|| "order_discount".to_string()),
            reward_value.unwrap_or(0.0),
            reward_value_type.unwrap_or_else(|| "percentage".to_string()),
            reward_quantity.unwrap_or(0.0),
            reward_target_item_id,
            reward_lowest_cost_linked_item_id,
            discount_tag.unwrap_or_default(),
            max_limit_per_order,
            value_cap,
            is_stackable.unwrap_or(1),
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    backup_db();
    log_app_event("info", &format!("[DB] Updated discount ID {} ({}) of type '{}' with value {:.2}", id, name, discount_type, value));

    Ok(())
}

#[tauri::command]
fn delete_discount(id: i32) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM discounts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    backup_db();
    log_app_event("info", &format!("[DB] Deleted discount ID {}", id));

    Ok(())
}

#[tauri::command]
fn complete_sale(
    items: Vec<SaleItemInput>,
    subtotal: f64,
    discount_total: f64,
    tax_total: f64,
    final_total: f64,
    payment_method: String,
    godaddy_transaction_id: Option<String>,
    transaction_fee: f64,
) -> Result<i64, String> {
    let items_count = items.len();
    let db_path = resolve_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 1. Log sale record
    tx.execute(
        "INSERT INTO sales (subtotal, discount_total, tax_total, final_total, payment_method, godaddy_transaction_id, transaction_fee, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'completed')",
        params![
            subtotal,
            discount_total,
            tax_total,
            final_total,
            payment_method,
            godaddy_transaction_id,
            transaction_fee
        ],
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

        let allow_oversell: bool = tx
            .query_row(
                "SELECT value FROM settings WHERE key = 'allow_oversell'",
                [],
                |r| r.get::<_, String>(0),
            )
            .map(|v| v == "true")
            .unwrap_or(false);

        if let Some(stock_val) = stock {
            let qty_to_deduct = if target.is_bulk.unwrap_or(false) {
                target.quantity * bulk_qty.unwrap_or(1)
            } else {
                target.quantity
            };

            if !allow_oversell && stock_val < qty_to_deduct {
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

        let is_bulk_val = if target.is_bulk.unwrap_or(false) { 1 } else { 0 };
        // Record sale details
        tx.execute(
            "INSERT INTO sale_items (sale_id, item_id, quantity, price_at_sale, is_bulk) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![sale_id, target.item_id, target.quantity, target.price_at_sale, is_bulk_val],
        )
        .map_err(|e| format!("Failed to insert sale detail log: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Transaction commit failure: {}", e))?;
    backup_db();

    log_app_event("info", &format!("[DB] Completed sale ID {}. Total items: {}, Subtotal: ${:.2}, Total: ${:.2}", sale_id, items_count, subtotal, final_total));

    Ok(sale_id)
}

#[tauri::command]
fn get_sales() -> Result<Vec<Sale>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, timestamp, subtotal, discount_total, tax_total, final_total, payment_method, godaddy_transaction_id, transaction_fee, status FROM sales ORDER BY id DESC")
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
                payment_method: row.get(6)?,
                godaddy_transaction_id: row.get(7)?,
                transaction_fee: row.get(8)?,
                status: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut sales_list = Vec::new();
    for sale_res in sale_rows {
        let mut sale = sale_res.map_err(|e| e.to_string())?;

        let mut items_stmt = conn
            .prepare(
                "SELECT si.id, si.sale_id, si.item_id, i.name, i.barcode, si.quantity, si.price_at_sale, si.is_bulk
                 FROM sale_items si
                 LEFT JOIN items i ON si.item_id = i.id
                 WHERE si.sale_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let item_rows = items_stmt
            .query_map(params![sale.id], |row| {
                let is_bulk_num: i32 = row.get(7).unwrap_or(0);
                Ok(SaleItemDetail {
                    id: row.get(0)?,
                    sale_id: row.get(1)?,
                    item_id: row.get(2)?,
                    item_name: row.get(3)?,
                    item_barcode: row.get(4)?,
                    quantity: row.get(5)?,
                    price_at_sale: row.get(6)?,
                    is_bulk: Some(is_bulk_num == 1),
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
                s.yr,
                s.tot_sales,
                s.sub,
                s.tax,
                s.disc,
                s.tk_count,
                s.avg_tk,
                (s.tot_sales - IFNULL(c.total_cogs, 0) - IFNULL(s.tot_fees, 0)) as profit,
                s.tot_fees
             FROM (
                 SELECT 
                     strftime('%Y', timestamp) as yr,
                     SUM(final_total) as tot_sales,
                     SUM(subtotal) as sub,
                     SUM(tax_total) as tax,
                     SUM(discount_total) as disc,
                     COUNT(id) as tk_count,
                     AVG(final_total) as avg_tk,
                     SUM(transaction_fee) as tot_fees
                 FROM sales
                 WHERE status != 'refunded'
                 GROUP BY yr
             ) s
             LEFT JOIN (
                 SELECT 
                     strftime('%Y', s2.timestamp) as yr,
                     SUM(si.quantity * IFNULL(i.unit_cost, 0)) as total_cogs
                 FROM sale_items si
                 JOIN sales s2 ON si.sale_id = s2.id
                 JOIN items i ON si.item_id = i.id
                 WHERE s2.status != 'refunded'
                 GROUP BY yr
             ) c ON s.yr = c.yr
             ORDER BY s.yr DESC;",
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
            let profit: f64 = row.get(7).unwrap_or(0.0);
            let total_fees: f64 = row.get(8).unwrap_or(0.0);

            Ok(YearSummary {
                year,
                total_sales,
                subtotal,
                tax_total,
                discount_total,
                ticket_count,
                avg_ticket_value,
                profit,
                total_fees,
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
        "DELETE FROM sales WHERE timestamp LIKE '2023%' OR timestamp LIKE '2024%' OR timestamp LIKE '2025%'",
        [],
    )
    .ok();

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    // 2023 - Slower year, smaller booth, fewer items per sale
    let sales_2023: Vec<(&str, f64, f64, f64, f64)> = vec![
        ("2023-07-01 09:15:00", 38.97,  0.00,  0.00,  38.97),
        ("2023-07-01 11:42:00", 74.95,  7.50,  0.00,  67.45),
        ("2023-07-02 10:05:00", 29.97,  0.00,  0.00,  29.97),
        ("2023-07-02 13:30:00", 119.94, 12.00, 0.00, 107.94),
        ("2023-07-03 09:55:00", 54.97,  0.00,  0.00,  54.97),
        ("2023-07-03 14:20:00", 189.95, 28.50, 0.00, 161.45),
        ("2023-07-03 17:10:00", 44.97,  0.00,  0.00,  44.97),
        ("2023-07-04 08:30:00", 319.90, 48.00, 0.00, 271.90),
        ("2023-07-04 10:15:00", 479.85, 72.00, 0.00, 407.85),
        ("2023-07-04 12:00:00", 639.80, 0.00,  0.00, 639.80),
        ("2023-07-04 14:45:00", 799.75, 120.00, 0.00, 679.75),
        ("2023-07-04 17:30:00", 1059.70, 0.00, 0.00, 1059.70),
        ("2023-07-04 19:00:00", 559.80, 84.00, 0.00, 475.80),
        ("2023-07-05 11:00:00", 89.94,  13.50, 0.00,  76.44),
        ("2023-07-05 14:00:00", 179.88, 0.00,  0.00, 179.88),
        ("2023-07-05 16:30:00", 64.96,  0.00,  0.00,  64.96),
    ];

    for (ts, sub, disc, tax, final_val) in &sales_2023 {
        tx.execute(
            "INSERT INTO sales (timestamp, subtotal, discount_total, tax_total, final_total) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![ts, sub, disc, tax, final_val],
        ).map_err(|e| format!("Failed to insert 2023 sale: {}", e))?;
    }

    // 2024 - Good growth year, bigger orders
    let sales_2024: Vec<(&str, f64, f64, f64, f64)> = vec![
        ("2024-07-01 08:45:00", 59.95,  0.00,   0.00,  59.95),
        ("2024-07-01 10:30:00", 119.90, 12.00,  0.00, 107.90),
        ("2024-07-01 12:15:00", 249.85, 25.00,  0.00, 224.85),
        ("2024-07-01 15:00:00", 89.94,  0.00,   0.00,  89.94),
        ("2024-07-02 09:20:00", 174.93, 0.00,   0.00, 174.93),
        ("2024-07-02 11:45:00", 419.88, 62.98,  0.00, 356.90),
        ("2024-07-02 14:30:00", 699.80, 0.00,   0.00, 699.80),
        ("2024-07-02 17:00:00", 229.88, 34.48,  0.00, 195.40),
        ("2024-07-03 09:00:00", 139.92, 21.00,  0.00, 118.92),
        ("2024-07-03 11:30:00", 549.82, 0.00,   0.00, 549.82),
        ("2024-07-03 14:15:00", 989.70, 0.00,   0.00, 989.70),
        ("2024-07-03 16:45:00", 329.88, 49.48,  0.00, 280.40),
        ("2024-07-04 07:30:00", 449.85, 0.00,   0.00, 449.85),
        ("2024-07-04 09:00:00", 889.73, 133.46, 0.00, 756.27),
        ("2024-07-04 11:00:00", 1249.60, 0.00,  0.00, 1249.60),
        ("2024-07-04 13:00:00", 1679.46, 251.92, 0.00, 1427.54),
        ("2024-07-04 15:00:00", 2299.28, 0.00,  0.00, 2299.28),
        ("2024-07-04 17:00:00", 1449.53, 217.43, 0.00, 1232.10),
        ("2024-07-04 19:30:00", 899.68, 0.00,   0.00, 899.68),
        ("2024-07-05 10:00:00", 289.89, 43.48,  0.00, 246.41),
        ("2024-07-05 13:00:00", 479.83, 0.00,   0.00, 479.83),
        ("2024-07-05 16:00:00", 169.92, 0.00,   0.00, 169.92),
        ("2024-07-06 11:00:00", 99.94,  15.00,  0.00,  84.94),
        ("2024-07-06 14:30:00", 259.87, 0.00,   0.00, 259.87),
    ];

    for (ts, sub, disc, tax, final_val) in &sales_2024 {
        tx.execute(
            "INSERT INTO sales (timestamp, subtotal, discount_total, tax_total, final_total) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![ts, sub, disc, tax, final_val],
        ).map_err(|e| format!("Failed to insert 2024 sale: {}", e))?;
    }

    // 2025 - Best year yet, major 4th haul
    let sales_2025: Vec<(&str, f64, f64, f64, f64)> = vec![
        ("2025-07-01 09:00:00", 109.95,  0.00,   0.00, 109.95),
        ("2025-07-01 11:15:00", 279.87, 41.98,   0.00, 237.89),
        ("2025-07-01 13:30:00", 449.82,  0.00,   0.00, 449.82),
        ("2025-07-01 16:00:00", 199.90, 30.00,   0.00, 169.90),
        ("2025-07-02 08:30:00", 349.86,  0.00,   0.00, 349.86),
        ("2025-07-02 10:45:00", 749.75, 112.46,  0.00, 637.29),
        ("2025-07-02 13:00:00", 1099.64, 0.00,   0.00, 1099.64),
        ("2025-07-02 15:30:00", 549.82, 82.47,   0.00, 467.35),
        ("2025-07-02 18:00:00", 299.88, 0.00,    0.00, 299.88),
        ("2025-07-03 09:30:00", 619.79, 0.00,    0.00, 619.79),
        ("2025-07-03 11:00:00", 1249.57, 187.44, 0.00, 1062.13),
        ("2025-07-03 13:30:00", 1799.43, 0.00,   0.00, 1799.43),
        ("2025-07-03 16:00:00", 2499.26, 374.89, 0.00, 2124.37),
        ("2025-07-03 18:30:00", 1099.64, 0.00,   0.00, 1099.64),
        ("2025-07-04 07:00:00", 799.75,  0.00,   0.00, 799.75),
        ("2025-07-04 08:30:00", 1599.50, 239.93, 0.00, 1359.57),
        ("2025-07-04 10:00:00", 2399.25, 0.00,   0.00, 2399.25),
        ("2025-07-04 11:30:00", 3799.00, 569.85, 0.00, 3229.15),
        ("2025-07-04 13:00:00", 4998.75, 0.00,   0.00, 4998.75),
        ("2025-07-04 14:30:00", 2999.10, 449.87, 0.00, 2549.23),
        ("2025-07-04 16:00:00", 5498.50, 0.00,   0.00, 5498.50),
        ("2025-07-04 17:30:00", 3198.92, 479.84, 0.00, 2719.08),
        ("2025-07-04 19:00:00", 1999.40, 0.00,   0.00, 1999.40),
        ("2025-07-05 10:00:00", 849.73,  0.00,   0.00, 849.73),
        ("2025-07-05 12:30:00", 549.82, 82.47,   0.00, 467.35),
        ("2025-07-05 15:00:00", 319.88, 0.00,    0.00, 319.88),
        ("2025-07-05 17:30:00", 209.91, 31.49,   0.00, 178.42),
        ("2025-07-06 11:00:00", 159.93, 0.00,    0.00, 159.93),
        ("2025-07-06 14:00:00", 399.85, 59.98,   0.00, 339.87),
        ("2025-07-06 16:30:00", 129.94, 0.00,    0.00, 129.94),
    ];

    for (ts, sub, disc, tax, final_val) in &sales_2025 {
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
             WHERE status != 'refunded'
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
fn get_payment_methods() -> Result<Vec<PaymentMethod>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, enabled, fee_percentage, fee_flat, is_custom, status FROM payment_methods ORDER BY id ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(PaymentMethod {
                id: row.get(0)?,
                name: row.get(1)?,
                enabled: row.get(2)?,
                fee_percentage: row.get(3)?,
                fee_flat: row.get(4)?,
                is_custom: row.get(5)?,
                status: row.get(6)?,
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
fn save_payment_method(id: i32, enabled: i32, fee_percentage: f64, fee_flat: f64) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE payment_methods SET enabled = ?1, fee_percentage = ?2, fee_flat = ?3 WHERE id = ?4",
        params![enabled, fee_percentage, fee_flat, id],
    )
    .map_err(|e| e.to_string())?;

    backup_db();
    Ok(())
}

#[tauri::command]
fn add_payment_method(name: String, enabled: i32, fee_percentage: f64, fee_flat: f64) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Check duplicate name case-insensitively
    let existing: Option<(i32, String)> = conn
        .query_row(
            "SELECT id, status FROM payment_methods WHERE LOWER(name) = LOWER(?1)",
            params![name],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((id, status)) = existing {
        if status == "archived" {
            // Restore archived method
            conn.execute(
                "UPDATE payment_methods SET status = 'active', enabled = ?1, fee_percentage = ?2, fee_flat = ?3 WHERE id = ?4",
                params![enabled, fee_percentage, fee_flat, id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            return Err("A payment method with this name already exists.".to_string());
        }
    } else {
        conn.execute(
            "INSERT INTO payment_methods (name, enabled, fee_percentage, fee_flat, is_custom, status)
             VALUES (?1, ?2, ?3, ?4, 1, 'active')",
            params![name, enabled, fee_percentage, fee_flat],
        )
        .map_err(|e| e.to_string())?;
    }

    backup_db();
    Ok(())
}

#[tauri::command]
fn delete_payment_method(id: i32) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Get the name of this payment method
    let name: String = conn
        .query_row(
            "SELECT name FROM payment_methods WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Check if used in transactions
    let usage_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sales WHERE payment_method = ?1",
            params![name],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    if usage_count > 0 {
        // Soft delete: set status to archived, and disable it
        conn.execute(
            "UPDATE payment_methods SET status = 'archived', enabled = 0 WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        // Hard delete
        conn.execute("DELETE FROM payment_methods WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }

    backup_db();
    Ok(())
}

#[tauri::command]
fn update_sale_payment(sale_id: i32, payment_method: String, transaction_fee: f64) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE sales SET payment_method = ?1, transaction_fee = ?2 WHERE id = ?3",
        params![payment_method, transaction_fee, sale_id],
    )
    .map_err(|e| e.to_string())?;

    backup_db();
    Ok(())
}

#[tauri::command]
fn refund_sale(sale_id: i32, restock: bool) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;

    // 1. Update sale status to 'refunded'
    tx.execute(
        "UPDATE sales SET status = 'refunded' WHERE id = ?1",
        params![sale_id],
    )
    .map_err(|e| format!("Failed to update status to refunded: {}", e))?;

    // 2. If restock is true, revert inventory like delete_sale does
    if restock {
        let mut stmt = tx.prepare("SELECT item_id, quantity, is_bulk FROM sale_items WHERE sale_id = ?1")
            .map_err(|e| format!("Failed to prepare select query: {}", e))?;
        let rows = stmt.query_map(params![sale_id], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, i32>(1)?, row.get::<_, i32>(2)?))
        }).map_err(|e| format!("Failed to query sale items: {}", e))?;

        for row in rows {
            let (item_id, quantity, is_bulk) = row.map_err(|e| e.to_string())?;
            
            let item_info: Option<(Option<i32>, Option<i32>)> = tx.query_row(
                "SELECT stock_quantity, bulk_quantity FROM items WHERE id = ?1",
                params![item_id],
                |r| Ok((r.get(0)?, r.get(1)?))
            ).optional().map_err(|e| format!("Failed to query item: {}", e))?;

            if let Some((Some(_stock_qty), bulk_qty)) = item_info {
                let restore_qty = if is_bulk == 1 {
                    quantity * bulk_qty.unwrap_or(1)
                } else {
                    quantity
                };
                tx.execute(
                    "UPDATE items SET stock_quantity = stock_quantity + ?1 WHERE id = ?2",
                    params![restore_qty, item_id],
                ).map_err(|e| format!("Failed to update stock: {}", e))?;
            }
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;
    backup_db();
    log_app_event("info", &format!("[DB] Refunded sale ID {} (restocked: {})", sale_id, restock));
    Ok(())
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

#[tauri::command]
fn get_taxes() -> Result<Vec<Tax>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, rate, scope FROM taxes ORDER BY name ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Tax {
                id: row.get(0)?,
                name: row.get(1)?,
                rate: row.get(2)?,
                scope: row.get(3)?,
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
fn add_tax(name: String, rate: f64, scope: String) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO taxes (name, rate, scope) VALUES (?1, ?2, ?3)",
        params![name, rate, scope],
    )
    .map_err(|e| e.to_string())?;
    backup_db();
    log_app_event("info", &format!("[DB] Added tax '{}' with rate {:.4}", name, rate));

    Ok(())
}

#[tauri::command]
fn update_tax(id: i32, name: String, rate: f64, scope: String) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE taxes SET name = ?1, rate = ?2, scope = ?3 WHERE id = ?4",
        params![name, rate, scope, id],
    )
    .map_err(|e| e.to_string())?;
    backup_db();
    log_app_event("info", &format!("[DB] Updated tax ID {} '{}' with rate {:.4}", id, name, rate));

    Ok(())
}

#[tauri::command]
fn delete_tax(id: i32) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("UPDATE items SET tax_id = NULL WHERE tax_id = ?1", params![id]).ok();

    conn.execute("DELETE FROM taxes WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    backup_db();
    log_app_event("info", &format!("[DB] Deleted tax ID {}", id));

    Ok(())
}

/// Delete a single sale transaction and roll back all related effects.
/// In a database transaction, this:
/// 1. Removes the sale_items row for each item in the deleted sale (restoring inventory)
/// 2. Deletes the sale record itself
/// This ensures the transaction is undone atomically — either everything reverts or nothing does.
#[tauri::command]
fn delete_sale(id: i32) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Use a transaction so the rollback is atomic.
    let tx = conn.transaction().map_err(|e| format!("Failed to start delete_sale transaction: {}", e))?;

    // 1) Query all sale items to revert their stock
    let mut stmt = tx.prepare("SELECT item_id, quantity, is_bulk FROM sale_items WHERE sale_id = ?1")
        .map_err(|e| format!("Failed to prepare select query: {}", e))?;
    let rows = stmt.query_map(params![id], |row| {
        Ok((row.get::<_, i32>(0)?, row.get::<_, i32>(1)?, row.get::<_, i32>(2)?))
    }).map_err(|e| format!("Failed to query sale items: {}", e))?;

    for row in rows {
        let (item_id, quantity, is_bulk) = row.map_err(|e| e.to_string())?;
        
        // Check if item exists and get its bulk_quantity
        let item_info: Option<(Option<i32>, Option<i32>)> = tx.query_row(
            "SELECT stock_quantity, bulk_quantity FROM items WHERE id = ?1",
            params![item_id],
            |r| Ok((r.get(0)?, r.get(1)?))
        ).optional().map_err(|e| format!("Failed to query item: {}", e))?;

        if let Some((Some(_stock_qty), bulk_qty)) = item_info {
            let restore_qty = if is_bulk == 1 {
                quantity * bulk_qty.unwrap_or(1)
            } else {
                quantity
            };
            tx.execute(
                "UPDATE items SET stock_quantity = stock_quantity + ?1 WHERE id = ?2",
                params![restore_qty, item_id],
            ).map_err(|e| format!("Failed to update stock for item {}: {}", item_id, e))?;
        }
    }

    drop(stmt);

    // 2) Delete sale_items entries for this sale.
    tx.execute(
        "DELETE FROM sale_items WHERE sale_id = ?1",
        params![id],
    )
    .map_err(|e| format!("Failed to delete sale items for sale ID {}: {}", id, e))?;

    // 3) Delete the sale record itself.
    tx.execute(
        "DELETE FROM sales WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Failed to delete sale record: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit delete_sale transaction: {}", e))?;
    backup_db();
    log_app_event("info", &format!("[DB] Deleted/undone sale ID {}", id));

    Ok(())
}

#[tauri::command]
fn delete_database_and_backup() -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let backup_path = resolve_backup_path();

    if db_path.exists() {
        std::fs::remove_file(&db_path).map_err(|e| format!("Failed to delete database: {}", e))?;
    }

    if let Some(bp) = &backup_path {
        if bp.exists() {
            std::fs::remove_file(bp).map_err(|e| format!("Failed to delete backup: {}", e))?;
        }
    }

    init_db()?;
    Ok(())
}

fn resolve_videos_dir() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to find current executable path: {}", e))?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "Failed to get executable directory".to_string())?;
    let videos_dir = exe_dir.join("showcase_videos");
    if !videos_dir.exists() {
        std::fs::create_dir_all(&videos_dir)
            .map_err(|e| format!("Failed to create showcase_videos directory: {}", e))?;
    }
    Ok(videos_dir)
}

#[tauri::command]
async fn toggle_playback_window(app_handle: tauri::AppHandle) -> Result<bool, String> {
    if let Some(win) = app_handle.get_webview_window("playback") {
        win.close().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        let win = tauri::WebviewWindowBuilder::new(
            &app_handle,
            "playback",
            tauri::WebviewUrl::App("index.html?window=playback".into())
        )
        .title("Showcase Playback Screen")
        .inner_size(800.0, 480.0)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

        use tauri::Emitter;
        let app_handle_clone = app_handle.clone();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::Destroyed = event {
                let _ = app_handle_clone.emit("playback-window-closed", ());
            }
        });

        Ok(true)
    }
}

fn sanitize_filename(name: &str) -> String {
    let mut sanitized = String::new();
    for c in name.chars() {
        if c.is_alphanumeric() || c == '_' || c == '-' || c == ' ' {
            sanitized.push(c);
        } else {
            sanitized.push('_');
        }
    }
    sanitized.trim().replace(" ", "_")
}

#[tauri::command]
async fn save_showcase_video(source_path: String, item_name: String) -> Result<String, String> {
    let src = std::path::Path::new(&source_path);
    if !src.exists() {
        return Err("Source video file does not exist".to_string());
    }
    let ext = src.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
    let filename = format!("{}_showcase_video.{}", sanitize_filename(&item_name), ext);
    let videos_dir = resolve_videos_dir()?;
    let dest_path = videos_dir.join(&filename);
    std::fs::copy(&src, &dest_path)
        .map_err(|e| format!("Failed to copy video to local storage: {}", e))?;
    Ok(filename)
}

#[tauri::command]
fn get_video_url(filename: String) -> Result<String, String> {
    let videos_dir = resolve_videos_dir()?;
    let path = videos_dir.join(filename);
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn select_local_video() -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("Video Files", &["mp4", "webm"])
        .pick_file();
    Ok(file.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn get_backup_restore_info() -> Result<Value, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    // Ensure settings table exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        [],
    ).ok();
    
    // Read restored_from_backup flag
    let restored_from_backup: bool = conn.query_row(
        "SELECT value FROM settings WHERE key = 'restored_from_backup'",
        [],
        |row| row.get::<_, String>(0)
    )
    .optional()
    .map_err(|e| e.to_string())?
    .map(|v| v == "true")
    .unwrap_or(false);
    
    // Read restored_at
    let restored_at: Option<String> = conn.query_row(
        "SELECT value FROM settings WHERE key = 'restored_at'",
        [],
        |row| row.get(0)
    )
    .optional()
    .map_err(|e| e.to_string())?;
    
    // Read local_backup_last_updated from backup_metadata
    let local_backup_last_updated: Option<String> = conn.query_row(
        "SELECT value FROM backup_metadata WHERE key = 'local_backup_last_updated'",
        [],
        |row| row.get(0)
    )
    .optional()
    .map_err(|e| e.to_string())?;
    
    // Clear the restored_from_backup flag
    conn.execute("DELETE FROM settings WHERE key = 'restored_from_backup'", []).ok();
    
    let result = json!({
        "restored": restored_from_backup,
        "restored_at": restored_at,
        "local_backup_last_updated": local_backup_last_updated,
    });
    
    Ok(result)
}

// --- DATA MANAGEMENT HELPERS ---

fn escape_csv_field(val: &str) -> String {
    let needs_quotes = val.contains('"') || val.contains(',') || val.contains('\n') || val.contains('\r');
    if needs_quotes {
        let escaped = val.replace('"', "\"\"");
        format!("\"{}\"", escaped)
    } else {
        val.to_string()
    }
}

fn parse_csv_content(content: &str) -> Vec<Vec<String>> {
    let mut records = Vec::new();
    let mut record = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = content.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if in_quotes {
                    if chars.peek() == Some(&'"') {
                        chars.next();
                        field.push('"');
                    } else {
                        in_quotes = false;
                    }
                } else {
                    in_quotes = true;
                }
            }
            ',' => {
                if in_quotes {
                    field.push(',');
                } else {
                    record.push(field);
                    field = String::new();
                }
            }
            '\n' | '\r' => {
                if in_quotes {
                    field.push(c);
                } else {
                    if c == '\r' && chars.peek() == Some(&'\n') {
                        chars.next();
                    }
                    record.push(field);
                    records.push(record);
                    record = Vec::new();
                    field = String::new();
                }
            }
            _ => {
                field.push(c);
            }
        }
    }
    if !field.is_empty() || !record.is_empty() {
        record.push(field);
        records.push(record);
    }
    records
}

fn get_metadata_val(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let val: Option<String> = conn.query_row(
        "SELECT value FROM backup_metadata WHERE key = ?1",
        params![key],
        |r| r.get(0)
    )
    .optional()
    .map_err(|e| e.to_string())?;
    Ok(val)
}

fn set_metadata_val(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO backup_metadata (key, value) VALUES (?1, ?2)",
        params![key, value]
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}



fn find_csv_file(folder_path: &str, table: &str) -> Result<Option<PathBuf>, String> {
    let dir = std::fs::read_dir(folder_path).map_err(|e| format!("Failed to read directory: {}", e))?;
    let mut fallback = None;
    for entry in dir {
        if let Ok(entry) = entry {
            let filename = entry.file_name().to_string_lossy().to_string();
            if filename.ends_with(".csv") {
                if filename == format!("{}.csv", table) {
                    fallback = Some(entry.path());
                } else if filename.starts_with(&format!("{}_export_", table)) {
                    return Ok(Some(entry.path()));
                }
            }
        }
    }
    Ok(fallback)
}

fn refresh_access_token(client_id: &str, client_secret: Option<String>, refresh_token: &str) -> Result<String, String> {
    let token_url = "https://oauth2.googleapis.com/token";
    let secret_ref = client_secret.as_deref();
    let mut params = vec![
        ("client_id", client_id),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];
    if let Some(secret) = secret_ref {
        params.push(("client_secret", secret));
    }
    let resp: TokenResponse = ureq::post(token_url)
        .send_form(&params)
        .map_err(|e| format!("Refresh token failed: {}", e))?
        .into_json()
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;
    Ok(resp.access_token)
}

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static CURRENT_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

fn format_system_time(system_time: std::time::SystemTime) -> String {
    let duration = system_time.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    
    let days = secs / 86400;
    let rem_secs = secs % 86400;
    let hours = rem_secs / 3600;
    let mins = (rem_secs % 3600) / 60;
    let seconds = rem_secs % 60;
    
    let mut year = 1970;
    let mut day_count = days;
    
    loop {
        let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        let days_in_year = if is_leap { 366 } else { 365 };
        if day_count >= days_in_year {
            day_count -= days_in_year;
            year += 1;
        } else {
            break;
        }
    }
    
    let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let month_days = [31, if is_leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1;
    for &days_in_mon in month_days.iter() {
        let d_i_m = days_in_mon as u64;
        if day_count >= d_i_m {
            day_count -= d_i_m;
            month += 1;
        } else {
            break;
        }
    }
    let day = day_count + 1;
    
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC",
        year, month, day, hours, mins, seconds
    )
}

fn format_system_time_filename(system_time: std::time::SystemTime) -> String {
    let duration = system_time.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    
    let days = secs / 86400;
    let rem_secs = secs % 86400;
    let hours = rem_secs / 3600;
    let mins = (rem_secs % 3600) / 60;
    let seconds = rem_secs % 60;
    
    let mut year = 1970;
    let mut day_count = days;
    
    loop {
        let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        let days_in_year = if is_leap { 366 } else { 365 };
        if day_count >= days_in_year {
            day_count -= days_in_year;
            year += 1;
        } else {
            break;
        }
    }
    
    let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let month_days = [31, if is_leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1;
    for &days_in_mon in month_days.iter() {
        let d_i_m = days_in_mon as u64;
        if day_count >= d_i_m {
            day_count -= d_i_m;
            month += 1;
        } else {
            break;
        }
    }
    let day = day_count + 1;
    
    format!(
        "{:04}{:02}{:02}_{:02}{:02}{:02}",
        year, month, day, hours, mins, seconds
    )
}

fn init_logging() {
    if let Some(backup_dir) = resolve_backup_dir() {
        let _ = std::fs::create_dir_all(&backup_dir);
        
        // Prune old logs: keep only the 4 latest, so the 5th (current) is the newest
        if let Ok(entries) = std::fs::read_dir(&backup_dir) {
            let mut log_files = Vec::new();
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_file() {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        if name.starts_with("app_log_") && name.ends_with(".log") {
                            log_files.push((name, entry.path()));
                        }
                    }
                }
            }
            log_files.sort_by(|a, b| a.0.cmp(&b.0));
            if log_files.len() >= 5 {
                let prune_count = log_files.len() - 4;
                for i in 0..prune_count {
                    let _ = std::fs::remove_file(&log_files[i].1);
                }
            }
        }
        
        let now = std::time::SystemTime::now();
        let timestamp_str = format_system_time_filename(now);
        let log_filename = format!("app_log_{}.log", timestamp_str);
        let log_path = backup_dir.join(log_filename);
        
        let _ = CURRENT_LOG_PATH.set(log_path);
        
        log_app_event("info", "=== Application Launched ===");
        log_app_event("info", &format!("Version: {}", env!("CARGO_PKG_VERSION")));
        log_app_event("info", &format!("OS Target: {}", std::env::consts::OS));
    }
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppLogPayload {
    r#type: String,
    message: String,
    timestamp: String,
    window_label: String,
}

static BACKEND_LOG_BUFFER: Mutex<Vec<AppLogPayload>> = Mutex::new(Vec::new());

fn log_app_event(log_type: &str, message: &str) {
    log_app_event_with_source(log_type, message, "rust");
}

fn log_app_event_with_source(log_type: &str, message: &str, window_label: &str) {
    let now = std::time::SystemTime::now();
    let time_str = format_system_time(now);
    let log_line = format!("[{}] [{}] {}\n", time_str, log_type.to_uppercase(), message);

    if log_type == "error" {
        eprint!("[Rust Error] {}", log_line);
    } else {
        print!("[Rust Info] {}", log_line);
    }

    if let Some(log_path) = CURRENT_LOG_PATH.get() {
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
        {
            use std::io::Write;
            let _ = file.write_all(log_line.as_bytes());
        }
    }

    let payload = AppLogPayload {
        r#type: log_type.to_string(),
        message: message.to_string(),
        timestamp: time_str,
        window_label: window_label.to_string(),
    };

    if window_label == "rust" {
        if let Ok(mut buffer) = BACKEND_LOG_BUFFER.lock() {
            buffer.push(payload.clone());
            if buffer.len() > 500 {
                buffer.remove(0);
            }
        }
    }

    if let Some(app_handle) = APP_HANDLE.get() {
        use tauri::Emitter;
        let _ = app_handle.emit("app-log", payload);
    }
}

#[tauri::command]
fn log_event(window: tauri::Window, level: String, message: String) {
    log_app_event_with_source(&level.to_lowercase(), &message, window.label());
}

#[tauri::command]
fn open_logs_dir(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(backup_dir) = resolve_backup_dir() {
        let dir_str = backup_dir.to_string_lossy().to_string();
        app_handle.opener().open_path(&dir_str, None::<String>).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Could not resolve backup/logs directory".to_string())
    }
}

fn handle_ureq_error(err: ureq::Error, context: &str) -> String {
    let err_msg = match err {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_else(|_| "Failed to read error body".to_string());
            format!("{} failed (status {}): {}", context, code, body)
        }
        ureq::Error::Transport(e) => {
            format!("{} failed (transport): {}", context, e)
        }
    };
    log_app_event("error", &err_msg);
    err_msg
}

fn prune_cloud_backups(conn: &Connection, access_token: &str) -> Result<(), String> {
    let cloud_limit: usize = conn.query_row(
        "SELECT value FROM settings WHERE key = 'cloud_backup_limit'",
        [],
        |row| row.get::<_, String>(0)
    )
    .optional()
    .map_err(|e| e.to_string())?
    .and_then(|v| v.parse::<usize>().ok())
    .unwrap_or(5);
    let cloud_limit = cloud_limit.clamp(2, 10);

    let keep_daily: bool = conn.query_row(
        "SELECT value FROM settings WHERE key = 'keep_daily_backups_5_days'",
        [],
        |row| row.get::<_, String>(0)
    )
    .optional()
    .map_err(|e| e.to_string())?
    .map(|v| v == "true")
    .unwrap_or(true);

    let today: String = conn.query_row("SELECT strftime('%Y%m%d', 'now')", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let mut past_days = Vec::new();
    for i in 1..=5 {
        let day: String = conn.query_row(
            &format!("SELECT strftime('%Y%m%d', 'now', '-{} day')", i),
            [],
            |r| r.get(0)
        ).map_err(|e| e.to_string())?;
        past_days.push(day);
    }

    let list_url = "https://www.googleapis.com/drive/v3/files?q=name%20contains%20'firework_pos_cloud_backup'%20and%20trashed%3Dfalse&fields=files(id,name,size)&pageSize=100";
    let list_res = ureq::get(list_url)
        .set("Authorization", &format!("Bearer {}", access_token))
        .call();

    let list_resp: DriveFileList = match list_res {
        Ok(resp) => resp.into_json().map_err(|e| format!("Failed to parse list files: {}", e))?,
        Err(e) => return Err(handle_ureq_error(e, "List files for pruning")),
    };

    struct CloudBackupFile {
        id: String,
        name: String,
        date: String,      // YYYYMMDD
        timestamp: String, // YYYYMMDD_HHMMSS
    }

    let mut backup_files = Vec::new();

    for file in list_resp.files {
        let name = file.name.clone().unwrap_or_default();
        if name == "firework_pos_cloud_backup.db" {
            backup_files.push(CloudBackupFile {
                id: file.id.clone(),
                name: name.clone(),
                date: "20260706".to_string(),
                timestamp: "20260706_000000".to_string(),
            });
        } else if name.starts_with("firework_pos_cloud_backup_") && name.ends_with(".db") && name.len() == 44 {
            let date = name[26..34].to_string();
            let timestamp = name[26..41].to_string();
            backup_files.push(CloudBackupFile {
                id: file.id.clone(),
                name: name.clone(),
                date,
                timestamp,
            });
        }
    }

    backup_files.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    use std::collections::HashMap;
    let mut grouped: HashMap<String, Vec<CloudBackupFile>> = HashMap::new();
    for file in backup_files {
        grouped.entry(file.date.clone()).or_default().push(file);
    }

    for (date, files) in grouped {
        if date == today {
            if files.len() > cloud_limit {
                let to_delete_count = files.len() - cloud_limit;
                for i in 0..to_delete_count {
                    let delete_url = format!("https://www.googleapis.com/drive/v3/files/{}", files[i].id);
                    if let Err(e) = ureq::delete(&delete_url)
                        .set("Authorization", &format!("Bearer {}", access_token))
                        .call()
                    {
                        log_app_event("warning", &format!("[Sync] Failed to delete old cloud backup {}: {}", files[i].name, e));
                    } else {
                        log_app_event("info", &format!("[Sync] Deleted old cloud backup: {}", files[i].name));
                    }
                }
            }
        } else if keep_daily && past_days.contains(&date) {
            if files.len() > 1 {
                for i in 0..(files.len() - 1) {
                    let delete_url = format!("https://www.googleapis.com/drive/v3/files/{}", files[i].id);
                    if let Err(e) = ureq::delete(&delete_url)
                        .set("Authorization", &format!("Bearer {}", access_token))
                        .call()
                    {
                        log_app_event("warning", &format!("[Sync] Failed to delete old cloud backup {}: {}", files[i].name, e));
                    } else {
                        log_app_event("info", &format!("[Sync] Deleted old cloud backup: {}", files[i].name));
                    }
                }
            }
        } else {
            for file in files {
                let delete_url = format!("https://www.googleapis.com/drive/v3/files/{}", file.id);
                if let Err(e) = ureq::delete(&delete_url)
                    .set("Authorization", &format!("Bearer {}", access_token))
                    .call()
                {
                    log_app_event("warning", &format!("[Sync] Failed to delete old cloud backup {}: {}", file.name, e));
                } else {
                    log_app_event("info", &format!("[Sync] Deleted old cloud backup: {}", file.name));
                }
            }
        }
    }

    Ok(())
}

fn upload_db_to_drive_internal(db_path: &PathBuf, access_token: &str) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS backup_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        [],
    ).ok();

    let iso_timestamp: String = conn.query_row(
        "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
        [],
        |row| row.get(0),
    ).unwrap_or_else(|_| "2026-07-06T00:00:00Z".to_string());

    let file_timestamp: String = conn.query_row(
        "SELECT strftime('%Y%m%d_%H%M%S', 'now')",
        [],
        |row| row.get(0),
    ).unwrap_or_else(|_| "20260706_000000".to_string());

    conn.execute(
        "INSERT OR REPLACE INTO backup_metadata (key, value) VALUES (?, ?)",
        params!["cloud_backup_last_updated", iso_timestamp],
    ).ok();

    drop(conn);

    let db_bytes = std::fs::read(db_path).map_err(|e| format!("Failed to read database file: {}", e))?;
    let file_name = format!("firework_pos_cloud_backup_{}.db", file_timestamp);

    let create_res = ureq::post("https://www.googleapis.com/drive/v3/files")
        .set("Authorization", &format!("Bearer {}", access_token))
        .send_json(serde_json::json!({
            "name": file_name,
            "mimeType": "application/x-sqlite3"
        }));

    let create_resp: DriveFile = match create_res {
        Ok(resp) => resp.into_json().map_err(|e| format!("Parse create response failed: {}", e))?,
        Err(e) => return Err(handle_ureq_error(e, "Create cloud backup metadata")),
    };

    let upload_url = format!("https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=media", create_resp.id);
    let patch_res = ureq::patch(&upload_url)
        .set("Authorization", &format!("Bearer {}", access_token))
        .set("Content-Type", "application/octet-stream")
        .send_bytes(&db_bytes);

    if let Err(e) = patch_res {
        return Err(handle_ureq_error(e, "Upload cloud backup media"));
    }

    if let Ok(conn) = Connection::open(db_path) {
        let _ = prune_cloud_backups(&conn, access_token);
    }

    Ok(())
}



#[tauri::command]
fn list_local_backups() -> Result<Vec<BackupItem>, String> {
    let mut items = Vec::new();
    if let Some(backup_dir) = resolve_backup_dir() {
        if let Ok(entries) = std::fs::read_dir(backup_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    if name.starts_with("firework_pos_backup_") && name.ends_with(".db") && name.len() == 38 {
                        let timestamp_raw = &name[20..35];
                        let timestamp_iso = format_filename_timestamp_to_iso(timestamp_raw);
                        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        items.push(BackupItem {
                            name: name.clone(),
                            path: path.to_string_lossy().to_string(),
                            timestamp: timestamp_iso,
                            size,
                        });
                    }
                }
            }
        }
    }
    items.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(items)
}

#[tauri::command]
fn restore_from_local_backup_file(path: String) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let src = std::path::Path::new(&path);
    if !src.exists() {
        return Err("Local backup file does not exist".to_string());
    }

    {
        let test_conn = Connection::open(&src)
            .map_err(|e| format!("Invalid SQLite file: {}", e))?;
        let _integrity: String = test_conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .map_err(|e| format!("Database integrity check failed: {}", e))?;
    }

    backup_db();

    std::fs::copy(&src, &db_path)
        .map_err(|e| format!("Failed to restore database: {}", e))?;

    if let Ok(main_conn) = Connection::open(&db_path) {
        let timestamp: String = main_conn.query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
            [],
            |row| row.get(0),
        ).unwrap_or_else(|_| "2026-07-06T00:00:00Z".to_string());

        main_conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('restored_from_backup', 'true')",
            [],
        ).ok();
        main_conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('restored_at', ?1)",
            params![timestamp],
        ).ok();
    }

    Ok(())
}

#[tauri::command]
async fn list_cloud_backups() -> Result<Vec<BackupItem>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let refresh_token = get_metadata_val(&conn, "cloud_refresh_token")?
        .ok_or("Not connected to Google Drive")?;

    let client_id = get_setting_val(&conn, "google_client_id")?
        .unwrap_or_else(|| GOOGLE_CLIENT_ID.to_string());
    let client_secret = get_setting_val(&conn, "google_client_secret")?
        .or_else(|| GOOGLE_CLIENT_SECRET_DEFAULT.map(|s| s.to_string()));

    let access_token = refresh_access_token(&client_id, client_secret, &refresh_token)?;

    let list_url = "https://www.googleapis.com/drive/v3/files?q=name%20contains%20'firework_pos_cloud_backup'%20and%20trashed%3Dfalse&fields=files(id,name,size)&pageSize=100";
    let list_res = ureq::get(list_url)
        .set("Authorization", &format!("Bearer {}", access_token))
        .call();

    let list_resp: DriveFileList = match list_res {
        Ok(resp) => resp.into_json().map_err(|e| format!("Failed to parse list files: {}", e))?,
        Err(e) => return Err(handle_ureq_error(e, "List cloud backups")),
    };

    let mut items = Vec::new();
    for file in list_resp.files {
        let name = file.name.unwrap_or_default();
        let size = file.size.as_ref().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);

        let timestamp_iso = if name == "firework_pos_cloud_backup.db" {
            "Legacy Backup".to_string()
        } else if name.starts_with("firework_pos_cloud_backup_") && name.ends_with(".db") && name.len() == 44 {
            let raw_ts = &name[26..41];
            format_filename_timestamp_to_iso(raw_ts)
        } else {
            continue;
        };

        items.push(BackupItem {
            name: name.clone(),
            path: file.id.clone(),
            timestamp: timestamp_iso,
            size,
        });
    }

    items.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(items)
}

#[tauri::command]
async fn restore_from_google_backup_file(file_id: String) -> Result<String, String> {
    log_app_event("info", &format!("[Sync] Starting database restore from Google Drive file ID: {}...", file_id));
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| {
        let msg = e.to_string();
        log_app_event("error", &format!("[Sync] Database open failed: {}", msg));
        msg
    })?;

    let refresh_token = get_metadata_val(&conn, "cloud_refresh_token")?
        .ok_or_else(|| {
            let msg = "Not connected to Google".to_string();
            log_app_event("error", &format!("[Sync] {}", msg));
            msg
        })?;

    let client_id = get_setting_val(&conn, "google_client_id")?
        .unwrap_or_else(|| GOOGLE_CLIENT_ID.to_string());
    let client_secret = get_setting_val(&conn, "google_client_secret")?
        .or_else(|| GOOGLE_CLIENT_SECRET_DEFAULT.map(|s| s.to_string()));

    let access_token = refresh_access_token(&client_id, client_secret, &refresh_token).map_err(|e| {
        log_app_event("error", &format!("[Sync] Refresh token failed: {}", e));
        e
    })?;

    log_app_event("info", "[Sync] Access token successfully refreshed. Downloading database file...");

    let download_url = format!("https://www.googleapis.com/drive/v3/files/{}?alt=media", file_id);
    let download_res = ureq::get(&download_url)
        .set("Authorization", &format!("Bearer {}", access_token))
        .call();

    let response = match download_res {
        Ok(resp) => resp,
        Err(e) => return Err(handle_ureq_error(e, "Download backup file")),
    };

    let mut bytes = Vec::new();
    response.into_reader().read_to_end(&mut bytes).map_err(|e| format!("Failed to read download stream: {}", e))?;

    drop(conn);

    backup_db();

    std::fs::write(&db_path, &bytes).map_err(|e| {
        let msg = format!("Failed to write restored database: {}", e);
        log_app_event("error", &format!("[Sync] {}", msg));
        msg
    })?;

    let main_conn = Connection::open(&db_path).map_err(|e| {
        let msg = e.to_string();
        log_app_event("error", &format!("[Sync] Database reopen failed: {}", msg));
        msg
    })?;

    let timestamp: String = main_conn.query_row(
        "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
        [],
        |row| row.get(0),
    ).unwrap_or_else(|_| "2026-07-06T00:00:00Z".to_string());

    main_conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('restored_from_backup', 'true')",
        [],
    ).ok();
    main_conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('restored_at', ?1)",
        params![timestamp],
    ).ok();

    log_app_event("info", "[Sync] Cloud database restore completed successfully.");

    Ok(timestamp)
}

// --- NEW TAURI COMMANDS ---

#[tauri::command]
fn pick_export_folder() -> Result<Option<String>, String> {
    let dir = rfd::FileDialog::new().pick_folder();
    Ok(dir.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn export_tables_to_csv(folder_path: String, tables: Vec<String>) -> Result<Vec<String>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let whitelist = ["items", "discounts", "taxes", "sales", "sale_items", "settings", "item_price_history", "payment_methods"];
    let mut exported_files = Vec::new();

    let date: String = conn.query_row("SELECT strftime('%Y-%m-%d', 'now')", [], |r| r.get(0))
        .unwrap_or_else(|_| "2026-07-06".to_string());

    for table in tables {
        if !whitelist.contains(&table.as_str()) {
            return Err(format!("SQL Injection Guard: Table '{}' is not whitelisted", table));
        }

        let mut stmt = conn.prepare(&format!("SELECT * FROM {}", table))
            .map_err(|e| format!("Prepare query for {} failed: {}", table, e))?;

        let column_count = stmt.column_count();
        let column_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();

        let mut csv_content = String::new();
        csv_content.push_str(&column_names.join(","));
        csv_content.push('\n');

        let mut rows = stmt.query([]).map_err(|e| format!("Execute query for {} failed: {}", table, e))?;
        while let Some(row) = rows.next().map_err(|e| format!("Fetch row for {} failed: {}", table, e))? {
            let mut row_values = Vec::new();
            for i in 0..column_count {
                let val_str: String = match row.get_ref(i) {
                    Ok(rusqlite::types::ValueRef::Null) => "".to_string(),
                    Ok(rusqlite::types::ValueRef::Integer(n)) => n.to_string(),
                    Ok(rusqlite::types::ValueRef::Real(r)) => r.to_string(),
                    Ok(rusqlite::types::ValueRef::Text(t)) => {
                        let text = std::str::from_utf8(t).unwrap_or("");
                        text.to_string()
                    },
                    Ok(rusqlite::types::ValueRef::Blob(b)) => {
                        general_purpose::STANDARD.encode(b)
                    },
                    Err(e) => return Err(e.to_string()),
                };
                row_values.push(escape_csv_field(&val_str));
            }
            csv_content.push_str(&row_values.join(","));
            csv_content.push('\n');
        }

        let filename = format!("{}_export_{}.csv", table, date);
        let filepath = Path::new(&folder_path).join(filename);
        std::fs::write(&filepath, csv_content)
            .map_err(|e| format!("Failed to write CSV file for {}: {}", table, e))?;
        
        exported_files.push(filepath.to_string_lossy().to_string());
    }

    Ok(exported_files)
}

#[tauri::command]
fn pick_import_folder() -> Result<Option<String>, String> {
    let dir = rfd::FileDialog::new().pick_folder();
    Ok(dir.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn scan_import_folder(folder_path: String) -> Result<Vec<String>, String> {
    let dir = std::fs::read_dir(&folder_path).map_err(|e| format!("Failed to read directory: {}", e))?;
    let whitelist = ["items", "discounts", "taxes", "sales", "sale_items", "settings", "item_price_history", "payment_methods"];
    let mut found = std::collections::HashSet::new();

    for entry in dir {
        if let Ok(entry) = entry {
            let filename = entry.file_name().to_string_lossy().to_string();
            if filename.ends_with(".csv") {
                for table in &whitelist {
                    if filename == format!("{}.csv", table) || filename.starts_with(&format!("{}_export_", table)) {
                        found.insert(table.to_string());
                    }
                }
            }
        }
    }

    let mut list: Vec<String> = found.into_iter().collect();
    list.sort();
    Ok(list)
}

#[tauri::command]
fn import_tables_from_csv(
    folder_path: String,
    tables: Vec<String>,
    duplicate_policy: String,
) -> Result<ImportResult, String> {
    let db_path = resolve_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let whitelist = ["items", "discounts", "taxes", "sales", "sale_items", "settings", "item_price_history", "payment_methods"];
    let mut imported = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();

    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;

    for table in tables {
        if !whitelist.contains(&table.as_str()) {
            return Err(format!("SQL Injection Guard: Table '{}' is not whitelisted", table));
        }

        let filepath = match find_csv_file(&folder_path, &table)? {
            Some(path) => path,
            None => {
                errors.push(format!("CSV file for table '{}' not found", table));
                continue;
            }
        };

        let content = std::fs::read_to_string(&filepath)
            .map_err(|e| format!("Failed to read CSV for '{}': {}", table, e))?;

        let parsed = parse_csv_content(&content);
        if parsed.is_empty() {
            errors.push(format!("CSV for '{}' is empty", table));
            continue;
        }

        let headers_list = &parsed[0];
        let mut headers = std::collections::HashMap::new();
        for (i, h) in headers_list.iter().enumerate() {
            headers.insert(h.trim().to_string(), i);
        }

        let get_str = |row: &[String], col: &str| -> Option<String> {
            headers.get(col).and_then(|&idx| row.get(idx).map(|s| s.trim().to_string()))
        };
        let get_f64 = |row: &[String], col: &str| -> Option<f64> {
            get_str(row, col).and_then(|s| s.parse().ok())
        };
        let get_i32 = |row: &[String], col: &str| -> Option<i32> {
            get_str(row, col).and_then(|s| s.parse().ok())
        };
        let get_i64 = |row: &[String], col: &str| -> Option<i64> {
            get_str(row, col).and_then(|s| s.parse().ok())
        };

        for row in parsed.iter().skip(1) {
            if row.is_empty() || row.iter().all(|s| s.is_empty()) {
                continue;
            }

            match table.as_str() {
                "items" => {
                    let barcode = match get_str(row, "barcode") {
                        Some(b) if !b.is_empty() => b,
                        _ => {
                            errors.push("items: Row missing barcode".to_string());
                            continue;
                        }
                    };
                    let name = get_str(row, "name").unwrap_or_else(|| "Unnamed Item".to_string());
                    let price = get_f64(row, "price").unwrap_or(0.0);
                    let stock_quantity = get_i32(row, "stock_quantity");
                    let notes = get_str(row, "notes");
                    let bulk_price = get_f64(row, "bulk_price");
                    let bulk_barcode = get_str(row, "bulk_barcode");
                    let bulk_quantity = get_i32(row, "bulk_quantity");
                    let unit_cost = get_f64(row, "unit_cost");
                    let tax_id = get_i32(row, "tax_id");
                    let video_path = get_str(row, "video_path");
                    let id = get_i32(row, "id");

                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM items WHERE barcode = ?1)",
                        params![barcode],
                        |r| r.get(0)
                    ).unwrap_or(false);

                    if exists {
                        if duplicate_policy == "overwrite" {
                            let sql = "UPDATE items SET name=?1, price=?2, stock_quantity=?3, notes=?4, bulk_price=?5, bulk_barcode=?6, bulk_quantity=?7, unit_cost=?8, tax_id=?9, video_path=?10 WHERE barcode=?11";
                            if let Err(e) = tx.execute(sql, params![name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path, barcode]) {
                                errors.push(format!("items: Update error for {}: {}", barcode, e));
                            } else {
                                imported += 1;
                            }
                        } else {
                            skipped += 1;
                        }
                    } else {
                        let sql = "INSERT INTO items (id, barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)";
                        if let Err(e) = tx.execute(sql, params![id, barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path]) {
                            errors.push(format!("items: Insert error for {}: {}", barcode, e));
                        } else {
                            imported += 1;
                        }
                    }
                }
                "discounts" => {
                    let name = match get_str(row, "name") {
                        Some(n) if !n.is_empty() => n,
                        _ => {
                            errors.push("discounts: Row missing name".to_string());
                            continue;
                        }
                    };
                    let discount_type = get_str(row, "type").unwrap_or_else(|| "percentage".to_string());
                    let value = get_f64(row, "value").unwrap_or(0.0);

                    let existing_id: Option<i32> = tx.query_row(
                        "SELECT id FROM discounts WHERE name = ?1",
                        params![name],
                        |r| r.get(0)
                    ).optional().unwrap_or(None);

                    if let Some(id) = existing_id {
                        if duplicate_policy == "overwrite" {
                            if let Err(e) = tx.execute("UPDATE discounts SET type = ?1, value = ?2 WHERE id = ?3", params![discount_type, value, id]) {
                                errors.push(format!("discounts: Update error for {}: {}", name, e));
                            } else {
                                imported += 1;
                            }
                        } else {
                            skipped += 1;
                        }
                    } else {
                        if let Err(e) = tx.execute("INSERT INTO discounts (name, type, value) VALUES (?1, ?2, ?3)", params![name, discount_type, value]) {
                            errors.push(format!("discounts: Insert error for {}: {}", name, e));
                        } else {
                            imported += 1;
                        }
                    }
                }
                "taxes" => {
                    let name = match get_str(row, "name") {
                        Some(n) if !n.is_empty() => n,
                        _ => {
                            errors.push("taxes: Row missing name".to_string());
                            continue;
                        }
                    };
                    let rate = get_f64(row, "rate").unwrap_or(0.0);
                    let scope = get_str(row, "scope").unwrap_or_else(|| "total".to_string());

                    let existing_id: Option<i32> = tx.query_row(
                        "SELECT id FROM taxes WHERE name = ?1",
                        params![name],
                        |r| r.get(0)
                    ).optional().unwrap_or(None);

                    if let Some(id) = existing_id {
                        if duplicate_policy == "overwrite" {
                            if let Err(e) = tx.execute("UPDATE taxes SET rate = ?1, scope = ?2 WHERE id = ?3", params![rate, scope, id]) {
                                errors.push(format!("taxes: Update error for {}: {}", name, e));
                            } else {
                                imported += 1;
                            }
                        } else {
                            skipped += 1;
                        }
                    } else {
                        if let Err(e) = tx.execute("INSERT INTO taxes (name, rate, scope) VALUES (?1, ?2, ?3)", params![name, rate, scope]) {
                            errors.push(format!("taxes: Insert error for {}: {}", name, e));
                        } else {
                            imported += 1;
                        }
                    }
                }
                "sales" => {
                    let id = match get_i64(row, "id") {
                        Some(id) => id,
                        None => {
                            errors.push("sales: Row missing id".to_string());
                            continue;
                        }
                    };
                    let timestamp = get_str(row, "timestamp").unwrap_or_default();
                    let subtotal = get_f64(row, "subtotal").unwrap_or(0.0);
                    let discount_total = get_f64(row, "discount_total").unwrap_or(0.0);
                    let tax_total = get_f64(row, "tax_total").unwrap_or(0.0);
                    let final_total = get_f64(row, "final_total").unwrap_or(0.0);

                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM sales WHERE id = ?1)",
                        params![id],
                        |r| r.get(0)
                    ).unwrap_or(false);

                    if exists {
                        skipped += 1;
                    } else {
                        let sql = "INSERT INTO sales (id, timestamp, subtotal, discount_total, tax_total, final_total) VALUES (?1, ?2, ?3, ?4, ?5, ?6)";
                        if let Err(e) = tx.execute(sql, params![id, timestamp, subtotal, discount_total, tax_total, final_total]) {
                            errors.push(format!("sales: Insert error for ID {}: {}", id, e));
                        } else {
                            imported += 1;
                        }
                    }
                }
                "sale_items" => {
                    let id = match get_i64(row, "id") {
                        Some(id) => id,
                        None => {
                            errors.push("sale_items: Row missing id".to_string());
                            continue;
                        }
                    };
                    let sale_id = get_i64(row, "sale_id").unwrap_or(0);
                    let item_id = get_i64(row, "item_id").unwrap_or(0);
                    let quantity = get_i32(row, "quantity").unwrap_or(0);
                    let price_at_sale = get_f64(row, "price_at_sale").unwrap_or(0.0);
                    let is_bulk_val = get_i32(row, "is_bulk").unwrap_or(0);

                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM sale_items WHERE id = ?1)",
                        params![id],
                        |r| r.get(0)
                    ).unwrap_or(false);

                    if exists {
                        skipped += 1;
                    } else {
                        let sql = "INSERT INTO sale_items (id, sale_id, item_id, quantity, price_at_sale, is_bulk) VALUES (?1, ?2, ?3, ?4, ?5, ?6)";
                        if let Err(e) = tx.execute(sql, params![id, sale_id, item_id, quantity, price_at_sale, is_bulk_val]) {
                            errors.push(format!("sale_items: Insert error for ID {}: {}", id, e));
                        } else {
                            imported += 1;
                        }
                    }
                }
                "settings" => {
                    let key = match get_str(row, "key") {
                        Some(k) if !k.is_empty() => k,
                        _ => {
                            errors.push("settings: Row missing key".to_string());
                            continue;
                        }
                    };
                    let value = get_str(row, "value").unwrap_or_default();

                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM settings WHERE key = ?1)",
                        params![key],
                        |r| r.get(0)
                    ).unwrap_or(false);

                    if exists {
                        if duplicate_policy == "overwrite" {
                            if let Err(e) = tx.execute("UPDATE settings SET value = ?1 WHERE key = ?2", params![value, key]) {
                                errors.push(format!("settings: Update error for {}: {}", key, e));
                            } else {
                                imported += 1;
                            }
                        } else {
                            skipped += 1;
                        }
                    } else {
                        if let Err(e) = tx.execute("INSERT INTO settings (key, value) VALUES (?1, ?2)", params![key, value]) {
                            errors.push(format!("settings: Insert error for {}: {}", key, e));
                        } else {
                            imported += 1;
                        }
                    }
                }
                "item_price_history" => {
                    let item_id = match get_i32(row, "item_id") {
                        Some(id) => id,
                        None => {
                            errors.push("item_price_history: Row missing item_id".to_string());
                            continue;
                        }
                    };
                    let year = get_str(row, "year").unwrap_or_default();
                    let price = get_f64(row, "price").unwrap_or(0.0);

                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM item_price_history WHERE item_id = ?1 AND year = ?2)",
                        params![item_id, year],
                        |r| r.get(0)
                    ).unwrap_or(false);

                    if exists {
                        if duplicate_policy == "overwrite" {
                            if let Err(e) = tx.execute("UPDATE item_price_history SET price = ?1 WHERE item_id = ?2 AND year = ?3", params![price, item_id, year]) {
                                errors.push(format!("item_price_history: Update error for {}-{}: {}", item_id, year, e));
                            } else {
                                imported += 1;
                            }
                        } else {
                            skipped += 1;
                        }
                    } else {
                        if let Err(e) = tx.execute("INSERT INTO item_price_history (item_id, year, price) VALUES (?1, ?2, ?3)", params![item_id, year, price]) {
                            errors.push(format!("item_price_history: Insert error for {}-{}: {}", item_id, year, e));
                        } else {
                            imported += 1;
                        }
                    }
                }
                _ => {}
            }
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;
    backup_db();

    Ok(ImportResult { imported, skipped, errors })
}

#[tauri::command]
fn clear_selected_tables(tables: Vec<String>) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| format!("Failed to start clear transaction: {}", e))?;

    tx.execute("PRAGMA foreign_keys = ON", []).ok();

    if tables.contains(&"sales".to_string()) {
        tx.execute("DELETE FROM sale_items", []).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM sales", []).map_err(|e| e.to_string())?;
    }
    if tables.contains(&"items".to_string()) {
        tx.execute("DELETE FROM item_price_history", []).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM sale_items", []).ok();
        tx.execute("DELETE FROM items", []).map_err(|e| e.to_string())?;
    }
    if tables.contains(&"discounts".to_string()) {
        tx.execute("DELETE FROM discounts", []).map_err(|e| e.to_string())?;
    }
    if tables.contains(&"taxes".to_string()) {
        tx.execute("UPDATE items SET tax_id = NULL", []).ok();
        tx.execute("DELETE FROM taxes", []).map_err(|e| e.to_string())?;
    }
    if tables.contains(&"settings".to_string()) {
        tx.execute("DELETE FROM settings WHERE key NOT IN ('schema_version')", []).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| format!("Failed to commit clear transaction: {}", e))?;
    backup_db();

    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
struct ItemImportInput {
    id: Option<i32>,
    barcode: String,
    name: String,
    price: f64,
    stock_quantity: Option<i32>,
    notes: Option<String>,
    bulk_price: Option<f64>,
    bulk_barcode: Option<String>,
    bulk_quantity: Option<i32>,
    unit_cost: Option<f64>,
    tax_id: Option<i32>,
    video_path: Option<String>,
    is_invalid: Option<bool>,
    missing_fields: Option<String>,
    discount_tags: Option<String>,
}

#[tauri::command]
fn export_database_file(dest_path: String) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    if !db_path.exists() {
        return Err("Database file does not exist".to_string());
    }
    std::fs::copy(&db_path, &dest_path)
        .map_err(|e| format!("Failed to copy database file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn import_database_file(src_path: String) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let src = std::path::Path::new(&src_path);
    if !src.exists() {
        return Err("Source database file does not exist".to_string());
    }

    // Integrity check
    {
        let test_conn = Connection::open(&src)
            .map_err(|e| format!("Invalid SQLite file: {}", e))?;
        let _integrity: String = test_conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .map_err(|e| format!("Database integrity check failed: {}", e))?;
    }

    backup_db();

    std::fs::copy(&src, &db_path)
        .map_err(|e| format!("Failed to replace database: {}", e))?;

    Ok(())
}

#[tauri::command]
fn pick_save_file(default_name: String, filter_name: String, filter_ext: String) -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter(&filter_name, &[&filter_ext])
        .save_file();
    Ok(path.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn pick_import_file(filter_name: String, filter_ext: String) -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .add_filter(&filter_name, &[&filter_ext])
        .pick_file();
    Ok(path.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
    use base64::{Engine as _, engine::general_purpose};
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn write_binary_file(path: String, base64_data: String) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose};
    let bytes = general_purpose::STANDARD.decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    std::fs::write(path, bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_table_rows(table: String) -> Result<Vec<serde_json::Value>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let whitelist = ["items", "discounts", "taxes", "sales", "sale_items", "settings", "item_price_history", "payment_methods"];
    if !whitelist.contains(&table.as_str()) {
        return Err(format!("SQL Injection Guard: Table '{}' is not whitelisted", table));
    }

    let mut stmt = conn.prepare(&format!("SELECT * FROM {}", table))
        .map_err(|e| format!("Prepare query for {} failed: {}", table, e))?;

    let column_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
    let column_count = stmt.column_count();

    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut map = serde_json::Map::new();
        for i in 0..column_count {
            let val: Value = match row.get_ref(i) {
                Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                Ok(rusqlite::types::ValueRef::Integer(n)) => json!(n),
                Ok(rusqlite::types::ValueRef::Real(r)) => json!(r),
                Ok(rusqlite::types::ValueRef::Text(t)) => {
                    let text = std::str::from_utf8(t).unwrap_or("");
                    json!(text)
                },
                Ok(rusqlite::types::ValueRef::Blob(b)) => {
                    use base64::{Engine as _, engine::general_purpose};
                    json!(general_purpose::STANDARD.encode(b))
                },
                Err(e) => return Err(e.to_string()),
            };
            map.insert(column_names[i].clone(), val);
        }
        results.push(Value::Object(map));
    }

    Ok(results)
}

#[tauri::command]
fn import_items_batch(
    items: Vec<ItemImportInput>,
    duplicate_policy: String,
) -> Result<ImportResult, String> {
    let db_path = resolve_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;

    let mut imported = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();

    for item in items {
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE barcode = ?1)",
            params![item.barcode],
            |r| r.get(0)
        ).unwrap_or(false);

        let is_invalid_val = if item.is_invalid.unwrap_or(false) { 1 } else { 0 };

        if exists {
            if duplicate_policy == "overwrite" {
                let sql = "UPDATE items SET name=?1, price=?2, stock_quantity=?3, notes=?4, bulk_price=?5, bulk_barcode=?6, bulk_quantity=?7, unit_cost=?8, tax_id=?9, video_path=?10, is_invalid=?11, missing_fields=?12, discount_tags=?13 WHERE barcode=?14";
                if let Err(e) = tx.execute(sql, params![
                    item.name, item.price, item.stock_quantity, item.notes,
                    item.bulk_price, item.bulk_barcode, item.bulk_quantity,
                    item.unit_cost, item.tax_id, item.video_path,
                    is_invalid_val, item.missing_fields, item.discount_tags.unwrap_or_default(), item.barcode
                ]) {
                    errors.push(format!("items: Update error for {}: {}", item.barcode, e));
                } else {
                    imported += 1;
                }
            } else {
                skipped += 1;
            }
        } else {
            let sql = "INSERT INTO items (barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path, is_invalid, missing_fields, discount_tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)";
            if let Err(e) = tx.execute(sql, params![
                item.barcode, item.name, item.price, item.stock_quantity, item.notes,
                item.bulk_price, item.bulk_barcode, item.bulk_quantity,
                item.unit_cost, item.tax_id, item.video_path,
                is_invalid_val, item.missing_fields, item.discount_tags.unwrap_or_default()
            ]) {
                errors.push(format!("items: Insert error for {}: {}", item.barcode, e));
            } else {
                imported += 1;
            }
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;
    backup_db();

    Ok(ImportResult {
        imported,
        skipped,
        errors,
    })
}

#[tauri::command]
fn import_table_rows_batch(
    table_name: String,
    rows: Vec<serde_json::Value>,
    duplicate_policy: String,
) -> Result<ImportResult, String> {
    let db_path = resolve_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;

    let whitelist = ["items", "discounts", "taxes", "sales", "sale_items", "settings", "item_price_history", "payment_methods"];
    if !whitelist.contains(&table_name.as_str()) {
        return Err(format!("SQL Injection Guard: Table '{}' is not whitelisted", table_name));
    }

    let mut imported = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();

    for row_val in rows {
        let obj = match row_val.as_object() {
            Some(o) => o,
            None => {
                errors.push("Invalid JSON row object".to_string());
                continue;
            }
        };

        let get_str = |key: &str| -> Option<String> {
            obj.get(key).and_then(|v| match v {
                Value::String(s) => Some(s.clone()),
                Value::Number(n) => Some(n.to_string()),
                Value::Null => None,
                _ => Some(v.to_string()),
            })
        };

        let get_f64 = |key: &str| -> Option<f64> {
            obj.get(key).and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        };

        let get_i32 = |key: &str| -> Option<i32> {
            obj.get(key).and_then(|v| v.as_i64().map(|n| n as i32).or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        };

        let get_i64 = |key: &str| -> Option<i64> {
            obj.get(key).and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        };

        match table_name.as_str() {
            "items" => {
                let barcode = match get_str("barcode") {
                    Some(b) if !b.is_empty() => b,
                    _ => {
                        errors.push("items: Row missing barcode".to_string());
                        continue;
                    }
                };
                let name = get_str("name").unwrap_or_else(|| "Unnamed Item".to_string());
                let price = get_f64("price").unwrap_or(0.0);
                let stock_quantity = get_i32("stock_quantity");
                let notes = get_str("notes");
                let bulk_price = get_f64("bulk_price");
                let bulk_barcode = get_str("bulk_barcode");
                let bulk_quantity = get_i32("bulk_quantity");
                let unit_cost = get_f64("unit_cost");
                let tax_id = get_i32("tax_id");
                let video_path = get_str("video_path");
                let is_invalid = get_i32("is_invalid").unwrap_or(0);
                let missing_fields = get_str("missing_fields");
                let discount_tags = get_str("discount_tags");

                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM items WHERE barcode = ?1)",
                    params![barcode],
                    |r| r.get(0)
                ).unwrap_or(false);

                if exists {
                    if duplicate_policy == "overwrite" {
                        let sql = "UPDATE items SET name=?1, price=?2, stock_quantity=?3, notes=?4, bulk_price=?5, bulk_barcode=?6, bulk_quantity=?7, unit_cost=?8, tax_id=?9, video_path=?10, is_invalid=?11, missing_fields=?12, discount_tags=?13 WHERE barcode=?14";
                        if let Err(e) = tx.execute(sql, params![name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path, is_invalid, missing_fields, discount_tags.unwrap_or_default(), barcode]) {
                            errors.push(format!("items: Update error for {}: {}", barcode, e));
                        } else {
                            imported += 1;
                        }
                    } else {
                        skipped += 1;
                    }
                } else {
                    let sql = "INSERT INTO items (barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path, is_invalid, missing_fields, discount_tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)";
                    if let Err(e) = tx.execute(sql, params![barcode, name, price, stock_quantity, notes, bulk_price, bulk_barcode, bulk_quantity, unit_cost, tax_id, video_path, is_invalid, missing_fields, discount_tags.unwrap_or_default()]) {
                        errors.push(format!("items: Insert error for {}: {}", barcode, e));
                    } else {
                        imported += 1;
                    }
                }
            }
            "discounts" => {
                let name = match get_str("name") {
                    Some(n) if !n.is_empty() => n,
                    _ => {
                        errors.push("discounts: Row missing name".to_string());
                        continue;
                    }
                };
                let discount_type = get_str("type").unwrap_or_else(|| "percentage".to_string());
                let value = get_f64("value").unwrap_or(0.0);
                let qualifier_type = get_str("qualifier_type").unwrap_or_else(|| "manual".to_string());
                let qualifier_value = get_f64("qualifier_value").unwrap_or(0.0);
                let reward_type = get_str("reward_type").unwrap_or_else(|| "order_discount".to_string());
                let reward_value = get_f64("reward_value").unwrap_or(0.0);
                let reward_value_type = get_str("reward_value_type").unwrap_or_else(|| "percentage".to_string());
                let reward_quantity = get_f64("reward_quantity").unwrap_or(0.0);
                let reward_target_item_id = get_i32("reward_target_item_id");
                let reward_lowest_cost_linked_item_id = get_i32("reward_lowest_cost_linked_item_id");
                let discount_tag = get_str("discount_tag").unwrap_or_default();
                let max_limit_per_order = get_i32("max_limit_per_order");
                let value_cap = get_f64("value_cap");
                let is_stackable = get_i32("is_stackable").unwrap_or(1);

                let existing_id: Option<i32> = tx.query_row(
                    "SELECT id FROM discounts WHERE name = ?1",
                    params![name],
                    |r| r.get(0)
                ).optional().unwrap_or(None);

                if let Some(id) = existing_id {
                    if duplicate_policy == "overwrite" {
                        let sql = "UPDATE discounts SET type = ?1, value = ?2, qualifier_type = ?3, qualifier_value = ?4, reward_type = ?5, reward_value = ?6, reward_value_type = ?7, reward_quantity = ?8, reward_target_item_id = ?9, reward_lowest_cost_linked_item_id = ?10, discount_tag = ?11, max_limit_per_order = ?12, value_cap = ?13, is_stackable = ?14 WHERE id = ?15";
                        if let Err(e) = tx.execute(sql, params![discount_type, value, qualifier_type, qualifier_value, reward_type, reward_value, reward_value_type, reward_quantity, reward_target_item_id, reward_lowest_cost_linked_item_id, discount_tag, max_limit_per_order, value_cap, is_stackable, id]) {
                            errors.push(format!("discounts: Update error for {}: {}", name, e));
                        } else {
                            imported += 1;
                        }
                    } else {
                        skipped += 1;
                    }
                } else {
                    let sql = "INSERT INTO discounts (name, type, value, qualifier_type, qualifier_value, reward_type, reward_value, reward_value_type, reward_quantity, reward_target_item_id, reward_lowest_cost_linked_item_id, discount_tag, max_limit_per_order, value_cap, is_stackable) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)";
                    if let Err(e) = tx.execute(sql, params![name, discount_type, value, qualifier_type, qualifier_value, reward_type, reward_value, reward_value_type, reward_quantity, reward_target_item_id, reward_lowest_cost_linked_item_id, discount_tag, max_limit_per_order, value_cap, is_stackable]) {
                        errors.push(format!("discounts: Insert error for {}: {}", name, e));
                    } else {
                        imported += 1;
                    }
                }
            }
            "taxes" => {
                let name = match get_str("name") {
                    Some(n) if !n.is_empty() => n,
                    _ => {
                        errors.push("taxes: Row missing name".to_string());
                        continue;
                    }
                };
                let rate = get_f64("rate").unwrap_or(0.0);
                let scope = get_str("scope").unwrap_or_else(|| "total".to_string());

                let existing_id: Option<i32> = tx.query_row(
                    "SELECT id FROM taxes WHERE name = ?1",
                    params![name],
                    |r| r.get(0)
                ).optional().unwrap_or(None);

                if let Some(id) = existing_id {
                    if duplicate_policy == "overwrite" {
                        if let Err(e) = tx.execute("UPDATE taxes SET rate = ?1, scope = ?2 WHERE id = ?3", params![rate, scope, id]) {
                            errors.push(format!("taxes: Update error for {}: {}", name, e));
                        } else {
                            imported += 1;
                        }
                    } else {
                        skipped += 1;
                    }
                } else {
                    if let Err(e) = tx.execute("INSERT INTO taxes (name, rate, scope) VALUES (?1, ?2, ?3)", params![name, rate, scope]) {
                        errors.push(format!("taxes: Insert error for {}: {}", name, e));
                    } else {
                        imported += 1;
                    }
                }
            }
            "sales" => {
                let id = match get_i64("id") {
                    Some(id) => id,
                    None => {
                        errors.push("sales: Row missing id".to_string());
                        continue;
                    }
                };
                let timestamp = get_str("timestamp").unwrap_or_default();
                let subtotal = get_f64("subtotal").unwrap_or(0.0);
                let discount_total = get_f64("discount_total").unwrap_or(0.0);
                let tax_total = get_f64("tax_total").unwrap_or(0.0);
                let final_total = get_f64("final_total").unwrap_or(0.0);

                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM sales WHERE id = ?1)",
                    params![id],
                    |r| r.get(0)
                ).unwrap_or(false);

                if exists {
                    skipped += 1;
                } else {
                    let sql = "INSERT INTO sales (id, timestamp, subtotal, discount_total, tax_total, final_total) VALUES (?1, ?2, ?3, ?4, ?5, ?6)";
                    if let Err(e) = tx.execute(sql, params![id, timestamp, subtotal, discount_total, tax_total, final_total]) {
                        errors.push(format!("sales: Insert error for ID {}: {}", id, e));
                    } else {
                        imported += 1;
                    }
                }
            }
            "sale_items" => {
                let id = match get_i64("id") {
                    Some(id) => id,
                    None => {
                        errors.push("sale_items: Row missing id".to_string());
                        continue;
                    }
                };
                let sale_id = get_i64("sale_id").unwrap_or(0);
                let item_id = get_i64("item_id").unwrap_or(0);
                let quantity = get_i32("quantity").unwrap_or(0);
                let price_at_sale = get_f64("price_at_sale").unwrap_or(0.0);
                let is_bulk = get_i32("is_bulk").unwrap_or(0);

                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM sale_items WHERE id = ?1)",
                    params![id],
                    |r| r.get(0)
                ).unwrap_or(false);

                if exists {
                    skipped += 1;
                } else {
                    let sql = "INSERT INTO sale_items (id, sale_id, item_id, quantity, price_at_sale, is_bulk) VALUES (?1, ?2, ?3, ?4, ?5, ?6)";
                    if let Err(e) = tx.execute(sql, params![id, sale_id, item_id, quantity, price_at_sale, is_bulk]) {
                        errors.push(format!("sale_items: Insert error for ID {}: {}", id, e));
                    } else {
                        imported += 1;
                    }
                }
            }
            "settings" => {
                let key = match get_str("key") {
                    Some(k) if !k.is_empty() => k,
                    _ => {
                        errors.push("settings: Row missing key".to_string());
                        continue;
                    }
                };
                let value = get_str("value").unwrap_or_default();

                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM settings WHERE key = ?1)",
                    params![key],
                    |r| r.get(0)
                ).unwrap_or(false);

                if exists {
                    if duplicate_policy == "overwrite" {
                        if let Err(e) = tx.execute("UPDATE settings SET value = ?1 WHERE key = ?2", params![value, key]) {
                            errors.push(format!("settings: Update error for {}: {}", key, e));
                        } else {
                            imported += 1;
                        }
                    } else {
                        skipped += 1;
                    }
                } else {
                    if let Err(e) = tx.execute("INSERT INTO settings (key, value) VALUES (?1, ?2)", params![key, value]) {
                        errors.push(format!("settings: Insert error for {}: {}", key, e));
                    } else {
                        imported += 1;
                    }
                }
            }
            "item_price_history" => {
                let item_id = match get_i32("item_id") {
                    Some(id) => id,
                    None => {
                        errors.push("item_price_history: Row missing item_id".to_string());
                        continue;
                    }
                };
                let year = get_str("year").unwrap_or_default();
                let price = get_f64("price").unwrap_or(0.0);

                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM item_price_history WHERE item_id = ?1 AND year = ?2)",
                    params![item_id, year],
                    |r| r.get(0)
                ).unwrap_or(false);

                if exists {
                    if duplicate_policy == "overwrite" {
                        if let Err(e) = tx.execute("UPDATE item_price_history SET price = ?1 WHERE item_id = ?2 AND year = ?3", params![price, item_id, year]) {
                            errors.push(format!("item_price_history: Update error for {}-{}: {}", item_id, year, e));
                        } else {
                            imported += 1;
                        }
                    } else {
                        skipped += 1;
                    }
                } else {
                    if let Err(e) = tx.execute("INSERT INTO item_price_history (item_id, year, price) VALUES (?1, ?2, ?3)", params![item_id, year, price]) {
                        errors.push(format!("item_price_history: Insert error for {}-{}: {}", item_id, year, e));
                    } else {
                        imported += 1;
                    }
                }
            }
            _ => {}
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;
    backup_db();

    Ok(ImportResult {
        imported,
        skipped,
        errors,
    })
}

#[tauri::command]
fn get_cloud_backup_status() -> Result<CloudBackupStatus, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS backup_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        [],
    ).ok();

    let enabled = get_metadata_val(&conn, "cloud_backup_enabled")?.unwrap_or_default() == "true";
    let email = get_metadata_val(&conn, "cloud_account_email")?;
    let last_backup = get_metadata_val(&conn, "cloud_backup_last_updated")?;

    Ok(CloudBackupStatus {
        is_connected: enabled && email.is_some(),
        account_email: email,
        last_backup_at: last_backup,
    })
}

#[tauri::command]
fn disconnect_google_account() -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS backup_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        [],
    ).ok();

    conn.execute("DELETE FROM backup_metadata WHERE key IN ('cloud_backup_enabled', 'cloud_account_email', 'cloud_refresh_token', 'cloud_backup_last_updated')", []).ok();
    Ok(())
}

fn percent_decode(s: &str) -> String {
    let mut bytes = Vec::new();
    let input = s.as_bytes();
    let mut i = 0;
    while i < input.len() {
        if input[i] == b'%' && i + 2 < input.len() {
            let h1 = input[i + 1];
            let h2 = input[i + 2];
            if let Ok(val) = u8::from_str_radix(std::str::from_utf8(&[h1, h2]).unwrap_or(""), 16) {
                bytes.push(val);
                i += 3;
                continue;
            }
        }
        if input[i] == b'+' {
            bytes.push(b' ');
        } else {
            bytes.push(input[i]);
        }
        i += 1;
    }
    String::from_utf8(bytes).unwrap_or_else(|_| s.to_string())
}

#[tauri::command]
async fn connect_google_account_pkce(
    code_challenge: String,
    port: u16,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let client_id = get_setting_val(&conn, "google_client_id")?
        .unwrap_or_else(|| GOOGLE_CLIENT_ID.to_string());

    let oauth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri=http://127.0.0.1:{}&response_type=code&scope=https://www.googleapis.com/auth/drive.file%20https://www.googleapis.com/auth/userinfo.email&access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256",
        client_id, port, code_challenge
    );

    app_handle.opener().open_url(&oauth_url, None::<String>).map_err(|e| e.to_string())?;

    let server_addr = format!("127.0.0.1:{}", port);
    let server = tiny_http::Server::http(&server_addr).map_err(|e| format!("Failed to start local redirect server: {}", e))?;

    let start_time = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(120);
    let mut code = None;

    while start_time.elapsed() < timeout {
        match server.recv_timeout(std::time::Duration::from_secs(1)) {
            Ok(Some(request)) => {
                let url = request.url().to_string();
                if let Some(pos) = url.find("code=") {
                    let code_part = &url[pos + 5..];
                    let end = code_part.find('&').unwrap_or(code_part.len());
                    let decoded_code = percent_decode(&code_part[..end]);
                    code = Some(decoded_code);

                    let response = tiny_http::Response::from_string(
                        "<html><head><style>body { font-family: sans-serif; background: #081a12; color: white; text-align: center; padding-top: 50px; } h1 { color: #10b981; }</style></head><body><h1>Authentication Successful!</h1><p>You can close this tab and return to the application.</p></body></html>"
                    ).with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
                    let _ = request.respond(response);
                    break;
                } else {
                    let response = tiny_http::Response::from_string("Waiting for Google OAuth code...");
                    let _ = request.respond(response);
                }
            }
            _ => {}
        }
    }

    let auth_code = code.ok_or_else(|| "Google connection timed out (no response received)".to_string())?;
    Ok(auth_code)
}

#[tauri::command]
async fn exchange_google_code_pkce(
    code: String,
    code_verifier: String,
    port: u16,
) -> Result<String, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let token_url = "https://oauth2.googleapis.com/token";
    let client_id = get_setting_val(&conn, "google_client_id")?
        .unwrap_or_else(|| GOOGLE_CLIENT_ID.to_string());
    let client_secret = get_setting_val(&conn, "google_client_secret")?
        .or_else(|| GOOGLE_CLIENT_SECRET_DEFAULT.map(|s| s.to_string()));

    let redirect_uri_str = format!("http://127.0.0.1:{}", port);
    let mut params = vec![
        ("client_id", client_id.as_str()),
        ("code", code.as_str()),
        ("code_verifier", code_verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri_str.as_str()),
    ];

    let secret_str;
    if let Some(ref secret) = client_secret {
        secret_str = secret.as_str();
        params.push(("client_secret", secret_str));
    }

    let res = ureq::post(token_url).send_form(&params);

    let response = match res {
        Ok(r) => r,
        Err(ureq::Error::Status(status_code, resp)) => {
            let err_body = resp.into_string().unwrap_or_else(|_| "Failed to read error body".to_string());
            return Err(format!("Token request failed (status {}): {}", status_code, err_body));
        }
        Err(e) => {
            return Err(format!("Token request transport error: {}", e));
        }
    };

    let resp: TokenResponse = response.into_json()
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let refresh_token = resp.refresh_token.ok_or_else(|| "Google did not return a refresh token. If you previously connected, please disconnect and try again (ensure you consent to offline access).".to_string())?;

    let info_url = "https://www.googleapis.com/oauth2/v2/userinfo";
    let user_info: UserInfo = ureq::get(info_url)
        .set("Authorization", &format!("Bearer {}", resp.access_token))
        .call()
        .map_err(|e| format!("UserInfo request failed: {}", e))?
        .into_json()
        .map_err(|e| format!("Failed to parse user info: {}", e))?;

    let email = user_info.email.unwrap_or_else(|| "unknown@gmail.com".to_string());

    conn.execute(
        "CREATE TABLE IF NOT EXISTS backup_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        [],
    ).ok();

    set_metadata_val(&conn, "cloud_refresh_token", &refresh_token)?;
    set_metadata_val(&conn, "cloud_account_email", &email)?;
    set_metadata_val(&conn, "cloud_backup_enabled", "true")?;

    Ok(email)
}

#[tauri::command]
async fn trigger_cloud_backup_now() -> Result<String, String> {
    log_app_event("info", "[Sync] Starting manual cloud backup...");
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| {
        let msg = e.to_string();
        log_app_event("error", &format!("[Sync] Database open failed: {}", msg));
        msg
    })?;

    let refresh_token = get_metadata_val(&conn, "cloud_refresh_token")?
        .ok_or_else(|| {
            let msg = "Not connected to Google".to_string();
            log_app_event("error", &format!("[Sync] {}", msg));
            msg
        })?;

    let client_id = get_setting_val(&conn, "google_client_id")?
        .unwrap_or_else(|| GOOGLE_CLIENT_ID.to_string());
    let client_secret = get_setting_val(&conn, "google_client_secret")?
        .or_else(|| GOOGLE_CLIENT_SECRET_DEFAULT.map(|s| s.to_string()));

    log_app_event("info", &format!("[Sync] Refreshing access token with client ID: {}...", client_id));
    let access_token = refresh_access_token(&client_id, client_secret, &refresh_token).map_err(|e| {
        log_app_event("error", &format!("[Sync] Refresh token failed: {}", e));
        e
    })?;

    log_app_event("info", "[Sync] Access token successfully refreshed. Uploading database file...");
    upload_db_to_drive_internal(&db_path, &access_token).map_err(|e| {
        log_app_event("error", &format!("[Sync] Upload database failed: {}", e));
        e
    })?;

    let timestamp: String = conn.query_row(
        "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
        [],
        |row| row.get(0),
    ).unwrap_or_else(|_| "2026-07-06T00:00:00Z".to_string());

    set_metadata_val(&conn, "cloud_backup_last_updated", &timestamp)?;
    
    // Update LAST_SYNC_FILE_MTIME for manual backups too
    if let Some(new_mtime) = get_file_mtime(&db_path) {
        LAST_SYNC_FILE_MTIME.store(new_mtime, Ordering::SeqCst);
    }

    log_app_event("info", &format!("[Sync] Cloud backup completed successfully at {}", timestamp));

    Ok(timestamp)
}

#[tauri::command]
async fn restore_from_google_backup() -> Result<String, String> {
    log_app_event("info", "[Sync] Starting database restore from Google Drive (auto-selecting newest)...");
    let backups = list_cloud_backups().await?;
    let newest = backups.first().ok_or("No backups found on Google Drive to restore from.")?;
    restore_from_google_backup_file(newest.path.clone()).await
}

// --- MODULE INVOCATION ENTRY ---

use std::sync::atomic::{AtomicU64, Ordering};
static LAST_SYNC_FILE_MTIME: AtomicU64 = AtomicU64::new(0);

fn get_file_mtime(path: &std::path::Path) -> Option<u64> {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

fn seconds_since_last_backup(conn: &Connection) -> Result<Option<i64>, String> {
    let res: Option<i64> = conn.query_row(
        "SELECT CAST((strftime('%s', 'now') - strftime('%s', value)) AS INTEGER) FROM backup_metadata WHERE key = 'cloud_backup_last_updated'",
        [],
        |r| r.get(0)
    )
    .optional()
    .map_err(|e| e.to_string())?;
    Ok(res)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();
    #[cfg(target_os = "windows")]
    {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-features=CalculateWindowOcclusion --disable-background-timer-throttling --disable-backgrounding-occluded-windows");
    }

    // Initialize DB schema and seed starting mock entries
    if let Err(e) = init_db() {
        eprintln!("Database initialization failed critical check: {}", e);
    }

    // Spawn background cloud backup thread (checks every 10 seconds)
    std::thread::spawn(|| {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(10));
            if let Ok(db_path) = resolve_db_path() {
                if db_path.exists() {
                    if let Ok(conn) = Connection::open(&db_path) {
                        let enabled = get_metadata_val(&conn, "cloud_backup_enabled").unwrap_or(None).unwrap_or_default() == "true";
                        if enabled {
                            let freq = get_setting_val(&conn, "cloud_sync_frequency")
                                .unwrap_or(None)
                                .unwrap_or_else(|| "30m".to_string());

                            let mut should_backup = false;

                            if freq == "manual" {
                                // Do nothing
                            } else if freq == "after_change" {
                                let mtime = get_file_mtime(&db_path).unwrap_or(0);
                                let last_sync_mtime = LAST_SYNC_FILE_MTIME.load(Ordering::SeqCst);
                                if last_sync_mtime == 0 {
                                    // Initialize on first check so we don't trigger immediately at startup unless changed
                                    LAST_SYNC_FILE_MTIME.store(mtime, Ordering::SeqCst);
                                } else if mtime > last_sync_mtime {
                                    should_backup = true;
                                }
                            } else {
                                // Time-based frequency
                                let limit_secs = match freq.as_str() {
                                    "5m" => 300,
                                    "10m" => 600,
                                    "15m" => 900,
                                    "30m" => 1800,
                                    "1h" => 3600,
                                    _ => 1800, // Default to 30m
                                };

                                match seconds_since_last_backup(&conn) {
                                    Ok(Some(secs)) => {
                                        if secs >= limit_secs {
                                            should_backup = true;
                                        }
                                    }
                                    Ok(None) => {
                                        // Never backed up, sync now
                                        should_backup = true;
                                    }
                                    Err(_) => {}
                                }
                            }

                            if should_backup {
                                let refresh_token = get_metadata_val(&conn, "cloud_refresh_token").ok().flatten();

                                if let Some(token) = refresh_token {
                                    let client_id = get_setting_val(&conn, "google_client_id")
                                        .unwrap_or(None)
                                        .unwrap_or_else(|| GOOGLE_CLIENT_ID.to_string());
                                    let client_secret = get_setting_val(&conn, "google_client_secret")
                                        .unwrap_or(None)
                                        .or_else(|| GOOGLE_CLIENT_SECRET_DEFAULT.map(|s| s.to_string()));

                                    if let Ok(access_token) = refresh_access_token(&client_id, client_secret, &token) {
                                        if let Ok(_) = upload_db_to_drive_internal(&db_path, &access_token) {
                                            let timestamp: String = conn.query_row(
                                                "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
                                                [],
                                                |row| row.get(0),
                                            ).unwrap_or_else(|_| "2026-07-06T00:00:00Z".to_string());
                                            let _ = set_metadata_val(&conn, "cloud_backup_last_updated", &timestamp);
                                            
                                            // Update LAST_SYNC_FILE_MTIME with file mtime after SQLite transaction completes
                                            if let Some(new_mtime) = get_file_mtime(&db_path) {
                                                LAST_SYNC_FILE_MTIME.store(new_mtime, Ordering::SeqCst);
                                            }
                                            eprintln!("[Cloud Backup] Success at {}", timestamp);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            
            // Listen for request-log-history from the developer console to replay Rust logs
            let app_handle_clone = app.handle().clone();
            app.listen("request-log-history", move |_event| {
                if let Ok(buffer) = BACKEND_LOG_BUFFER.lock() {
                    use tauri::Emitter;
                    for log in buffer.iter() {
                        let _ = app_handle_clone.emit("app-log", log.clone());
                    }
                }
            });

            log_app_event("info", "Tauri application setup initialized");
            if let Ok(db_path) = resolve_db_path() {
                log_app_event("info", &format!("Database path resolved to: {}", db_path.to_string_lossy()));
                if let Some(db_dir) = db_path.parent() {
                    let bypass_path = db_dir.join("developer.bypass");
                    if bypass_path.exists() || cfg!(debug_assertions) {
                        log_app_event("info", "Developer console bypass file or debug assertion detected. Launching developer window...");
                        let _win = tauri::WebviewWindowBuilder::new(
                            app,
                            "developer",
                            tauri::WebviewUrl::App("index.html?window=developer".into())
                        )
                        .title("THC Fireworks Developer Console")
                        .inner_size(700.0, 600.0)
                        .resizable(true)
                        .build();
                    }
                }
            }
            log_app_event("info", "Tauri setup completed");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_db_path,
            get_items,
            get_item_by_barcode,
            add_item,
            update_item_stock,
            update_item_details,
            delete_item,
            link_existing_item_as_bulk,
            get_discounts,
            add_discount,
            update_discount,
            delete_discount,
            complete_sale,
            get_sales,
            delete_sale,
            get_yearly_sales_summary,
            get_daily_sales_summary,
            get_payment_methods,
            save_payment_method,
            add_payment_method,
            delete_payment_method,
            update_sale_payment,
            refund_sale,
            seed_historical_sales,
            get_item_price_history,
            get_setting,
            save_setting,
            get_taxes,
            add_tax,
            update_tax,
            delete_tax,
            delete_database_and_backup,
            toggle_playback_window,
            save_showcase_video,
            get_video_url,
            select_local_video,
            get_backup_restore_info,
            pick_export_folder,
            export_tables_to_csv,
            pick_import_folder,
            scan_import_folder,
            import_tables_from_csv,
            clear_selected_tables,
            pick_save_file,
            pick_import_file,
            read_binary_file,
            write_binary_file,
            get_table_rows,
            import_items_batch,
            import_table_rows_batch,
            export_database_file,
            import_database_file,
            get_cloud_backup_status,
            disconnect_google_account,
            connect_google_account_pkce,
            exchange_google_code_pkce,
            trigger_cloud_backup_now,
            restore_from_google_backup,
            list_local_backups,
            list_cloud_backups,
            restore_from_local_backup_file,
            restore_from_google_backup_file,
            check_developer_bypass,
            open_developer_window,
            seed_test_data,
            godaddy_ping_terminal,
            godaddy_pair_terminal,
            godaddy_initiate_payment,
            godaddy_print_receipt,
            godaddy_refund_transaction,
            godaddy_void_transaction,
            godaddy_discover_terminals,
            godaddy_show_second_screen,
            godaddy_scan_barcode,
            godaddy_start_sidecar,
            list_system_printers,
            list_system_keyboards,
            print_to_named_printer,
            log_event,
            open_logs_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_setting(key: String) -> Result<Option<String>, String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    // Ensure settings table exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
        [],
    ).ok();

    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let val: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(Some(val))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_setting(key: String, value: String) -> Result<(), String> {
    let db_path = resolve_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    // Ensure settings table exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
        [],
    ).ok();

    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
         params![key, value],
    ).map_err(|e| e.to_string())?;

    backup_db();
    log_app_event("info", &format!("[DB] Saved setting '{}' = '{}'", key, value));
    Ok(())
}



fn get_setting_val(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let val: Option<String> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |r| r.get(0)
    )
    .optional()
    .map_err(|e| e.to_string())?;
    Ok(val)
}

#[tauri::command]
fn check_developer_bypass() -> Result<bool, String> {
    let db_path = resolve_db_path()?;
    let db_dir = db_path.parent().ok_or_else(|| "Failed to get db directory".to_string())?;
    let bypass_path = db_dir.join("developer.bypass");
    Ok(bypass_path.exists() || cfg!(debug_assertions))
}

#[tauri::command]
async fn open_developer_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if !check_developer_bypass().unwrap_or(false) {
        return Err("Unauthorized: Developer bypass is not active".to_string());
    }
    if app_handle.get_webview_window("developer").is_none() {
        let _win = tauri::WebviewWindowBuilder::new(
            &app_handle,
            "developer",
            tauri::WebviewUrl::App("index.html?window=developer".into())
        )
        .title("THC Fireworks Developer Console")
        .inner_size(700.0, 600.0)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;
    } else if let Some(win) = app_handle.get_webview_window("developer") {
        let _ = win.set_focus();
    }
    Ok(())
}

fn is_godaddy_mock_enabled() -> bool {
    let db_path = match resolve_db_path() {
        Ok(p) => p,
        Err(_) => return false,
    };
    let db_dir = match db_path.parent() {
        Some(d) => d,
        None => return false,
    };
    if !db_dir.join("developer.bypass").exists() && !cfg!(debug_assertions) {
        return false;
    }
    if let Ok(conn) = Connection::open(&db_path) {
        if let Ok(Some(val)) = get_setting_val(&conn, "dev_godaddy_mock_enabled") {
            return val == "true";
        }
    }
    false
}

fn get_godaddy_mock_behavior() -> String {
    let db_path = match resolve_db_path() {
        Ok(p) => p,
        Err(_) => return "approve".to_string(),
    };
    if let Ok(conn) = Connection::open(&db_path) {
        if let Ok(Some(val)) = get_setting_val(&conn, "dev_godaddy_mock_behavior") {
            return val;
        }
    }
    "approve".to_string()
}

#[tauri::command]
fn seed_test_data() -> Result<(), String> {
    if !check_developer_bypass().unwrap_or(false) {
        return Err("Unauthorized: Developer bypass is not active".to_string());
    }
    let db_path = resolve_db_path()?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Clear tables
    tx.execute("DELETE FROM sale_items", []).ok();
    tx.execute("DELETE FROM sales", []).ok();
    tx.execute("DELETE FROM items", []).ok();
    tx.execute("DELETE FROM item_price_history", []).ok();
    tx.execute("DELETE FROM discounts", []).ok();
    tx.execute("DELETE FROM taxes", []).ok();
    
    // Reset sequences
    tx.execute("DELETE FROM sqlite_sequence WHERE name IN ('sale_items', 'sales', 'items', 'item_price_history', 'discounts', 'taxes')", []).ok();
    
    // Seed taxes
    tx.execute("INSERT INTO taxes (name, rate, scope) VALUES ('Missouri Sales Tax', 8.475, 'total')", []).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO taxes (name, rate, scope) VALUES ('County Firework Surcharge', 1.5, 'item')", []).map_err(|e| e.to_string())?;
    
    // Seed catalog items
    // (barcode, name, price, stock, notes, bulk_barcode, bulk_price, bulk_quantity, unit_cost, tax_id, video_path, discount_tags)
    let fireworks: Vec<(&str, &str, f64, Option<i32>, Option<&str>, Option<&str>, Option<f64>, Option<i32>, Option<f64>, Option<i32>, Option<&str>, Option<&str>)> = vec![
        ("1001", "Red Hot Sparklers (10-pack)", 4.99, Some(148), Some("Classic morning glory wire sparklers — crowd favorite for all ages"),
            Some("1001-CASE"), Some(44.99), Some(12), Some(1.85), Some(2), None, Some("sparkler")),
        ("1002", "Roman Candle (8-shot)", 9.99, Some(72), Some("Multi-color shooting stars with report — always a bestseller"),
            Some("1002-CASE"), Some(69.99), Some(8), Some(4.20), Some(2),
            Some("https://youtu.be/QGJuMBdaqIw?si=rbAQALDmb94bF1MI"), Some("candle")),
        ("1003", "Golden Willow Reloadable Shells (6-pk)", 39.99, Some(38), Some("Professional-grade 60mm aerial reloadables with golden willow breaks"),
            Some("1003-CASE"), Some(219.99), Some(6), Some(18.50), Some(2), None, Some("aerial")),
        ("1004", "Liberty Fountain", 14.99, Some(55), Some("Golden sparks with alternating red and blue star bursts — 90 second show"),
            Some("1004-CASE"), Some(99.99), Some(8), Some(5.80), Some(2), None, None),
        ("1005", "Mega Blast Repeater Cake (500g)", 49.99, Some(22), Some("Heavy 500-gram fan cake with 49 shots and finale sequence"),
            Some("1005-CASE"), Some(169.99), Some(4), Some(22.00), Some(2),
            Some("https://youtu.be/jFWnVdsSgxs?si=Rxg8TkfImD8UQAs9"), None),
        ("1006", "Sky Rockets (12-pack)", 19.99, Some(46), Some("High-flying whistle report rockets with colorful star bursts at peak altitude"),
            Some("1006-CASE"), Some(139.99), Some(10), Some(8.00), Some(2), None, None),
        ("1007", "Patriot Smoke Grenades (6-pack)", 7.99, Some(95), Some("Ultra-dense patriotic red white and blue smoke canisters — 60 seconds each"),
            Some("1007-CASE"), Some(79.99), Some(12), Some(3.25), Some(2), None, None),
        ("1008", "Crackling Ground Blooms (20-pack)", 3.99, Some(210), Some("Spinning color-changing ground spinners with gold crackle finale"),
            Some("1008-CASE"), Some(59.99), Some(20), Some(1.40), Some(2), None, None),
        ("1009", "Pharaoh's Gold Fountain", 24.99, Some(30), Some("Long-lasting 3-stage multi-color fountain with 3-minute display"),
            Some("1009-CASE"), Some(134.99), Some(6), Some(10.50), Some(2), None, None),
        ("1010", "Uncle Sam Grand Finale Cake", 89.99, Some(12), Some("Maximum-charge 100-shot grand finale — the show stopper"),
            Some("1010-CASE"), Some(319.99), Some(4), Some(42.00), Some(2),
            Some("https://youtu.be/QGJuMBdaqIw?si=rbAQALDmb94bF1MI"), None),
        ("1011", "Color Peony Shells (12-pack)", 29.99, Some(44), Some("Vivid multi-color peony breaks with long hang time — stunning night display"),
            Some("1011-CASE"), Some(179.99), Some(6), Some(13.50), Some(2), None, None),
        ("1012", "Saturn Missile Battery (200-shot)", 12.99, Some(68), Some("200-shot rapid-fire saturn missile battery — fills the sky in under a minute"),
            Some("1012-CASE"), Some(89.99), Some(8), Some(5.50), Some(2), None, None),
        ("1013", "Dragon Eggs (50-count)", 5.99, Some(130), Some("Crackling dragon egg ground effects with gold and silver crackle"),
            Some("1013-CASE"), Some(54.99), Some(12), Some(2.30), Some(2), None, None),
        ("1014", "Artillery Shell Kit (60-shot)", 59.99, Some(18), Some("Professional 60mm mortar kit with 60 assorted break shells — reloadable tube included"),
            Some("1014-CASE"), Some(219.99), Some(4), Some(28.00), Some(2),
            Some("https://youtu.be/jFWnVdsSgxs?si=Rxg8TkfImD8UQAs9"), None),
        ("1015", "Piccolo Pete Whistlers (24-pack)", 3.49, Some(175), Some("Classic whistling ground firework — the original noise maker since 1953"),
            Some("1015-CASE"), Some(34.99), Some(12), Some(1.30), Some(2), None, Some("sparkler")),
        ("1016", "Red White & Blue Finale Cake", 34.99, Some(27), Some("Patriotic 36-shot finale cake alternating red white and blue bursts"),
            Some("1016-CASE"), Some(124.99), Some(4), Some(15.00), Some(2),
            Some("https://youtu.be/QGJuMBdaqIw?si=rbAQALDmb94bF1MI"), None),
        ("1017", "Confetti Poppers (12-pack)", 1.99, Some(280), Some("Safe for all ages — pull-string confetti poppers for kids and celebrations"),
            None, None, None, Some(0.65), Some(1), None, None),
        ("1018", "Family Fun Assortment Box", 49.99, Some(9), Some("Curated family-safe assortment — ground effects sparklers smoke and poppers"),
            None, None, None, Some(22.00), Some(1), None, None),
    ];
    
    for (bar, name, pr, stock, notes, bbar, bpr, bqty, cost, tax, video, tags) in &fireworks {
        tx.execute(
            "INSERT INTO items (barcode, name, price, stock_quantity, notes, bulk_barcode, bulk_price, bulk_quantity, unit_cost, tax_id, video_path, discount_tags) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![bar, name, pr, stock, notes, bbar, bpr, bqty, cost, tax, video, tags],
        ).map_err(|e| e.to_string())?;
    }

    // Seed discounts with all permutations
    tx.execute("INSERT INTO discounts (name, type, value, qualifier_type, reward_type, reward_value, reward_value_type, is_stackable) 
                VALUES ('Church Member (10%)', 'percentage', 10.0, 'manual', 'order_discount', 10.0, 'percentage', 1)", []).map_err(|e| e.to_string())?;

    tx.execute("INSERT INTO discounts (name, type, value, qualifier_type, reward_type, reward_value, reward_value_type, is_stackable) 
                VALUES ('Manager Special ($10)', 'fixed', 10.0, 'manual', 'order_discount', 10.0, 'fixed', 1)", []).map_err(|e| e.to_string())?;

    tx.execute("INSERT INTO discounts (name, type, value, qualifier_type, qualifier_value, reward_type, reward_value, reward_value_type, reward_quantity, discount_tag, is_stackable) 
                VALUES ('Mix-and-Match: Buy 2 Sparklers get Cheapest 50% Off', 'percentage', 0.0, 'item_quantity', 2, 'lowest_cost_item', 50.0, 'percentage', 1, 'sparkler', 1)", []).map_err(|e| e.to_string())?;

    tx.execute("INSERT INTO discounts (name, type, value, qualifier_type, qualifier_value, reward_type, reward_value, reward_quantity, discount_tag, is_stackable) 
                VALUES ('3 Sparklers for $10 Bundle', 'fixed', 0.0, 'item_quantity', 3, 'items_for_price', 10.00, 3, 'sparkler', 1)", []).map_err(|e| e.to_string())?;

    tx.execute("INSERT INTO discounts (name, type, value, qualifier_type, qualifier_value, reward_type, reward_target_item_id, reward_value, reward_value_type, reward_quantity, is_stackable) 
                VALUES ('Free Golden Willow Shell on orders over $100', 'percentage', 0.0, 'order_total', 100.0, 'item_discount_qty', 3, 100.0, 'percentage', 1, 1)", []).map_err(|e| e.to_string())?;

    tx.execute("INSERT INTO discounts (name, type, value, qualifier_type, reward_type, reward_target_item_id, reward_value, reward_value_type, is_stackable) 
                VALUES ('Cashier Special: 25% off all Roman Candles', 'percentage', 0.0, 'manual', 'item_discount_all', 2, 25.0, 'percentage', 1)", []).map_err(|e| e.to_string())?;

    tx.execute("INSERT INTO discounts (name, type, value, qualifier_type, reward_type, reward_value, reward_value_type, max_limit_per_order, value_cap, is_stackable) 
                VALUES ('Unstackable VIP Discount ($15 Cap)', 'fixed', 15.0, 'manual', 'order_discount', 15.0, 'fixed', 1, 15.0, 0)", []).map_err(|e| e.to_string())?;
    
    // Seed realistic per-item price history (items had different prices in prior years)
    let price_history: Vec<(i32, &str, f64)> = vec![
        (1,  "2023", 3.99),  (1,  "2024", 4.49),  (1,  "2025", 4.99),
        (2,  "2023", 7.99),  (2,  "2024", 8.99),  (2,  "2025", 9.99),
        (3,  "2023", 32.99), (3,  "2024", 36.99), (3,  "2025", 39.99),
        (4,  "2023", 11.99), (4,  "2024", 12.99), (4,  "2025", 14.99),
        (5,  "2023", 39.99), (5,  "2024", 44.99), (5,  "2025", 49.99),
        (6,  "2023", 14.99), (6,  "2024", 17.99), (6,  "2025", 19.99),
        (7,  "2023", 5.99),  (7,  "2024", 6.99),  (7,  "2025", 7.99),
        (8,  "2023", 2.49),  (8,  "2024", 2.99),  (8,  "2025", 3.99),
        (9,  "2023", 19.99), (9,  "2024", 21.99), (9,  "2025", 24.99),
        (10, "2023", 69.99), (10, "2024", 79.99), (10, "2025", 89.99),
        (11, "2023", 24.99), (11, "2024", 27.99), (11, "2025", 29.99),
        (12, "2023", 9.99),  (12, "2024", 10.99), (12, "2025", 12.99),
        (13, "2023", 4.49),  (13, "2024", 4.99),  (13, "2025", 5.99),
        (14, "2023", 49.99), (14, "2024", 54.99), (14, "2025", 59.99),
        (15, "2023", 2.49),  (15, "2024", 2.99),  (15, "2025", 3.49),
        (16, "2023", 27.99), (16, "2024", 31.99), (16, "2025", 34.99),
        (17, "2023", 1.49),  (17, "2024", 1.75),  (17, "2025", 1.99),
        (18, "2023", 39.99), (18, "2024", 44.99), (18, "2025", 49.99),
    ];
    for (item_id, year, price) in &price_history {
        tx.execute(
            "INSERT INTO item_price_history (item_id, year, price) VALUES (?1, ?2, ?3)",
            params![item_id, year, price],
        ).ok();
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    // Call historical Sales seeder (2023-2025)
    seed_historical_sales()?;
    
    // Seed 2026 current-year sales with much more variety
    let mut conn2 = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let tx = conn2.transaction().map_err(|e| e.to_string())?;
    let sales_2026: Vec<(&str, f64, f64, f64, f64)> = vec![
        ("2026-07-01 09:30:00", 34.97,   0.00,  0.00,  34.97),
        ("2026-07-01 11:15:00", 89.94,   9.00,  0.00,  80.94),
        ("2026-07-01 13:45:00", 159.91,  0.00,  0.00, 159.91),
        ("2026-07-01 16:00:00", 54.97,   8.25,  0.00,  46.72),
        ("2026-07-02 08:45:00", 119.93,  0.00,  0.00, 119.93),
        ("2026-07-02 10:30:00", 249.88, 37.48,  0.00, 212.40),
        ("2026-07-02 13:00:00", 419.83,  0.00,  0.00, 419.83),
        ("2026-07-02 15:30:00", 179.91, 18.00,  0.00, 161.91),
        ("2026-07-02 17:45:00", 89.97,   0.00,  0.00,  89.97),
        ("2026-07-03 09:00:00", 299.87,  0.00,  0.00, 299.87),
        ("2026-07-03 10:45:00", 589.77, 88.47,  0.00, 501.30),
        ("2026-07-03 12:30:00", 899.66,  0.00,  0.00, 899.66),
        ("2026-07-03 14:15:00", 449.84, 67.48,  0.00, 382.36),
        ("2026-07-03 16:00:00", 1249.57, 0.00,  0.00, 1249.57),
        ("2026-07-03 18:30:00", 699.76, 104.97, 0.00, 594.79),
        ("2026-07-04 08:00:00", 549.83,  0.00,  0.00, 549.83),
        ("2026-07-04 09:30:00", 1199.61, 179.94, 0.00, 1019.67),
        ("2026-07-04 11:00:00", 2399.25, 0.00,  0.00, 2399.25),
        ("2026-07-04 12:30:00", 3199.00, 479.85, 0.00, 2719.15),
        ("2026-07-04 14:00:00", 1799.43, 0.00,  0.00, 1799.43),
        ("2026-07-04 16:00:00", 879.71,  131.96, 0.00, 747.75),
    ];
    for (ts, sub, disc, tax, final_val) in &sales_2026 {
        tx.execute(
            "INSERT INTO sales (timestamp, subtotal, discount_total, tax_total, final_total) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![ts, sub, disc, tax, final_val],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    // Seed total_stock_cost_spent setting (realistic yearly inventory investment)
    let conn3 = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn3.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('total_stock_cost_spent', '18450.00')",
        [],
    ).ok();
    
    backup_db();
    
    Ok(())
}

fn rand_number() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// --- GoDaddy Terminal Bridge Sidecar Management & Integrations ---

struct SidecarConnection {
    child: Child,
}

static SIDECAR: OnceLock<Mutex<Option<SidecarConnection>>> = OnceLock::new();

fn get_sidecar_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    app_handle.path().resource_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("binaries")
        .join("godaddy-bridge.exe")
}

fn get_or_start_sidecar(app_handle: &tauri::AppHandle) -> Result<std::sync::MutexGuard<'static, Option<SidecarConnection>>, String> {
    let mutex = SIDECAR.get_or_init(|| Mutex::new(None));
    let mut guard = mutex.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    
    let needs_start = match &mut *guard {
        Some(conn) => {
            // Check if process has exited
            match conn.child.try_wait() {
                Ok(Some(_status)) => true, // exited
                Ok(None) => false, // still running
                Err(_) => true, // error checking, restart
            }
        }
        None => true,
    };
    
    if needs_start {
        let exe_path = get_sidecar_path(app_handle);
        if !exe_path.exists() {
            return Err(format!("GoDaddy bridge sidecar not found at {:?}", exe_path));
        }
        
        let mut cmd = Command::new(&exe_path);
        cmd.stdin(Stdio::piped())
           .stdout(Stdio::piped())
           .stderr(Stdio::null());
           
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        
        let child = cmd.spawn().map_err(|e| format!("Failed to start sidecar: {}", e))?;
        *guard = Some(SidecarConnection { child });
    }
    
    Ok(guard)
}

fn call_sidecar(app_handle: &tauri::AppHandle, cmd: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut guard = get_or_start_sidecar(app_handle)?;
    let conn = guard.as_mut().ok_or("Sidecar connection not initialized")?;
    
    let request_id = rand_number().to_string();
    let request = json!({
        "id": request_id,
        "cmd": cmd,
        "params": params
    });
    
    let stdin = conn.child.stdin.as_mut().ok_or("Failed to open sidecar stdin")?;
    let stdout = conn.child.stdout.as_mut().ok_or("Failed to open sidecar stdout")?;
    
    let request_str = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;
        
    writeln!(stdin, "{}", request_str)
        .map_err(|e| format!("Failed to write to sidecar: {}", e))?;
    stdin.flush().map_err(|e| format!("Failed to flush sidecar stdin: {}", e))?;
    
    let mut reader = BufReader::new(stdout);
    let mut response_line = String::new();
    reader.read_line(&mut response_line)
        .map_err(|e| format!("Failed to read response from sidecar: {}", e))?;
        
    let response: Value = serde_json::from_str(&response_line)
        .map_err(|e| format!("Failed to parse response: {}", e))?;
        
    if response["id"].as_str() != Some(&request_id) {
        return Err("Mismatched request/response ID from sidecar".to_string());
    }
    
    let success = response["success"].as_bool().unwrap_or(false);
    if !success {
        let err_msg = response["error"].as_str().unwrap_or("Unknown sidecar error");
        return Err(err_msg.to_string());
    }
    
    Ok(response["data"].clone())
}

#[tauri::command]
fn godaddy_ping_terminal(app_handle: tauri::AppHandle, ip: String) -> Result<bool, String> {
    log_app_event("info", &format!("[GoDaddy] Ping terminal started for IP: {}", ip));
    if is_godaddy_mock_enabled() {
        let behavior = get_godaddy_mock_behavior();
        if behavior == "timeout" {
            std::thread::sleep(std::time::Duration::from_millis(2000));
            log_app_event("error", "[GoDaddy] Mock ping terminal timed out");
            return Err("Mock timeout error connecting to terminal".to_string());
        }
        log_app_event("info", "[GoDaddy] Mock ping terminal online");
        return Ok(true);
    }
    
    let key = match get_setting("godaddy_pairing_token".to_string()) {
        Ok(Some(k)) => k,
        _ => "".to_string()
    };

    match call_sidecar(&app_handle, "ping", json!({ "ip": ip, "key": key })) {
        Ok(res) => {
            let online = res["online"].as_bool().unwrap_or(false);
            log_app_event("info", &format!("[GoDaddy] Ping terminal online: {}", online));
            Ok(online)
        }
        Err(e) => {
            log_app_event("error", &format!("[GoDaddy] Ping terminal failed: {}", e));
            Err(e)
        }
    }
}

#[tauri::command]
fn godaddy_pair_terminal(app_handle: tauri::AppHandle, ip: String, pairing_code: String) -> Result<String, String> {
    log_app_event("info", &format!("[GoDaddy] Pairing terminal started for IP: {} code: {}", ip, pairing_code));
    if is_godaddy_mock_enabled() {
        use tauri::Emitter;
        let _ = app_handle.emit("mock-terminal-event", json!({
            "type": "pair",
            "pairingCode": pairing_code.clone()
        }));
        std::thread::sleep(std::time::Duration::from_millis(1000));
        let behavior = get_godaddy_mock_behavior();
        if behavior == "decline" {
            log_app_event("error", "[GoDaddy] Mock pairing declined by terminal");
            return Err("Mock pairing declined: Invalid pairing code".to_string());
        } else if behavior == "timeout" {
            log_app_event("error", "[GoDaddy] Mock pairing timed out");
            return Err("Mock pairing timed out".to_string());
        }
        if pairing_code.len() != 6 {
            log_app_event("error", "[GoDaddy] Mock pairing failed: Invalid code length");
            return Err("Invalid pairing code. Code must be 6 digits.".to_string());
        }
        log_app_event("info", "[GoDaddy] Mock pairing succeeded");
        return Ok("mock_pairing_token_123456".to_string());
    }

    match call_sidecar(&app_handle, "pair", json!({
        "ip": ip,
        "pairingCode": pairing_code
    })) {
        Ok(res) => {
            let paired = res["paired"].as_bool().unwrap_or(false);
            if !paired {
                log_app_event("error", "[GoDaddy] Pairing failed (paired=false)");
                return Err("Pairing failed. Check pairing code and terminal state.".to_string());
            }

            let key = res["key"].as_str().unwrap_or("").to_string();
            if key.is_empty() {
                log_app_event("error", "[GoDaddy] Pairing failed: Empty pairing key returned");
                return Err("No pairing key returned from terminal.".to_string());
            }

            log_app_event("info", "[GoDaddy] Pairing succeeded and pairing key stored");
            Ok(key)
        }
        Err(e) => {
            log_app_event("error", &format!("[GoDaddy] Pairing failed with error: {}", e));
            Err(e)
        }
    }
}

#[tauri::command]
fn godaddy_initiate_payment(
    app_handle: tauri::AppHandle,
    ip: String,
    token: String,
    amount_cents: i64,
    sale_id: String
) -> Result<String, String> {
    log_app_event("info", &format!("[GoDaddy] Initiating payment of {} cents for Sale ID: {}", amount_cents, sale_id));
    if is_godaddy_mock_enabled() {
        use tauri::Emitter;
        let behavior = get_godaddy_mock_behavior();
        let _ = app_handle.emit("mock-terminal-event", json!({
            "type": "sale",
            "amount": amount_cents,
            "saleId": sale_id.clone(),
            "behavior": behavior.clone()
        }));
        if behavior == "decline" {
            std::thread::sleep(std::time::Duration::from_millis(2000));
            log_app_event("error", "[GoDaddy] Mock payment declined");
            return Err("GoDaddy Smart Terminal communication failed: Transaction declined by customer".to_string());
        } else if behavior == "timeout" {
            std::thread::sleep(std::time::Duration::from_millis(4000));
            log_app_event("error", "[GoDaddy] Mock payment timed out");
            return Err("GoDaddy Smart Terminal communication failed: Request timed out".to_string());
        }
        std::thread::sleep(std::time::Duration::from_millis(1500));
        let mock_tx = format!("MOCK_TX_{}", rand_number());
        log_app_event("info", &format!("[GoDaddy] Mock payment succeeded: {}", mock_tx));
        return Ok(mock_tx);
    }

    match call_sidecar(&app_handle, "sale", json!({
        "ip": ip,
        "key": token,
        "amount": amount_cents,
        "referenceId": sale_id,
        "timeoutMs": 60000
    })) {
        Ok(res) => {
            let success = res["success"].as_bool().unwrap_or(false);
            if !success {
                let err_details = res["errorDetails"].to_string();
                log_app_event("error", &format!("[GoDaddy] Payment failed: {}", err_details));
                return Err(format!("GoDaddy payment failed: {}", err_details));
            }

            let tx_id = res["transactionId"].as_str().unwrap_or("SUCCESS_TX").to_string();
            log_app_event("info", &format!("[GoDaddy] Payment succeeded. Transaction ID: {}", tx_id));
            Ok(tx_id)
        }
        Err(e) => {
            log_app_event("error", &format!("[GoDaddy] Payment failed with error: {}", e));
            Err(e)
        }
    }
}

#[tauri::command]
fn godaddy_print_receipt(
    app_handle: tauri::AppHandle,
    ip: String,
    token: String,
    receipt_text: String
) -> Result<bool, String> {
    let cleaned_text: String = receipt_text.chars().filter(|c| c.is_ascii()).collect();

    let check_bypass = check_developer_bypass().unwrap_or(false);
    if check_bypass {
        use tauri::Emitter;
        let _ = app_handle.emit("receipt-printed", cleaned_text.clone());
    }

    if is_godaddy_mock_enabled() {
        println!("=== MOCK PRINT TO GODADDY TERMINAL ===\n{}\n======================================", cleaned_text);
        return Ok(true);
    }

    let res = call_sidecar(&app_handle, "print", json!({
        "ip": ip,
        "key": token,
        "receiptText": cleaned_text,
        "timeoutMs": 15000
    }))?;

    let success = res["success"].as_bool().unwrap_or(false);
    Ok(success)
}

#[tauri::command]
fn godaddy_refund_transaction(
    app_handle: tauri::AppHandle,
    ip: String,
    token: String,
    transaction_id: String,
    amount_cents: Option<i64>
) -> Result<String, String> {
    if is_godaddy_mock_enabled() {
        use tauri::Emitter;
        let _ = app_handle.emit("mock-terminal-event", json!({
            "type": "refund",
            "transactionId": transaction_id.clone(),
            "amount": amount_cents
        }));
        std::thread::sleep(std::time::Duration::from_millis(1500));
        return Ok(format!("REFUND_MOCK_{}", rand_number()));
    }

    let res = call_sidecar(&app_handle, "refund", json!({
        "ip": ip,
        "key": token,
        "transactionId": transaction_id,
        "amount": amount_cents,
        "timeoutMs": 60000
    }))?;

    let success = res["success"].as_bool().unwrap_or(false);
    if !success {
        let err_details = res["errorDetails"].to_string();
        return Err(format!("Refund failed: {}", err_details));
    }

    let tx_id = res["transactionId"].as_str().unwrap_or("REFUNDED_TX").to_string();
    Ok(tx_id)
}

#[tauri::command]
fn godaddy_void_transaction(
    app_handle: tauri::AppHandle,
    ip: String,
    token: String,
    transaction_id: String
) -> Result<String, String> {
    if is_godaddy_mock_enabled() {
        use tauri::Emitter;
        let _ = app_handle.emit("mock-terminal-event", json!({
            "type": "void",
            "transactionId": transaction_id.clone()
        }));
        std::thread::sleep(std::time::Duration::from_millis(1000));
        return Ok(format!("VOID_MOCK_{}", rand_number()));
    }

    let res = call_sidecar(&app_handle, "void", json!({
        "ip": ip,
        "key": token,
        "transactionId": transaction_id,
        "timeoutMs": 60000
    }))?;

    let success = res["success"].as_bool().unwrap_or(false);
    if !success {
        let err_details = res["errorDetails"].to_string();
        return Err(format!("Void failed: {}", err_details));
    }

    let tx_id = res["transactionId"].as_str().unwrap_or(&transaction_id).to_string();
    Ok(tx_id)
}

#[tauri::command]
fn godaddy_discover_terminals(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    if is_godaddy_mock_enabled() {
        std::thread::sleep(std::time::Duration::from_millis(1500));
        return Ok(vec!["192.168.1.150".to_string(), "192.168.1.200".to_string()]);
    }

    let res = call_sidecar(&app_handle, "discover", json!({ "timeoutMs": 2000 }))?;
    let ips: Vec<String> = serde_json::from_value(res)
        .map_err(|e| format!("Failed to parse discovered IPs: {}", e))?;
        
    Ok(ips)
}

#[tauri::command]
fn godaddy_show_second_screen(
    app_handle: tauri::AppHandle,
    ip: String,
    token: String,
    total_cents: i64,
    items: serde_json::Value
) -> Result<bool, String> {
    if is_godaddy_mock_enabled() {
        return Ok(true);
    }

    let res = call_sidecar(&app_handle, "second_screen", json!({
        "ip": ip,
        "key": token,
        "total": total_cents,
        "items": items,
        "timeoutMs": 30000
    }))?;

    let success = res["success"].as_bool().unwrap_or(false);
    Ok(success)
}

#[tauri::command]
fn godaddy_scan_barcode(
    app_handle: tauri::AppHandle,
    ip: String,
    token: String
) -> Result<String, String> {
    if is_godaddy_mock_enabled() {
        std::thread::sleep(std::time::Duration::from_millis(2000));
        return Ok("MOCK_LOYALTY_BARCODE_888".to_string());
    }

    let res = call_sidecar(&app_handle, "scan_barcode", json!({
        "ip": ip,
        "key": token
    }))?;

    let status = res["status"].as_str().unwrap_or("");
    if status.to_uppercase() != "SUCCESS" {
        return Err(format!("Barcode scan failed or cancelled. Status: {}", status));
    }

    let result = res["scanResult"].as_str().unwrap_or("").to_string();
    Ok(result)
}

#[tauri::command]
fn godaddy_start_sidecar(app_handle: tauri::AppHandle) -> Result<(), String> {
    if is_godaddy_mock_enabled() {
        return Ok(());
    }
    let _guard = get_or_start_sidecar(&app_handle)?;
    Ok(())
}

#[tauri::command]
fn list_system_printers() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("powershell")
            .args(&["-Command", "Get-Printer | Select-Object -ExpandProperty Name"])
            .output();
        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let mut printers: Vec<String> = stdout
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect();
                if printers.is_empty() {
                    printers.push("Microsoft Print to PDF".to_string());
                }
                Ok(printers)
            }
            Err(_) => {
                Ok(vec!["Microsoft Print to PDF".to_string()])
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![
            "Mock Receipt Thermal 80mm".to_string(),
            "Microsoft Print to PDF".to_string(),
            "EPSON TM-T88VI Receipt Printer".to_string(),
        ])
    }
}

#[tauri::command]
fn list_system_keyboards() -> Result<Vec<String>, String> {
    Ok(vec![
        "Standard PS/2 Keyboard".to_string(),
        "USB Barcode Scanner wedge (HID Keyboard)".to_string(),
    ])
}

#[tauri::command]
fn print_to_named_printer(app_handle: tauri::AppHandle, printer_name: String, text: String) -> Result<bool, String> {
    let check_bypass = check_developer_bypass().unwrap_or(false);
    if check_bypass {
        use tauri::Emitter;
        let _ = app_handle.emit("receipt-printed", text.clone());
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let escaped_text = text.replace("'", "''");
        let output = Command::new("powershell")
            .args(&[
                "-Command",
                &format!("Out-Printer -Name '{}' -InputObject '{}'", printer_name.replace("'", "''"), escaped_text),
            ])
            .output();
        match output {
            Ok(out) => {
                if out.status.success() {
                    Ok(true)
                } else {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    Err(format!("Printer command failed: {}", stderr))
                }
            }
            Err(e) => Err(format!("Failed to initiate printing: {}", e)),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        println!("=== MOCK PRINT TO NAMED PRINTER [{}] ===\n{}\n=======================================", printer_name, text);
        Ok(true)
    }
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
        if let Some(path) = resolve_backup_path() {
            if path.exists() {
                let _ = fs::remove_file(path);
            }
        }
        if let Some(backup_dir) = resolve_backup_dir() {
            if let Ok(entries) = fs::read_dir(backup_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("firework_pos_backup_") && name.ends_with(".db") {
                        let _ = fs::remove_file(entry.path());
                    }
                }
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
            None,
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
            "9999".to_string(),
            "Mega Blast Aerial Edited".to_string(),
            54.99,
            Some(25),
            None,
            None,
            None,
            None,
            None,
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
        let sale_id = complete_sale(cart, subtotal, 0.0, 0.0, subtotal, "Cash".to_string(), None, 0.0)
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
        let checkout_result = complete_sale(bad_cart, bad_subtotal, 0.0, 0.0, bad_subtotal, "Cash".to_string(), None, 0.0);
        assert!(checkout_result.is_err());

        // 8. Verify historical seeder
        assert!(seed_historical_sales().is_ok());
        let summary = get_yearly_sales_summary().expect("Failed to get yearly sales summary");
        assert!(summary.len() >= 3);

        let has_2024 = summary.iter().any(|s| s.year == "2024");
        let has_2025 = summary.iter().any(|s| s.year == "2025");
        assert!(has_2024);
        assert!(has_2025);

        // 9. Verify link_existing_item_as_bulk function
        // Create single item 1
        assert!(add_item(
            "9991".to_string(),
            "Single Sparkler 1".to_string(),
            1.00,
            Some(10),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None
        ).is_ok());
        let single1 = get_item_by_barcode("9991".to_string()).unwrap().unwrap();

        // Create bulk item 1 with unit_cost
        assert!(add_item(
            "9991B".to_string(),
            "Bulk Sparkler Case 1".to_string(),
            15.00,
            Some(5),
            None,
            None,
            None,
            None,
            Some(12.00), // unit_cost
            None,
            None,
            None,
            None,
            None
        ).is_ok());
        let bulk1 = get_item_by_barcode("9991B".to_string()).unwrap().unwrap();

        // Link bulk item 1 to single item 1 (quantity 12)
        assert!(link_existing_item_as_bulk(single1.id, bulk1.id, 12).is_ok());

        // Verify bulk item 1 is deleted (check table by ID directly)
        let bulk_exists: bool = Connection::open(&resolve_db_path().unwrap()).unwrap().query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE id = ?1)",
            params![bulk1.id],
            |r| r.get(0)
        ).unwrap();
        assert!(!bulk_exists);

        // Verify get_item_by_barcode with bulk barcode now resolves to single item
        let resolved_item = get_item_by_barcode("9991B".to_string()).unwrap().unwrap();
        assert_eq!(resolved_item.id, single1.id);

        // Verify single item 1 is updated (bulk_price = unit_cost = 12.00, stock is NOT merged)
        let single1_updated = get_item_by_barcode("9991".to_string()).unwrap().unwrap();
        assert_eq!(single1_updated.bulk_barcode, Some("9991B".to_string()));
        assert_eq!(single1_updated.bulk_price, Some(12.00));
        assert_eq!(single1_updated.bulk_quantity, Some(12));
        assert_eq!(single1_updated.stock_quantity, Some(10)); // stock remains 10 (ignored bulk stock)

        // Create single item 2
        assert!(add_item(
            "9992".to_string(),
            "Single Sparkler 2".to_string(),
            2.00,
            Some(20),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None
        ).is_ok());
        let single2 = get_item_by_barcode("9992".to_string()).unwrap().unwrap();

        // Create bulk item 2 with NO unit_cost (falls back to retail price)
        assert!(add_item(
            "9992B".to_string(),
            "Bulk Sparkler Case 2".to_string(),
            25.00,
            Some(3),
            None,
            None,
            None,
            None,
            None, // unit_cost is None
            None,
            None,
            None,
            None,
            None
        ).is_ok());
        let bulk2 = get_item_by_barcode("9992B".to_string()).unwrap().unwrap();

        // Link bulk item 2 to single item 2 (quantity 24)
        assert!(link_existing_item_as_bulk(single2.id, bulk2.id, 24).is_ok());

        // Verify single item 2 is updated (bulk_price = retail price = 25.00)
        let single2_updated = get_item_by_barcode("9992".to_string()).unwrap().unwrap();
        assert_eq!(single2_updated.bulk_barcode, Some("9992B".to_string()));
        assert_eq!(single2_updated.bulk_price, Some(25.00));
        assert_eq!(single2_updated.bulk_quantity, Some(24));

        cleanup_test_db();
    }

    #[test]
    fn test_percent_decode() {
        assert_eq!(percent_decode("hello"), "hello");
        assert_eq!(percent_decode("4%2F0AdkVLP"), "4/0AdkVLP");
        assert_eq!(percent_decode("hello%20world"), "hello world");
        assert_eq!(percent_decode("hello+world"), "hello world");
        assert_eq!(percent_decode("hello%2fworld"), "hello/world");
    }
}
