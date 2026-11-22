# NULLVECTOR // Ephemeral Lisp Lab

A minimalist, retro-futuristic browser IDE for **MIT/GNU Scheme** (MIT Lisp), inspired by the Matrix terminal aesthetic and 1960s–1980s MIT AI Lab / ITS Lisp Machines.

## Security & Isolation Architecture

Every code evaluation spawns a **fresh, ephemeral Docker container** (`nullvector-sandbox:latest`) that is **destroyed immediately** (`--rm`) after execution completes or times out:

- **No network access:** `--network=none`
- **Read-only root filesystem:** `--read-only` (with a tiny 4MB `noexec,nosuid,nodev` `/tmp`)
- **Zero Linux capabilities:** `--cap-drop=ALL` and `--security-opt=no-new-privileges:true`
- **Unprivileged user:** Runs as UID/GID `10001:10001` (`nologin`)
- **Strict resource caps:** `--memory=128m --memory-swap=128m --cpus=0.5 --pids-limit=32`
- **No disk writes & file descriptor cap:** `--ulimit fsize=0:0 --ulimit nofile=64:64`
- **Hard execution timeout:** Default 6 seconds (`EXEC_TIMEOUT_SEC`)

## Quick Start

Requires Docker and Docker Compose.

```bash
chmod +x start.sh
./start.sh
```

Then open **http://localhost:8080** in your browser.

### Manual Build & Run

```bash
# 1. Build the hardened MIT/GNU Scheme sandbox image
docker build -f Dockerfile.sandbox -t nullvector-sandbox:latest .

# 2. Build and start the Web IDE server
docker compose up --build -d ide
```

### Standalone Mode (No Docker Socket)

If you want to run a single container without mounting `/var/run/docker.sock`, set `SANDBOX_MODE=local`. The server will execute `mit-scheme` in a subprocess constrained by `RLIMIT_CPU`, `RLIMIT_AS`, `RLIMIT_FSIZE=0`, and `RLIMIT_NPROC`:

```bash
docker build -f Dockerfile.ide -t nullvector-ide:latest .
docker run --rm -p 8080:8080 -e SANDBOX_MODE=local nullvector-ide:latest
```

## Features

- **Matrix Dark & Archive Paper Light Themes** with toggleable CRT scanlines
- **Live S-Expression Parenthesis Balance Checker**
- **Keyboard Shortcuts:** `Ctrl+Enter` / `Cmd+Enter` to evaluate, `Ctrl+L` to clear, `Tab` for 2-space indent
- **Built-in Classic Scheme Examples:** Tail-recursive Factorial, Y-Combinator, Newton's Method Sqrt, Church Numerals
