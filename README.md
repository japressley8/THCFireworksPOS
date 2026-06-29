# 🎆 LibertyPOS — Portable Fireworks POS & Inventory App

LibertyPOS is a premium, local-first Point of Sale (POS) and Inventory management application designed specifically for seasonal fireworks sales. Built on **Tauri v2**, **React (TypeScript)**, and **Tailwind CSS**, it features a bundled **SQLite** database that ensures **100% portability** (runs directly off a USB flash drive).

---

## 💾 Portability Architecture
* **Dynamic Database Resolution:** The SQLite database (`firework_pos.db`) automatically initializes in the same folder as the executable binary (`std::env::current_exe()`). This allows you to run the app on any Windows 10+ computer straight from a USB stick without local data footprint.
* **Embedded Assets:** The frontend React UI is completely compiled into static assets and embedded directly inside the compiled binary.
* **No External Dependencies:** The SQLite engine is bundled inside the Rust compiler target, requiring no database engine setup on the host computer.

---

## 🛠️ Tech Stack & Key Features
* **Backend:** Rust, Tauri v2, SQLite (via `rusqlite` bundled)
* **Frontend:** React (Vite, TypeScript), Tailwind CSS, Lucide Icons, Canvas Confetti
* **Design System:** Custom theme options optimized for outdoor/sunlight or night shift visibility:
  * **THC Mode (Default):** Deep forest greens with emerald borders.
  * **Midnight Sky:** Dark eye-friendly blue for night shifts at the firework tent.
  * **Patriotic:** Vibrant 4th of July Red, White, and Blue theme.
  * **High Contrast:** Pure black-and-white for visibility in bright direct sunlight.
* **Automated Updates:** Secure, serverless updates verified via Tauri's signatures and hosted directly on GitHub Releases.
* **Wedged Scanner Interception:** Global keyboard wedging listener catches barcode scanning events seamlessly.
* **Thermal Printing:** Custom `@media print` CSS layout for printing 80mm thermal receipts directly.

---

## 🚀 Setup & Build Instructions

### 📋 Prerequisites
1. **Node.js (v20+)**
2. **Rust & Cargo**
3. **C++ Build Tools** (Select "Desktop development with C++" in the Visual Studio Installer)

### ⚙️ Step 1: Install Dependencies
To install the frontend and package dependencies, run:
```bash
# Add the local Node.js environment to your PATH if running inside the workspace shell:
$env:PATH="c:\Users\Jacobs-Desktop\OneDrive\Projects\THCFireworksPOS\.node\node-v20.15.0-win-x64;" + $env:PATH
npm install
```

### 💻 Step 2: Run in Development Mode
Launch the live-reload desktop window:
```bash
npm run tauri dev
```
* **Admin View Password:** `fireworks1776`
* You can test barcode scanning by typing a code (e.g. `1001`, `1002`) and pressing `Enter` when no inputs are focused.

### 📦 Step 3: Compile the Standalone Executable
To package the final optimized `.exe` binary:
```bash
npm run tauri build
```
Once complete, the installer files will be generated in:
`src-tauri/target/release/bundle/msi/`

---

## 🔄 Automatic Update System
This application is configured to pull update signatures directly from GitHub Releases.
1. When a release is published, the app fetches `updater.json` from GitHub.
2. If a new version is detected, a banner slides in asking the user to update.
3. Clicking **Download & Install** downloads the signed update archive, installs it, and relaunches the application.

*To sign updates, ensure `TAURI_SIGNING_PRIVATE_KEY` is configured in your GitHub repository's Actions Secrets.*
