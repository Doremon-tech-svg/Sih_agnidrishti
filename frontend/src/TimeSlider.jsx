import { useMemo, useState, useEffect } from 'react';

export default function TimeSlider({ hotspots, onFilteredChange }) {
    const [pct, setPct] = useState(100); // 0–100% through the date range

    const { minDate, maxDate, isSingleDay } = useMemo(() => {
        if (!hotspots.length) return { minDate: null, maxDate: null, isSingleDay: false };
        const dates = hotspots.map(h => new Date(h.acq_date).getTime());
        const mn = Math.min(...dates);
        const mx = Math.max(...dates);
        return { minDate: mn, maxDate: mx, isSingleDay: mn === mx };
    }, [hotspots]);

    useEffect(() => {
        if (!minDate || !maxDate) return;
        if (isSingleDay) {
            // All hotspots on same date — show everything
            onFilteredChange(hotspots);
            return;
        }
        const cutoff = minDate + ((maxDate - minDate) * pct) / 100;
        onFilteredChange(hotspots.filter(h => new Date(h.acq_date).getTime() <= cutoff));
    }, [pct, hotspots, minDate, maxDate, isSingleDay, onFilteredChange]);

    if (!minDate) return null;

    const cutoffDate = isSingleDay
        ? new Date(maxDate)
        : new Date(minDate + ((maxDate - minDate) * pct) / 100);

    const fmtDate = (ts) =>
        new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });

    return (
        <div className="timeslider-bar">
            <div className="slider-label">Timeline</div>
            <span className="slider-date">{fmtDate(minDate)}</span>
            <input
                type="range"
                className="slider-track"
                min={0} max={100} step={0.5}
                value={pct}
                disabled={isSingleDay}
                onChange={e => setPct(Number(e.target.value))}
            />
            <span className="slider-date" style={{ color: 'var(--text-primary)' }}>
                {cutoffDate.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            {isSingleDay && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    (single day)
                </span>
            )}
        </div>
    );
}