# Walkthrough: Portable Fireworks POS & Inventory App

We have generated a production-ready, highly aesthetic local-first Point of Sale (POS) and Inventory management application named **THC Fireworks POS**. It is built with **Tauri v2**, **React (TypeScript)**, and **Tailwind CSS**, using an embedded **SQLite** database that guarantees **100% USB drive portability**.

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
* [package.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/package.json): Frontend node dependencies (React, Lucide, Tailwind, canvas-confetti, Tauri API).
* [tailwind.config.js](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/tailwind.config.js): Custom 4th of July color scheme (deep midnight, firework red, amber gold, star white).
* [postcss.config.js](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/postcss.config.js): Styles compilation processing directives.
* [tsconfig.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/tsconfig.json): TypeScript target configuration.
* [vite.config.ts](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/vite.config.ts): Tauri-optimized Vite development server and asset packager.
* [index.html](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/index.html): HTML base container with custom fonts (Inter & JetBrains Mono) and metadata.

### Frontend Application Structure
* [src/main.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/main.tsx): React core entry script.
* [src/index.css](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/index.css): Imports Tailwind, and adds custom animations, glassmorphism utilities, custom CSS utility classes (`border-custom-primary`, `text-custom-primary`), and receipt printing layouts.
* [src/types.ts](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/types.ts): Data structure schemas.
* [src/App.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/App.tsx): App router dashboard showing active database paths and toggle hooks. The `ScannerListener` component is now conditionally gated to only be enabled on the `register` tab (`isEnabled={isScannerListening && activeTab === 'register'}`).
* [src/components/ScannerListener.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/components/ScannerListener.tsx): Global scanner listener that intercepts keyboard wedging inputs. Now uses the precise CSS selector `.fixed.z-50` to detect active modal overlays, preventing false-positive blocking on other z-50 elements that are not modals.
* [src/components/RegisterView.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/components/RegisterView.tsx): The POS interface complete with active checkout cart, custom numpad discounts, presets, and receipt formatting. The receipt preview container now uses `items-start` and `h-fit` to prevent the virtual receipt from stretching vertically in its scrollable container.
* [src/components/AdminView.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/components/AdminView.tsx): Password-protected manager panel to manage stock catalog, presets, and transaction ledger audits. Inline item edit save button now uses `bg-custom-primary/20 border-custom-primary text-custom-primary` classes for consistent theming across all themes. Receipt preview also uses `items-start` and `h-fit` for proper rendering.

### Tauri Backend wrapper
* [src-tauri/Cargo.toml](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src-tauri/Cargo.toml): Rust dependencies.
* [src-tauri/tauri.conf.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src-tauri/tauri.conf.json): Tauri v2 configuration (defines windows, titles, icons, and bundle pipelines).
* [src-tauri/capabilities/default.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src-tauri/capabilities/default.json): Capability authorization file for client-side API invocations.
* [src-tauri/src/main.rs](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src-tauri/src/main.rs): Launches the crate library module entry points.
* [src-tauri/src/lib.rs](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src-tauri/src/lib.rs): Manages the SQLite schema, seeds mock inventory items, and binds all RPC commands.

---

## 🇺🇸 Design Theme Details

| Element | Color / Token | Purpose |
| :--- | :--- | :--- |
| **Sky Background** | Midnight Blue (`#030712` / `#090d16`) | Eye-friendly dark mode for night shifts at the firework tent |
| **Cards & Panels** | Translucent slate-900 (`glass-panel`) | Premium glassmorphism layout with thin glowing borders |
| **Sales Accent** | Fireworks Red (`#dc2626` / `#b91c1c`) | Touch targets for crucial actions (Complete Sale, Add Item) |
| **Prices & Highlights** | Amber-Gold (`#fbbf24` / `#f59e0b`) | Glowing text for total bills and active discounts |
| **Volunteers Assist** | Extended Padding & Large Fonts | Clean layouts designed for easy touch taps by non-technical helpers |

### Available Themes

