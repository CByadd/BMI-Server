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
			'https://bmi-client.vercel.app',
			'https://bmi-client.onrender.com',
			'https://adscape.co.in',
			'https://admin.adscape.co.in',
			'https://billboard-admin-x.vercel.app',
			'http://127.0.0.1:5500',
			'*' // Allow all for development
		],
		methods: ['GET', 'POST'],
		allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
		credentials: true
	}
});
// Prisma
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'https://bmi-client.vercel.app',
        'https://bmi-client.onrender.com',
        'https://adscape.co.in',
        'https://admin.adscape.co.in',
        'https://billboard-admin-x.vercel.app',
        'http://127.0.0.1:5500'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));

// Manual CORS headers as fallback
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning');
    
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
    console.log('[SOCKET] connected', socket.id, 'from', socket.handshake.address);

    socket.on('player-join', (data) => {
		try {
            const screenId = String(data?.screenId || '');
            console.log('[SOCKET] player-join', { socketId: socket.id, screenId, data });
			if (screenId) {
				socket.join(`screen:${screenId}`);
                console.log(`[SOCKET] joined room screen:${screenId}`);
			}
		} catch (e) {
            console.error('[SOCKET] player-join error', e);
		}
	});

    socket.on('disconnect', (reason) => {
        console.log('[SOCKET] disconnected', socket.id, 'reason:', reason);
	});
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
app.use('/api', screenRoutes);
app.use('/api/billboards', billboardRoutes);
app.use('/api', campaignRoutes);
app.use('/api', slotRoutes);
app.use('/api/registrations', registrationRoutes);


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


