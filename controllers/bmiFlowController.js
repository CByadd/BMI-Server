const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

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
		const flowStartTime = new Date().toISOString();
		
		// ========== PAYMENT FLOW LOGGING - FLOW STARTED (SERVER) ==========
		console.log('═══════════════════════════════════════════════════════════════');
		console.log('[PAYMENT_FLOW] 🚀 FLOW TRIGGERED - START (SERVER)');
		console.log('[PAYMENT_FLOW] Timestamp:', flowStartTime);
		console.log('[PAYMENT_FLOW] Screen ID:', screenId);
		console.log('[PAYMENT_FLOW] Weight:', weightKg, 'kg');
		console.log('[PAYMENT_FLOW] Height:', heightCm, 'cm');
		console.log('[PAYMENT_FLOW] App Version:', appVersion);
		console.log('[PAYMENT_FLOW] Request IP:', req.ip || req.connection.remoteAddress);
		console.log('═══════════════════════════════════════════════════════════════');
		
		if (!heightCm || !weightKg || !screenId) {
			console.log('[PAYMENT_FLOW] ❌ Validation failed - missing required fields');
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

        // ========== PAYMENT FLOW LOGGING - BMI CREATED (SERVER) ==========
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('[PAYMENT_FLOW] ✅ BMI RECORD CREATED (SERVER)');
        console.log('[PAYMENT_FLOW] BMI ID:', bmiId);
        console.log('[PAYMENT_FLOW] BMI:', bmi, '(', category, ')');
        console.log('[PAYMENT_FLOW] Web URL:', webUrl);
        console.log('[PAYMENT_FLOW] Effective Flow Type:', effectiveFlowType);
        console.log('[PAYMENT_FLOW] Fortune Generated:', !!fortune);
        console.log('[PAYMENT_FLOW] Waiting for payment...');
        console.log('═══════════════════════════════════════════════════════════════');

        // Emit to the Android player room so it can open a modal
        const emitPayload = {
            ...payload,
            webUrl
        };
        if (io) {
            io.to(`screen:${String(screenId)}`).emit('bmi-data-received', emitPayload);
            console.log('[PAYMENT_FLOW] 📡 Emitted bmi-data-received to screen:', screenId);
        }
        console.log('[BMI] created and emitted', emitPayload);

		return res.status(201).json({ ok: true, bmiId, webUrl });
    } catch (e) {
        console.error('[BMI] POST /api/bmi error', e);
		return res.status(500).json({ error: 'internal_error' });
	}
};

/**
 * POST /api/user -> { name, gender, age, mobile } -> create new user
 * Returns error if user already exists
 */
