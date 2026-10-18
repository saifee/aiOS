#!/usr/bin/env bash
# Quick health check once services are up.
set -e
check(){ printf "%-14s" "$1:"; curl -fsS "$2" >/dev/null 2>&1 && echo "OK" || echo "DOWN"; }
check "api"   "http://localhost:4000/health"
check "ai"    "http://localhost:8000/health"
check "web"   "http://localhost:3000"
