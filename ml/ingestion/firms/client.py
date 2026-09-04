"""
Pull FIRMS VIIRS 375m data for Gujarat industrial clusters (or India).
Loops through dates in 5-day chunks (API limit).
Author: Aryan Gupta
Date: August 31, 2026
"""

import os
import time
import requests
import pandas as pd
from io import StringIO
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root and backend/
ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / '.env')
load_dotenv(ROOT_DIR / 'backend' / '.env')

# ===== CONFIGURATION =====
MAP_KEY = os.getenv("FIRMS_MAP_KEY", "")

# Bounding boxes: lon_min, lat_min, lon_max, lat_max
# For Gujarat only:
# CLUSTERS = {
#     'jamnagar': '69.80,22.20,70.30,22.60',
#     'vadodara': '73.00,22.10,73.40,22.45',
#     'bharuch': '72.90,21.55,73.15,21.85',
#     'surat': '72.75,21.00,73.05,21.35'
# }
# For all India:
CLUSTERS = {
    'india': '68.0,6.0,97.0,35.0'
}

START_DATE = '2024-01-01'
END_DATE = '2026-08-29'

# VIIRS satellites
SATELLITES = ['VIIRS_NOAA21_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_SNPP_NRT']

CHUNK_DAYS = 5

def generate_date_chunks(start_date, end_date, chunk_days=5):
    chunks = []
    current = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    while current <= end:
        remaining = (end - current).days + 1
        days = min(chunk_days, remaining)
        chunks.append((current.strftime('%Y-%m-%d'), days))
        current += timedelta(days=days)
    return chunks

def pull_firms_chunk(bbox, days, start_date, satellite, map_key):
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/{satellite}/{bbox}/{days}/{start_date}"
    try:
        response = requests.get(url, timeout=180)
        if response.status_code != 200:
            print(f"    HTTP {response.status_code}: {response.text[:200]}")
            return pd.DataFrame()
        df = pd.read_csv(StringIO(response.text))
        if len(df) > 0:
            return df
        return pd.DataFrame()
    except Exception as e:
        print(f"    Request error: {e}")
        return pd.DataFrame()

def main():
    if not MAP_KEY:
        print("ERROR: FIRMS_MAP_KEY is not set. Add it to your environment or .env file.")
        return

    os.makedirs('data/raw/firms', exist_ok=True)

    date_chunks = generate_date_chunks(START_DATE, END_DATE, CHUNK_DAYS)
    print(f"Total chunks to fetch: {len(date_chunks)} per satellite")
    print(f"Total API calls: {len(date_chunks) * len(SATELLITES) * len(CLUSTERS)}")
    print()

    all_data = {}

    for cluster_name, bbox in CLUSTERS.items():
        print(f"{'='*60}")
        print(f"Processing {cluster_name.upper()}...")
        print(f"Bounding box: {bbox}")
        print(f"{'='*60}")

        cluster_data = []

        for satellite in SATELLITES:
            print(f"\n  Satellite: {satellite}")
            sat_data = []

            for idx, (start_date, days) in enumerate(date_chunks):
                df = pull_firms_chunk(bbox, days, start_date, satellite, MAP_KEY)
                if len(df) > 0:
                    sat_data.append(df)

                if (idx + 1) % 20 == 0:
                    print(f"    Progress: {idx+1}/{len(date_chunks)} chunks done, {sum(len(d) for d in sat_data)} detections so far")
                time.sleep(1)

            if sat_data:
                sat_df = pd.concat(sat_data, ignore_index=True)
                sat_df['cluster'] = cluster_name
                sat_df['satellite_source'] = satellite
                cluster_data.append(sat_df)
                print(f"    Total for {satellite}: {len(sat_df)} detections")
            else:
                print(f"    No data for {satellite}")

        if cluster_data:
            cluster_df = pd.concat(cluster_data, ignore_index=True)
            cluster_df = cluster_df.drop_duplicates(subset=['latitude', 'longitude', 'acq_date', 'acq_time'])
            output_file = f"data/raw/firms/firms_{cluster_name}.csv"
            cluster_df.to_csv(output_file, index=False)
            print(f"\n  Saved: {output_file} ({len(cluster_df)} total detections)")
            all_data[cluster_name] = cluster_df
        else:
            print(f"\n  No data for {cluster_name}")

    if all_data:
        print(f"\n{'='*60}")
        print("Combining all clusters...")
        combined_df = pd.concat(all_data.values(), ignore_index=True)
        combined_file = 'data/raw/firms/firms_india.csv'
        combined_df.to_csv(combined_file, index=False)
        print(f"\nFINAL OUTPUT: {combined_file}")
        print(f"  Total detections: {len(combined_df)}")
        print(f"  Date range: {combined_df['acq_date'].min()} to {combined_df['acq_date'].max()}")
        print(f"  Clusters: {combined_df['cluster'].unique().tolist()}")
        print(f"  Unique pixels: {combined_df[['latitude','longitude']].drop_duplicates().shape[0]}")
        sample_file = 'data/raw/firms/sample_preview.csv'
        combined_df.head(100).to_csv(sample_file, index=False)
        print(f"\nSample saved: {sample_file}")
    else:
        print("No data collected.")

if __name__ == '__main__':
    main()