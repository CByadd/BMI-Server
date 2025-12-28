const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const routeMobileService = require('../services/routeMobileService');

// In-memory store for OTP sessions (in production, use Redis or database)
const otpSessions = new Map(); // mobile -> { otp, timestamp, name }

// In-memory store for BMI data
const bmiStore = new Map(); // bmiId -> payload

/**
 * Generate fortune message using Grok API
 */
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

/**
 * Generate fallback fortune message
 */
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

/**
 * Compute BMI helper
 */
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

/**
 * Calculate streak helper
 */
function calculateStreak(bmiRecords) {
    if (!bmiRecords || bmiRecords.length === 0) return { currentStreak: 0, longestStreak: 0, isActive: false };
    
    // Sort records by date (newest first)
    const sortedRecords = bmiRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let isActive = false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Group records by date (ignore time)
    const recordsByDate = new Map();
    sortedRecords.forEach(record => {
        const dateKey = new Date(record.timestamp);
        dateKey.setHours(0, 0, 0, 0);
        const dateString = dateKey.toISOString().split('T')[0];
        if (!recordsByDate.has(dateString)) {
            recordsByDate.set(dateString, record);
        }
    });
    
    const uniqueDates = Array.from(recordsByDate.keys()).sort().reverse();
    
    if (uniqueDates.length === 0) return { currentStreak: 0, longestStreak: 0, isActive: false };
    
    // Check if most recent record is today or yesterday
    const mostRecentDate = new Date(uniqueDates[0]);
    const daysDiff = Math.floor((today - mostRecentDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 1) {
        isActive = true;
        currentStreak = 1;
        
        // Calculate current streak
        for (let i = 1; i < uniqueDates.length; i++) {
            const currentDate = new Date(uniqueDates[i]);
            const prevDate = new Date(uniqueDates[i - 1]);
            const diff = Math.floor((prevDate - currentDate) / (1000 * 60 * 60 * 24));
            
            if (diff === 1) {
                currentStreak++;
            } else {
                break;
            }
        }
    }
    
    // Calculate longest streak
    tempStreak = 1;
    longestStreak = 1;
    
    for (let i = 1; i < uniqueDates.length; i++) {
        const currentDate = new Date(uniqueDates[i]);
        const prevDate = new Date(uniqueDates[i - 1]);
        const diff = Math.floor((prevDate - currentDate) / (1000 * 60 * 60 * 24));
        
        if (diff === 1) {
            tempStreak++;
        } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
        }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    
    return { currentStreak, longestStreak, isActive };
}

/**
 * POST /api/bmi -> { heightCm, weightKg, screenId, appVersion }
 * Create BMI record
 */
exports.createBMI = async (req, res, io) => {
    try {
		const { heightCm, weightKg, screenId, appVersion } = req.body || {};
		if (!heightCm || !weightKg || !screenId) {
			return res.status(400).json({ error: 'heightCm, weightKg, screenId required' });
		}
		
		// Get the registered player's flow type from database
		let playerFlowType = null;
		try {
			const player = await prisma.adscapePlayer.findUnique({
				where: { screenId: String(screenId) }
			});
			playerFlowType = player?.flowType;
			console.log('[BMI] Player flow type from DB:', playerFlowType, 'for screenId:', screenId);
		} catch (e) {
			console.log('[BMI] Could not fetch player flow type:', e.message);
		}
		
		const { bmi, category } = computeBMI(heightCm, weightKg);
		const bmiId = uuidv4();
		const timestamp = new Date().toISOString();
		// Generate fortune cookie message for F2 flow, null for F1 (will be generated after payment)
        // Use player's flow type from DB, fallback to appVersion from request
        const effectiveFlowType = playerFlowType || appVersion;
        const fortune = (effectiveFlowType === 'F2' || effectiveFlowType === 'f2') ? await generateFortuneMessage({ bmi, category }) : null;
        console.log('[BMI] Effective flow type:', effectiveFlowType, 'fortune generated:', !!fortune);
        
		const payload = {
			bmiId,
			screenId: String(screenId),
			height: Number(heightCm),
			weight: Number(weightKg),
			bmi,
			category,
			timestamp,
			fortune
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
                timestamp: new Date(timestamp),
                deviceId: req.body.deviceId || null,
                appVersion: appVersion || null,
                location: req.body.location || null,
                fortune: fortune
            }
        });

		// Build web client URL (adjust if you host client elsewhere)
		const clientBase = process.env.CLIENT_BASE_URL || 'https://bmi-client.onrender.com';
		// Provide API base in URL hash so SPA can call backend even when hosted elsewhere
		const inferredProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || req.protocol;
		const apiBase = process.env.API_PUBLIC_BASE || `${inferredProto}://${req.get('host')}`;
		// Use effective flow type for web URL (convert to lowercase for client compatibility)
		const version = (effectiveFlowType || appVersion || 'f1').toLowerCase();
		const webUrl = `${clientBase}?screenId=${encodeURIComponent(String(screenId))}&bmiId=${encodeURIComponent(bmiId)}&appVersion=${encodeURIComponent(version)}#server=${encodeURIComponent(apiBase)}`;

        // Emit to the Android player room so it can open a modal
        const emitPayload = {
            ...payload,
            webUrl
        };
        if (io) {
            io.to(`screen:${String(screenId)}`).emit('bmi-data-received', emitPayload);
        }
        console.log('[BMI] created and emitted', emitPayload);

		return res.status(201).json({ ok: true, bmiId, webUrl });
    } catch (e) {
        console.error('[BMI] POST /api/bmi error', e);
		return res.status(500).json({ error: 'internal_error' });
	}
};

