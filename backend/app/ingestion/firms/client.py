"""
Pull FIRMS VIIRS 375m data for Gujarat industrial clusters
Loops through dates in 5-day chunks (API limit)
Author: Aryan Gupta
Date: August 31, 2026
"""

import os
import time
import requests
import pandas as pd
from io import StringIO
from datetime import datetime, timedelta

# ===== CONFIGURATION =====
MAP_KEY = "2d6536514c8efa5e004a1f494d10eab8"

# Bounding boxes: lon_min, lat_min, lon_max, lat_max
CLUSTERS = {
    'jamnagar': '69.80,22.20,70.30,22.60',
    'vadodara': '73.00,22.10,73.40,22.45',
    'bharuch': '72.90,21.55,73.15,21.85',
    'surat': '72.75,21.00,73.05,21.35'
}

# Date range
START_DATE = '2024-01-01'
END_DATE = '2026-08-29'

# VIIRS satellites
SATELLITES = ['VIIRS_NOAA21_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_SNPP_NRT']

# Chunk size (API max is 5 days)
CHUNK_DAYS = 5

# ===== FUNCTIONS =====

def generate_date_chunks(start_date, end_date, chunk_days=5):
    """Generate list of (start, days) tuples for API calls"""
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
    """Pull FIRMS data for one chunk"""
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/{satellite}/{bbox}/{days}/{start_date}"
    
    try:
        response = requests.get(url, timeout=180)
        
        if response.status_code == 200:
            df = pd.read_csv(StringIO(response.text))
            if len(df) > 0:
                return df
        return pd.DataFrame()
    except Exception as e:
        return pd.DataFrame()

def main():
    # Create output directory
    os.makedirs('data/raw/firms', exist_ok=True)
    
    # Generate date chunks once
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
                
                # Progress update every 20 chunks
                if (idx + 1) % 20 == 0:
                    print(f"    Progress: {idx+1}/{len(date_chunks)} chunks done, {sum(len(d) for d in sat_data)} detections so far")
                
                # Rate limiting
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
            cluster_df = cluster_df.drop_duplicates(
                subset=['latitude', 'longitude', 'acq_date', 'acq_time']
            )
            
            output_file = f"data/raw/firms/firms_{cluster_name}.csv"
            cluster_df.to_csv(output_file, index=False)
            print(f"\n  Saved: {output_file} ({len(cluster_df)} total detections)")
            
            all_data[cluster_name] = cluster_df
        else:
            print(f"\n  No data for {cluster_name}")
    
    # Combine all clusters
    if all_data:
        print(f"\n{'='*60}")
        print("Combining all clusters...")
        combined_df = pd.concat(all_data.values(), ignore_index=True)
        
        combined_file = 'data/raw/firms/firms_gujarat_clusters.csv'
        combined_df.to_csv(combined_file, index=False)
        
        print(f"\nFINAL OUTPUT: {combined_file}")
        print(f"  Total detections: {len(combined_df)}")
        print(f"  Date range: {combined_df['acq_date'].min()} to {combined_df['acq_date'].max()}")
        print(f"  Clusters: {combined_df['cluster'].unique().tolist()}")
        print(f"  Unique pixels: {combined_df[['latitude','longitude']].drop_duplicates().shape[0]}")
        
        print("\nSample data:")
        print(combined_df[['cluster', 'latitude', 'longitude', 'acq_date', 'bright_ti4', 'frp', 'confidence']].head(10))
        
        # Save sample
        sample_file = 'data/raw/firms/sample_preview.csv'
        combined_df.head(100).to_csv(sample_file, index=False)
        print(f"\nSample saved: {sample_file}")
    else:
        print("No data collected.")

if __name__ == '__main__':
    main()
