import fs from 'fs';
import path from 'path';

const files = [
    'backend/schema.sql',
    'backend/migrations/002_auth.sql',
    'backend/migrations/003_anomaly_cols.sql',
    'backend/migrations/004_notifications.sql',
    'backend/migrations/004_pipeline_v2.sql',
    'backend/migrations/005_roles_facilities_alerts.sql',
    'backend/migrations/rescore_hotspots.sql'
];

let sql = '-- Auto-generated Supabase Initialization Script\nCREATE EXTENSION IF NOT EXISTS postgis;\n\n';

for (const file of files) {
    if (fs.existsSync(file)) {
        sql += `\n\n-- ===================================\n-- Source: ${file}\n-- ===================================\n\n`;
        sql += fs.readFileSync(file, 'utf8');
    }
}

fs.writeFileSync('init_supabase.sql', sql);
console.log('init_supabase.sql created.');
