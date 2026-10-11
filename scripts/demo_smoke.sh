#!/usr/bin/env bash
# scripts/demo_smoke.sh  –  Hit every RiskScope endpoint and print OK/FAIL.
# Usage: bash scripts/demo_smoke.sh [host]
# Default host: http://localhost:8000
# Run this before demo day as a last-minute sanity check.

set -euo pipefail

HOST="${1:-http://localhost:8000}"
BASE="$HOST/api"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

check() {
  local label="$1"
  local status="$2"
  local body="$3"

  if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
    echo -e "${GREEN}OK${NC}   $label  (HTTP $status)"
    PASS=$((PASS+1))
  else
    echo -e "${RED}FAIL${NC} $label  (HTTP $status)"
    echo "     Body: ${body:0:200}"
    FAIL=$((FAIL+1))
  fi
}

echo "============================================================"
echo "  RiskScope Demo Smoke Test — $BASE"
echo "============================================================"

# GET endpoints
resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" "$BASE/health")
check "GET /health" "$resp" "$(cat /tmp/rs_body.json)"

resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" "$BASE/assets/search?q=NVDA")
check "GET /assets/search?q=NVDA" "$resp" "$(cat /tmp/rs_body.json)"

resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" "$BASE/presets")
check "GET /presets" "$resp" "$(cat /tmp/rs_body.json)"

resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" "$BASE/regimes")
check "GET /regimes" "$resp" "$(cat /tmp/rs_body.json)"

resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" "$BASE/model/info")
check "GET /model/info" "$resp" "$(cat /tmp/rs_body.json)"

resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" "$BASE/prices/live?tickers=NVDA,TCS.NS")
check "GET /prices/live" "$resp" "$(cat /tmp/rs_body.json)"

# Shared demo payload
WEIGHTS_JSON='{"NVDA":0.35,"TSLA":0.25,"RELIANCE.NS":0.20,"TCS.NS":0.10,"HDFCBANK.NS":0.10}'
HOLDINGS_JSON='[{"ticker":"NVDA","amount":350000},{"ticker":"TSLA","amount":250000},{"ticker":"RELIANCE.NS","amount":200000},{"ticker":"TCS.NS","amount":100000},{"ticker":"HDFCBANK.NS","amount":100000}]'
PERIOD_JSON='{"preset":"3y"}'

resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" -X POST "$BASE/simulate" \
  -H "Content-Type: application/json" \
  -d "{\"weights\":$WEIGHTS_JSON,\"amount\":1000000,\"period\":$PERIOD_JSON,\"rebalance\":\"monthly\",\"currency\":\"INR\"}")
check "POST /simulate" "$resp" "$(cat /tmp/rs_body.json)"

resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" -X POST "$BASE/benchmark" \
  -H "Content-Type: application/json" \
  -d "{\"weights\":$WEIGHTS_JSON,\"amount\":1000000,\"benchmark\":\"auto\",\"period\":$PERIOD_JSON,\"currency\":\"INR\"}")
check "POST /benchmark" "$resp" "$(cat /tmp/rs_body.json)"

resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" -X POST "$BASE/shield" \
  -H "Content-Type: application/json" \
  -d "{\"weights\":$WEIGHTS_JSON,\"amount\":1000000,\"floor\":-0.15,\"multiplier\":3.0,\"period\":$PERIOD_JSON}")
check "POST /shield" "$resp" "$(cat /tmp/rs_body.json)"

resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" -X POST "$BASE/compare" \
  -H "Content-Type: application/json" \
  -d "{\"holdings\":$HOLDINGS_JSON,\"risk_level\":\"high\",\"benchmark\":\"auto\",\"period\":$PERIOD_JSON,\"shield_floor\":-0.15,\"currency\":\"INR\"}")
check "POST /compare" "$resp" "$(cat /tmp/rs_body.json)"

resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" -X POST "$BASE/track" \
  -H "Content-Type: application/json" \
  -d '{"positions":[{"ticker":"NVDA","quantity":10,"buy_price":800},{"ticker":"TCS.NS","quantity":50,"buy_price":3500}],"benchmark":"auto","lookback":"1y","currency":"INR"}')
check "POST /track" "$resp" "$(cat /tmp/rs_body.json)"

# JJ endpoints — OK if 200, WARN if 404/500 (not yet built)
for ep in "analyze" "allocate" "scenario"; do
  resp=$(curl -s -o /tmp/rs_body.json -w "%{http_code}" -X POST "$BASE/$ep" \
    -H "Content-Type: application/json" \
    -d "{\"weights\":$WEIGHTS_JSON,\"amount\":1000000,\"period\":$PERIOD_JSON,\"scenario\":\"market_crash\",\"holdings\":$HOLDINGS_JSON,\"risk_level\":\"high\",\"currency\":\"INR\",\"tickers\":[\"NVDA\",\"TSLA\",\"RELIANCE.NS\",\"TCS.NS\",\"HDFCBANK.NS\"]}" 2>/dev/null)
  if [ "$resp" -ge 200 ] && [ "$resp" -lt 300 ]; then
    check "POST /$ep" "$resp" ""
  else
    echo -e "WARN POST /$ep  (HTTP $resp — JJ's endpoint may not be built yet)"
  fi
done

echo ""
echo "============================================================"
echo "  Results: $PASS passed, $FAIL failed"
echo "============================================================"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
