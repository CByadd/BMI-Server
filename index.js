// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: [
			'http://localhost:5173',
			'http://localhost:5174',
			'http://localhost:3000',
			'http://localhost:8080',
			'https://bmi-client.vercel.app',
			'https://bmi-client.onrender.com',
			'https://adscape.co.in',
			'https://admin.adscape.co.in',
			'https://billboard-admin-x.vercel.app',
			'http://127.0.0.1:5500',
            'https://bmi-client.onrender.com',
			'*' // Allow all for development
		],
		methods: ['GET', 'POST'],
		allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-bmi-token', 'x-bmi-session', 'x-client-id'],
		credentials: true
	}
});
// Prisma - use shared instance
const prisma = require('./db');

app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'http://localhost:8080',
        'https://bmi-client.vercel.app',
        'https://bmi-client.onrender.com',
        'https://adscape.co.in',
        'https://admin.adscape.co.in',
        'https://billboard-admin-x.vercel.app',
        'http://127.0.0.1:5500',
        'https://bmi-client.onrender.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-bmi-token', 'x-bmi-session', 'x-client-id']
}));

// Manual CORS headers as fallback
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:8080',
    'https://bmi-client.vercel.app',
    'https://bmi-client.onrender.com',
    'https://adscape.co.in',
    'https://admin.adscape.co.in',
    'https://billboard-admin-x.vercel.app',
    'http://127.0.0.1:5500'
];

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning, x-bmi-token, x-bmi-session, x-client-id');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use(express.json());
// Basic request logger
app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    if (req.method !== 'GET') {
        try { 
            console.log('[HTTP] body:', JSON.stringify(req.body)); 
            console.log('[HTTP] body type:', typeof req.body);
            console.log('[HTTP] body length:', req.body ? Object.keys(req.body).length : 'null');
        } catch (e) {
            console.log('[HTTP] body parse error:', e.message);
        }
    }
    next();
});

// BMI Flow Routes
const bmiFlowRoutes = require('./routes/bmiFlowRoutes');

