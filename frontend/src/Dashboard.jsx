

import { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend as ReLegend,
  LineChart,
  Line,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import {
  getHotspots,
  getAlerts,
  getFacilities,
  getMlStatus,
  runMlPipeline,
} from "./api.js";
import "./Dashboard.css";
import "./DashboardBackground.css";
import PixelatedWorldMap from "./PixelatedWorldMap.jsx";

const CLASS_COLORS = {
  "Gas Flare": "#46d9ff",
  "Industrial Thermal Source": "#4d8dff",
  "Industrial Fire / Accident": "#ff647c",
  "Agricultural Burning": "#ffc857",
  "Wildfire / Forest Fire": "#ff9d5c",
  "Mining Thermal Activity": "#9b7cff",
  "False Positive": "#5b7086",
};

const TIER_META = [
  { tier: 4, label: "National emergency", color: "#9b7cff" },
  { tier: 3, label: "State alert", color: "#ff647c" },
  { tier: 2, label: "District alert", color: "#ff9d5c" },
  { tier: 1, label: "Facility monitor", color: "#52f0b0" },
];

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/* ---------------------------------- reveal --------------------------------- */

function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}

function Reveal({ children, className = "", delay = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={`od-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* --------------------------------- primitives ------------------------------- */

function Panel({ title, note, children, className = "" }) {
  return (
    <section className={`od-panel ${className}`}>
      {(title || note) && (
        <header className="od-panel-head">
          <h3>{title}</h3>
          {note && <span>{note}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="od-tooltip">
      {label && <div className="od-tooltip-label">{label}</div>}
      {payload.map((item, index) => (
        <div key={index} style={{ color: item.color || "#dbeafe" }}>
          {item.name}: {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }) {
  return <div className="od-empty">{message}</div>;
}

function MeterRow({ label, display, pct, color = "var(--neon-cyan)" }) {
  const width = Math.min(1, Math.max(0, pct)) * 100;
  return (
    <div className="od-meter">
      <div className="od-meter-top">
        <span>{label}</span>
        <strong style={{ color }}>{display}</strong>
      </div>
      <div className="od-meter-track">
        <span style={{ width: `${width}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>
    </div>
  );
}

function Gauge({ label, display, sub, pct, color = "#46d9ff" }) {
  const ARC = Math.PI * 40;
  const dash = Math.min(1, Math.max(0.02, pct)) * ARC;
  return (
    <div className="od-gauge">
      <svg viewBox="0 0 100 56" className="od-gauge-svg" aria-hidden="true">
        <path d="M 10 50 A 40 40 0 0 1 90 50" className="od-gauge-track" />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          className="od-gauge-arc"
          style={{ stroke: color, strokeDasharray: `${dash} ${ARC}` }}
        />
        {[0.25, 0.5, 0.75].map((t) => {
          const a = Math.PI * (1 - t);
          const x1 = 50 + Math.cos(a) * 40;
          const y1 = 50 - Math.sin(a) * 40;
          const x2 = 50 + Math.cos(a) * 33;
          const y2 = 50 - Math.sin(a) * 33;
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} className="od-gauge-tick" />;
        })}
      </svg>
      <div className="od-gauge-value">{display}</div>
      <div className="od-gauge-label">{label}</div>
      {sub && <div className="od-gauge-sub">{sub}</div>}
    </div>
  );
}

/* ------------------------------ orbit hero canvas --------------------------- */

