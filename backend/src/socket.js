/**
 * backend/src/socket.js
 * 
 * Socket.IO implementation for real-time alerts on the frontend.
 */

import { Server } from 'socket.io';

let io;

export function initializeSocket(server) {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket.IO] Client connected: ${socket.id}`);
        
        // Clients can join a room for their district to only receive relevant alerts
        socket.on('join_district', (district) => {
            if (district) {
                socket.join(`district_${district}`);
                console.log(`[Socket.IO] Client ${socket.id} joined district_${district}`);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
        });
    });

    return io;
}

export function getIO() {
    if (!io) {
        throw new Error('Socket.IO has not been initialized');
    }
    return io;
}

/**
 * Broadcasts an alert update to clients in the specified district, or to everyone if no district.
 */
export function broadcastAlertUpdate(alert, district = null) {
    if (!io) return;
    
    if (district) {
        io.to(`district_${district}`).emit('alert_update', alert);
    } else {
        io.emit('alert_update', alert);
    }
}
