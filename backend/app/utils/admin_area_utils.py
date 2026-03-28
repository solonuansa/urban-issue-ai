"""
Administrative-area helpers for hotspot segmentation (demo baseline).
"""

from __future__ import annotations


Polygon = list[tuple[float, float]]


ADMIN_AREAS: list[dict] = [
    {
        "id": "JKT-PUSAT",
        "name": "Jakarta Pusat",
        "city": "DKI Jakarta",
        "polygon": [
            (-6.1550, 106.7950),
            (-6.1550, 106.8600),
            (-6.2150, 106.8600),
            (-6.2150, 106.7950),
        ],
    },
    {
        "id": "JKT-SELATAN",
        "name": "Jakarta Selatan",
        "city": "DKI Jakarta",
        "polygon": [
            (-6.2150, 106.7700),
            (-6.2150, 106.8800),
            (-6.2800, 106.8800),
            (-6.2800, 106.7700),
        ],
    },
    {
        "id": "JKT-TIMUR",
        "name": "Jakarta Timur",
        "city": "DKI Jakarta",
        "polygon": [
            (-6.1700, 106.8400),
            (-6.1700, 106.9200),
            (-6.2800, 106.9200),
            (-6.2800, 106.8400),
        ],
    },
]


def _point_in_polygon(lat: float, lng: float, polygon: Polygon) -> bool:
    """
    Ray-casting point-in-polygon.
    Polygon points are (lat, lng).
    """
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        yi, xi = polygon[i]
        yj, xj = polygon[j]
        intersects = ((xi > lng) != (xj > lng)) and (
            lat < ((yj - yi) * (lng - xi) / ((xj - xi) or 1e-12) + yi)
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def lookup_admin_area(lat: float, lng: float) -> dict | None:
    for area in ADMIN_AREAS:
        if _point_in_polygon(lat, lng, area["polygon"]):
            return {
                "id": area["id"],
                "name": area["name"],
                "city": area["city"],
            }
    return None
