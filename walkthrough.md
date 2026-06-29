# Walkthrough: Portable Fireworks POS & Inventory App

We have generated a production-ready, highly aesthetic local-first Point of Sale (POS) and Inventory management application named **LibertyPOS**. It is built with **Tauri v2**, **React (TypeScript)**, and **Tailwind CSS**, using an embedded **SQLite** database that guarantees **100% USB drive portability**.

---

## 💾 Portability Architecture

To ensure the application runs entirely off a USB drive and never writes data to the host machine's `C:` drive:
1. **Dynamic Executable Dir Resolution**: In `src-tauri/src/lib.rs`, the database connection points dynamically to the parent directory of the current running binary via `std::env::current_exe()`.
2. **Bundled SQLite**: In `Cargo.toml`, we configure `rusqlite` with the `bundled` feature. This compiles SQLite directly inside the executable so that the app runs on a clean Windows 10 environment without external database engine dependencies.
3. **Embedded Assets**: The entire React UI is compiled into static files and embedded directly into the final `.exe` binary.

---

## 🛠️ Files Created & Configured

Below is the directory list of all generated files in the workspace:

### Configuration Files (Root)
* [package.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/package.json): Frontend node dependencies (React, Lucide, Tailwind, canvas-confetti, Tauri API).
* [tailwind.config.js](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/tailwind.config.js): Custom 4th of July color scheme (deep midnight, firework red, amber gold, star white).
* [postcss.config.js](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/postcss.config.js): Styles compilation processing directives.
* [tsconfig.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/tsconfig.json): TypeScript target configuration.
* [vite.config.ts](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/vite.config.ts): Tauri-optimized Vite development server and asset packager.
* [index.html](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/index.html): HTML base container with custom fonts (Inter & JetBrains Mono) and metadata.

### Frontend Application Structure
* [src/main.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/main.tsx): React core entry script.
* [src/index.css](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/index.css): Imports Tailwind, and adds custom animations, glassmorphism utilities, and receipt printing layouts.
* [src/types.ts](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/types.ts): Data structure schemas.
* [src/App.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/App.tsx): App router dashboard showing active database paths and toggle hooks.
* [src/components/ScannerListener.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/components/ScannerListener.tsx): Global scanner listener that intercepts keyboard wedging inputs.
* [src/components/RegisterView.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/components/RegisterView.tsx): The POS interface complete with active checkout cart, custom numpad discounts, presets, and receipt formatting.
* [src/components/AdminView.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/components/AdminView.tsx): Password-protected manager panel to manage stock catalog, presets, and transaction ledger audits.

### Tauri Backend wrapper
* [src-tauri/Cargo.toml](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src-tauri/Cargo.toml): Rust dependencies.
* [src-tauri/tauri.conf.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src-tauri/tauri.conf.json): Tauri v2 configuration (defines windows, titles, icons, and bundle pipelines).
* [src-tauri/capabilities/default.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src-tauri/capabilities/default.json): Capability authorization file for client-side API invocations.
* [src-tauri/src/main.rs](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src-tauri/src/main.rs): Launches the crate library module entry points.
* [src-tauri/src/lib.rs](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src-tauri/src/lib.rs): Manages the SQLite schema,Seeds mock inventory items, and binds all RPC commands.

---

## 🇺🇸 Design Theme Details

| Element | Color / Token | Purpose |
| :--- | :--- | :--- |
| **Sky Background** | Midnight Blue (`#030712` / `#090d16`) | Eye-friendly dark mode for night shifts at the firework tent |
| **Cards & Panels** | Translucent slate-900 (`glass-panel`) | Premium glassmorphism layout with thin glowing borders |
| **Sales Accent** | Fireworks Red (`#dc2626` / `#b91c1c`) | Touch targets for crucial actions (Complete Sale, Add Item) |
| **Prices & Highlights** | Amber-Gold (`#fbbf24` / `#f59e0b`) | Glowing text for total bills and active discounts |
| **Volunteers Assist** | Extended Padding & Large Fonts | Clean layouts designed for easy touch taps by non-technical helpers |

