#!/usr/bin/env bash
# TG-нотификация админу. Молча skip если нет токена/chat_id.
# Usage: ./scripts/notify-admin.sh "текст"
set -euo pipefail

[[ $# -eq 0 ]] && exit 0
TEXT="$1"

ENV_FILE="${ENV_FILE:-/opt/poputchiki/.env}"
if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ENV_FILE"
    set +a
fi

[[ -z "${BOT_TOKEN:-}" ]] && exit 0
[[ -z "${ADMIN_TG_CHAT_ID:-}" ]] && exit 0

curl -sS --max-time 5 -X POST \
    "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d "chat_id=${ADMIN_TG_CHAT_ID}" \
    --data-urlencode "text=[ralph] ${TEXT}" \
    > /dev/null 2>&1 || true