// Admin Panel Routes
const adminRoutes = require('./routes/adminRoutes');
const screenRoutes = require('./routes/screenRoutes');
const billboardRoutes = require('./routes/billboardRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const slotRoutes = require('./routes/slotRoutes');
const registrationRoutes = require('./routes/registrationRoutes');

// Players join rooms by screenId
io.on('connection', (socket) => {
    const authToken = socket.handshake.auth && socket.handshake.auth.bmiToken;
    console.log('[SOCKET] [CONNECT] ✅ New connection:', {
        socketId: socket.id,
        address: socket.handshake.address,
        headers: socket.handshake.headers,
        query: socket.handshake.query,
        transport: socket.conn.transport.name,
        bmiToken: authToken || null
    });

    // Optionally validate the BMI token against our in-memory store
    if (authToken) {
        try {
            const tokenManager = require('./controllers/tokenManager');
            const tokenData = tokenManager.getToken(authToken);
            if (tokenData) {
                console.log('[SOCKET] [AUTH] ✅ BMI token is valid for screenId:', tokenData.screenId);
                socket.data.bmiToken = authToken;
                socket.data.screenIdFromToken = tokenData.screenId;
            } else {
                console.log('[SOCKET] [AUTH] ⚠️ BMI token not found or expired');
            }
        } catch (e) {
            console.error('[SOCKET] [AUTH] Error validating BMI token:', e);
        }
    }

    socket.on('player-join', (data) => {
		try {
            console.log('[SOCKET] [JOIN] player-join event received:', {
                socketId: socket.id,
                data: data,
                dataType: typeof data,
                screenId: data?.screenId,
                machineId: data?.machineId,
                type: data?.type
            });
            const screenId = String(data?.screenId || '');
            const machineId = String(data?.machineId || '');
            const clientType = String(data?.type || 'unknown');
            
            console.log('[SOCKET] [JOIN] Parsed join data:', { socketId: socket.id, screenId, machineId, clientType });
            
			if (screenId) {
				const roomName = `screen:${screenId}`;
				socket.join(roomName);
                console.log(`[SOCKET] [JOIN] ✅ Socket ${socket.id} joined room: ${roomName}`);
                console.log(`[SOCKET] [JOIN] Room ${roomName} now has ${io.sockets.adapter.rooms.get(roomName)?.size || 0} socket(s)`);
			} else {
                console.log('[SOCKET] [JOIN] ⚠️ No screenId provided, cannot join room');
            }
		} catch (e) {
            console.error('[SOCKET] [JOIN] ❌ player-join error:', e);
		}
	});

    socket.on('disconnect', (reason) => {
        console.log('[SOCKET] [DISCONNECT] Socket disconnected:', {
            socketId: socket.id,
            reason: reason
        });
	});

    // Optional: Android can emit an explicit "android-ready" event once fully initialized
    socket.on('android-ready', (data = {}) => {
        try {
            const screenId = String(data.screenId || data.machineId || '');
            console.log('[SOCKET] [ANDROID-READY] Android reported ready:', {
                socketId: socket.id,
                screenId,
                data
            });

            if (screenId) {
                const roomName = `screen:${screenId}`;
                console.log('[SOCKET] [ANDROID-READY] Broadcasting android-ready to room:', roomName);
                io.to(roomName).emit('android-ready', {
                    screenId,
                    timestamp: Date.now()
                });
                console.log('[SOCKET] [ANDROID-READY] ✅ Broadcasted android-ready to room:', roomName);
            }
        } catch (e) {
            console.error('[SOCKET] [ANDROID-READY] Error:', e);
        }
    });

    // Web client can notify that a token/session has expired
    socket.on('token-expired', (data = {}) => {
        try {
            const screenId = String(data.screenId || data.machineId || '');
            const token = String(data.token || '');
            console.log('[SOCKET] [TOKEN-EXPIRED] Token expired notification from client:', {
                socketId: socket.id,
                screenId,
                token,
                data
            });

            if (screenId && token) {
                const roomName = `screen:${screenId}`;
                console.log('[SOCKET] [TOKEN-EXPIRED] Broadcasting token-expired to room:', roomName);
                io.to(roomName).emit('token-expired', {
                    screenId,
                    token,
                    timestamp: Date.now()
                });
                console.log('[SOCKET] [TOKEN-EXPIRED] ✅ Broadcasted token-expired to room:', roomName);
            }
        } catch (e) {
            console.error('[SOCKET] [TOKEN-EXPIRED] Error:', e);
        }
    });
    
    // Listen for screen state change from Android
    socket.on('screen-state-change', (data) => {
        try {
            const screenId = String(data?.screenId || '');
            const state = String(data?.state || '');
            const token = String(data?.token || '');
            console.log('[SOCKET] [SCREEN-STATE] Android screen state changed:', {
                socketId: socket.id,
                screenId: screenId,
                state: state,
                token: token,
                data: data
            });
            
            // Update token state if token provided
            if (token) {
                const tokenManager = require('./controllers/tokenManager');
                tokenManager.updateTokenState(token, state, socket.id);
            }
            
            if (screenId && state) {
                // Broadcast to all clients in the room (including web client)
                const roomName = `screen:${screenId}`;
                console.log('[SOCKET] [SCREEN-STATE] Broadcasting to room:', roomName, 'state:', state);
                io.to(roomName).emit('android-screen-state', {
                    screenId: screenId,
                    state: state, // "qr", "loading", "bmi", "fortune"
                    token: token,
                    timestamp: data?.timestamp || Date.now()
                });
                console.log('[SOCKET] [SCREEN-STATE] ✅ Broadcasted to room:', roomName, 'state:', state);
            }
        } catch (e) {
            console.error('[SOCKET] [SCREEN-STATE] Error:', e);
        }
    });
    
    // Listen for payment-received confirmation from Android (legacy, keeping for compatibility)
    socket.on('payment-received', (data) => {
        try {
            const screenId = String(data?.screenId || '');
            console.log('[SOCKET] [PAYMENT-RECEIVED] Android confirmed payment received:', {
                socketId: socket.id,
                screenId: screenId,
                data: data
            });
            
            if (screenId) {
                // Broadcast to all clients in the room (including web client)
                const roomName = `screen:${screenId}`;
                console.log('[SOCKET] [PAYMENT-RECEIVED] Broadcasting to room:', roomName);
                io.to(roomName).emit('android-payment-received', {
                    screenId: screenId,
                    timestamp: data?.timestamp || Date.now()
                });
                console.log('[SOCKET] [PAYMENT-RECEIVED] ✅ Broadcasted to room:', roomName);
            }
        } catch (e) {
            console.error('[SOCKET] [PAYMENT-RECEIVED] Error:', e);
        }
    });
    
    // Log all events for debugging
    const originalOnevent = socket.onevent;
    socket.onevent = function (packet) {
        const args = packet.data || [];
        if (args[0] && args[0] !== 'player-join' && args[0] !== 'disconnect' && args[0] !== 'payment-received') {
            console.log('[SOCKET] [EVENT] Received event:', {
                socketId: socket.id,
                event: args[0],
                data: args.slice(1)
            });
        }
        originalOnevent.call(this, packet);
    };
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Note: Adscape registration is now handled by screenRoutes
// POST /api/adscape/register -> Register Adscape player (moved to routes/screenRoutes.js)
/* app.post('/api/adscape/register', async (req, res) => {
    try {
        const { 
            screenId, 
            appVersion, 
            flowType, 
            deviceName, 
            screenWidth, 
            screenHeight, 
            ipAddress, 
            location, 
            osVersion, 
            appVersionCode 
        } = req.body || {};
        
        if (!screenId || !appVersion) {
            return res.status(400).json({ error: 'screenId and appVersion required' });
        }
        
        // Upsert Adscape player registration
        const player = await prisma.adscapePlayer.upsert({
            where: { screenId: String(screenId) },
            update: {
                appVersion: String(appVersion),
                // Only update flowType if provided, otherwise keep existing value
                ...(flowType !== undefined && flowType !== null ? { flowType: String(flowType) } : {}),
                deviceName: deviceName ? String(deviceName) : null,
                screenWidth: screenWidth ? Number(screenWidth) : null,
                screenHeight: screenHeight ? Number(screenHeight) : null,
                ipAddress: ipAddress ? String(ipAddress) : null,
                location: location ? String(location) : null,
                osVersion: osVersion ? String(osVersion) : null,
                appVersionCode: appVersionCode ? String(appVersionCode) : null,
                lastSeen: new Date(),
                isActive: true,
                updatedAt: new Date()
            },
            create: {
                screenId: String(screenId),
                appVersion: String(appVersion),
                flowType: flowType ? String(flowType) : null,
                deviceName: deviceName ? String(deviceName) : null,
                screenWidth: screenWidth ? Number(screenWidth) : null,
                screenHeight: screenHeight ? Number(screenHeight) : null,
                ipAddress: ipAddress ? String(ipAddress) : null,
                location: location ? String(location) : null,
                osVersion: osVersion ? String(osVersion) : null,
                appVersionCode: appVersionCode ? String(appVersionCode) : null,
                lastSeen: new Date(),
                isActive: true
            }
        });
        
        console.log('[ADSCAPE] Player registered:', { screenId, appVersion, flowType });
        
        return res.json({ 
            ok: true, 
            player: {
                id: player.id,
                screenId: player.screenId,
                appVersion: player.appVersion,
                flowType: player.flowType,
                isActive: player.isActive
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Registration error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// Note: All adscape endpoints are now handled by screenRoutes
// GET /api/adscape/player/:screenId -> Get player flow type (moved to routes/screenRoutes.js)
/* app.get('/api/adscape/player/:screenId', async (req, res) => {
    try {
        const { screenId } = req.params;
        
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                appVersion: player.appVersion,
                flowType: player.flowType,
                isActive: player.isActive
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Get player error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
}); */

// GET /api/adscape/players -> Get all players (moved to routes/screenRoutes.js)
/* app.get('/api/adscape/players', async (req, res) => {
    try {
        console.log('[ADSCAPE] Getting all players');
        
        const players = await prisma.adscapePlayer.findMany({
            orderBy: { lastSeen: 'desc' }
        });
        
        res.json({ 
            success: true, 
            players 
        });
    } catch (error) {
        console.error('[ADSCAPE] Get players error:', error);
        res.status(500).json({ error: 'Failed to get players' });
    }
}); */

// PUT /api/adscape/player/:screenId/flow-type -> Update player flow type (moved to routes/screenRoutes.js)
/* app.put('/api/adscape/player/:screenId/flow-type', async (req, res) => {
    try {
        const { screenId } = req.params;
        const { flowType } = req.body;
        
        console.log('[ADSCAPE] Updating flow type for player:', screenId, 'to:', flowType);
        
        const player = await prisma.adscapePlayer.update({
            where: { screenId },
            data: { flowType }
        });
        
        res.json({ 
            success: true, 
            player 
        });
    } catch (error) {
        console.error('[ADSCAPE] Update flow type error:', error);
        res.status(500).json({ error: 'Failed to update flow type' });
    }
}); */

// DELETE /api/adscape/player/:screenId -> Delete player (moved to routes/screenRoutes.js)
/* app.delete('/api/adscape/player/:screenId', async (req, res) => {
    try {
        const { screenId } = req.params;
        console.log('[ADSCAPE] Deleting player:', screenId);
        
        await prisma.adscapePlayer.delete({
            where: { screenId }
        });
        
        res.json({ 
            success: true, 
            message: 'Player deleted successfully' 
        });
    } catch (error) {
        console.error('[ADSCAPE] Delete player error:', error);
        res.status(500).json({ error: 'Failed to delete player' });
    }
}); */

// Mount BMI Flow Routes
app.use('/api', bmiFlowRoutes(io));

// Mount Admin Panel Routes
app.use('/api', adminRoutes);
app.use('/api', screenRoutes(io)); // Pass io for real-time updates
app.use('/api/billboards', billboardRoutes);
app.use('/api', campaignRoutes);
app.use('/api', slotRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/media', require('./routes/mediaRoutes'));
app.use('/api', require('./routes/playlistRoutes'));
app.use('/api', require('./routes/scheduleRoutes'));
app.use('/api', require('./routes/defaultAssetRoutes'));


const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
	console.log(`Server listening on :${PORT}`);
});

// Global error handler to ensure JSON responses
app.use((err, req, res, next) => {
    console.error('[SERVER] Global error:', err);
    res.status(500).json({ 
        error: 'internal_server_error', 
        message: err.message,
        path: req.path
    });
});

// Catch-all route for undefined endpoints
app.use('*', (req, res) => {
    console.log(`[SERVER] 404 for ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
        error: 'not_found', 
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        path: req.originalUrl
    });
});


