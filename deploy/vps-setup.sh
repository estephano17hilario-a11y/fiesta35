#!/usr/bin/env bash
# Instala Docker y levanta Fiesta 35 con HTTPS en un VPS Ubuntu/Debian.
#   sudo DOMAIN=fiesta.midominio.com ADMIN_SECRET_KEY=mi-clave JURY_PIN=1234 REPO_URL=https://TOKEN@github.com/estephano17hilario-a11y/fiesta35.git bash vps-setup.sh
set -euo pipefail
: "${DOMAIN:?falta DOMAIN}" "${ADMIN_SECRET_KEY:?falta ADMIN_SECRET_KEY}" "${REPO_URL:?falta REPO_URL}"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
[ -d /opt/fiesta35 ] || git clone "$REPO_URL" /opt/fiesta35
cd /opt/fiesta35 && git pull -q
DOMAIN="$DOMAIN" ADMIN_SECRET_KEY="$ADMIN_SECRET_KEY" JURY_PIN="${JURY_PIN:-2468}" docker compose -f deploy/docker-compose.vps.yml up -d --build
echo "✅ Listo: https://$DOMAIN/  (admin: /admin · pantalla: /pantalla)"
