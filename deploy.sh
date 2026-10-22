#!/usr/bin/env bash
# ── Nomina · Renace Protocol deploy.sh ─────────
#  Usage on VPS:
#      cd /opt/nomina && ./deploy.sh
#
#  Stack: nomina  ·  Domain: nomina.renace.tech  ·  Network: RenaceNet
#  Repo:  https://github.com/ExpertosTI/nomina

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ExpertosTI/nomina.git}"
PROJECT_DIR="${PROJECT_DIR:-/opt/nomina}"
STACK_NAME="${STACK_NAME:-nomina}"
DOMAIN="${DOMAIN:-nomina.renace.tech}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }

cyan "── 1. Sync source ($DEPLOY_BRANCH) ─────────────"
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git fetch origin "$DEPLOY_BRANCH"
  git checkout "$DEPLOY_BRANCH" 2>/dev/null || git checkout -b "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
  git reset --hard "origin/$DEPLOY_BRANCH"
else
  git clone --branch "$DEPLOY_BRANCH" "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

cyan "── 2. Load / seed .env ────────────────────────"
if [ ! -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
  # generate secrets
  gen() { openssl rand -hex 24; }
  sed -i "s|change_me_strong|$(gen)|" "$PROJECT_DIR/.env"
  sed -i "s|change_me_jwt_32_chars_minimum_here|$(gen)|" "$PROJECT_DIR/.env"
  sed -i "s|change_me_admin|Nomina$(gen | head -c 10)!|" "$PROJECT_DIR/.env"
  sed -i "s|change_me_listener_secret|$(gen)|" "$PROJECT_DIR/.env"
  green "Created .env with generated secrets"
fi

set -a
# shellcheck disable=SC1091
source "$PROJECT_DIR/.env"
set +a

cyan "── 3. Ensure RenaceNet overlay ────────────────"
docker network inspect RenaceNet >/dev/null 2>&1 || \
  docker network create --driver overlay --attachable RenaceNet

cyan "── 4. Build images ────────────────────────────"
docker build -t nomina-api:latest "$PROJECT_DIR/api"
docker build -t nomina-hikvision:latest "$PROJECT_DIR/listener"
docker build -t nomina-web:latest "$PROJECT_DIR/web"

cyan "── 5. Deploy stack ────────────────────────────"
docker stack deploy -c "$PROJECT_DIR/docker-compose.yml" "$STACK_NAME" --with-registry-auth

cyan "── 6. Wait for services ───────────────────────"
sleep 8
docker stack services "$STACK_NAME"
green "Deployed → https://${DOMAIN}"
green "Hikvision push → https://${DOMAIN}/hikvision/event?device_id=<ID>"
