#!/bin/sh
# JARVIS 실행 (macOS). Node.js 24 이상 필요. 처음 한 번: chmod +x start-jarvis.command
cd "$(dirname "$0")" || exit 1
node src/main.js --open