/**
 * POST /api/otp/generate -> { name, mobile } -> Generate and send OTP
 */
exports.generateOTP = async (req, res) => {
    try {
        const { name, mobile } = req.body || {};
        if (!name || !mobile) {
            return res.status(400).json({ error: 'name and mobile are required' });
        }
        
        // Validate mobile number format (basic validation)
        const cleanMobile = mobile.replace(/[\s\+\-]/g, '');
        if (cleanMobile.length < 10 || cleanMobile.length > 15) {
            return res.status(400).json({ error: 'Invalid mobile number format' });
        }
        
        console.log('[OTP] Generating OTP for:', { name, mobile: cleanMobile });
        
        // Generate OTP via Route Mobile
        const result = await routeMobileService.generateOTP(cleanMobile);
        
        if (result.success) {
            // Store OTP session (mobile -> { otp, name, timestamp })
            otpSessions.set(cleanMobile, {
                otp: result.otp,
                name: String(name),
                timestamp: Date.now(),
            });
            
            // Clean up old sessions (older than 10 minutes)
            const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
            for (const [key, session] of otpSessions.entries()) {
                if (session.timestamp < tenMinutesAgo) {
                    otpSessions.delete(key);
                }
            }
            
            console.log('[OTP] OTP sent successfully to:', cleanMobile);
            return res.json({ 
                success: true, 
                message: 'OTP sent successfully',
                messageId: result.messageId 
            });
        } else {
            console.error('[OTP] Failed to send OTP:', result.error);
            return res.status(400).json({ 
                error: result.error || 'Failed to send OTP' 
            });
        }
    } catch (e) {
        console.error('[OTP] Generate OTP error:', e);
        return res.status(500).json({ error: 'Failed to generate OTP' });
    }
};

/**
 * POST /api/otp/validate -> { mobile, otp } -> Validate OTP
 */
