#!/bin/sh
# Development fallback when Docker Desktop is unavailable. Requires PostgreSQL/Redis installed in Ubuntu.
set -eu
pg_ctlcluster 16 main start || test "$(pg_lsclusters --no-header | awk '{print $4}')" = online
redis-cli ping >/dev/null
echo 'PostgreSQL and Redis are ready. This script never creates or deletes data.'
