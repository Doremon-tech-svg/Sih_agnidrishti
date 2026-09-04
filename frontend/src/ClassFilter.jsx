import { useState, useEffect, useRef } from 'react';

const CLASSES = [
    { name: 'Gas Flare',                   color: '#f59e0b', emoji: '🔥' },
    { name: 'Industrial Thermal Source',   color: '#3b82f6', emoji: '🏭' },
    { name: 'Industrial Fire / Accident',  color: '#ef4444', emoji: '💥' },
    { name: 'Agricultural Burning',        color: '#84cc16', emoji: '🌾' },
    { name: 'Wildfire / Forest Fire',      color: '#f97316', emoji: '🌲' },
    { name: 'Mining Thermal Activity',     color: '#a855f7', emoji: '⛏️' },
    { name: 'False Positive',              color: '#6b7280', emoji: '✗'  },
];

const ALL_NAMES = new Set(CLASSES.map(c => c.name));

export default function ClassFilter({ hotspots, onFilteredChange }) {
    const [active, setActive] = useState(ALL_NAMES);
    const [showAll, setShowAll] = useState(true);
    // Ref so the hotspot-change effect always reads current active without
    // causing an infinite loop if active were listed as a dependency.
    const activeRef = useRef(active);
    activeRef.current = active;

    // Re-emit filtered list whenever hotspots array changes (e.g. 30s refresh)
    useEffect(() => {
        onFilteredChange(hotspots.filter(h => {
            const cls = h.classification || 'False Positive';
            return activeRef.current.has(cls);
        }));
    }, [hotspots, onFilteredChange]);

    const toggle = (name) => {
        const next = new Set(activeRef.current);
        if (next.has(name)) {
            if (next.size === 1) return; // keep at least one active
            next.delete(name);
        } else {
            next.add(name);
        }
        setActive(next);
        setShowAll(next.size === CLASSES.length);
        onFilteredChange(hotspots.filter(h => {
            const cls = h.classification || 'False Positive';
            return next.has(cls);
        }));
    };

    const toggleAll = () => {
        if (showAll) {
            const high = new Set(['Industrial Fire / Accident', 'Gas Flare', 'Wildfire / Forest Fire']);
            setActive(high);
            setShowAll(false);
            onFilteredChange(hotspots.filter(h => high.has(h.classification)));
        } else {
            setActive(ALL_NAMES);
            setShowAll(true);
            onFilteredChange(hotspots);
        }
    };

    const counts = {};
    for (const h of hotspots) {
        const cls = h.classification || 'False Positive';
        counts[cls] = (counts[cls] || 0) + 1;
    }

    return (
        <div style={{ width: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="sidebar-section-title" style={{ margin: 0 }}>Class Filter</span>
                <button
                    onClick={toggleAll}
                    style={{
                        fontSize: 10, color: '#60a5fa', background: 'none',
                        border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                    }}
                >
                    {showAll ? 'High-risk only' : 'Show all'}
                </button>
            </div>

            {/* Class chips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {CLASSES.map(cls => {
                    const isActive = active.has(cls.name);
                    const count = counts[cls.name] || 0;
                    return (
                        <button
                            key={cls.name}
                            className={`cls-chip ${isActive ? 'active' : ''}`}
                            onClick={() => toggle(cls.name)}
                            style={{ opacity: count === 0 ? 0.35 : 1 }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: isActive ? cls.color : 'rgba(255,255,255,0.1)',
                                    display: 'inline-block', flexShrink: 0,
                                    boxShadow: isActive ? `0 0 6px ${cls.color}` : 'none',
                                    transition: 'all 0.15s ease',
                                }} />
                                <span style={{ color: isActive ? 'white' : 'var(--text-muted)' }}>
                                    {cls.emoji} {cls.name}
                                </span>
                            </div>
                            {count > 0 && (
                                <span style={{
                                    fontSize: 10, fontWeight: 700,
                                    color: isActive ? cls.color : 'var(--text-muted)',
                                }}>
                                    {count.toLocaleString()}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