exports.validateOTP = async (req, res) => {
    try {
        const { mobile, otp } = req.body || {};
        if (!mobile || !otp) {
            return res.status(400).json({ error: 'mobile and otp are required' });
        }
        
        const cleanMobile = mobile.replace(/[\s\+\-]/g, '');
        
        // Check if OTP session exists
        const session = otpSessions.get(cleanMobile);
        if (!session) {
            return res.status(400).json({ error: 'OTP session not found. Please request a new OTP.' });
        }
        
        // Check if OTP has expired (5 minutes)
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        if (session.timestamp < fiveMinutesAgo) {
            otpSessions.delete(cleanMobile);
            return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
        }
        
        // Validate OTP via Route Mobile API
        const result = await routeMobileService.validateOTP(cleanMobile, otp);
        
        if (result.success) {
            // OTP validated, create or find user
            let user = await prisma.user.findFirst({
                where: { mobile: cleanMobile }
            });
            
            if (!user) {
                user = await prisma.user.create({
                    data: {
                        name: session.name,
                        mobile: cleanMobile
                    }
                });
            }
            
            // Clean up OTP session
            otpSessions.delete(cleanMobile);
            
            console.log('[OTP] OTP validated successfully for:', cleanMobile);
            return res.json({ 
                success: true,
                message: 'OTP validated successfully',
                user: {
                    userId: user.id,
                    name: user.name,
                    mobile: user.mobile
                }
            });
        } else {
            console.error('[OTP] OTP validation failed:', result.error);
            return res.status(400).json({ 
                error: result.error || 'Invalid OTP' 
            });
        }
    } catch (e) {
        console.error('[OTP] Validate OTP error:', e);
        return res.status(500).json({ error: 'Failed to validate OTP' });
    }
};

/**
 * POST /api/user -> { name, mobile } -> create or find user (DEPRECATED - Use OTP flow instead)
 * This endpoint is kept for backward compatibility but should be replaced with OTP flow
 */
exports.createUser = async (req, res) => {
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
};

/**
 * POST /api/payment-success -> { userId, bmiId } -> link user to BMI and emit to Android
 */
