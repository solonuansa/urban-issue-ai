from __future__ import annotations

import json
import logging
from datetime import datetime, timezone


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


def log_access_event(
    *,
    logger: logging.Logger,
    request_id: str,
    method: str,
    path: str,
    status_code: int,
    duration_ms: float,
    client_ip: str,
    user_agent: str,
) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": "http_request",
        "request_id": request_id,
        "method": method,
        "path": path,
        "status_code": status_code,
        "duration_ms": round(duration_ms, 2),
        "client_ip": client_ip,
        "user_agent": user_agent[:180],
    }
    logger.info(json.dumps(payload, ensure_ascii=True))
