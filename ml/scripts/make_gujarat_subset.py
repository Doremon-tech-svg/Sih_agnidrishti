import pandas as pd
from pathlib import Path

INDIA_FILE = Path("data/raw/firms/firms_india.csv")
GUJARAT_FILE = Path("data/raw/firms/firms_gujarat.csv")

def main():
    print("Loading India FIRMS data...")
    df = pd.read_csv(INDIA_FILE)
    print(f"Total rows: {len(df)}")

    # Gujarat bbox
    mask = (
        (df["latitude"] >= 20.5) & (df["latitude"] <= 24.5) &
        (df["longitude"] >= 68.0) & (df["longitude"] <= 74.5)
    )
    gj = df[mask].copy()
    print(f"Gujarat rows: {len(gj)}")

    gj.to_csv(GUJARAT_FILE, index=False)
    print(f"Saved to {GUJARAT_FILE}")

if __name__ == "__main__":
    main()