exports.paymentSuccess = async (req, res, io) => {
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
        
        // Generate fortune immediately for F1 flow
        if (appVersion !== 'f2') {
            console.log('[PAYMENT] F1 Flow: Generating fortune immediately');
            const fortuneMessage = await generateFortuneMessage({
                bmi: updatedBMI.bmi,
                category: updatedBMI.category
            });
            
            // Update BMI record with generated fortune
            await prisma.bMI.update({
                where: { id: bmiId },
                data: { fortune: fortuneMessage }
            });
            
            console.log('[PAYMENT] F1 Flow: Fortune generated and stored:', fortuneMessage);
        }
        
       // Emit payment success to Android screen (only for non-F2 versions)
        if (appVersion !== 'f2' && io) {
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
        
        return res.json({ ok: true, message: 'Payment processed successfully' });
    } catch (e) {
        console.error('[PAYMENT] POST /api/payment-success error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * POST /api/progress-start -> { bmiId } -> emit progress start to both web and Android
 */
exports.progressStart = async (req, res, io) => {
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
        if (io) {
            io.to(`screen:${bmiData.screenId}`).emit('progress-start', {
                bmiId: bmiData.id,
                screenId: bmiData.screenId,
                userId: bmiData.userId,
                user: bmiData.user,
                bmi: bmiData.bmi,
                category: bmiData.category,
                height: bmiData.heightCm,
                weight: bmiData.weightKg,
                timestamp: bmiData.timestamp.toISOString(),
                progressComplete: true // Flag to indicate this is progress start data
            });
        }
        
        console.log('[PROGRESS] Start emitted to screen:', bmiData.screenId);
        
        return res.json({ ok: true, message: 'Progress started' });
    } catch (e) {
        console.error('[PROGRESS] POST /api/progress-start error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * POST /api/fortune-generate -> { bmiId } -> generate fortune and emit to both web and Android
 */
exports.fortuneGenerate = async (req, res, io) => {
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
        
        // Use existing fortune if available, otherwise generate new one
        let fortuneMessage = bmiData.fortune;
        if (!fortuneMessage) {
            console.log('[FORTUNE] No existing fortune, generating new one');
            fortuneMessage = await generateFortuneMessage({
                bmi: bmiData.bmi,
                category: bmiData.category
            });
            
            // Update BMI record with generated fortune
            await prisma.bMI.update({
                where: { id: bmiId },
                data: { fortune: fortuneMessage }
            });
        } else {
            console.log('[FORTUNE] Using existing fortune from database');
        }
        
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
        if (appVersion !== 'f2' && io) {
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
};

/**
 * GET /api/user/:userId/analytics -> return user analytics data
 */
exports.getUserAnalytics = async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Get all BMI records for user
        const bmiRecords = await prisma.bMI.findMany({
            where: { userId: userId },
            orderBy: { timestamp: 'desc' },
            include: {
                screen: true
            }
        });
        
        if (bmiRecords.length === 0) {
            return res.json({
                totalRecords: 0,
                recentBMI: null,
                streak: { currentStreak: 0, longestStreak: 0, isActive: false },
                trends: [],
                categoryDistribution: {},
                averageBMI: 0
            });
        }
        
        // Calculate streak
        const streak = calculateStreak(bmiRecords);
        
        // Get recent BMI (most recent record)
        const recentBMI = {
            id: bmiRecords[0].id,
            bmi: bmiRecords[0].bmi,
            category: bmiRecords[0].category,
            height: bmiRecords[0].heightCm,
            weight: bmiRecords[0].weightKg,
            timestamp: bmiRecords[0].timestamp.toISOString(),
            screenId: bmiRecords[0].screenId,
            deviceId: bmiRecords[0].deviceId,
            location: bmiRecords[0].location,
            fortune: bmiRecords[0].fortune
        };
        
        // Calculate trends (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentRecords = bmiRecords.filter(record => 
            new Date(record.timestamp) >= thirtyDaysAgo
        );
        
        const trends = recentRecords.map(record => ({
            date: record.timestamp.toISOString().split('T')[0],
            bmi: record.bmi,
            weight: record.weightKg,
            category: record.category
        })).reverse(); // Oldest first for chart
        
        // Category distribution
        const categoryDistribution = {};
        bmiRecords.forEach(record => {
            categoryDistribution[record.category] = (categoryDistribution[record.category] || 0) + 1;
        });
        
        // Average BMI
        const averageBMI = Number((bmiRecords.reduce((sum, record) => sum + record.bmi, 0) / bmiRecords.length).toFixed(1));
        
        return res.json({
            totalRecords: bmiRecords.length,
            recentBMI,
            streak,
            trends,
            categoryDistribution,
            averageBMI,
            firstRecord: bmiRecords[bmiRecords.length - 1].timestamp.toISOString(),
            lastRecord: bmiRecords[0].timestamp.toISOString()
        });
    } catch (e) {
        console.error('[ANALYTICS] GET /api/user/:userId/analytics error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * POST /api/bmi/:id/link-user -> link BMI record to user
 */
exports.linkUserToBMI = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        console.log(`[BMI-LINK] Linking BMI ${id} to user ${userId}`);
        
        // Update BMI record with user ID
        const updatedBMI = await prisma.bMI.update({
            where: { id },
            data: { userId },
            include: {
                user: true,
                screen: true
            }
        });
        
        console.log(`[BMI-LINK] Successfully linked BMI to user: ${updatedBMI.user?.name}`);
        
        return res.json({ 
            ok: true, 
            message: 'BMI record linked to user successfully',
            bmi: {
                bmiId: updatedBMI.id,
                screenId: updatedBMI.screenId,
                height: updatedBMI.heightCm,
                weight: updatedBMI.weightKg,
                bmi: updatedBMI.bmi,
                category: updatedBMI.category,
                timestamp: updatedBMI.timestamp.toISOString(),
                userId: updatedBMI.userId,
                user: updatedBMI.user ? {
                    id: updatedBMI.user.id,
                    name: updatedBMI.user.name,
                    mobile: updatedBMI.user.mobile
                } : null
            }
        });
    } catch (e) {
        console.error('[BMI-LINK] Error linking BMI to user:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * GET /api/bmi/:id -> return stored payload
 */
exports.getBMI = async (req, res) => {
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
            fortune: row.fortune,
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
};

/**
 * GET /api/debug/connections -> Debug socket connections
 */
exports.debugConnections = (req, res, io) => {
    try {
        const rooms = [];
        if (io) {
            io.sockets.adapter.rooms.forEach((socketsSet, room) => {
                rooms.push({ room, size: socketsSet.size });
            });
        }
        const sockets = [];
        if (io) {
            io.sockets.sockets.forEach((sock) => sockets.push(sock.id));
        }
        res.json({ rooms, sockets });
    } catch (e) {
        res.status(500).json({ error: 'debug_error' });
    }
};



