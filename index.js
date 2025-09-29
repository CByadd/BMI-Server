const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

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

app.use(cors());
app.use(express.json());
// Basic request logger
app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    if (req.method !== 'GET') {
        try { console.log('[HTTP] body:', JSON.stringify(req.body)); } catch {}
    }
    next();
});

// Simple in-memory stores
const bmiStore = new Map(); // bmiId -> payload

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

// POST /api/bmi -> { heightCm, weightKg, screenId }
app.post('/api/bmi', async (req, res) => {
    try {
		const { heightCm, weightKg, screenId } = req.body || {};
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
		const webUrl = `${clientBase}?screenId=${encodeURIComponent(String(screenId))}&bmiId=${encodeURIComponent(bmiId)}#server=${encodeURIComponent(apiBase)}`;

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
        const { userId, bmiId } = req.body || {};
        if (!userId || !bmiId) {
            return res.status(400).json({ error: 'userId, bmiId required' });
        }
        
        // Update BMI record with user
        const updatedBMI = await prisma.bMI.update({
            where: { id: bmiId },
            data: { userId: userId },
            include: { user: true, screen: true }
        });
        
        // Emit payment success to Android screen
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
        
        return res.json({ ok: true, message: 'Payment processed successfully' });
    } catch (e) {
        console.error('[PAYMENT] POST /api/payment-success error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// GET /api/bmi/:id -> return stored payload
app.get('/api/bmi/:id', async (req, res) => {
    const id = req.params.id;
    const mem = bmiStore.get(id);
    if (mem) return res.json(mem);
    try {
        const row = await prisma.bMI.findUnique({ where: { id } });
        if (!row) return res.status(404).json({ error: 'not_found' });
        return res.json({
            bmiId: row.id,
            screenId: row.screenId,
            height: row.heightCm,
            weight: row.weightKg,
            bmi: row.bmi,
            category: row.category,
            timestamp: row.timestamp.toISOString()
        });
    } catch (e) {
        console.error('[BMI] GET error', e);
        return res.status(500).json({ error: 'internal_error' });
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


