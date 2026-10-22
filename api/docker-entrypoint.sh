#!/bin/sh
set -e
echo "Waiting for database..."
npx prisma migrate deploy
if [ "${RUN_SEED:-1}" = "1" ]; then
  node dist/seed.js || echo "seed skipped"
fi
exec node dist/index.js
