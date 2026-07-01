# 🎆 THC Fireworks POS — Portable POS & Inventory App

THC Fireworks POS (Thousand Hills Church POS) is a premium, local-first Point of Sale (POS) and Inventory management application designed specifically for seasonal fireworks sales. It runs entirely off a USB flash drive, requiring no installation or internet connection to operate.

---

## ✨ Features

* **🎨 Theme Options:** Optimized for indoor, outdoor, and low-light environments. Switch between:
  * **THC Dark** (default) — A deep midnight-green dark mode for indoor or nighttime tent operation.
  * **THC Light** — A bright emerald-toned light mode for daytime use.
  * **Patriotic** — A light-themed palette with off-white/slate background, deep navy text, and patriotic red & blue accents. Ideal for daytime outdoor use with good readability.
  * **High Contrast (Sunlight)** — Maximum black-on-white contrast for direct sunlight readability.
* **💾 100% USB Portability:** The application database (`firework_pos.db`) is stored in the same folder as the app. Simply copy the portable executable file to a USB drive and plug it into any Windows computer.
* **📺 Secondary Showcase Playback Screen:** Toggle a secondary video screen via the header button to display high-definition product demonstrations. Includes double-sided playback controls, seek timelines, and silent background `yt-dlp` offline YouTube integration.
* **🚀 Keyboard Wedge Scanner Support:** Scans barcode entries instantly without needing to click into search inputs. The scanner is intelligently gated — it only activates on the **Sales Register** tab, and is automatically suppressed when a modal dialog is open. This prevents accidental double-scans or interference with admin dialogs.
* **📦 Catalog & Inventory Audit Ledger:** Real-time stock counts, bulk package pricing support, price adjustments, and a restricted-access warning popup.
* **💸 Sales Taxes & Rules:** Set up total-scope taxes or per-item specific taxes. Support for tax-exempt items.
* **🖨️ Thermal Receipt Printing & Reprinting:** Integrated styling designed to print clean 80mm receipts automatically to standard thermal roll printers. Reprint and view any receipt directly from the Sales Ledger.
* **📊 Analytics & Profit Margin Tracking:** Graph and compare Revenue vs Profit side-by-side in SVG charts. Keep track of net earnings by subtracting item wholesale costs.
* **⚙️ Overselling Controls & Safe Deletion:** Toggle out-of-stock check rules or irreversibly delete database and backup files securely using random confirmation codes.
* **🎆 Celebratory Feedback:** Colorful fireworks confetti animations play on successful transactions.
* **🔄 Automatic Updates:** The app automatically checks for updates at startup (if connected to the internet) and opens your web browser to download the latest portable executable directly, keeping your USB drive updated.

---

## 🚀 How to Install & Run (User Walkthrough)

### 1. Download the App
* Go to the [Releases](https://github.com/japressley8/THCFireworksPOS/releases) page of the repository.
* Download the portable executable (`THC_Fireworks_Portable.exe`).

### 2. Run Portably from a USB Drive
1. Insert your USB flash drive into your computer.
2. Copy the downloaded `THC_Fireworks_Portable.exe` file directly onto the USB drive.
3. Double-click the executable to launch the app!
   * *A database file named `firework_pos.db` will automatically be created in the same folder on your USB drive to save your catalog, presets, and sales history.*

---

## 💻 How to Use the POS Terminal

### 1. The Sales Register
* **Adding Items:** Point and scan a barcode, or manually select items from the catalog.
* **Barcode Scanner Behavior:** The global keyboard wedge scanner is only active when you are on the **Sales Register** tab. Switching to the Admin panel automatically disables it to avoid stray inputs.
* **Discounts:** Click the discount presets (e.g. Church Member) or trigger the custom discount keypad to type percentages/fixed dollar amounts.
  * *Numpad Support:* You can use either the on-screen buttons or your physical keyboard's numpad to type numbers, delete with Backspace, close with Escape, and apply with Enter.
* **Checkout:** Click **Complete Sale** to record the transaction.
* **Receipts:** Hit **Print Receipt** (shortcut `Ctrl + P`) to print or save a PDF. The virtual receipt preview is now scrollable and correctly sized to accurately represent a real 72mm receipt printout.

### 2. Showcase Videos (Secondary Playback Window)
* **Toggle Screen:** Click the **Showcase Screen** toggle button in the header (next to the Scanner Hook) to open a dedicated borderless video window. You can drag this to a second display facing customers.
* **Play Videos:** Click the video icon button next to items in the checkout cart, Quick Add grid, or inventory catalog to play product demonstration clips.
* **Offline Playback**: When you add a YouTube URL to an item, the app automatically downloads it using an integrated open-source extractor (`yt-dlp`) to enable offline local playback. If offline download fails, it falls back to online streaming.
* **Synchronized Control**: Controls like play, pause, mute, timeline scrubbing, and fullscreen toggles sync dynamically between the primary window and the secondary screen.

### 3. The Administrator Panel
* Click **Admin View** in the top navigation bar.
* Read and acknowledge the restricted access warning modal.
* From here you can:
  * Add, edit, or delete items, barcodes, discounts, and taxes.
    * **Inline Item Editing:** Click the **Edit** button on any catalog row to enter inline edit mode. The save button now uses your active primary theme color for visual consistency across all themes.
  * Set message footers on printed receipts under the organization name.
  * Toggle out-of-stock checkout permission controls in Settings.
  * View daily and yearly sales summaries (compare Revenue vs Profit side-by-side).
  * Reprint receipt details or inspect ledger entries.
  * Clear SQLite database files and backup archives securely.
