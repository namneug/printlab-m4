#!/usr/bin/env bash
# รัน e2e ทุกไฟล์ต่อเนื่อง ต้องมี preview server ที่ BASE_URL (ค่าเริ่มต้น http://localhost:4173/printlab-m4/)
# และ playwright ใน NODE_PATH (เช่น NODE_PATH=/usr/lib/node_modules)
set -euo pipefail
cd "$(dirname "$0")/../.."
fail=0
for f in tests/e2e/m*.mjs; do
  echo "=== $f"
  if ! node "$f"; then fail=1; fi
done
exit $fail
