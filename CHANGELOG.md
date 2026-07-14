# Changelog

All notable changes to the THC Fireworks POS system will be documented in this file.

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
