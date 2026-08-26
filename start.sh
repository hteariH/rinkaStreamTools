#!/usr/bin/env bash
# Запуск rinkaStreamTools (macOS/Linux). Ставит зависимости при первом запуске.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установи LTS с https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Первый запуск: устанавливаю зависимости..."
  npm install
fi

node server.js