| Theme | Background | Text | Primary | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **THC Dark** | `#081a12` (deep green) | `#ffffff` | `#10b981` (emerald) | Indoor / nighttime tent |
| **THC Light** | `#f0fdf4` (mint) | `#064e3b` (dark green) | `#10b981` (emerald) | Daytime, bright indoor |
| **Patriotic** | `#f8fafc` (off-white slate) | `#1e3a8a` (navy) | `#b22234` (patriotic red) | Outdoor July 4th events |
| **High Contrast** | `#ffffff` | `#000000` | `#000000` | Direct sunlight / WCAG max contrast |

---

## 🎆 Confetti Feedback
When a transaction is submitted, the backend logs details and updates inventory. Once successful, the frontend initiates a two-sided burst of **Red, White, Blue, and Gold** fireworks-like confetti from the bottom corners of the screen to celebrate the purchase.

---

## 🖨️ Thermal Receipt Printing Layout
The receipt layout uses standard `@media print` directives in [src/index.css](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/index.css) to hide navigation, backgrounds, and buttons when printing. The receipt width is set to `80mm` (standard 3-inch thermal receipt rolls) and forces all text to black/monospaced fonts.

The receipt preview container (both in `RegisterView` and `AdminView`) now uses `items-start` and `h-fit` to prevent the receipt card from stretching vertically inside its scrollable wrapper, ensuring the on-screen preview matches the real printed output.

---

## 🚀 Setup & Build Instructions

Follow these step-by-step instructions to set up the development environment, test the app, and compile the final `.exe` for your USB drive.

