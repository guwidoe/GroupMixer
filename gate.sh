#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

cd "$(dirname "$0")"

# Track timing
START_TIME=$(date +%s)

# ============================================
# Rust checks
# ============================================

print_step "Rust: Checking formatting"
cargo fmt --all -- --check
print_success "Rust formatting OK"

print_step "Rust: Running Clippy"
cargo clippy --all --all-targets -- -D warnings
print_success "Clippy OK"

print_step "Rust: Building all crates"
cargo build --all
print_success "Rust build OK"

print_step "Rust: Running tests"
cargo test --all
print_success "Rust tests OK"

# ============================================
# WASM build
# ============================================

print_step "WASM: Building solver-wasm"
cd solver-wasm
wasm-pack build --target web --out-dir ../webapp/public/pkg
cd ..
print_success "WASM build OK"

# ============================================
# Frontend checks
# ============================================

print_step "Frontend: Installing dependencies"
cd webapp
npm ci
print_success "npm ci OK"

print_step "Frontend: Running ESLint"
npm run lint
print_success "ESLint OK"

print_step "Frontend: Running E2E tests"
npm run test:e2e
print_success "E2E tests OK"

cd ..

# ============================================
# Summary
# ============================================

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  All gates passed! (${ELAPSED}s)${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
