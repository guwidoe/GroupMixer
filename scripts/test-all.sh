#!/bin/bash
# Run all tests to verify no regressions during refactoring
# Usage: ./scripts/test-all.sh [--quick]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== GroupMixer Test Suite ===${NC}"
echo ""

QUICK_MODE=false
if [[ "$1" == "--quick" ]]; then
    QUICK_MODE=true
    echo -e "${YELLOW}Running in quick mode (skipping benchmarks)${NC}"
    echo ""
fi

# 1. Rust tests (release mode for performance testing)
echo -e "${YELLOW}[1/4] Running Rust tests (release mode)...${NC}"
if cargo test -p solver-core --release 2>&1; then
    echo -e "${GREEN}✓ Rust tests passed${NC}"
else
    echo -e "${RED}✗ Rust tests failed${NC}"
    exit 1
fi
echo ""

# 2. CLI smoke test
echo -e "${YELLOW}[2/4] Running CLI smoke test...${NC}"
if cargo run -p solver-cli --release -- solve solver-cli/test_cases/simple_test.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ CLI smoke test passed${NC}"
else
    echo -e "${RED}✗ CLI smoke test failed${NC}"
    exit 1
fi
echo ""

# 3. Criterion benchmarks (optional in quick mode)
if [[ "$QUICK_MODE" == false ]]; then
    echo -e "${YELLOW}[3/4] Running performance benchmarks...${NC}"
    echo "Note: Benchmarks are stored in target/criterion/ for historical comparison."
    if cargo bench -p solver-core --bench solver_perf -- --noplot 2>&1 | tail -30; then
        echo -e "${GREEN}✓ Benchmarks completed${NC}"
    else
        echo -e "${RED}✗ Benchmarks failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}[3/4] Skipping benchmarks (quick mode)${NC}"
fi
echo ""

# 4. Frontend E2E tests (if webapp exists)
if [[ -d "webapp" ]]; then
    echo -e "${YELLOW}[4/4] Running frontend E2E tests...${NC}"
    cd webapp
    if npm run test:e2e 2>&1 | tail -20; then
        echo -e "${GREEN}✓ E2E tests passed${NC}"
    else
        echo -e "${RED}✗ E2E tests failed${NC}"
        exit 1
    fi
    cd ..
else
    echo -e "${YELLOW}[4/4] Skipping E2E tests (webapp not found)${NC}"
fi
echo ""

echo -e "${GREEN}=== All tests passed! ===${NC}"
