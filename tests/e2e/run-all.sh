#!/usr/bin/env bash
# รัน e2e ทั้งหมดต่อเนื่อง (build ให้เองตามตัวแปรที่แต่ละชุดต้องใช้)
# ต้องมี preview server: npm run preview -- --port 4173  (เสิร์ฟ dist/ แบบสด จึง build ซ้ำได้โดยไม่ต้องรีสตาร์ต)
# และ playwright ใน NODE_PATH เช่น NODE_PATH=/usr/lib/node_modules bash tests/e2e/run-all.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
fail=0
run() { echo "=== $1"; if ! node "$1"; then fail=1; fi; }

npm run build >/dev/null
for f in tests/e2e/m2-shell.mjs tests/e2e/m3-telemetry.mjs tests/e2e/m4-level1.mjs tests/e2e/m5-level2.mjs tests/e2e/m6-level3.mjs tests/e2e/m7-explore.mjs tests/e2e/m8-level4.mjs tests/e2e/m9-level5-6.mjs tests/e2e/m10-offline-full.mjs; do run "$f"; done

VITE_EVENTS_ENDPOINT=http://localhost:4174/api/events npm run build >/dev/null
run tests/e2e/m11-queue.mjs

VITE_TEACHER_PASSWORD=test1234 npm run build >/dev/null
run tests/e2e/m12-teacher.mjs

npm run build >/dev/null
if [ $fail -eq 0 ]; then echo "ALL E2E OK"; else echo "E2E FAILED"; fi
exit $fail
