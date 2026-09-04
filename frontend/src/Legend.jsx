const COLORS = {
    'Gas Flare':                  '#f59e0b',
    'Industrial Thermal Source':  '#3b82f6',
    'Industrial Fire / Accident': '#ef4444',
    'Agricultural Burning':       '#84cc16',
    'Wildfire / Forest Fire':     '#f97316',
    'Mining Thermal Activity':    '#a855f7',
    'False Positive':             '#6b7280',
};

export default function Legend() {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10,
            padding: '10px 12px',
        }}>
            <div style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 1.2, color: 'rgba(138,172,204,0.5)', marginBottom: 8,
            }}>
                Classification Legend
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {Object.entries(COLORS).map(([label, color]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{
                            width: 9, height: 9, borderRadius: '50%',
                            background: color, flexShrink: 0,
                            boxShadow: `0 0 5px ${color}88`,
                        }} />
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}