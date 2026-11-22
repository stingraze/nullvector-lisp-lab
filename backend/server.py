import os
import resource
import subprocess
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

SANDBOX_MODE = os.getenv("SANDBOX_MODE", "docker").lower()
SANDBOX_IMAGE = os.getenv("SANDBOX_IMAGE", "nullvector-sandbox:latest")
EXEC_TIMEOUT_SEC = int(os.getenv("EXEC_TIMEOUT_SEC", "6"))
MAX_CODE_BYTES = int(os.getenv("MAX_CODE_BYTES", "32768"))
MAX_OUTPUT_BYTES = int(os.getenv("MAX_OUTPUT_BYTES", "65536"))

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(title="NULLVECTOR Sandboxed Lisp IDE", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class EvalRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=MAX_CODE_BYTES)


class EvalResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    mode: Literal["docker-ephemeral", "local-rlimit"]
    timed_out: bool


def _truncate(text: str, limit: int) -> str:
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= limit:
        return text
    return encoded[:limit].decode("utf-8", errors="ignore") + "\n... [OUTPUT TRUNCATED]"


def _run_docker_ephemeral(code: str) -> EvalResponse:
    # Each evaluation runs in a brand-new, locked-down container that is immediately destroyed (--rm).
    cmd = [
        "docker", "run",
        "--rm",
        "-i",
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges:true",
        "--pids-limit=32",
        "--memory=128m",
        "--memory-swap=128m",
        "--cpus=0.5",
        "--ulimit", "nofile=64:64",
        "--ulimit", "fsize=0:0",
        "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=4m",
        "--user", "10001:10001",
        SANDBOX_IMAGE,
    ]

    # Ensure MIT/GNU Scheme exits cleanly after evaluating stdin
    payload = code.rstrip() + "\n(%exit)\n"

    start = time.monotonic()
    timed_out = False
    try:
        proc = subprocess.run(
            cmd,
            input=payload,
            capture_output=True,
            text=True,
            timeout=EXEC_TIMEOUT_SEC,
        )
        stdout = _truncate(proc.stdout, MAX_OUTPUT_BYTES)
        stderr = _truncate(proc.stderr, MAX_OUTPUT_BYTES)
        exit_code = proc.returncode
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        stdout = _truncate((exc.stdout or b"").decode("utf-8", errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or ""), MAX_OUTPUT_BYTES)
        stderr = f"[SANDBOX] Execution timed out after {EXEC_TIMEOUT_SEC}s. Ephemeral container terminated."
        exit_code = 124
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Docker CLI not found in IDE container.")

    duration_ms = int((time.monotonic() - start) * 1000)
    return EvalResponse(
        stdout=stdout,
        stderr=stderr,
        exit_code=exit_code,
        duration_ms=duration_ms,
        mode="docker-ephemeral",
        timed_out=timed_out,
    )


def _set_local_limits() -> None:
    resource.setrlimit(resource.RLIMIT_CPU, (EXEC_TIMEOUT_SEC, EXEC_TIMEOUT_SEC))
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NPROC, (32, 32))


def _run_local_rlimit(code: str) -> EvalResponse:
    cmd = ["mit-scheme", "--quiet", "--batch-mode"]
    payload = code.rstrip() + "\n(%exit)\n"

    start = time.monotonic()
    timed_out = False
    try:
        proc = subprocess.run(
            cmd,
            input=payload,
            capture_output=True,
            text=True,
            timeout=EXEC_TIMEOUT_SEC,
            preexec_fn=_set_local_limits,
        )
        stdout = _truncate(proc.stdout, MAX_OUTPUT_BYTES)
        stderr = _truncate(proc.stderr, MAX_OUTPUT_BYTES)
        exit_code = proc.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        stdout = ""
        stderr = f"[SANDBOX] Execution timed out after {EXEC_TIMEOUT_SEC}s."
        exit_code = 124

    duration_ms = int((time.monotonic() - start) * 1000)
    return EvalResponse(
        stdout=stdout,
        stderr=stderr,
        exit_code=exit_code,
        duration_ms=duration_ms,
        mode="local-rlimit",
        timed_out=timed_out,
    )


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "sandbox_mode": SANDBOX_MODE,
        "sandbox_image": SANDBOX_IMAGE,
        "timeout_sec": EXEC_TIMEOUT_SEC,
    }


@app.post("/api/eval", response_model=EvalResponse)
def evaluate_lisp(req: EvalRequest):
    if len(req.code.encode("utf-8")) > MAX_CODE_BYTES:
        raise HTTPException(status_code=413, detail="Code payload exceeds maximum allowed size.")
    if SANDBOX_MODE == "docker":
        return _run_docker_ephemeral(req.code)
    return _run_local_rlimit(req.code)


app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def index():
    return FileResponse(str(FRONTEND_DIR / "index.html"))
