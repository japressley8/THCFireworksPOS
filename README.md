# 🎆 THC Fireworks POS — Portable POS & Inventory App

THC Fireworks POS (Thousand Hills Church POS) is a premium, local-first Point of Sale (POS) and Inventory management application designed specifically for seasonal fireworks sales. It runs entirely off a USB flash drive, requiring no installation or internet connection to operate.

---

## ✨ Features

* **🎨 Theme Options:** Optimized for indoor, outdoor, and low-light environments. Switch between **THC Mode** (default), **Dark Mode**, **Light Mode**, **Patriotic** (Red/White/Blue), and **High Contrast (Sunlight)** for maximum readability in direct outdoor sunlight.
* **💾 100% USB Portability:** The application database (`firework_pos.db`) is stored in the same folder as the app. Simply copy the portable executable file to a USB drive and plug it into any Windows computer.
* **🚀 Keyboard Wedge Scanner Support:** Scans barcode entries instantly without needing to click into search inputs.
* **📦 Catalog & Inventory Audit Ledger:** Real-time stock counts, bulk package pricing support, price adjustments, and a restricted-access warning popup.
* **🖨️ Thermal Receipt Printing:** Integrated styling designed to print clean 80mm receipts automatically to standard thermal roll printers.
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
* **Discounts:** Click the discount presets (e.g. Church Member) or trigger the custom discount keypad to type percentages/fixed dollar amounts.
  * *Numpad Support:* You can use either the on-screen buttons or your physical keyboard's numpad to type numbers, delete with Backspace, close with Escape, and apply with Enter.
* **Checkout:** Click **Complete Sale** to record the transaction.
* **Receipts:** Hit **Print Receipt** (shortcut `Ctrl + P`) to print or save a PDF.

### 2. The Administrator Panel
* Click **Admin View** in the top navigation bar.
* Read and acknowledge the restricted access warning modal (which warns that changes to pricing and inventory must only be performed by qualified staff).
* From here you can:
  * Add, edit, or delete items and barcodes.
  * Adjust current stock levels and unit costs.
  * View daily and yearly sales summaries.
  * Download/inspect the historical transaction ledger.