function OrbitCanvas({ blipCount }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let width = 0;
    let height = 0;
    let t = 0;

    const stars = Array.from({ length: 110 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.2,
      s: Math.random() * 0.00045 + 0.00012,
      o: Math.random() * 0.5 + 0.2,
    }));

    const orbits = [
      { rx: 1.32, ry: 0.5, tilt: -0.32, speed: 0.35, offset: 0.4, label: "AGD-01", color: "#46d9ff" },
      { rx: 1.62, ry: 0.62, tilt: 0.26, speed: -0.22, offset: 2.4, label: "AGD-02", color: "#9b7cff" },
      { rx: 1.95, ry: 0.78, tilt: -0.12, speed: 0.16, offset: 4.4, label: "AGD-03", color: "#52f0b0" },
    ];

    const blips = Array.from({ length: Math.min(10, Math.max(4, blipCount)) }, (_, i) => ({
      a: (i * 2.399963) % (Math.PI * 2),
      d: 0.22 + ((i * 37) % 58) / 100,
      ph: i * 0.73,
      hot: i % 4 === 0,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const orbitPoint = (cx, cy, rx, ry, tilt, angle) => ({
      x: cx + rx * Math.cos(angle) * Math.cos(tilt) - ry * Math.sin(angle) * Math.sin(tilt),
      y: cy + rx * Math.cos(angle) * Math.sin(tilt) + ry * Math.sin(angle) * Math.cos(tilt),
    });

    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, width, height);

      for (const st of stars) {
        st.y += st.s;
        if (st.y > 1) st.y = 0;
        const tw = 0.6 + 0.4 * Math.sin(t * 2 + st.x * 24);
        ctx.globalAlpha = st.o * tw;
        ctx.fillStyle = "#cfe9ff";
        ctx.beginPath();
        ctx.arc(st.x * width, st.y * height, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const cx = width * 0.5;
      const cy = height * 0.6;
      const R = Math.min(width, height) * 0.27;

      const grad = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.55, R * 0.1, cx, cy, R * 1.45);
      grad.addColorStop(0, "rgba(64, 140, 210, 0.85)");
      grad.addColorStop(0.45, "rgba(18, 52, 96, 0.92)");
      grad.addColorStop(1, "rgba(3, 10, 22, 0.96)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(130, 215, 255, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 1.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(150, 210, 255, 0.09)";
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        const yy = cy + (i / 3) * R;
        const half = Math.sqrt(Math.max(0, R * R - (yy - cy) * (yy - cy)));
        ctx.beginPath();
        ctx.moveTo(cx - half, yy);
        ctx.lineTo(cx + half, yy);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * Math.abs(Math.cos(a)) || 0.6, R, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const sweep = t * 0.55;
      const sweepGrad = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
      sweepGrad.addColorStop(0, "rgba(70, 217, 255, 0)");
      sweepGrad.addColorStop(1, "rgba(70, 217, 255, 0.5)");
      ctx.strokeStyle = sweepGrad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
      ctx.stroke();
      ctx.restore();

      for (const b of blips) {
        const bx = cx + Math.cos(b.a) * b.d * R;
        const by = cy + Math.sin(b.a) * b.d * R * 0.82;
        if ((bx - cx) ** 2 + (by - cy) ** 2 > R * R) continue;
        const pulse = 0.45 + 0.4 * Math.sin(t * 3 + b.ph);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = b.hot ? "#ff647c" : "#46d9ff";
        ctx.beginPath();
        ctx.arc(bx, by, b.hot ? 2.2 : 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = pulse * 0.25;
        ctx.beginPath();
        ctx.arc(bx, by, (b.hot ? 2.2 : 1.6) + 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const orb of orbits) {
        const rx = R * orb.rx;
        const ry = R * orb.ry;
        ctx.strokeStyle = "rgba(120, 200, 255, 0.14)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, orb.tilt, 0, Math.PI * 2);
        ctx.stroke();

        const angle = t * orb.speed + orb.offset;
        const p = orbitPoint(cx, cy, rx, ry, orb.tilt, angle);
        ctx.save();
        ctx.shadowColor = orb.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = orb.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "rgba(190, 225, 250, 0.75)";
        ctx.font = "600 8.5px Inter, system-ui, sans-serif";
        ctx.fillText(orb.label, p.x + 7, p.y - 5);
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [blipCount]);

  return <canvas ref={canvasRef} className="od-orbit-canvas" aria-hidden="true" />;
}

/* ---------------------------------- dashboard ------------------------------- */

export default function Dashboard({ mlStatus, onRunML, showNavbar = true, onGoLanding }) {
  const [hotspots, setHotspots] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [mlRunning, setMlRunning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [now, setNow] = useState(() => new Date());

  const refresh = () => {
    setErrored(false);
    return Promise.all([getHotspots(), getAlerts(), getFacilities()])
      .then(([hotspotData, alertData, facilityData]) => {
        setHotspots(Array.isArray(hotspotData) ? hotspotData : []);
        setAlerts(Array.isArray(alertData) ? alertData : []);
        setFacilities(Array.isArray(facilityData) ? facilityData : []);
        setLastRefresh(new Date());
        setLoading(false);
      })
      .catch(() => {
        setErrored(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, []);

  const classified = hotspots.filter(
    (item) => item.classification && item.classification !== "False Positive"
  );
  const falsePositives = hotspots.filter((item) => item.classification === "False Positive");
  const critical = hotspots.filter((item) => safeNumber(item.risk_score) >= 76);
  const avgFrp = hotspots.length
    ? hotspots.reduce((sum, item) => sum + safeNumber(item.frp), 0) / hotspots.length
    : 0;
  const peakFrp = hotspots.length
    ? Math.max(...hotspots.map((item) => safeNumber(item.frp)))
    : 0;

  const classCounts = {};
  hotspots.forEach((item) => {
    const name = item.classification || "Unclassified";
    classCounts[name] = (classCounts[name] || 0) + 1;
  });
  const pieData = Object.entries(classCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const riskBuckets = { Critical: 0, High: 0, Moderate: 0, Low: 0 };
  hotspots.forEach((item) => {
    const score = safeNumber(item.risk_score);
    if (score >= 76) riskBuckets.Critical += 1;
    else if (score >= 56) riskBuckets.High += 1;
    else if (score >= 31) riskBuckets.Moderate += 1;
    else riskBuckets.Low += 1;
  });
  const riskBarData = Object.entries(riskBuckets).map(([name, count]) => ({
    name,
    count,
    color: { Critical: "#ff647c", High: "#ff9d5c", Moderate: "#ffc857", Low: "#52f0b0" }[name],
  }));

  const dailyAgg = {};
  hotspots.forEach((item) => {
    if (!item.acq_date) return;
    const day = new Date(item.acq_date).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
    dailyAgg[day] = dailyAgg[day] || { count: 0, frp: 0 };
    dailyAgg[day].count += 1;
    dailyAgg[day].frp += safeNumber(item.frp);
  });
  const trendData = Object.entries(dailyAgg)
    .slice(-14)
    .map(([date, v]) => ({
      date,
      count: v.count,
      avgFrp: v.count ? +(v.frp / v.count).toFixed(1) : 0,
    }));

  const priorityToTier = { 'LOW': 1, 'MODERATE': 2, 'HIGH': 3, 'CRITICAL': 4 };
  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  alerts.forEach((alert) => {
    const tier = priorityToTier[alert.priority] || 1;
    if (tier in tierCounts) tierCounts[tier] += 1;
  });

  const meterMax = Math.max(hotspots.length, 1);
  const meters = [
    { label: "Detections", display: hotspots.length.toLocaleString(), pct: hotspots.length / meterMax, color: "#46d9ff" },
    { label: "Classified", display: classified.length.toLocaleString(), pct: classified.length / meterMax, color: "#4d8dff" },
    { label: "Critical", display: critical.length.toLocaleString(), pct: critical.length / meterMax, color: "#ff647c" },
    { label: "Alerts sent", display: alerts.length.toLocaleString(), pct: alerts.length / meterMax, color: "#ffc857" },
    { label: "Suppressed", display: falsePositives.length.toLocaleString(), pct: falsePositives.length / meterMax, color: "#5b7086" },
    { label: "Facilities", display: facilities.length.toLocaleString(), pct: facilities.length / meterMax, color: "#52f0b0" },
  ];

  const stationRows = facilities.slice(0, 6).map((facility, index) => {
    const seed =
      String(facility.id ?? facility.name ?? index)
        .split("")
        .reduce((sum, ch) => sum + ch.charCodeAt(0), 0) +
      index * 7;
    return {
      name: facility.name || `Station ${index + 1}`,
      load: 34 + (seed % 62),
      warn: seed % 5 === 0,
    };
  });

  const sweepLeft = lastRefresh
    ? Math.max(0, 30 - Math.floor((now - lastRefresh) / 1000))
    : 30;
  const sweepLabel = `0:${String(sweepLeft).padStart(2, "0")}`;
  const pipelineBusy = mlRunning || mlStatus?.status === "running";
  const navigateNavbar = (target) => {
    const node = document.querySelector(target);
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const latestAlert = alerts[0];
  const alertAgo = latestAlert?.sent_at
    ? (() => {
      const mins = Math.floor((now - new Date(latestAlert.sent_at)) / 60000);
      return mins < 1 ? "just now" : `${mins}m ago`;
    })()
    : "—";

  const handleRunML = async () => {
    if (mlRunning) return;
    setMlRunning(true);
    await runMlPipeline(true).catch(() => { });
    setMlRunning(false);
    getMlStatus().then(onRunML).catch(() => { });
    refresh();
  };

  if (loading) {
    return (
      <main className="od-dashboard od-loading">
        <div className="od-topbar-skeleton" />
        <div className="od-loading-grid">
          <div className="od-loading-rail">
            {[...Array(2)].map((_, i) => (
              <div className="od-loading-panel" key={i} />
            ))}
          </div>
          <div className="od-loading-hero" />
          <div className="od-loading-rail">
            {[...Array(3)].map((_, i) => (
              <div className="od-loading-panel" key={i} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="od-dashboard">
      <div className="od-stars" aria-hidden="true" />

      {showNavbar && (
        <header className="explorer-header od-dashboard-navbar" role="banner">
          <div className="header-left">
            <div
              className="explorer-brand"
              onClick={onGoLanding}
              style={onGoLanding ? { cursor: 'pointer' } : undefined}
            >
              <span className="brand-google">Agni</span>
              <span className="brand-research">Drishti</span>
              <span className="brand-sep">|</span>
              <span className="brand-project">Satellite Thermal Explorer</span>
            </div>
            <nav className="explorer-breadcrumbs" aria-label="Breadcrumb">
              <span className="breadcrumb-item">Overview</span>
              <span className="breadcrumb-arrow">&gt;</span>
              <span className="breadcrumb-item active">Dashboard</span>
            </nav>
          </div>
          <nav className="header-center-tabs" aria-label="Primary navigation">
            <button className="nav-tab-btn" onClick={() => navigateNavbar(".od-hero")}>Live Map</button>
            <button className="nav-tab-btn is-active" onClick={() => navigateNavbar(".od-layout")}>
              Dashboard<span className="active-indicator-bar" />
            </button>
            <button className="nav-tab-btn" onClick={() => navigateNavbar(".od-alerts")}>Incidents</button>
          </nav>
          <div className="header-right">
            <div className="od-status-pill"><span className="od-status-dot" />Live<em>{lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</em></div>
            <button className="od-nav-icon" onClick={() => navigateNavbar(".od-alerts")} aria-label="View incidents">
              <span className="od-bell">◌</span>
              {alerts.length > 0 && <b>{alerts.length}</b>}
            </button>
            <button className="od-nav-icon" onClick={() => navigateNavbar(".od-dashboard")} aria-label="Back to overview">⌘</button>
            <button className="header-cta-btn od-dashboard-run" onClick={handleRunML} disabled={pipelineBusy}>
              {pipelineBusy ? "Pipeline running" : "Run analysis"}<span className="cta-arrow">↗</span>
            </button>
          </div>
        </header>
      )}

      {errored && (
        <div className="od-error">
          <span>Live data could not be refreshed. Showing the last available results.</span>
          <button onClick={refresh}>Retry</button>
        </div>
      )}

      <div className="od-layout">
        {/* ------------------------------- left rail ------------------------------ */}
        <aside className="od-rail">
          <Reveal>
            <Panel title="Detection load" note="Live feed">
              <div className="od-meter-stack">
                {meters.map((m) => (
                  <MeterRow key={m.label} {...m} />
                ))}
              </div>
            </Panel>
          </Reveal>
          <Reveal delay={70}>
            <Panel title="Ground stations" note={`${facilities.length} sites`}>
              {stationRows.length === 0 ? (
                <EmptyState message="No facilities on record." />
              ) : (
                <div className="od-station-list">
                  {stationRows.map((row, index) => (
                    <div className="od-station-row" key={index}>
                      <div className="od-station-top">
                        <span className={`od-station-dot ${row.warn ? "is-warn" : ""}`} />
                        <span className="od-station-name" title={row.name}>
                          {row.name}
                        </span>
                        <strong>{row.load}</strong>
                      </div>
                      <div className="od-station-track">
                        <span
                          style={{
                            width: `${row.load}%`,
                            background: row.warn ? "#ffc857" : "#46d9ff",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </Reveal>
        </aside>

        {/* ------------------------------- center stage ---------------------------- */}
        <section className="od-stage">
          <Reveal>
            <div className="od-hero">
              <PixelatedWorldMap blipCount={classified.length} hotspots={classified} />
              <div className="od-hero-overlay">
                <div className="od-mission">
                  <div className="od-mission-id">
                    <span className="od-mission-dot" />
                    AGNIDRISHTI-01 · Thermal sweep
                  </div>
                  <div className="od-mission-sub">Monitored network · NEO constellation</div>
                </div>
                <div className="od-gauges">
                  <Gauge
                    label="Average FRP"
                    display={avgFrp ? `${avgFrp.toFixed(1)}` : "—"}
                    sub="MW · current"
                    pct={peakFrp ? avgFrp / peakFrp : 0}
                    color="#46d9ff"
                  />
                  <Gauge
                    label="Peak FRP"
                    display={peakFrp ? `${peakFrp.toFixed(1)}` : "—"}
                    sub="MW · target"
                    pct={peakFrp ? peakFrp / Math.max(peakFrp, 1) : 0}
                    color="#ff647c"
                  />
                </div>
                <div className="od-chips">
                  <div className="od-chip">
                    <span className="od-chip-icon">◉</span>
                    <div>
                      <em>Hotspots tracked</em>
                      <strong>{classified.length.toLocaleString()} satellites</strong>
                    </div>
                  </div>
                  <div className="od-chip">
                    <span className="od-chip-icon is-alert">⚠</span>
                    <div>
                      <em>Latest alert</em>
                      <strong>{alertAgo}</strong>
                    </div>
                  </div>
                  <div className="od-chip">
                    <span className="od-chip-icon is-cyan">⟳</span>
                    <div>
                      <em>Next sweep</em>
                      <strong>T-{sweepLabel}</strong>
                    </div>
                  </div>
                  <div className="od-chip">
                    <span className={`od-chip-icon ${pipelineBusy ? "is-busy" : "is-green"}`}>⬡</span>
                    <div>
                      <em>Pipeline</em>
                      <strong>{pipelineBusy ? "Processing" : mlStatus?.status || "Standby"}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <div className="od-section-head">
              <span>01 / Signal profile</span>
              <h2>What the network is seeing</h2>
            </div>
            <div className="od-duo">
              <Panel title="Classification" note="validated signals">
                {pieData.length ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={88}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="rgba(5, 11, 20, 0.6)"
                        strokeWidth={1}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={index} fill={CLASS_COLORS[entry.name] || "#5b7086"} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <ReLegend
                        formatter={(value) => (
                          <span className="od-legend-text">{value}</span>
                        )}
                        iconSize={7}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState message="Run analysis to classify current detections." />
                )}
              </Panel>
              <Panel title="Risk distribution" note="score bands">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={riskBarData} barSize={36}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "#7890a7" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#7890a7" }}
                      axisLine={false}
                      tickLine={false}
                      width={26}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(70, 217, 255, 0.05)" }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {riskBarData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </div>
          </Reveal>

          <Reveal delay={90}>
            <Panel title="Response log" note="latest escalations">
              {alerts.length === 0 ? (
                <EmptyState message="No alerts have been recorded." />
              ) : (
                <div className="od-alerts">
                  {alerts.slice(0, 5).map((a) => {
                    const mappedTier = { 'LOW': 1, 'MODERATE': 2, 'HIGH': 3, 'CRITICAL': 4 }[a.priority] || 1;
                    const meta = TIER_META.find((t) => t.tier === mappedTier);
                    const msg = a.district ? `${a.ml_result?.classification || 'Fire'} detected in ${a.district}` : `${a.ml_result?.classification || 'Fire'} detection event`;
                    return (
                      <article className="od-alert-row" key={a.id}>
                        <span
                          className="od-tier-chip"
                          style={{ color: meta?.color, borderColor: meta?.color }}
                        >
                          Tier {mappedTier}
                        </span>
                        <time>
                          {a.created_at
                            ? new Date(a.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                            : "—"}
                        </time>
                        <p>{msg}</p>
                      </article>
                    );
                  })}
                </div>
              )}
            </Panel>
          </Reveal>
        </section>

        {/* ------------------------------- right rail ------------------------------ */}
        <aside className="od-rail">
          <Reveal delay={40}>
            <Panel title="Incident traffic" note="14 day">
              {trendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="odIncidentFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#46d9ff" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#46d9ff" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(117, 190, 231, 0.08)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 8.5, fill: "#7890a7" }}
                      axisLine={false}
                      tickLine={false}
                      interval={1}
                    />
                    <YAxis
                      tick={{ fontSize: 8.5, fill: "#7890a7" }}
                      axisLine={false}
                      tickLine={false}
                      width={24}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Detections"
                      stroke="#46d9ff"
                      strokeWidth={2}
                      fill="url(#odIncidentFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="Not enough data for a trend view." />
              )}
            </Panel>
          </Reveal>
          <Reveal delay={80}>
            <Panel title="Signal flow" note="avg FRP">
              {trendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(117, 190, 231, 0.08)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 8.5, fill: "#7890a7" }}
                      axisLine={false}
                      tickLine={false}
                      interval={1}
                    />
                    <YAxis
                      tick={{ fontSize: 8.5, fill: "#7890a7" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="avgFrp"
                      name="Avg FRP"
                      stroke="#9b7cff"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3, fill: "#9b7cff" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="Not enough data for a signal view." />
              )}
            </Panel>
          </Reveal>
          <Reveal delay={120}>
            <Panel title="Escalation status" note="tiers">
              <div className="od-tiers">
                {TIER_META.map(({ tier, label, color }) => {
                  const count = tierCounts[tier] || 0;
                  const maxCount = Math.max(...Object.values(tierCounts), 1);
                  return (
                    <div className="od-tier" key={tier}>
                      <div className="od-tier-top">
                        <span>{label}</span>
                        <strong style={{ color }}>{count}</strong>
                      </div>
                      <div className="od-tier-track">
                        <span
                          style={{
                            width: `${(count / maxCount) * 100}%`,
                            background: color,
                            boxShadow: `0 0 8px ${color}`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {mlStatus?.summary && (
                <div className="od-ml-summary">
                  {[
                    ["Total processed", mlStatus.summary.total || 0],
                    ["Classified", mlStatus.summary.patched || 0],
                    ["False positives", mlStatus.summary.debunked || 0],
                    ["Incidents filed", mlStatus.summary.incidents || 0],
                  ].map(([label, value]) => (
                    <div className="od-summary-row" key={label}>
                      <span>{label}</span>
                      <strong>{value.toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </Reveal>
        </aside>
      </div>
    </main>
  );
}