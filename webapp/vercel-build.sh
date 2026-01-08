#!/bin/bash

# Exit if any command fails
set -e

# Set custom homes for rustup and cargo to avoid permission issues in Vercel
export RUSTUP_HOME=/vercel/.rustup
export CARGO_HOME=/vercel/.cargo

echo "--- Installing Rust toolchain... ---"
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
source "$CARGO_HOME/env"

echo "--- Installing wasm-pack (pre-built binary)... ---"
# Use the official wasm-pack installer which downloads pre-built binaries
# This is MUCH faster than `cargo install wasm-pack` which compiles from source
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

echo "--- Rust toolchain installed. ---"
rustc --version
wasm-pack --version

echo "--- Running original build command... ---"
npm run build