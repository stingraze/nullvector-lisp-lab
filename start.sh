#!/usr/bin/env bash
set -euo pipefail

echo "[NULLVECTOR] Building hardened MIT/GNU Scheme sandbox image..."
docker build -f Dockerfile.sandbox -t nullvector-sandbox:latest .

echo "[NULLVECTOR] Building NULLVECTOR Web IDE image..."
docker compose build ide

echo "[NULLVECTOR] Starting Sandboxed NULLVECTOR Lisp IDE on http://localhost:8080 ..."
docker compose up -d ide

echo "[NULLVECTOR] Ready. Open http://localhost:8080 in your browser."
