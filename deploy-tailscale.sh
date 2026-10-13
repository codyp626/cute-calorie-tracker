#!/bin/sh
set -eu
docker compose -f compose.yaml up -d --build
curl -fsS http://127.0.0.1:5011/health
tailscale serve --bg --https=8444 http://127.0.0.1:5011
tailscale serve status
