# ml/api/client.py
import requests
import os

API_BASE = os.getenv("API_BASE", "http://localhost:4000/api")

def get_unprocessed_hotspots(limit=5000):
    """Fetch hotspots with no classification yet."""
    url = f"{API_BASE}/hotspots?classification=null&limit={limit}"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return r.json()

def patch_hotspot(hotspot_id, payload):
    url = f"{API_BASE}/hotspots/{hotspot_id}"
    r = requests.patch(url, json=payload, timeout=10)
    r.raise_for_status()
    return r

def post_incident(payload):
    url = f"{API_BASE}/incidents"
    r = requests.post(url, json=payload, timeout=10)
    r.raise_for_status()
    return r.json()