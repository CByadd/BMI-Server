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
		origin: '*'
	}
});
// Prisma
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'https://bmi-client.vercel.app','http://127.0.0.1:5500'],
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

// Simple in-memory stores
const bmiStore = new Map(); // bmiId -> payload

// Grok API integration
async function generateFortuneMessage(bmiData) {
  try {
    const grokApiKey = process.env.GROK_API_KEY;
    if (!grokApiKey) {
      console.log('[GROK] No API key found, using fallback message');
      return generateFallbackFortune(bmiData);
    }

    const prompt = `Generate a positive, motivational fortune cookie message for someone with BMI ${bmiData.bmi} (${bmiData.category}). 
    Keep it short (1-2 sentences), uplifting, and health-focused. Don't mention specific BMI numbers.`;
    
    const response = await axios.post('https://api.x.ai/v1/chat/completions', {
      model: 'grok-beta',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.8
    }, {
      headers: {
        'Authorization': `Bearer ${grokApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const message = response.data.choices[0]?.message?.content?.trim();
    return message || generateFallbackFortune(bmiData);
  } catch (error) {
    console.error('[GROK] API error:', error.message);
    return generateFallbackFortune(bmiData);
  }
}

function generateFallbackFortune(bmiData) {
  const fortunes = [
    "Your journey to wellness is a beautiful adventure. Every step forward is progress worth celebrating.",
    "Health is not just about numbers, but about feeling strong and confident in your own skin.",
    "Small, consistent changes lead to big transformations. You're already on the right path.",
    "Your body is your temple. Treat it with love, respect, and gentle care every day.",
    "Wellness is a journey, not a destination. Enjoy the process of becoming your best self.",
    "Every healthy choice you make is an investment in your future happiness and vitality.",
    "Your commitment to health shows incredible self-love. Keep nurturing that beautiful spirit.",
    "Balance is the key to lasting wellness. Listen to your body and honor its wisdom."
  ];
  
  return fortunes[Math.floor(Math.random() * fortunes.length)];
}

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

// Compute BMI helper
function computeBMI(heightCm, weightKg) {
	const h = Number(heightCm);
	const w = Number(weightKg);
	if (!h || !w) return { bmi: null, category: 'invalid' };
	const heightM = h / 100;
	const bmi = Number((w / (heightM * heightM)).toFixed(1));
	let category = 'Normal';
	if (bmi < 18.5) category = 'Underweight';
	else if (bmi < 25) category = 'Normal';
	else if (bmi < 30) category = 'Overweight';
	else category = 'Obese';
	return { bmi, category };
}

// POST /api/bmi -> { heightCm, weightKg, screenId, appVersion }
app.post('/api/bmi', async (req, res) => {
    try {
		const { heightCm, weightKg, screenId, appVersion } = req.body || {};
		if (!heightCm || !weightKg || !screenId) {
			return res.status(400).json({ error: 'heightCm, weightKg, screenId required' });
		}
		const { bmi, category } = computeBMI(heightCm, weightKg);
		const bmiId = uuidv4();
		const timestamp = new Date().toISOString();
		const payload = {
			bmiId,
			screenId: String(screenId),
			height: Number(heightCm),
			weight: Number(weightKg),
			bmi,
			category,
			timestamp
		};
        bmiStore.set(bmiId, payload);

        // Upsert Screen and create BMI record
        await prisma.screen.upsert({
            where: { id: String(screenId) },
            create: { id: String(screenId) },
            update: {}
        });
        await prisma.bMI.create({
            data: {
                id: bmiId,
                screenId: String(screenId),
                heightCm: Number(heightCm),
                weightKg: Number(weightKg),
                bmi: Number(bmi),
                category,
                timestamp: new Date(timestamp)
            }
        });

		// Build web client URL (adjust if you host client elsewhere)
		const clientBase = process.env.CLIENT_BASE_URL || 'https://bmi-client.onrender.com';
		// Provide API base in URL hash so SPA can call backend even when hosted elsewhere
		const inferredProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || req.protocol;
		const apiBase = process.env.API_PUBLIC_BASE || `${inferredProto}://${req.get('host')}`;
		// Use dynamic app version or default to 'f1' if not provided
		const version = appVersion || 'f1';
		const webUrl = `${clientBase}?screenId=${encodeURIComponent(String(screenId))}&bmiId=${encodeURIComponent(bmiId)}&appVersion=${encodeURIComponent(version)}#server=${encodeURIComponent(apiBase)}`;

        // Emit to the Android player room so it can open a modal
        const emitPayload = {
            ...payload,
            webUrl
        };
        io.to(`screen:${String(screenId)}`).emit('bmi-data-received', emitPayload);
        console.log('[BMI] created and emitted', emitPayload);

		return res.status(201).json({ ok: true, bmiId, webUrl });
    } catch (e) {
        console.error('[BMI] POST /api/bmi error', e);
		return res.status(500).json({ error: 'internal_error' });
	}
});

// POST /api/user -> { name, mobile } -> create or find user
app.post('/api/user', async (req, res) => {
    try {
        const { name, mobile } = req.body || {};
        if (!name || !mobile) {
            return res.status(400).json({ error: 'name, mobile required' });
        }
        
        // Try to find existing user by mobile, otherwise create new
        let user = await prisma.user.findFirst({
            where: { mobile: String(mobile) }
        });
        
        if (!user) {
            user = await prisma.user.create({
                data: {
                    name: String(name),
                    mobile: String(mobile)
                }
            });
        }
        
        return res.json({ userId: user.id, name: user.name, mobile: user.mobile });
    } catch (e) {
        console.error('[USER] POST /api/user error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// POST /api/payment-success -> { userId, bmiId } -> link user to BMI and emit to Android
app.post('/api/payment-success', async (req, res) => {
    try {
        const { userId, bmiId, appVersion } = req.body || {};
        if (!userId || !bmiId) {
            return res.status(400).json({ error: 'userId, bmiId required' });
        }
        
        // Update BMI record with user
        const updatedBMI = await prisma.bMI.update({
            where: { id: bmiId },
            data: { userId: userId },
            include: { user: true, screen: true }
        });
        
       // Emit payment success to Android screen (only for non-F2 versions)
        if (appVersion !== 'f2') {
            io.to(`screen:${updatedBMI.screenId}`).emit('payment-success', {
                bmiId: updatedBMI.id,
                screenId: updatedBMI.screenId,
                userId: updatedBMI.userId,
                user: updatedBMI.user,
                bmi: updatedBMI.bmi,
                category: updatedBMI.category,
                height: updatedBMI.heightCm,
                weight: updatedBMI.weightKg,
                timestamp: updatedBMI.timestamp.toISOString()
            });
            console.log('[PAYMENT] Success emitted to screen:', updatedBMI.screenId);
        } else {
            console.log('[PAYMENT] F2 version - skipping socket emission to Android');
        }
        
        console.log('[PAYMENT] Success emitted to screen:', updatedBMI.screenId);
        
        return res.json({ ok: true, message: 'Payment processed successfully' });
    } catch (e) {
        console.error('[PAYMENT] POST /api/payment-success error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// POST /api/progress-start -> { bmiId } -> emit progress start to both web and Android
app.post('/api/progress-start', async (req, res) => {
    try {
        const { bmiId } = req.body || {};
        if (!bmiId) {
            return res.status(400).json({ error: 'bmiId required' });
        }
        
        // Get BMI data
        const bmiData = await prisma.bMI.findUnique({
            where: { id: bmiId },
            include: { user: true, screen: true }
        });
        
        if (!bmiData) {
            return res.status(404).json({ error: 'BMI data not found' });
        }
        
        // Emit progress start to Android screen
        io.to(`screen:${bmiData.screenId}`).emit('progress-start', {
            bmiId: bmiData.id,
            screenId: bmiData.screenId,
            userId: bmiData.userId,
            user: bmiData.user,
            bmi: bmiData.bmi,
            category: bmiData.category,
            height: bmiData.heightCm,
            weight: bmiData.weightKg,
            timestamp: bmiData.timestamp.toISOString()
        });
        
        console.log('[PROGRESS] Start emitted to screen:', bmiData.screenId);
        
        return res.json({ ok: true, message: 'Progress started' });
    } catch (e) {
        console.error('[PROGRESS] POST /api/progress-start error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// POST /api/fortune-generate -> { bmiId } -> generate fortune and emit to both web and Android
app.post('/api/fortune-generate', async (req, res) => {
    try {
        console.log('[FORTUNE] Request body:', req.body);
        console.log('[FORTUNE] Request body type:', typeof req.body);
        
        const { bmiId, appVersion } = req.body || {};
        console.log('[FORTUNE] Extracted bmiId:', bmiId, 'appVersion:', appVersion);
        
        if (!bmiId) {
            console.log('[FORTUNE] Missing bmiId in request');
            return res.status(400).json({ error: 'bmiId required' });
        }
        
        // Get BMI data
        const bmiData = await prisma.bMI.findUnique({
            where: { id: bmiId },
            include: { user: true, screen: true }
        });
        
        if (!bmiData) {
            return res.status(404).json({ error: 'BMI data not found' });
        }
        
        // Generate fortune message
        const fortuneMessage = await generateFortuneMessage({
            bmi: bmiData.bmi,
            category: bmiData.category
        });
        
        const fortuneData = {
            bmiId: bmiData.id,
            screenId: bmiData.screenId,
            userId: bmiData.userId,
            user: bmiData.user,
            bmi: bmiData.bmi,
            category: bmiData.category,
            height: bmiData.heightCm,
            weight: bmiData.weightKg,
            timestamp: bmiData.timestamp.toISOString(),
            fortuneMessage: fortuneMessage
        };
        
        // Emit fortune to Android screen (only for non-F2 versions)
        if (appVersion !== 'f2') {
            io.to(`screen:${bmiData.screenId}`).emit('fortune-ready', fortuneData);
            console.log('[FORTUNE] Generated and emitted to screen:', bmiData.screenId);
        } else {
            console.log('[FORTUNE] F2 version - skipping socket emission to Android');
        }
        
        console.log('[FORTUNE] Message:', fortuneMessage);
        
        return res.json({ ok: true, fortuneMessage, data: fortuneData });
    } catch (e) {
        console.error('[FORTUNE] POST /api/fortune-generate error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// GET /api/bmi/:id -> return stored payload
app.get('/api/bmi/:id', async (req, res) => {
    const id = req.params.id;
    console.log(`[BMI] GET request for id: ${id}`);
    
    try {
        // Try in-memory store first
        const mem = bmiStore.get(id);
        if (mem) {
            console.log(`[BMI] Found in memory:`, mem);
            return res.json(mem);
        }
        
        console.log(`[BMI] Searching database for id: ${id}`);
        const row = await prisma.bMI.findUnique({ 
            where: { id },
            include: {
                user: true,
                screen: true
            }
        });
        
        if (!row) {
            console.log(`[BMI] Not found in database: ${id}`);
            return res.status(404).json({ 
                error: 'not_found', 
                message: `BMI record ${id} not found`,
                id: id
            });
        }
        
        const result = {
            bmiId: row.id,
            screenId: row.screenId,
            height: row.heightCm,
            weight: row.weightKg,
            bmi: row.bmi,
            category: row.category,
            timestamp: row.timestamp.toISOString(),
            userId: row.userId,
            user: row.user ? {
                id: row.user.id,
                name: row.user.name,
                mobile: row.user.mobile
            } : null
        };
        
        console.log(`[BMI] Found in database:`, result);
        return res.json(result);
    } catch (e) {
        console.error('[BMI] GET error', e);
        return res.status(500).json({ 
            error: 'internal_error', 
            message: e.message,
            stack: e.stack
        });
    }
});

// Debug connections
app.get('/api/debug/connections', (_req, res) => {
    try {
        const rooms = [];
        io.sockets.adapter.rooms.forEach((socketsSet, room) => {
            rooms.push({ room, size: socketsSet.size });
        });
        const sockets = [];
        io.sockets.sockets.forEach((sock) => sockets.push(sock.id));
        res.json({ rooms, sockets });
    } catch (e) {
        res.status(500).json({ error: 'debug_error' });
    }
});

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


