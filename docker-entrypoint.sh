#!/bin/sh
# Write runtime config for the SPA from environment variables
CONFIG_FILE=/usr/share/nginx/html/env.json
echo "Writing runtime config to $CONFIG_FILE"
cat > $CONFIG_FILE <<EOF
{
  "mode": "${MODE:-}"
}
EOF

exec nginx -g 'daemon off;'