exports.createUser = async (req, res) => {
    try {
        const { name, gender, age, mobile } = req.body || {};
        if (!name || !mobile) {
            return res.status(400).json({ error: 'name, mobile required' });
        }
        
        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: { mobile: String(mobile) }
        });
        
        if (existingUser) {
            return res.status(409).json({ error: 'User already exists with this mobile number. Please login instead.' });
        }
        
        // Create new user
        const user = await prisma.user.create({
            data: {
                name: String(name),
                mobile: String(mobile),
                gender: gender ? String(gender) : null,
                age: age ? parseInt(age) : null
            }
        });
        
        return res.json({ userId: user.id, name: user.name, mobile: user.mobile, gender: user.gender, age: user.age });
    } catch (e) {
        console.error('[USER] POST /api/user error', e);
        if (e.code === 'P2002') {
            // Prisma unique constraint violation
            return res.status(409).json({ error: 'User already exists with this mobile number. Please login instead.' });
        }
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * POST /api/user/login -> { mobile } -> find user by mobile
 * Returns error if user doesn't exist
 */
exports.loginUser = async (req, res) => {
    try {
        const { mobile } = req.body || {};
        if (!mobile) {
            return res.status(400).json({ error: 'mobile required' });
        }
        
        // Find user by mobile
        const user = await prisma.user.findFirst({
            where: { mobile: String(mobile) }
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found. Please create an account first.' });
        }
        
        return res.json({ userId: user.id, name: user.name, mobile: user.mobile, gender: user.gender, age: user.age });
    } catch (e) {
        console.error('[USER] POST /api/user/login error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * POST /api/payment-success -> { userId, bmiId } -> link user to BMI and emit to Android
 */
exports.paymentSuccess = async (req, res, io) => {
    try {
        const { userId, bmiId, appVersion, paymentToken, paymentAmount: paymentAmountFromRequest } = req.body || {};
        const paymentReceivedTime = new Date().toISOString();
        
        // ========== PAYMENT FLOW LOGGING - PAYMENT RECEIVED (SERVER) ==========
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('[PAYMENT_FLOW] 💰 PAYMENT COMPLETED - INFO RECEIVED (SERVER)');
        console.log('[PAYMENT_FLOW] Timestamp:', paymentReceivedTime);
        console.log('[PAYMENT_FLOW] BMI ID:', bmiId);
        console.log('[PAYMENT_FLOW] User ID:', userId);
        console.log('[PAYMENT_FLOW] App Version:', appVersion);
        console.log('[PAYMENT_FLOW] Payment Token:', paymentToken || 'Not provided');
        console.log('[PAYMENT_FLOW] Payment Amount (from request):', paymentAmountFromRequest);
        console.log('[PAYMENT_FLOW] Full request body:', JSON.stringify(req.body, null, 2));
        console.log('[PAYMENT_FLOW] Request IP:', req?.ip ?? req?.connection?.remoteAddress ?? 'N/A');
        console.log('═══════════════════════════════════════════════════════════════');
        
        if (!userId || !bmiId) {
            console.log('[PAYMENT_FLOW] ❌ Validation failed - missing userId or bmiId');
            return res.status(400).json({ error: 'userId, bmiId required' });
        }
        
        // Get BMI record first to get screenId
        const bmiRecord = await prisma.bMI.findUnique({
            where: { id: bmiId },
            select: { screenId: true }
        });
        
        if (!bmiRecord) {
            return res.status(404).json({ error: 'BMI record not found' });
        }
        
        // Default payment amount (same as PaymentPage default) - only used if amount not provided from frontend
        const DEFAULT_PAYMENT_AMOUNT = 9;
        
        // Use payment amount from request (actual amount paid by user from frontend payment confirmation)
        // Don't rely on screen config - store the actual amount paid
        let paymentAmount = null;
        if (paymentAmountFromRequest !== null && paymentAmountFromRequest !== undefined) {
            paymentAmount = parseFloat(paymentAmountFromRequest);
            if (!isNaN(paymentAmount) && paymentAmount > 0) {
                console.log('[PAYMENT_FLOW] Using payment amount from frontend (actual amount paid):', paymentAmount);
            } else {
                paymentAmount = null;
                console.log('[PAYMENT_FLOW] Payment amount from request is invalid');
            }
        }
        
        // If payment amount not provided from frontend, use default (don't rely on screen config)
        if (paymentAmount === null || paymentAmount === undefined || isNaN(paymentAmount) || paymentAmount <= 0) {
            paymentAmount = DEFAULT_PAYMENT_AMOUNT;
            console.log('[PAYMENT_FLOW] Payment amount not provided from frontend, using default:', paymentAmount);
        }
        
        console.log('[PAYMENT_FLOW] Final payment amount to be saved:', paymentAmount);
        
        // Update BMI record with user, payment status, and payment amount using raw SQL to handle new columns
        // Use ::uuid casts so PostgreSQL compares uuid = uuid (params are passed as text otherwise)
        try {
            await prisma.$executeRawUnsafe(
                `UPDATE "BMI" SET "userId" = $1::uuid, "paymentStatus" = true, "paymentAmount" = $2 WHERE id = $3::uuid`,
                userId,
                paymentAmount,
                bmiId
            );
            console.log('[PAYMENT_FLOW] ✅ BMI record updated successfully with payment amount:', paymentAmount);
        } catch (e) {
            // If columns don't exist, create them first
            if (e.code === '42703' || e.message?.includes('does not exist')) {
                console.log('[PAYMENT_FLOW] Payment columns do not exist, creating them...');
                try {
                    // Create paymentStatus column if it doesn't exist
                    await prisma.$executeRawUnsafe(`
                        ALTER TABLE "BMI" 
                        ADD COLUMN IF NOT EXISTS "paymentStatus" BOOLEAN DEFAULT false
                    `);
                    console.log('[PAYMENT_FLOW] ✅ Created paymentStatus column');
                    
                    // Create paymentAmount column if it doesn't exist
                    await prisma.$executeRawUnsafe(`
                        ALTER TABLE "BMI" 
                        ADD COLUMN IF NOT EXISTS "paymentAmount" DOUBLE PRECISION
                    `);
                    console.log('[PAYMENT_FLOW] ✅ Created paymentAmount column');
                    
                    // Now try the update again (::uuid casts avoid "uuid = text" operator error)
                    await prisma.$executeRawUnsafe(
                        `UPDATE "BMI" SET "userId" = $1::uuid, "paymentStatus" = true, "paymentAmount" = $2 WHERE id = $3::uuid`,
                        userId,
                        paymentAmount,
                        bmiId
                    );
                    console.log('[PAYMENT_FLOW] ✅ BMI record updated successfully with payment amount after creating columns:', paymentAmount);
                } catch (createError) {
                    console.error('[PAYMENT_FLOW] Error creating columns or updating:', createError);
                    // Fallback to Prisma update (will fail if columns don't exist in schema)
                    try {
                        await prisma.bMI.update({
                            where: { id: bmiId },
                            data: {
                                userId: userId,
                                paymentStatus: true,
                                paymentAmount: paymentAmount
                            }
                        });
                        console.log('[PAYMENT_FLOW] ✅ BMI record updated using Prisma after column creation');
                    } catch (prismaError) {
                        console.error('[PAYMENT_FLOW] ❌ Error updating BMI record with Prisma:', prismaError);
                        throw prismaError;
                    }
                }
            } else {
                console.error('[PAYMENT_FLOW] ❌ Error updating BMI record:', e);
                throw e;
            }
        }
        
        // Fetch updated BMI record and verify payment amount was saved
        let updatedBMI;
        try {
            updatedBMI = await prisma.bMI.findUnique({
                where: { id: bmiId },
                include: { user: true, screen: true }
            });
        } catch (e) {
            // If Prisma can't find it (columns might not exist in Prisma schema), use raw SQL
            console.log('[PAYMENT_FLOW] Prisma findUnique failed, using raw SQL to verify...');
            const verifyResult = await prisma.$queryRawUnsafe(
                `SELECT id, "userId", "paymentStatus", "paymentAmount" FROM "BMI" WHERE id = $1::uuid LIMIT 1`,
                bmiId
            );
            if (verifyResult && verifyResult.length > 0) {
                const record = verifyResult[0];
                console.log('[PAYMENT_FLOW] ✅ Verified payment amount saved:', {
                    bmiId: record.id,
                    userId: record.userId,
                    paymentStatus: record.paymentStatus,
                    paymentAmount: record.paymentAmount
                });
                // Create a mock object for compatibility
                updatedBMI = {
                    id: record.id,
                    userId: record.userId,
                    paymentStatus: record.paymentStatus,
                    paymentAmount: record.paymentAmount,
                    user: null,
                    screen: null
                };
            } else {
                return res.status(404).json({ error: 'BMI record not found after update' });
            }
        }
        
        if (!updatedBMI) {
            return res.status(404).json({ error: 'BMI record not found after update' });
        }
        
        console.log('[PAYMENT_FLOW] ✅ BMI record updated with user:', updatedBMI.user?.name || 'Unknown');
        console.log('[PAYMENT_FLOW] User Details:', {
            userId: updatedBMI.userId,
            userName: updatedBMI.user?.name,
            userMobile: updatedBMI.user?.mobile
        });
        console.log('[PAYMENT_FLOW] ✅ Payment Details Saved:', {
            paymentStatus: updatedBMI.paymentStatus,
            paymentAmount: updatedBMI.paymentAmount
        });
        
        // Normalize appVersion for consistent comparison (case-insensitive)
        const normalizedAppVersion = appVersion ? String(appVersion).toLowerCase() : '';
        
        // Generate fortune immediately for F1/F3 flow (non-F2 versions)
        if (normalizedAppVersion !== 'f2') {
            console.log('[PAYMENT] F1/F3 Flow: Generating fortune immediately (appVersion:', appVersion, ')');
            const fortuneMessage = await generateFortuneMessage({
                bmi: updatedBMI.bmi,
                category: updatedBMI.category
            });
            
            // Update BMI record with generated fortune
            await prisma.bMI.update({
                where: { id: bmiId },
                data: { fortune: fortuneMessage }
            });
            
            console.log('[PAYMENT] F1/F3 Flow: Fortune generated and stored:', fortuneMessage);
            console.log('[PAYMENT_FLOW] Fortune Message:', fortuneMessage);
        }
        
       // Emit payment success to Android screen (for F1/F3 flows - non-F2 versions)
        // Always emit for non-F2 flows to ensure Android receives payment confirmation
        if (normalizedAppVersion !== 'f2' && io) {
            const paymentSuccessPayload = {
                bmiId: updatedBMI.id,
                screenId: updatedBMI.screenId,
                userId: updatedBMI.userId,
                user: updatedBMI.user,
                bmi: updatedBMI.bmi,
                category: updatedBMI.category,
                height: updatedBMI.heightCm,
                weight: updatedBMI.weightKg,
                timestamp: updatedBMI.timestamp.toISOString(),
                paymentToken: paymentToken || null // Include payment token for Android verification
            };
            
            // ========== PAYMENT FLOW LOGGING - EMITTING TO ANDROID ==========
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('[PAYMENT_FLOW] 📡 EMITTING PAYMENT SUCCESS TO ANDROID');
            console.log('[PAYMENT_FLOW] Target Screen:', updatedBMI.screenId);
            console.log('[PAYMENT_FLOW] Socket Room: screen:' + updatedBMI.screenId);
            console.log('[PAYMENT_FLOW] Payload:', JSON.stringify(paymentSuccessPayload, null, 2));
            console.log('═══════════════════════════════════════════════════════════════');
            
            const roomName = `screen:${updatedBMI.screenId}`;
            const room = io.sockets.adapter.rooms.get(roomName);
            const roomSize = room ? room.size : 0;
            
            console.log('[PAYMENT_FLOW] 📡 About to emit to room:', roomName);
            console.log('[PAYMENT_FLOW] Room members count:', roomSize);
            console.log('[PAYMENT_FLOW] Room exists:', room !== undefined);
            
            if (roomSize === 0) {
                console.log('[PAYMENT_FLOW] ⚠️⚠️⚠️ WARNING: Room is empty! No Android clients connected to room:', roomName);
                console.log('[PAYMENT_FLOW] ⚠️ This means the Android app may not have joined the room yet');
            }
            
            io.to(roomName).emit('payment-success', paymentSuccessPayload);
            console.log('[PAYMENT] ✅ Payment success event emitted to room:', roomName);
            console.log('[PAYMENT] ✅ Target screen:', updatedBMI.screenId, 'appVersion:', appVersion);
            console.log('[PAYMENT] ✅ Room members:', roomSize);
            console.log('[PAYMENT] Payload:', JSON.stringify(paymentSuccessPayload, null, 2));
        } else {
            console.log('[PAYMENT] F2 version detected - skipping socket emission to Android. appVersion:', appVersion);
        }
        
        console.log('[PAYMENT_FLOW] ✅ Payment flow completed successfully on server');
        
        return res.json({ ok: true, message: 'Payment processed successfully' });
    } catch (e) {
        console.log('[PAYMENT_FLOW] ❌ Error processing payment success:', e.message);
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
        
        // Get unique screen IDs and fetch their device names
        const screenIds = [...new Set(recentRecords.map(record => record.screenId))];
        const screenPlayers = await prisma.adscapePlayer.findMany({
            where: {
                screenId: { in: screenIds }
            },
            select: {
                screenId: true,
                deviceName: true
            }
        });
        
        // Create a map of screenId to deviceName
        const screenNameMap = {};
        screenPlayers.forEach(player => {
            screenNameMap[player.screenId] = player.deviceName || player.screenId;
        });
        
        const trends = recentRecords.map(record => ({
            date: record.timestamp.toISOString().split('T')[0],
            bmi: record.bmi,
            weight: record.weightKg,
            category: record.category,
            screenId: record.screenId,
            screenName: screenNameMap[record.screenId] || record.screenId,
            timestamp: record.timestamp.toISOString()
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