---

## 🎆 Confetti Feedback
When a transaction is submitted, the backend logs details and updates inventory. Once successful, the frontend initiates a two-sided burst of **Red, White, Blue, and Gold** fireworks-like confetti from the bottom corners of the screen to celebrate the purchase.

---

## 🖨️ Thermal Receipt Printing Layout
The receipt layout uses standard `@media print` directives in [src/index.css](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/index.css) to hide navigation, backgrounds, and buttons when printing. The receipt width is set to `80mm` (standard 3-inch thermal receipt rolls) and forces all text to black/monospaced fonts.

---

## 🚀 Setup & Build Instructions

Follow these step-by-step instructions to set up the development environment, test the app, and compile the final `.exe` for your USB drive.

### 📋 Prerequisites (To install on your computer once)
1. **Node.js**: Install from [nodejs.org](https://nodejs.org/). This compiles the React frontend.
2. **Rust & Cargo**: Install from [rustup.rs](https://rustup.rs/). This compiles the Rust backend.
3. **Windows C++ Build Tools**: Make sure to check "Desktop development with C++" when installing the Visual Studio Installer (needed for Tauri compilation).

### ⚙️ Step 1: Install Dependencies
Open a terminal in the project folder `c:\Users\Jacobs-Desktop\OneDrive\Projects\FireworksScanApp` and run:
```bash
npm install
```

### 💻 Step 2: Run in Development Mode
To launch the app in live-reload debug mode (changes to frontend or backend will automatically recompile):
```bash
npm run tauri dev
```
* The SQLite database `firework_pos.db` will be initialized in `src-tauri/target/debug/` next to the debug executable.
* You can test scanner inputs by typing a barcode (e.g. `1001`, `1002`, `85720491`) and hitting `Enter` while clicking outside text boxes.
* The Admin Panel password is: `fireworks1776`.

### 📦 Step 3: Build the Standalone Executable
To package the final production binary, run:
```bash
npm run tauri build
```
Once the compilation completes:
1. Locate the compiled `.exe` file at:
   `c:\Users\Jacobs-Desktop\OneDrive\Projects\FireworksScanApp\src-tauri\target\release\fireworks-pos-app.exe`
2. **Copy this `.exe` file** directly to your USB Flash Drive.
3. Run the executable from your USB flash drive on any Windows 10 computer. A `firework_pos.db` SQLite database file will automatically initialize next to it on the USB stick.

---

## 🧪 Automated Testing Suite

We have implemented an automated test suite across the backend and frontend to verify core capabilities, math correctness, and edge scanner wedging logic.

### 1. 🦀 Backend Rust Tests
Located at the bottom of [lib.rs](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src-tauri/src/lib.rs).
* **Test Case**: `test_db_operations`
* **What is tested**:
  * SQLite database initialization and table structure mapping.
  * Auto-seeding of mock data items and discount presets.
  * Creating new catalog items and retrieving them by barcode.
  * Price and stock adjustments.
  * Sale completion with database stock level decrement validation.
  * Transaction rollback safety: trying to complete a sale with quantity exceeding available stock returns an error and rolls back the database state (verifies stock remains unchanged).
* **How to Run**:
  Navigate to `src-tauri` folder and run:
  ```bash
  cargo test
  ```

### 2. ⚛️ Frontend React Tests
Located in [src/components/__tests__/](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/components/__tests__/).
* **Test Suites**:
  * [ScannerListener.test.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/components/__tests__/ScannerListener.test.tsx): Tests wedging scanner buffer inputs, fast typing thresholds, global browser hooks, and keyboard entry gates.
  * [RegisterView.test.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/components/__tests__/RegisterView.test.tsx): Tests cart item modifications, subtotal calculations, tax adding math, preset selections, and RPC payload serialization.
  * [AdminView.test.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/FireworksScanApp/src/components/__tests__/AdminView.test.tsx): Tests password login flow (`fireworks1776`), creating new items/presets, editing, and expanding ledger drawer details.
* **How to Run**:
  Navigate to the workspace root and run:
  ```bash
  npm run test
  ```

