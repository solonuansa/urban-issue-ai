from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

from app.config import OSRM_BASE_URL, ROUTING_ENGINE, ROUTING_TIMEOUT_SECONDS


def _straight_line_route(
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float,
) -> list[dict]:
    return [
        {
            "source": "fallback",
            "distance_m": 0.0,
            "duration_s": 0.0,
            "points": [
                (start_lat, start_lng),
                (end_lat, end_lng),
            ],
        }
    ]


def _get_osrm_routes(
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float,
) -> list[dict]:
    coords = f"{start_lng},{start_lat};{end_lng},{end_lat}"
    query = urllib.parse.urlencode(
        {
            "alternatives": "true",
            "steps": "false",
            "overview": "full",
            "geometries": "geojson",
        }
    )
    url = f"{OSRM_BASE_URL.rstrip('/')}/route/v1/driving/{coords}?{query}"

    request = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(request, timeout=ROUTING_TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))

    routes = payload.get("routes") or []
    normalized: list[dict] = []
    for route in routes[:3]:
        geometry = route.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        points = []
        for pair in coordinates:
            if not isinstance(pair, list) or len(pair) < 2:
                continue
            lng, lat = pair[0], pair[1]
            points.append((float(lat), float(lng)))
        if len(points) < 2:
            continue
        normalized.append(
            {
                "source": "osrm",
                "distance_m": float(route.get("distance") or 0.0),
                "duration_s": float(route.get("duration") or 0.0),
                "points": points,
            }
        )
    return normalized


def get_route_candidates(
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float,
) -> list[dict]:
    if ROUTING_ENGINE == "none":
        return _straight_line_route(start_lat, start_lng, end_lat, end_lng)
    try:
        routes = _get_osrm_routes(start_lat, start_lng, end_lat, end_lng)
        if routes:
            return routes
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        pass
    return _straight_line_route(start_lat, start_lng, end_lat, end_lng)
