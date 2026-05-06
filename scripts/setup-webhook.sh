#!/usr/bin/env bash
# Run once after deploy to register webhook URL with Telegram.
# Usage: BOT_TOKEN=... WEBHOOK_SECRET=... bash scripts/setup-webhook.sh
set -euo pipefail

BOT_TOKEN="${BOT_TOKEN:?BOT_TOKEN required}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:?WEBHOOK_SECRET required}"
DOMAIN="${DOMAIN:-poputchiki.searchingforgamesforever.online}"
URL="https://webhook.${DOMAIN}/webhook/tg"

curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${URL}" \
  -d "secret_token=${WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\",\"callback_query\",\"inline_query\"]" | jq .

echo ""
echo "Webhook set to: ${URL}"
