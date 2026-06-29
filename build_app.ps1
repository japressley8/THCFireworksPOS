# LibertyPOS Installer and Builder script
# Run this script to set up a portable Node/NPM, install Rust, and compile the final executable.

$ErrorActionPreference = "Stop"

# Create a local directory for installer downloads
$installerDir = Join-Path $PSScriptRoot ".installers"
if (-not (Test-Path $installerDir)) {
    New-Item -ItemType Directory -Path $installerDir | Out-Null
}

$nodeDir = Join-Path $PSScriptRoot ".node"
if (-not (Test-Path $nodeDir)) {
    New-Item -ItemType Directory -Path $nodeDir | Out-Null
}

# --- 1. PORTABLE NODE.JS SETUP ---
$nodeZipPath = Join-Path $installerDir "node-v20.15.0-win-x64.zip"
$nodeDestFolder = Join-Path $nodeDir "node-v20.15.0-win-x64"

if (-not (Test-Path $nodeDestFolder)) {
    Write-Host "[1/5] Portable Node.js is not found. Downloading..." -ForegroundColor Cyan
    $nodeUrl = "https://nodejs.org/dist/v20.15.0/node-v20.15.0-win-x64.zip"
    
    # Download Node.js zip
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZipPath
    
    Write-Host "[1/5] Extracting Node.js zip archive..." -ForegroundColor Cyan
    Expand-Archive -Path $nodeZipPath -DestinationPath $nodeDir -Force
    
    # Cleanup download zip
    Remove-Item $nodeZipPath -Force
} else {
    Write-Host "[1/5] Portable Node.js already downloaded and extracted." -ForegroundColor Green
}

# --- 2. RUSTUP SETUP ---
$cargoBin = "$env:USERPROFILE\.cargo\bin"
$cargoExe = Join-Path $cargoBin "cargo.exe"

if (-not (Test-Path $cargoExe)) {
    Write-Host "[2/5] Rust is not found. Installing rustup..." -ForegroundColor Cyan
    $rustupInitPath = Join-Path $installerDir "rustup-init.exe"
    
    $rustupUrl = "https://win.rustup.rs/x86_64"
    Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupInitPath
    
    Write-Host "[2/5] Running rustup silent installer (this takes a moment)..." -ForegroundColor Cyan
    # Run silently with -y (accepts defaults)
    Start-Process -FilePath $rustupInitPath -ArgumentList "-y", "--default-host", "x86_64-pc-windows-msvc", "--default-toolchain", "stable" -Wait -NoNewWindow
    
    # Cleanup downloader
    Remove-Item $rustupInitPath -Force
} else {
    Write-Host "[2/5] Rust/Cargo already installed." -ForegroundColor Green
}

# --- 3. CONFIGURE RUNTIME PATHS ---
Write-Host "[3/5] Setting up environment paths..." -ForegroundColor Cyan
$env:Path = "$nodeDestFolder;$cargoBin;" + $env:Path

# Verify tools are loaded
$nodeVer = & node -v
$cargoVer = & cargo --version
Write-Host "Active Node.js: $nodeVer" -ForegroundColor Green
Write-Host "Active Cargo  : $cargoVer" -ForegroundColor Green

# --- 4. INSTALL NPM PACKAGES ---
Write-Host "[4/5] Running npm install..." -ForegroundColor Cyan
& npm install

# --- 5. BUILD TAURI PRODUCTION APP ---
Write-Host "[5/5] Compiling final portable .exe via Tauri build..." -ForegroundColor Cyan
$env:CARGO_TARGET_DIR = "$env:USERPROFILE\.cargo-target\fireworks-pos-app"
& npm run tauri build

# Copy the final executable back to our release directory for easy user access
$targetExe = "$env:USERPROFILE\.cargo-target\fireworks-pos-app\release\fireworks-pos-app.exe"
$destExe = Join-Path $PSScriptRoot "src-tauri\target\release\fireworks-pos-app.exe"

if (Test-Path $targetExe) {
    $destReleaseDir = Split-Path $destExe
    if (-not (Test-Path $destReleaseDir)) {
        New-Item -ItemType Directory -Path $destReleaseDir -Force | Out-Null
    }
    Copy-Item -Path $targetExe -Destination $destExe -Force
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host "Locate your final portable POS terminal executable at:" -ForegroundColor Green
Write-Host "$destExe" -ForegroundColor Yellow
Write-Host "Copy it to your USB drive and run!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
