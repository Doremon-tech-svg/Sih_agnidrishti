import React, { useState, useEffect } from 'react';
import { getUser, updateUserLocation } from './api.js';

export default function ProfileLocation() {
    const [user, setUser] = useState(getUser() || null);
    const [lat, setLat] = useState(user?.work_lat || '');
    const [lon, setLon] = useState(user?.work_lon || '');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => { setUser(getUser()); }, []);

    async function save() {
        if (!user) return setMsg('Not logged in');
        const uId = user.id;
        const la = parseFloat(lat);
        const lo = parseFloat(lon);
        if (!isFinite(la) || !isFinite(lo)) return setMsg('Enter valid lat/lon');
        setSaving(true);
        try {
            await updateUserLocation(uId, la, lo);
            setMsg('Location saved');
        } catch (e) { setMsg('Save failed'); }
        setSaving(false);
    }

    return (
        <div style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.9)', width: 280 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Profile: Workplace Location</div>
            <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="Latitude" value={lat} onChange={e=>setLat(e.target.value)} style={{ flex: 1 }} />
                <input placeholder="Longitude" value={lon} onChange={e=>setLon(e.target.value)} style={{ flex: 1 }} />
            </div>
            <div style={{ marginTop: 8 }}>
                <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save location'}</button>
                <span style={{ marginLeft: 8 }}>{msg}</span>
            </div>
        </div>
    );
}
