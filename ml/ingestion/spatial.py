# ml/ingestion/spatial.py
import numpy as np
from scipy.spatial import cKDTree


class NearestNeighbors:
    """
    Fast nearest-neighbor queries for latitude/longitude points using a KDTree
    on 3D unit sphere coordinates. Distances are returned in meters.
    """

    def __init__(self, df, lat_col="latitude", lon_col="longitude"):
        self.df = df
        lat_rad = np.radians(df[lat_col].values)
        lon_rad = np.radians(df[lon_col].values)

        # Convert to 3D Cartesian coordinates on unit sphere
        x = np.cos(lat_rad) * np.cos(lon_rad)
        y = np.cos(lat_rad) * np.sin(lon_rad)
        z = np.sin(lat_rad)
        self.pts = np.vstack([x, y, z]).T

        # Build KDTree
        self.kdtree = cKDTree(self.pts)

    def nearest(self, lat, lon, k=1):
        """
        Return (distance_meters, index) of the k nearest neighbors.
        If k=1, returns a scalar distance and integer index.
        If k>1, returns arrays.
        """
        lat_r = np.radians(lat)
        lon_r = np.radians(lon)
        x = np.cos(lat_r) * np.cos(lon_r)
        y = np.cos(lat_r) * np.sin(lon_r)
        z = np.sin(lat_r)
        dist_3d, idx = self.kdtree.query([x, y, z], k=k)

        # Convert chord distance to meters:
        # chord = 2 * sin(d / (2 * R))  =>  d = 2 * R * arcsin(chord / 2)
        R = 6371000.0
        chord = np.clip(dist_3d, 0.0, 2.0)
        dist_m = 2 * R * np.arcsin(chord / 2)

        return dist_m, idx