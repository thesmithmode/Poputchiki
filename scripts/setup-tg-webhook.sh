#!/usr/bin/env bash
set -euo pipefail

: "${BOT_TOKEN:?BOT_TOKEN required}"
: "${WEBHOOK_SECRET:?WEBHOOK_SECRET required}"
: "${DOMAIN:?DOMAIN required}"

WEBHOOK_URL="https://webhook.${DOMAIN}/tg/webhook"

curl -fsSL -X POST \
  "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${WEBHOOK_URL}\",\"secret_token\":\"${WEBHOOK_SECRET}\",\"allowed_updates\":[\"my_chat_member\",\"message\"]}"

echo ""
echo "Webhook set to: ${WEBHOOK_URL}"
