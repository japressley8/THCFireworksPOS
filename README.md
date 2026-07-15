# 🎆 THC Fireworks POS — Portable POS & Inventory App

THC Fireworks POS (Thousand Hills Church POS) is a premium, local-first Point of Sale (POS) and Inventory management application designed specifically for seasonal fireworks sales. It runs entirely off a USB flash drive, requiring no installation or internet connection to operate.

> [!IMPORTANT]
> **⚠️ Transaction Processing Disclaimer:**
> While this POS application manages items, tracks active cart totals, generates sales analytics, and prints receipts, it **does not process credit card transactions or electronic funds** directly (unless fully configured and paired with a GoDaddy Smart Terminal). You will need to process credit cards, checks, or cash payments using your own external methods (e.g. standalone merchant reader, cash register) and manually complete the sale in the registry interface to log the transaction.

---

## ✨ Features

* **🎨 Theme Options:** Optimized for indoor, outdoor, and low-light environments. Switch between:
  * **THC Dark** (default) — A deep midnight-green dark mode for indoor or nighttime tent operation.
  * **THC Light** — A bright emerald-toned light mode for daytime use.
  * **Patriotic** — A light-themed palette with off-white/slate background, deep navy text, and patriotic red & blue accents. Ideal for daytime outdoor use.
  * **High Contrast (Sunlight)** — Maximum black-on-white contrast for direct sunlight readability.
