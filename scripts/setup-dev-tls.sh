#!/usr/bin/env bash
# Генерирует локальные TLS-сертификаты через mkcert для dev-окружения.
# Использование: bash scripts/setup-dev-tls.sh
set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/.tls"

if ! command -v mkcert &>/dev/null; then
  echo "ERROR: mkcert не найден. Установи: https://github.com/FiloSottile/mkcert#installation"
  exit 1
fi

mkcert -install

mkdir -p "$CERT_DIR"
cd "$CERT_DIR"
mkcert localhost 127.0.0.1 ::1

# mkcert создаёт файлы с именами localhost+2.pem / localhost+2-key.pem
# Переименуем для удобства
mv -f localhost+2.pem     cert.pem     2>/dev/null || true
mv -f localhost+2-key.pem cert-key.pem 2>/dev/null || true

echo ""
echo "Сертификаты созданы в .tls/"
echo "  cert:     .tls/cert.pem"
echo "  key:      .tls/cert-key.pem"
echo ""
echo "Следующий шаг: bun run dev (Vite + Hono подхватят автоматически)"
