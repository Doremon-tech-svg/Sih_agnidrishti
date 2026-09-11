import React from "react";
import { playUiClick } from "./audioEffects.js";
import ProfileBadge from "./ProfileBadge.jsx";

function TopbarBadge({ status }) {
    if (!status || status.status === 'never_run') return null;
    if (status.status === 'running') {
        return <span className="badge badge-running pulse-running">⟳ ML Running</span>;
    }
    if (status.status === 'done' && status.summary) {
        const { validated = 0, patched = 0 } = status.summary;
        return (
            <span className="badge badge-done">
                ✓ {(patched || validated).toLocaleString()} classified
            </span>
        );
    }
    if (status.status === 'error') {
        return <span className="badge badge-critical">✗ ML Error</span>;
    }
    return null;
}

export default function UnifiedNavbar({
    brandLabel = "Satellite Thermal Explorer",
    breadcrumbs = ["Overview", "World Map"],
    tabs = [],
    activeTab = null,
    onTabClick,
    onLogoClick,
    rightSlot,
    user,
    onLogout,
    mlStatus,
    hotspotCount,
    showSoundToggle = false,
    soundOn = false,
    onToggleSound,
    showNotifications = false,
    notificationsCount = 0,
    showAppGrid = false,
    onAppGrid,
    ctaLabel,
    onCtaClick,
    signOutLabel,
    onSignOut,
    children,
}) {
    return (
        <header className="explorer-header unified-navbar" role="banner">
            <div className="header-left">
                <div
                    className="explorer-brand"
                    onClick={() => { playUiClick(); onLogoClick && onLogoClick(); }}
                    style={onLogoClick ? { cursor: 'pointer' } : undefined}
                >
                    <span className="brand-google">Agni</span>
                    <span className="brand-research">Drishti</span>
                    <span className="brand-sep">|</span>
                    <span className="brand-project">{brandLabel}</span>
                </div>
                {breadcrumbs.length > 0 && (
                    <nav className="explorer-breadcrumbs">
                        {breadcrumbs.map((crumb, idx) => (
                            <React.Fragment key={crumb + idx}>
                                {idx > 0 && <span className="breadcrumb-arrow">&gt;</span>}
                                <span className={`breadcrumb-item ${idx === breadcrumbs.length - 1 ? "active" : ""}`}>
                                    {crumb}
                                </span>
                            </React.Fragment>
                        ))}
                    </nav>
                )}
            </div>

            {tabs.length > 0 && (
                <nav className="header-center-tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            className={`nav-tab-btn ${activeTab === tab.id ? "is-active" : ""}`}
                            onClick={() => { playUiClick(); onTabClick && onTabClick(tab.id); }}
                        >
                            {tab.label}
                            {activeTab === tab.id && <span className="active-indicator-bar" />}
                        </button>
                    ))}
                </nav>
            )}

            <div className="header-right">
                {mlStatus !== undefined && <TopbarBadge status={mlStatus} />}

                {hotspotCount != null && (
                    <div className="unified-stat-pill">
                        🔥 <b>{hotspotCount.toLocaleString()}</b> <span>hotspots</span>
                    </div>
                )}

                {showSoundToggle && (
                    <button
                        className={`sound-toggle-btn ${soundOn ? "is-on" : ""}`}
                        onClick={() => { playUiClick(); onToggleSound && onToggleSound(); }}
                    >
                        <span className="sound-bars"><span className="bar" /><span className="bar" /><span className="bar" /></span>
                        <span>{soundOn ? "Sound on" : "Sound off"}</span>
                    </button>
                )}

                {showNotifications && (
                    <button
                        className="notification-bell"
                        onClick={() => { playUiClick(); onAppGrid && onAppGrid(); }}
                        aria-label="Notifications"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        {notificationsCount > 0 && <span className="notification-badge">{notificationsCount}</span>}
                    </button>
                )}

                {showAppGrid && (
                    <button className="app-grid-icon-btn" onClick={() => { playUiClick(); onAppGrid && onAppGrid(); }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="5" cy="5" r="2" />
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="19" cy="5" r="2" />
                            <circle cx="5" cy="12" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="19" cy="12" r="2" />
                            <circle cx="5" cy="19" r="2" />
                            <circle cx="12" cy="19" r="2" />
                            <circle cx="19" cy="19" r="2" />
                        </svg>
                    </button>
                )}

                {ctaLabel && (
                    <button className="header-cta-btn" onClick={() => { playUiClick(); onCtaClick && onCtaClick(); }}>
                        <span>{ctaLabel}</span>
                        <span className="cta-arrow">↗</span>
                    </button>
                )}

                {rightSlot}

                {user && (
                    <ProfileBadge user={user} onLogout={onLogout} />
                )}

                {signOutLabel && onSignOut && !user && (
                    <button className="header-logout-btn" onClick={() => { playUiClick(); onSignOut(); }}>
                        {signOutLabel}
                    </button>
                )}

                {children}
            </div>
        </header>
    );
}