* **💳 GoDaddy Smart Terminal Integration:** Process card payments directly using a GoDaddy Smart Terminal Flex v1. Configure the terminal IP and pair using a pairing code in the Settings tab. Initiate card payments at checkout, and print receipts using the terminal's built-in printer.
* **💾 100% USB Portability, Backups & Recovery Banner:** The application database (`firework_pos.db`) is stored in the same folder as the app. Simply copy the portable executable file to a USB drive and plug it into any Windows computer. Includes silent, automatic local backup syncs to `%LOCALAPPDATA%\THCFireworksPOS\` after every change. If the database file goes missing, it auto-restores on startup and alerts the user with a recovery confirmation banner.
* **☁️ Google Drive Cloud Backup:** Configure Google OAuth Client ID and Secret in the Data Management console to link a Google account. The database is synchronized to Google Drive automatically every 30 minutes. Supports manual backup triggers and full database restores directly from your cloud backup.
* **📊 CSV Data Import & Export:** Export any database tables as separate `.csv` spreadsheet files to a directory of your choice. Import spreadsheets back into the POS database with custom duplicate record conflict policies (skip duplicates vs. overwrite existing).
* **🔒 Admin Security & Password Recovery:** Protect manager configurations with an admin password. Setup a custom Security Question & Answer and generate a 16-character Recovery Key for password recovery.
* **📺 Secondary Showcase Playback Screen:** Toggle a secondary video screen via the header button to display high-definition product demonstrations. Includes double-sided playback controls, seek timelines, and silent background `yt-dlp` offline YouTube integration.
* **🚀 Keyboard Wedge Scanner Support & Modal Suppressor:** Scans barcode entries instantly without needing to click into search inputs. The scanner is intelligently gated — it only activates on the **Sales Register** tab, and is automatically suppressed when a modal dialog (such as confirmation overlays, passwords, or warnings) is open. This prevents accidental double-scans or interference with admin dialogs.
* **📦 Catalog & Inventory Audit Ledger:** Real-time stock counts, bulk package pricing support, price adjustments, and a restricted-access warning popup.
* **💸 Sales Taxes & Rules:** Set up total-scope taxes or per-item specific taxes. Support for tax-exempt items.
* **🖨️ Thermal Receipt Printing & Reprinting:** Integrated styling designed to print clean 80mm receipts automatically to standard thermal roll printers. Reprint and view any receipt directly from the Sales Ledger.
* **📊 Analytics & Profit Margin Tracking:** Graph and compare Revenue vs Profit side-by-side in SVG charts. Keep track of net earnings by subtracting item wholesale costs.
* **⚙️ Overselling Controls & Safe Deletion:** Toggle out-of-stock check rules or selectively clear database tables securely in the danger zone using random confirmation codes.
* **🎆 Celebratory Feedback:** Colorful fireworks confetti animations play on successful transactions.
* **🔄 Automatic Updates:** The app automatically checks for updates at startup (if connected to the internet) and opens your web browser to download the latest portable executable directly, keeping your USB drive updated.

---

## 🚀 How to Install & Run (User Walkthrough)

### Which version should I download?

Every release includes two files. Here's how to choose:

| | 🖥️ **Installer** (`THC_Fireworks_Setup.exe`) | 💾 **Portable** (`THC_Fireworks_Portable.exe`) |
|---|---|---|
| **Best for** | A dedicated Windows PC used every year | A USB drive shared between multiple computers |
| **How it works** | Installs the app into Program Files on one machine | Runs directly from any location — no installation needed |
| **Auto-updates** | ✅ One-click in-app update button | ❌ Download the new portable file manually each season |
| **Data storage** | Database is saved next to the `.exe` wherever it lives | Database is saved next to the `.exe` on your USB drive |
| **Requires admin?** | Yes, to install | No |
| **Portable?** | ❌ Tied to that computer | ✅ Plug your USB into any Windows PC and go |

> [!TIP]
> **Not sure? Pick Portable.** It works on any Windows computer, keeps your data on the USB drive so it moves with you, and avoids any installation steps. Just download, copy to your USB, and double-click.

---

### Option A — Installer (for a dedicated machine)

1. Go to the [Releases](https://github.com/japressley8/THCFireworksPOS/releases) page.
2. Under **Assets**, click **`THC_Fireworks_Setup.exe`** to download it.
3. Double-click the downloaded file and follow the installation wizard.
4. Launch **THC Fireworks POS** from your Start Menu or Desktop shortcut.
5. The app will automatically check for updates each time it launches and can update itself in one click.

### Option B — Portable (for USB or shared computers)

1. Go to the [Releases](https://github.com/japressley8/THCFireworksPOS/releases) page.
2. Under **Assets**, click **`THC_Fireworks_Portable.exe`** to download it.
3. Copy `THC_Fireworks_Portable.exe` to your USB flash drive (or any folder you prefer).
4. Double-click the `.exe` to launch — no installation required.
   - *A database file named `firework_pos.db` is automatically created in the same folder as the `.exe`. This file holds your entire catalog, settings, and sales history. Keep the `.exe` and `.db` file together.*
5. To update to a newer version, simply download the new `THC_Fireworks_Portable.exe` and replace the old one. **Your `firework_pos.db` data file will not be affected.**


## 💻 How to Use the POS Terminal

### 1. The Sales Register
* **Adding Items:** Point and scan a barcode, or manually select items from the catalog.
* **Barcode Scanner Behavior:** The global keyboard wedge scanner is only active when you are on the **Sales Register** tab. Switching to the Admin panel automatically disables it to avoid stray inputs.
* **Discounts:** Click the discount presets (e.g. Church Member) or trigger the custom discount keypad to type percentages/fixed dollar amounts.
  * *Numpad Support:* You can use either the on-screen buttons or your physical keyboard's numpad to type numbers, delete with Backspace, close with Escape, and apply with Enter.
* **Checkout:** Click **Complete Sale** to record the transaction. Choose Cash, Card, or GoDaddy Terminal. GoDaddy terminal payments send the amount directly to the paired device, record the transaction upon approval, and print via its built-in printer.
* **Receipts:** Hit **Print Receipt** (shortcut `Ctrl + P`) to print or save a PDF. The virtual receipt preview is now scrollable and correctly sized to accurately represent a real 72mm receipt printout.

### 2. Showcase Videos (Secondary Playback Window)
* **Toggle Screen:** Click the **Showcase Screen** toggle button in the header (next to the Scanner Hook) to open a dedicated borderless video window. You can drag this to a second display facing customers.
* **Play Videos:** Click the video icon button next to items in the checkout cart, Quick Add grid, or inventory catalog to play product demonstration clips.
* **Offline Playback**: When you add a YouTube URL to an item, the app automatically downloads it using an integrated open-source extractor (`yt-dlp`) to enable offline local playback. If offline download fails, it falls back to online streaming.
* **Synchronized Control**: Controls like play, pause, mute, timeline scrubbing, and fullscreen toggles sync dynamically between the primary window and the secondary screen.

### 3. The Administrator Panel
* Click **Admin View** in the top navigation bar.
* Read and acknowledge the restricted access warning modal or enter your admin password if configured.
* Sub-tabs available in the Admin View:
  * **Inventory:** Add, edit, or delete items, barcodes, and wholesale case settings. Click **Edit** on any row to perform inline edits (save button is themed with active primary color).
  * **Discounts & Taxes:** Manage custom percentage/fixed discount presets and tax rates (total-scope or per-item).
  * **Sales Ledger:** Reprint receipts, view transaction line details, or delete individual sales logs.
  * **Analytics:** View daily and yearly profit margin trends (Revenue vs Profit) using side-by-side SVG graphs.
  * **Data Management:** Export database tables as CSV spreadsheets, scan/import CSV data with collision handling, connect Google Drive accounts with local Google OAuth credentials for automated cloud backups, or manually trigger cloud syncs/restores. Wipe specific tables in the Selective Data Clearing danger zone using random verification codes.
  * **Settings:** Toggle out-of-stock sales permissions, set receipt headers/footers, configure/test paired GoDaddy Smart Terminal connections, update theme custom configurations, or check for updates.
  * **Security Settings:** Set up passwords, custom security question recovery details, and generate 16-character recovery keys.

---

## 🛠️ Notes for Future Contributors

### How to Access the Developer Window
To enable and view the developer console for backend testing:
1. **Create the bypass file:** Create an empty file named `developer.bypass` in the database directory.
   - When running portably, the database directory is the folder containing the compiled `fireworks-pos-app.exe` binary.
   - When running in local development mode (`npm run tauri dev`), this file is automatically bypass-active via `cfg!(debug_assertions)` or can be created next to the database file in `src-tauri/target/debug/`.
2. **Launch sequence:** With the bypass active, launching the application will automatically boot the **THC Fireworks Developer Console** next to the primary POS window (or you can open your browser directly to `http://localhost:1420/?window=developer`).

### Developer Window Capabilities
The Developer Console contains rich simulation panels to debug and verify application code offline:
* **Database Management:** Instantly clear database tables and seed test data. This seeding feeds a set of mock fireworks catalog items, custom sales invoices, and multi-year daily analytics trends.
* **System Date Simulation:** Overrides the current system date/year across the entire application (useful to test future analytics calculations or seasonal resets).
* **Admin Password Bypass:** Instantly bypass password gates in the admin console.
* **GoDaddy Smart Terminal Mocking:** Mock local GoDaddy API responses (e.g. simulate terminal pairing, card transaction approvals, customer declines, payment timeouts, refunds, and void actions).
* **Scanner Simulator:** Type a test barcode and dispatch simulated keyboard wedge scanned keystroke events directly to the active Sales register tab.
* **Virtual Printer Output Logs:** Inspect raw printed receipt output structures and monospaced layout logs without needing physical roll paper.
* **System Telemetry Logging:** View real-time frontend JS console logs and Rust backend debug traces side-by-side with log levels filter (`INFO`, `WARN`, `ERROR`) and text search filters.

