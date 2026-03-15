#!/bin/sh
# Write runtime config for the SPA from environment variables
CONFIG_FILE=/app/app/build/env.json
echo "Writing runtime config to $CONFIG_FILE"
mkdir -p "$(dirname "$CONFIG_FILE")"
cat > $CONFIG_FILE <<EOF
{
  "mode": "${MODE:-}",
  "adminPassword": "${ADMIN_PASSWORD:-}"
}
EOF

echo "Starting node server"
exec node /app/server/index.js
