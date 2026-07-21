# Changelog

All notable changes to the THC Fireworks POS system will be documented in this file.

## [27.2.0] - 2026-07-21

### Added
- **Parked Carts System**:
  - Save active customer sales carts with optional reference names or order notes.
  - View, resume, or dismiss parked carts directly from a dedicated modal on the Sales Register.
  - Retains all cart line items, pricing, discounts, and tax states seamlessly.
- **Split Payment Method Support**:
  - Split checkout totals across multiple tender types (Cash, Card, GoDaddy Terminal Flex, Custom methods).
  - Real-time balance calculations with validation ensuring full payment before completing transactions.
  - Full breakdown recorded in sales ledger history and formatted on receipt printouts.
- **Database Self-Healing & Recovery Advisory**:
  - Enhanced local AppData backup recovery process with an automated ui confirmation banner when restoring database files.
- **Developer Suite & Telemetry Enhancements**:
  - Extended Developer Console with interactive seed controls, date simulation, GoDaddy terminal mocking, and trace filters.
  - Added full test coverage for database recovery, parked carts, playback window, and split payment workflows.

### Changed
- **Easter Egg Module Refactoring & Stability**:
  - Modularized easter egg components and tests under `src/components/eastereggs/`.
  - Improved React Strict Mode state preservation for Solitaire, Trigon, and Hex Command games.

## [27.1.9] - 2026-07-15

### Changed
- **In-App Version Display — Always Accurate**:
  - The version number shown in Settings → App Updates now reads directly from the Tauri binary's embedded metadata (sourced from `Cargo.toml`) via the `getVersion()` API at runtime.
  - Previously, it read from `package.json`, which could fall out of sync with `Cargo.toml` and `tauri.conf.json`.
  - No manual sync step required going forward — the displayed version is always the true built version.
- **README Install Instructions**:
  - Rewrote the "How to Install & Run" section to explain both the **Installer** and **Portable** options side-by-side.
  - Added a comparison table (best for, auto-updates, portability, admin required) and separate step-by-step guides for each, written for non-technical volunteers.
- **GitHub Release Notes**:
  - Release notes now include a full installation guide with a comparison table and step-by-step instructions for both the Installer and Portable options — generated automatically for every tagged release.
  - Replaces the previous placeholder text `'See the full changelog below.'`

## [27.1.8] - 2026-07-15

### Changed
- **GoDaddy Terminal — Smart Payment Method Detection**:
  - When a GoDaddy Terminal Flex payment is processed, the POS now reads the actual tender type reported by the terminal after the transaction completes.
  - If the customer paid with **cash** at the terminal kiosk, the ledger entry is recorded with the payment method **"Cash"** instead of "GoDaddy Terminal Flex".
  - For all card-based payments (credit, debit, EMV, NFC, etc.), the payment method continues to be recorded as "GoDaddy Terminal Flex".
  - The GoDaddy transaction ID is always linked regardless of the tender type used.
  - Updated the `HandleSale` bridge response to include `fundingSourceType` from `Transaction.FundingSource.Type`.
  - Updated `godaddy_initiate_payment` Rust command to return a structured object `{ txId, paymentMethod }` instead of a plain transaction ID string.

## [27.1.1] - 2026-07-14

### Added
- **Native One-Click Auto-Updater**:
  - Replaced the "link-to-GitHub" manual update flow with Tauri's native signed updater. Users now see an "Update & Restart" button that downloads, cryptographically verifies, and installs updates automatically — no manual file replacement needed.
  - CI/CD release pipeline rewritten: each GitHub release now produces exactly two assets (`THC_Fireworks.zip` — the signed NSIS update payload — and `updater.json` — the updater manifest). All legacy loose `.exe`, portable `.zip`, and `godaddy-bridge.zip` assets are removed from releases.
  - Added `prepare_update` Rust backend command that kills the GoDaddy bridge sidecar process before the NSIS installer runs, preventing Windows file-lock errors during update.
  - Added graceful permission-error handling: if the app is running from a protected directory (e.g., `C:\Program Files`), the update UI surfaces a clear advisory message prompting users to move the folder to Documents or Desktop.
  - Added "View release history on GitHub" secondary link in Settings > App Updates panel.
  - Forward-compatible `updater.json` schema with `platforms` key — ready for macOS and Linux targets without schema changes.
- **Automated Tests**:
  - Added `UpdateModal.test.tsx` covering: correct button labels, `prepare_update` call ordering, permission error advisory message, generic error display, and close-button disabled state during install.
  - Extended `AdminView.test.tsx` with 3 new tests for the App Updates settings panel.

## [27.1.0] - 2026-07-14

### Added
- **GoDaddy POS Bridge Integration**: 
  - Integrated a C# (.NET Framework 4.8) background bridge application (`godaddy-bridge.exe`) that interfaces with GoDaddy/Poynt smart terminal hardware via REST APIs.
  - Packaged the bridge executable and its dependencies (`Newtonsoft.Json.dll`, `RestSharp.dll`, etc.) as a Tauri Sidecar.
  - Implemented automated builds of the bridge binary alongside the Tauri app packaging pipeline.
  - Added frontend settings toggle and RPC actions to initialize, test connection, and process transaction payloads with the GoDaddy device.
- **Security Validation**:
  - Implemented automated integration tests (`Security.test.tsx`) to verify system session-locking behaviors (immediate locking on tab switch or timeout config).
- **Automated Tests**:
  - Added `ScannerListener.test.tsx` coverage for verifying scanner suppression when modal overlays are visible.
  - Added `SharedUtils.test.tsx` to verify mathematical helper utility accuracy.

### Changed
- **Easter Egg Module Restructuring**:
  - Moved all React Easter egg games (Trigon, Chain Reaction, Connect 4, Trithello, Hex Command, Solitaire) and their associated assets into a unified `src/components/eastereggs/` directory.
  - Moved game test suites into a nested `tests/` subdirectory under `src/components/eastereggs/` to organize workspace structures.
- **Barcode Scanner Interceptor Optimization**:
  - Refactored `ScannerListener` to use precise CSS selector targets (`.fixed.z-50`) to accurately detect modal dialog presence, preventing input blockages during normal operations.
- **UI Styling Enhancements**:
  - receipt preview scrolling container now properly uses `items-start` and `h-fit` to keep receipt heights proportional.
  - Themed inline inventory edit buttons with CSS variables matching chosen color themes.
- **Security Hardening**:
  - Configured project `.gitignore` rules to completely prevent staging of development-only cryptographic private keys (`*.pem`, `*.key`), certificate files, and environment settings.

### Removed
- **Redundant Components**:
  - Removed deprecated `src/components/SolitaireModal.tsx` in favor of the modular version located under `eastereggs`.

### Fixed
- **Solitaire Empty Board Issue**:
  - Fixed a React 18 Strict Mode double-mount/unmount/remount issue where an empty board state was cached and restored on startup, causing the game to load without dealing cards. Added cache validation guards to prevent empty state persistence.