### 📋 Prerequisites (To install on your computer once)
1. **Node.js**: Install from [nodejs.org](https://nodejs.org/). This compiles the React frontend.
2. **Rust & Cargo**: Install from [rustup.rs](https://rustup.rs/). This compiles the Rust backend.
3. **Windows C++ Build Tools**: Make sure to check "Desktop development with C++" when installing the Visual Studio Installer (needed for Tauri compilation).

### ⚙️ Step 1: Install Dependencies
Open a terminal in the project folder `c:\Users\Jacobs-Desktop\OneDrive\Projects\THCFireworksPOS` and run:
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
  * **Note**: The scanner listener is only active when the **Sales Register** tab is selected. Switching to Admin view automatically disables it.
* The Admin Panel password is: `fireworks1776`.

### 📦 Step 3: Build the Standalone Executable
To package the final production binary, run:
```bash
npm run tauri build
```
Once the compilation completes:
1. Locate the compiled `.exe` file at:
   `c:\Users\Jacobs-Desktop\OneDrive\Projects\THCFireworksPOS\src-tauri\target\release\fireworks-pos-app.exe`
2. **Copy this `.exe` file** directly to your USB Flash Drive.
3. Run the executable from your USB flash drive on any Windows 10 computer. A `firework_pos.db` SQLite database file will automatically initialize next to it on the USB stick.

---

## 🧪 Automated Testing Suite

We have implemented an automated test suite across the backend and frontend to verify core capabilities, math correctness, and edge scanner wedging logic.

### 1. 🦀 Backend Rust Tests
Located at the bottom of [lib.rs](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src-tauri/src/lib.rs).
* **Test Case**: `test_db_operations`
* **What is tested**:
  * SQLite database initialization and table structure mapping.
  * Auto-seeding of mock data items and discount presets.
  * Creating new catalog items and retrieving them by barcode.
  * Price and stock adjustments.
  * Sale completion with database stock level decrement validation.
  * Transaction rollback safety: trying to complete a sale with quantity exceeding available stock returns an error and rolls back the database state (verifies stock remains unchanged).
  * Historical sales seeder producing multi-year summary data.
* **How to Run**:
  Navigate to `src-tauri` folder and run:
  ```bash
  cargo test
  ```

### 2. ⚛️ Frontend React Tests
Located in [src/components/__tests__/](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/components/__tests__/).
* **Test Suites**:
  * [ScannerListener.test.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/components/__tests__/ScannerListener.test.tsx): Tests wedging scanner buffer inputs, fast typing thresholds, global browser hooks, and keyboard entry gates. Includes a new test verifying scanner is suppressed when a `.fixed.z-50` modal element is present in the DOM.
  * [RegisterView.test.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/components/__tests__/RegisterView.test.tsx): Tests cart item modifications, subtotal calculations, tax adding math, preset selections, and RPC payload serialization. Includes virtual receipt DOM structure assertions.
  * [AdminView.test.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/components/__tests__/AdminView.test.tsx): Tests password login flow (`fireworks1776`), creating new items/presets, editing, and expanding ledger drawer details. Includes a test for inline item editing with theme-primary styled save button, and receipt preview layout assertions.
  * [SolitaireGame.test.tsx](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src/components/__tests__/SolitaireGame.test.tsx): Tests game loading behavior under various cached states, specifically verifying correct deal handling and robustness under React 18 Strict Mode double-mount/unmount/remount conditions.
* **How to Run**:
  Navigate to the workspace root and run:
  ```bash
  npm run test
  ```

---

## 🐞 Bug Fixes

### 🃏 Solitaire Game Auto-Deal Fix
* **Issue**: Solitaire game would load blank and not automatically deal when opened for the first time.
* **Root Cause**: In React 18 (Strict Mode), components undergo a rapid Mount -> Unmount -> Remount cycle in development. Upon initial mount, `SolitaireGame` triggered the `handleRestart()` helper to shuffle and deal, scheduling asynchronous state updates. However, the component was immediately unmounted *before* these updates could flush. The unmount cleanup function captured the initial blank states from `stateRef.current` and saved this blank state (`{ stock: [], waste: [], tableau: [[], ...], ... }`) into the cache of the parent component (`App.tsx`). When the component mounted for the second time, it loaded this blank cached state instead of triggering a deal, leaving the board empty.
* **Resolution**:
  1. Added an `isValidState` helper to verify that a state cache actually contains cards before attempting to restore from it. If the cache is empty (i.e. does not contain cards in stock, waste, tableau, or foundation), it is ignored, and `handleRestart()` is called to deal a fresh game.
  2. Guarded the unmount helper function so that it does not call `onSaveCache` if the board is completely empty, preventing Strict Mode double-mounts from overwriting the cache with empty values.

---

## 🛠️ GitHub Repository & Automatic Update System

We have set up a localized Git repository and integrated a secure, serverless update checking hook using GitHub Releases.

### 🔄 How the Auto-Updater Works
1. **GitHub Release Assets**: Each compilation build pushes installer assets (e.g. `.msi` installers) and an `updater.json` signature file.
2. **App Update Checks**: The desktop application requests the latest signatures from `https://github.com/[YOUR_USER]/[YOUR_REPO]/releases/latest/download/updater.json` at startup.
3. **Banner Notification**: If a new release version is published (e.g. `v26.1.3`), a banner automatically slides in at the top of the interface displaying changelog descriptions.
4. **Direct Download**: Clicking **Download & Install** fetches the binary, shows real-time progress, validates signatures, and launches `relaunch()` to reload the app with the new version.

### 📝 Next Deployment Steps for You (GitHub Connection)

To connect this local workspace to your GitHub repository and build automatic releases:
1. **Add Remote & Push**:
   Create a repository on your GitHub account, then run:
   ```bash
   git remote add origin https://github.com/YOUR_GITHUB_USER/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```
2. **Generate Tauri Signing Keys**:
   To secure application updates, generate a private/public keypair by running:
   ```bash
   npx tauri signer generate
   ```
   * Save the generated **Private Key** in your GitHub repository's secrets:
     `GitHub Repo Settings -> Secrets and variables -> Actions -> New repository secret`
     * Name: `TAURI_SIGNING_PRIVATE_KEY`
     * Value: *[Copy the private key contents]*
   * Copy the generated **Public Key** and paste it into [tauri.conf.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src-tauri/tauri.conf.json) under `pubkey`:
     ```json
     "updater": {
       "pubkey": "YOUR_GENERATED_PUBLIC_KEY"
     }
     ```
3. **Push Version Tag to Build**:
   To build a release installer, update your `version` in [package.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/package.json) and [tauri.conf.json](file:///c:/Users/Jacobs-Desktop/OneDrive/Projects/THCFireworksPOS/src-tauri/tauri.conf.json), then tag and push:
   ```bash
   git add .
   git commit -m "Bump version for release"
   git tag v26.1.3
   git push origin main --tags
   ```
   The GitHub Actions workflow [release.yml](file:///.github/workflows/release.yml) will trigger automatically, compile the NSIS installer on a Windows runner, and host it as a GitHub release!
