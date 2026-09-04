/*
 * AgniDrishti Entrance — Clean Cinematic Video Background
 * The background video contains the Earth, satellites, and laser beams.
 * Overlaid with telemetry HUD, brand title, and "Enter Mission Control" trigger.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./EnteringPage.css";

const EARTH_ROTATION_VIDEO = "/assets/upscaled-video.mp4";

export default function EnteringPage({ onEnter, onEnterDashboard }) {
  const [fadeOut, setFadeOut] = useState(false);
  const [hudTime, setHudTime] = useState("");
  const enterTimerRef = useRef(null);

  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => ({
        id: index,
        left: `${10 + Math.random() * 80}%`,
        delay: `${Math.random() * 5}s`,
        duration: `${8 + Math.random() * 7}s`,
        size: `${1 + Math.random() * 2}px`,
        color: Math.random() > 0.45 ? "rgba(72, 215, 255, .55)" : "rgba(173, 222, 255, .35)",
      })),
    [],
  );

  useEffect(() => {
    const updateTime = () => setHudTime(`${new Date().toISOString().slice(11, 19)} UTC`);
    updateTime();
    const interval = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
    };
  }, []);

  const handleEnter = useCallback(() => {
    if (fadeOut) return;
    setFadeOut(true);
    enterTimerRef.current = window.setTimeout(() => {
      if (onEnter) onEnter();
      if (onEnterDashboard) onEnterDashboard();
    }, 1000);
  }, [fadeOut, onEnter, onEnterDashboard]);

  return (
    <main className={`entering-page ${fadeOut ? "fade-out" : ""}`}>
      {/* Full-screen Video Background */}
      <video
        className="earth-video-bg"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      >
        <source src={EARTH_ROTATION_VIDEO} type="video/mp4" />
      </video>

      {/* Subtle cinematic vignette overlay */}
      <div className="vignette" aria-hidden="true" />
      <div className="scan-lines" aria-hidden="true" />

      {/* Floating particles */}
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="particle"
          style={{
            left: particle.left,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
            width: particle.size,
            height: particle.size,
            background: particle.color,
          }}
        />
      ))}

      {/* HUD Telemetry in 4 Corners */}
      <div className="hud-corner top-left">
        <div className="hud-brand">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="#48d7ff" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="4" fill="#f1c36c" />
          </svg>
          <span>AGNIDRISHTI</span>
        </div>
        <span>SYS::AGNIDRISHTI v2.1</span><br />
        <span>Satellite Link <b>● Active</b></span>
      </div>

      <div className="hud-corner top-right">
        <span>{hudTime}</span><br />
        <span>Orbit Stable</span>
      </div>

      <div className="hud-corner bottom-left">
        <span>Thermal Array Online</span><br />
        <span>Monitoring 24/7</span>
      </div>

      <div className="hud-corner bottom-right">
        <span>ISRO • DRDO • SIH</span><br />
        <span>Secure Channel</span>
      </div>

      {/* Center Brand & Enter Button */}
      <section className="entering-content" aria-label="AgniDrishti mission entry">
        <p className="eyebrow">
          <span className="eyebrow-line" />
          Orbital thermal intelligence
          <span className="eyebrow-line" />
        </p>

        <div className="title-lockup">
          <span className="title-orbit" aria-hidden="true" />
          <span className="title-signal" aria-hidden="true" />
          <h1 className="entering-title">
            Agni<span>Drishti</span>
          </h1>
        </div>

        <p className="entering-subtitle">Satellite Thermal Intelligence</p>
        <p className="entering-tagline">
          <span className="tagline-pip" aria-hidden="true" />
          Real-time wildfire &amp; industrial heat monitoring from orbit
        </p>

        <button
          className="enter-btn"
          type="button"
          onClick={handleEnter}
          disabled={fadeOut}
        >
          <span>Enter Mission Control</span>
          <span className="enter-arrow" aria-hidden="true">↗</span>
        </button>
      </section>

      {/* Loading indicator bar */}
      <div className="entering-loading-bar" aria-label="Satellite link loading">
        <div className="entering-loading-fill" />
      </div>

      <div className="frame-corner frame-corner-tl" aria-hidden="true" />
      <div className="frame-corner frame-corner-br" aria-hidden="true" />
    </main>
  );
}