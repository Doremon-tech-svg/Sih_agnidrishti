import React, { useEffect, useState } from 'react';
import { getPendingAlerts, confirmAlert } from './api.js';

export default function AdminAlerts({ onClose }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(null);

    useEffect(() => {
        load();
    }, []);

    async function load() {
        setLoading(true);
        try {
            const rows = await getPendingAlerts();
            setAlerts(rows || []);
        } catch (e) { console.warn(e); }
        setLoading(false);
    }

    async function handleConfirm(id) {
        setConfirming(id);
        try {
            await confirmAlert(id);
            await load();
        } catch (e) { console.warn(e); }
        setConfirming(null);
    }

    return (
        <div className="admin-alerts-modal" style={{ position: 'absolute', right: 16, top: 72, width: 420, maxHeight: '70vh', overflowY: 'auto', background: 'white', padding: 12, borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 120 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong>Pending Alerts</strong>
                <div>
                    <button onClick={onClose} style={{ marginLeft: 8 }}>Close</button>
                </div>
            </div>

            {loading ? <div>Loading...</div> : (
                alerts.length === 0 ? <div>No pending alerts</div> : (
                    alerts.map(a => (
                        <div key={a.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0' }}>
                            <div style={{ fontSize: 13, color: '#333' }}>Alert #{a.id} · {new Date(a.created_at).toLocaleString()}</div>
                            <pre style={{ fontSize: 11, background: '#fafafa', padding: 8, borderRadius: 4, overflowX: 'auto' }}>{JSON.stringify(a.payload, null, 2)}</pre>
                            <div style={{ marginTop: 6 }}>
                                <button disabled={confirming===a.id} onClick={() => handleConfirm(a.id)}>
                                    {confirming===a.id ? 'Confirming…' : 'Confirm & Dispatch'}
                                </button>
                            </div>
                        </div>
                    ))
                )
            )}
        </div>
    );
}
