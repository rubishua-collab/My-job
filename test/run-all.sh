#!/bin/bash
# מריץ את כל הבדיקות בזו אחר זו. שימוש: BACKUP=path/to/backup.json bash test/run-all.sh
cd "$(dirname "$0")/.."
fail=0
for t in test/e2e.cjs test/feature-*.cjs; do
  out=$(timeout 900 node "$t" 2>&1); code=$?
  line=$(echo "$out" | grep -E "עברו|passed|[0-9]+/[0-9]+" | tail -1)
  echo "$t: exit=$code  $line"
  [ $code -ne 0 ] && { fail=1; echo "$out" | grep -E "^✗|✗|FAIL|Error" | head -8; }
done
exit $fail
