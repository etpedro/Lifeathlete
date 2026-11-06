#!/usr/bin/env bash
# Runs the SQL tests on a throwaway local PostgreSQL cluster (no Docker needed).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
BASE="/tmp/lifeathlete-pgtest-$$"  # must be traversable by the postgres OS user
PORT="${PGTEST_PORT:-54329}"
PGUSER_OS=postgres
if [ "$(id -u)" = 0 ]; then AS=(runuser -u "$PGUSER_OS" --); else AS=(); fi

mkdir -p "$BASE" && chmod 755 "$BASE"
[ "$(id -u)" = 0 ] && chown "$PGUSER_OS" "$BASE"

cleanup() {
  "${AS[@]}" "$PGBIN/pg_ctl" -D "$BASE/data" -m immediate stop >/dev/null 2>&1
  rm -rf "$BASE"
}
trap cleanup EXIT

"${AS[@]}" "$PGBIN/initdb" -D "$BASE/data" -A trust -U postgres >/dev/null || exit 1
"${AS[@]}" "$PGBIN/pg_ctl" -D "$BASE/data" -w -s \
  -o "-p $PORT -k $BASE -c listen_addresses=''" start -l "$BASE/pg.log" || exit 1

psql_() { "$PGBIN/psql" -h "$BASE" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -X -q "$@"; }

psql_ -d postgres -c "create database lifeathlete_test" || exit 1
echo "== stub auth"; psql_ -d lifeathlete_test -f "$ROOT/supabase/tests/stub_auth.sql" || exit 1
shopt -s nullglob
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "== migration $(basename "$f")"; psql_ -d lifeathlete_test -f "$f" || exit 1
done
echo "== rls.test.sql"
psql_ -d lifeathlete_test -f "$ROOT/supabase/tests/rls.test.sql" || { echo "DB TESTS FAILED"; exit 1; }
echo "DB TESTS PASSED"
