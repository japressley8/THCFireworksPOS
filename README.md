# 🎆 LibertyPOS — Portable Fireworks POS & Inventory App

LibertyPOS is a premium, local-first Point of Sale (POS) and Inventory management application designed specifically for seasonal fireworks sales. It runs entirely off a USB flash drive, requiring no installation or internet connection to operate.

---

## ✨ Features

* **🇺🇸 Patriotic & High-Contrast Themes:** Optimized for all environments. Switch between **THC Green**, **Midnight Sky** (great for night shifts in the tent), **Patriotic Red/White/Blue**, and a **High Contrast** mode designed for readability in direct sunlight.
* **💾 100% USB Portability:** The application database (`firework_pos.db`) is stored in the same folder as the app. Simply copy the executable file to a USB drive and plug it into any Windows computer.
* **🚀 Keyboard Wedge Scanner support:** Scans barcode entries instantly without needing to click into search inputs.
* **📦 Catalog & Inventory Audit Ledger:** Real-time stock counts, bulk package pricing support, price adjustments, and password-protected manager audits.
* **🖨️ Thermal Receipt Printing:** Integrated styling designed to print clean 80mm receipts automatically to standard thermal roll printers.
* **🎆 Celebratory Feedback:** Colorful fireworks confetti animations play on successful transactions.
* **🔄 Automatic Updates:** The app automatically checks for updates at startup (if connected to the internet) and lets you install them with a single click.

---

## 🚀 How to Install & Run (User Walkthrough)

### 1. Download the App
* Go to the [Releases](https://github.com/japressley8/THCFireworksPOS/releases) page of the repository.
* Download the standalone executable (`fireworks-pos-app.exe`) or the setup package (`THC_Fireworks_1.0.0_x64-setup.exe`).

### 2. Run Portably from a USB Drive
1. Insert your USB flash drive into your computer.
2. Copy the downloaded `fireworks-pos-app.exe` file directly onto the USB drive.
3. Double-click the executable to launch the app!
   * *A database file named `firework_pos.db` will automatically be created in the same folder on your USB drive to save your catalog, presets, and sales history.*

---

## 💻 How to Use the POS Terminal

### 1. The Sales Register
* **Adding Items:** Point and scan a barcode, or manually select items from the catalog.
* **Discounts:** Click the discount presets (e.g. Church Member) or type custom percentages/fixed dollar amounts using the on-screen keypad.
* **Checkout:** Click **Complete Sale** to record the transaction.
* **Receipts:** Hit **Print Receipt** (shortcut `Ctrl + P`) to print or save a PDF.

### 2. The Administrator Panel
* Click **Admin View** in the top navigation bar.
* Enter the password: `fireworks1776`
* From here you can:
  * Add, edit, or delete items and barcodes.
  * Adjust current stock levels and unit costs.
  * View daily and yearly sales summaries.
  * Download/inspect the historical transaction ledger.
