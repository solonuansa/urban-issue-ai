"""
Geo Utilities – helper functions for location-based calculations.
"""

import math


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance (km) between two GPS coordinates.

    Args:
        lat1, lon1: First point (decimal degrees)
        lat2, lon2: Second point (decimal degrees)

    Returns:
        Distance in kilometres.
    """
    R = 6371  # Earth radius in km
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def get_location_importance(latitude: float, longitude: float) -> int:
    """
    Return a location importance score (1–100) based on coordinates.
    Higher = more important (e.g. main road, city centre).

    TODO: Integrate with a road classification API or GeoJSON dataset.
    """
    # Placeholder: returns a default medium importance
    return 50
