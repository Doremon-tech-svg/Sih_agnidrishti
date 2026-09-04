/**
 * frontend/src/geoUtils.js
 * Lightweight reverse-geocoding for Gujarat industrial belt.
 * No external API — pure lookup by bounding box.
 */

const REGIONS = [
    // [name, minLat, maxLat, minLon, maxLon, district]
    { name: 'Jamnagar Refinery Belt',   minLat: 22.20, maxLat: 22.65, minLon: 69.80, maxLon: 70.35, district: 'Jamnagar' },
    { name: 'Vadodara Industrial Zone', minLat: 22.10, maxLat: 22.50, minLon: 72.95, maxLon: 73.45, district: 'Vadodara' },
    { name: 'Bharuch Petrochemical Hub',minLat: 21.50, maxLat: 21.90, minLon: 72.85, maxLon: 73.20, district: 'Bharuch' },
    { name: 'Surat Diamond & Textile',  minLat: 20.95, maxLat: 21.40, minLon: 72.70, maxLon: 73.10, district: 'Surat' },
    { name: 'Rajkot Industrial Estate', minLat: 22.20, maxLat: 22.45, minLon: 70.70, maxLon: 71.00, district: 'Rajkot' },
    { name: 'Anand Agri Zone',          minLat: 22.45, maxLat: 22.75, minLon: 72.85, maxLon: 73.10, district: 'Anand' },
    { name: 'Ahmedabad Metro',          minLat: 22.85, maxLat: 23.15, minLon: 72.45, maxLon: 72.75, district: 'Ahmedabad' },
    { name: 'Gandhinagar Special Zone', minLat: 23.10, maxLat: 23.35, minLon: 72.55, maxLon: 72.80, district: 'Gandhinagar' },
    { name: 'Kutch Desert',             minLat: 22.90, maxLat: 24.10, minLon: 68.50, maxLon: 71.50, district: 'Kutch' },
    { name: 'Gulf of Khambhat Coast',   minLat: 21.40, maxLat: 22.10, minLon: 72.10, maxLon: 72.90, district: 'Coastal Gujarat' },
];

export function getRegionInfo(lat, lon) {
    for (const r of REGIONS) {
        if (lat >= r.minLat && lat <= r.maxLat && lon >= r.minLon && lon <= r.maxLon) {
            return { name: r.name, district: r.district };
        }
    }
    // Fallback: named by quadrant within Gujarat
    if (lat > 23.0)  return { name: 'North Gujarat', district: 'Gujarat' };
    if (lat < 21.5)  return { name: 'South Gujarat', district: 'Gujarat' };
    if (lon < 71.0)  return { name: 'Saurashtra Peninsula', district: 'Gujarat' };
    return { name: 'Central Gujarat', district: 'Gujarat' };
}

export function formatCoord(lat, lon) {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(3)}°${ns}, ${Math.abs(lon).toFixed(3)}°${ew}`;
}

export function getLandCoverLabel(raw) {
    if (!raw) return 'Unknown';
    if (raw.lc_industrial) return '🏭 Industrial';
    if (raw.lc_cropland)   return '🌾 Cropland';
    if (raw.lc_forest)     return '🌲 Forest';
    if (raw.lc_urban)      return '🏙 Urban';
    // Fallback: infer from cluster
    const cluster = raw.cluster || '';
    if (cluster === 'jamnagar' || cluster === 'vadodara' || cluster === 'bharuch') return '🏭 Industrial';
    if (cluster === 'surat') return '🌆 Mixed Urban/Industrial';
    return '🌿 Rural';
}

const SATELLITE_NAMES = {
    'VIIRS_SNPP_NRT':   'VIIRS S-NPP',
    'VIIRS_NOAA20_NRT': 'VIIRS NOAA-20',
    'VIIRS_NOAA21_NRT': 'VIIRS NOAA-21',
    'N21': 'VIIRS NOAA-21',
    'N20': 'VIIRS NOAA-20',
    'NPP': 'VIIRS S-NPP',
};
export function getSatelliteName(sat) {
    return SATELLITE_NAMES[sat] || sat || 'VIIRS';
}
