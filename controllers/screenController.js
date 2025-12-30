const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
if (!cloudinary.config().cloud_name && process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

/**
 * Register or update an Adscape player
 * POST /api/adscape/register
 */
exports.registerPlayer = async (req, res) => {
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
};

/**
 * Get a specific player by screenId
 * GET /api/adscape/player/:screenId
 */
exports.getPlayer = async (req, res) => {
    try {
        const { screenId } = req.params;
        
        // Use raw SQL to fetch player to avoid Prisma error if heightCalibration column doesn't exist
        let player;
        try {
            const playerResult = await prisma.$queryRaw`
                SELECT * FROM "AdscapePlayer" WHERE "screenId" = ${String(screenId)} LIMIT 1
            `;
            if (playerResult && playerResult.length > 0) {
                player = playerResult[0];
            } else {
                return res.status(404).json({ error: 'Player not found' });
            }
        } catch (e) {
            // Fallback to Prisma if raw SQL fails
            player = await prisma.adscapePlayer.findUnique({
                where: { screenId: String(screenId) }
            });
            if (!player) {
                return res.status(404).json({ error: 'Player not found' });
            }
        }
        
        // Get current playlist assignment with date range
        let playlistId = null;
        let playlistStartDate = null;
        let playlistEndDate = null;
        try {
            const playlistResult = await prisma.$queryRaw`
                SELECT playlist_id, start_date, end_date FROM screen_playlists WHERE screen_id = ${String(screenId)}
            `;
            if (playlistResult && playlistResult.length > 0) {
                playlistId = playlistResult[0].playlist_id;
                playlistStartDate = playlistResult[0].start_date;
                playlistEndDate = playlistResult[0].end_date;
            }
        } catch (e) {
            // Table might not exist yet, that's okay
        }
        
        // Format dates as ISO strings for the client
        const formattedStartDate = playlistStartDate ? new Date(playlistStartDate).toISOString() : null;
        const formattedEndDate = playlistEndDate ? new Date(playlistEndDate).toISOString() : null;
        
        // Try to get heightCalibration, paymentAmount, and logoUrl using raw SQL (columns might not exist yet)
        let heightCalibration = 0;
        let paymentAmount = null;
        let logoUrl = null;
        try {
            const configResult = await prisma.$queryRaw`
                SELECT "heightCalibration", "paymentAmount", "logoUrl" FROM "AdscapePlayer" WHERE "screenId" = ${String(screenId)} LIMIT 1
            `;
            if (configResult && configResult.length > 0) {
                if (configResult[0].heightCalibration !== null && configResult[0].heightCalibration !== undefined) {
                    heightCalibration = configResult[0].heightCalibration;
                }
                if (configResult[0].paymentAmount !== null && configResult[0].paymentAmount !== undefined) {
                    paymentAmount = configResult[0].paymentAmount;
                }
                if (configResult[0].logoUrl !== null && configResult[0].logoUrl !== undefined) {
                    logoUrl = configResult[0].logoUrl;
                }
            }
        } catch (e) {
            // Columns might not exist yet, use defaults
            console.log('[ADSCAPE] Config columns might not exist yet, using defaults');
        }
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                appVersion: player.appVersion,
                flowType: player.flowType,
                deviceName: player.deviceName,
                screenWidth: player.screenWidth,
                screenHeight: player.screenHeight,
                ipAddress: player.ipAddress,
                location: player.location,
                osVersion: player.osVersion,
                appVersionCode: player.appVersionCode,
                heightCalibration: heightCalibration,
                paymentAmount: paymentAmount,
                lastSeen: player.lastSeen,
                isActive: player.isActive,
                isEnabled: player.isActive, // Also include isEnabled for Android app compatibility
                createdAt: player.createdAt,
                updatedAt: player.updatedAt,
                playlistId: playlistId,
                playlistStartDate: formattedStartDate,
                playlistEndDate: formattedEndDate,
                logoUrl: logoUrl
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Get player error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * Get all players
 * GET /api/adscape/players
 */
exports.getAllPlayers = async (req, res) => {
    try {
        // Filter by role: super_admin sees all, admin sees only assigned screens
        const whereClause = req.user.role === 'super_admin'
            ? {}
            : { screenId: { in: req.user.assignedScreenIds } };
        
        // Try to get players with heightCalibration using raw SQL, fallback if column doesn't exist
        let players;
        try {
            if (req.user.role === 'super_admin') {
                players = await prisma.$queryRaw`
                    SELECT 
                        id, "screenId", "appVersion", "flowType", "deviceName", 
                        "screenWidth", "screenHeight", "ipAddress", location, 
                        "osVersion", "lastSeen", "isActive", "createdAt",
                        COALESCE("heightCalibration", 0) as "heightCalibration"
                    FROM "AdscapePlayer"
                    ORDER BY "createdAt" DESC
                `;
            } else {
                const screenIds = req.user.assignedScreenIds;
                if (screenIds.length === 0) {
                    players = [];
                } else {
                    players = await prisma.$queryRaw`
                        SELECT 
                            id, "screenId", "appVersion", "flowType", "deviceName", 
                            "screenWidth", "screenHeight", "ipAddress", location, 
                            "osVersion", "lastSeen", "isActive", "createdAt",
                            COALESCE("heightCalibration", 0) as "heightCalibration"
                        FROM "AdscapePlayer"
                        WHERE "screenId" = ANY(${screenIds})
                        ORDER BY "createdAt" DESC
                    `;
                }
            }
        } catch (e) {
            // Column doesn't exist yet, use raw SQL without heightCalibration
            console.log('[ADSCAPE] heightCalibration column does not exist, fetching without it');
            if (req.user.role === 'super_admin') {
                const rawPlayers = await prisma.$queryRaw`
                    SELECT 
                        id, "screenId", "appVersion", "flowType", "deviceName", 
                        "screenWidth", "screenHeight", "ipAddress", location, 
                        "osVersion", "lastSeen", "isActive", "createdAt"
                    FROM "AdscapePlayer"
                    ORDER BY "createdAt" DESC
                `;
                players = rawPlayers.map(p => ({ ...p, heightCalibration: 0 }));
            } else {
                const screenIds = req.user.assignedScreenIds;
                if (screenIds.length === 0) {
                    players = [];
                } else {
                    const rawPlayers = await prisma.$queryRaw`
                        SELECT 
                            id, "screenId", "appVersion", "flowType", "deviceName", 
                            "screenWidth", "screenHeight", "ipAddress", location, 
                            "osVersion", "lastSeen", "isActive", "createdAt"
                        FROM "AdscapePlayer"
                        WHERE "screenId" = ANY(${screenIds})
                        ORDER BY "createdAt" DESC
                    `;
                    players = rawPlayers.map(p => ({ ...p, heightCalibration: 0 }));
                }
            }
        }
        
        return res.json({
            ok: true,
            players: players.map(player => ({
                id: player.id,
                screenId: player.screenId,
                appVersion: player.appVersion,
                flowType: player.flowType,
                deviceName: player.deviceName,
                screenWidth: player.screenWidth,
                screenHeight: player.screenHeight,
                ipAddress: player.ipAddress,
                location: player.location,
                osVersion: player.osVersion,
                heightCalibration: player.heightCalibration ?? 0,
                lastSeen: player.lastSeen,
                isActive: player.isActive,
                createdAt: player.createdAt
            }))
        });
    } catch (e) {
        console.error('[ADSCAPE] Get all players error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * Update player flow type
 * PUT /api/adscape/player/:screenId/flow-type
 */
exports.updateFlowType = async (req, res, io) => {
    try {
        const { screenId } = req.params;
        const { flowType } = req.body;
        
        if (!flowType) {
            return res.status(400).json({ error: 'flowType required' });
        }
        
        // Normalize flowType: "Normal" becomes null, otherwise keep as is
        const normalizedFlowType = flowType === 'Normal' || flowType === 'normal' || flowType === '' ? null : String(flowType);
        
        const player = await prisma.adscapePlayer.update({
            where: { screenId: String(screenId) },
            data: { flowType: normalizedFlowType }
        });
        
        console.log('[ADSCAPE] Flow type updated:', { screenId, flowType: normalizedFlowType });
        
        // Emit real-time update to Android app via WebSocket
        if (io) {
            io.to(`screen:${String(screenId)}`).emit('flow-type-changed', {
                screenId: String(screenId),
                flowType: normalizedFlowType
            });
            console.log('[ADSCAPE] Flow type change emitted to screen:', screenId);
        }
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                flowType: player.flowType
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Update flow type error:', e);
        return res.status(500).json({ error: 'Failed to update flow type' });
    }
};

/**
 * Update player status (last seen, isActive)
 * POST /api/players/update-status
 */
exports.updatePlayerStatus = async (req, res) => {
    try {
        const { screenId, isActive } = req.body || {};
        
        if (!screenId) {
            return res.status(400).json({ error: 'screenId required' });
        }
        
        const player = await prisma.adscapePlayer.update({
            where: { screenId: String(screenId) },
            data: {
                lastSeen: new Date(),
                ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {})
            }
        });
        
        console.log('[ADSCAPE] Player status updated:', { screenId, isActive: player.isActive });
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                lastSeen: player.lastSeen,
                isActive: player.isActive
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Update player status error:', e);
        return res.status(500).json({ error: 'Failed to update player status' });
    }
};

/**
 * Get player by registration code (8-digit code derived from screenId)
 * GET /api/adscape/player-by-code/:code
 */
exports.getPlayerByCode = async (req, res) => {
    try {
        const { code } = req.params;
        
        if (!code || code.length !== 8) {
            return res.status(400).json({ error: 'Invalid registration code. Must be 8 digits.' });
        }
        
        // Find player by matching the last 8 characters of screenId
        // or by a generated code (for now, we'll search by screenId ending)
        const players = await prisma.adscapePlayer.findMany({
            where: {
                screenId: {
                    endsWith: code
                }
            }
        });
        
        if (players.length === 0) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        // If multiple matches, return the first one
        const player = players[0];
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                appVersion: player.appVersion,
                flowType: player.flowType,
                deviceName: player.deviceName,
                screenWidth: player.screenWidth,
                screenHeight: player.screenHeight,
                ipAddress: player.ipAddress,
                location: player.location,
                osVersion: player.osVersion,
                appVersionCode: player.appVersionCode,
                lastSeen: player.lastSeen,
                isActive: player.isActive,
                createdAt: player.createdAt,
                updatedAt: player.updatedAt
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Get player by code error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * Upload logo for screen
 * POST /api/adscape/player/:screenId/logo
 */
exports.uploadLogo = async (req, res) => {
    try {
        const { screenId } = req.params;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No logo file provided' });
        }

        // Check if player exists
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });

        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }

        // Delete old logo from Cloudinary if exists
        if (player.logoUrl) {
            try {
                // Extract public_id from Cloudinary URL
                const urlParts = player.logoUrl.split('/');
                const filename = urlParts[urlParts.length - 1].split('.')[0];
                const folder = 'well2day-logos';
                const publicId = `${folder}/${filename}`;
                await cloudinary.uploader.destroy(publicId);
                console.log('[ADSCAPE] Old logo deleted from Cloudinary:', publicId);
            } catch (deleteError) {
                console.error('[ADSCAPE] Error deleting old logo:', deleteError);
                // Continue even if deletion fails
            }
        }

        // Upload new logo to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                {
                    folder: 'well2day-logos',
                    resource_type: 'image',
                    use_filename: true,
                    unique_filename: true,
                    overwrite: false,
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            ).end(req.file.buffer);
        });

        // Update player with logo URL
        const updatedPlayer = await prisma.adscapePlayer.update({
            where: { screenId: String(screenId) },
            data: {
                logoUrl: uploadResult.secure_url,
                updatedAt: new Date()
            }
        });

        console.log('[ADSCAPE] Logo uploaded for screen:', screenId);

        return res.json({
            ok: true,
            logoUrl: uploadResult.secure_url,
            player: {
                screenId: updatedPlayer.screenId,
                logoUrl: updatedPlayer.logoUrl
            }
        });
    } catch (error) {
        console.error('[ADSCAPE] Upload logo error:', error);
        return res.status(500).json({ error: 'Failed to upload logo' });
    }
};

/**
 * Get logo for screen
 * GET /api/adscape/player/:screenId/logo
 */
exports.getLogo = async (req, res) => {
    try {
        const { screenId } = req.params;
        
        // Use raw SQL to fetch logoUrl (column might not exist in older schemas)
        let logoUrl = null;
        try {
            const logoResult = await prisma.$queryRaw`
                SELECT "logoUrl" 
                FROM "AdscapePlayer" 
                WHERE "screenId" = ${String(screenId)} 
                LIMIT 1
            `;
            if (logoResult && logoResult.length > 0) {
                logoUrl = logoResult[0].logoUrl || null;
            }
        } catch (e) {
            // Column doesn't exist yet or error, return 404
            console.log('[ADSCAPE] Logo column might not exist yet or error:', e.message);
            return res.status(404).json({ ok: false, error: 'Logo not found' });
        }

        if (!logoUrl) {
            return res.status(404).json({ ok: false, error: 'Logo not found' });
        }

        return res.json({
            ok: true,
            logoUrl: logoUrl
        });
    } catch (error) {
        console.error('[ADSCAPE] Get logo error:', error);
        return res.status(500).json({ ok: false, error: 'Failed to get logo' });
    }
};

/**
 * Update screen configuration
 * PUT /api/adscape/player/:screenId/config
 */
exports.updateScreenConfig = async (req, res, io) => {
    try {
        const { screenId } = req.params;
        const { flowType, isActive, deviceName, location, heightCalibration, paymentAmount, playlistId, playlistStartDate, playlistEndDate, logoUrl } = req.body || {};
        
        console.log('[ADSCAPE] Update screen config request:', { 
            screenId, 
            playlistId, 
            playlistStartDate, 
            playlistEndDate,
            body: req.body 
        });
        
        const updateData = {};
        
        if (flowType !== undefined) {
            // Normalize flowType: "Normal" becomes null, otherwise keep as is
            updateData.flowType = flowType === 'Normal' || flowType === 'normal' || flowType === '' ? null : String(flowType);
        }
        
        if (isActive !== undefined) {
            updateData.isActive = Boolean(isActive);
        }
        
        if (deviceName !== undefined) {
            updateData.deviceName = deviceName ? String(deviceName) : null;
        }
        
        if (location !== undefined) {
            updateData.location = location ? String(location) : null;
        }
        
        if (heightCalibration !== undefined) {
            // Allow null or empty string to clear the calibration (will use default 0 from database)
            if (heightCalibration === null || heightCalibration === undefined || heightCalibration === "") {
                updateData.heightCalibration = 0; // Use 0 instead of null since schema has @default(0)
            } else {
                const numValue = Number(heightCalibration);
                if (isNaN(numValue)) {
                    return res.status(400).json({ error: 'heightCalibration must be a valid number' });
                }
                updateData.heightCalibration = numValue;
            }
        }
        
        if (paymentAmount !== undefined) {
            // Allow null or empty string to clear the payment amount
            if (paymentAmount === null || paymentAmount === undefined || paymentAmount === "") {
                updateData.paymentAmount = null;
            } else {
                const numValue = Number(paymentAmount);
                if (isNaN(numValue) || numValue < 0) {
                    return res.status(400).json({ error: 'paymentAmount must be a valid positive number' });
                }
                updateData.paymentAmount = numValue;
            }
        }
        
        if (Object.keys(updateData).length === 0 && playlistId === undefined) {
            return res.status(400).json({ error: 'At least one field required for update' });
        }
        
        // Update player config
        let player = null;
        if (Object.keys(updateData).length > 0) {
            // Check if heightCalibration or paymentAmount is in updateData - if so, use raw SQL to update them
            // (This is a workaround until Prisma client is regenerated on Vercel)
            const hasHeightCalibration = 'heightCalibration' in updateData;
            const hasPaymentAmount = 'paymentAmount' in updateData;
            const heightCalibrationValue = updateData.heightCalibration;
            const paymentAmountValue = updateData.paymentAmount;
            
            if (hasHeightCalibration || hasPaymentAmount) {
                // Remove heightCalibration and paymentAmount from updateData for Prisma update
                const { heightCalibration, paymentAmount, ...prismaUpdateData } = updateData;
                
                // Update other fields with Prisma if there are any
                if (Object.keys(prismaUpdateData).length > 0) {
                    player = await prisma.adscapePlayer.update({
                        where: { screenId: String(screenId) },
                        data: prismaUpdateData
                    });
                } else {
                    // Only heightCalibration to update, fetch player first using raw SQL
                    try {
                        const playerResult = await prisma.$queryRaw`
                            SELECT * FROM "AdscapePlayer" WHERE "screenId" = ${String(screenId)} LIMIT 1
                        `;
                        if (playerResult && playerResult.length > 0) {
                            player = playerResult[0];
                        }
                    } catch (e) {
                        // Fallback to Prisma
                        player = await prisma.adscapePlayer.findUnique({
                            where: { screenId: String(screenId) }
                        });
                    }
                }
                
                // Update heightCalibration and paymentAmount using raw SQL
                // First check if columns exist, if not create them
                const updateFields = [];
                const updateValues = [];
                
                if (hasHeightCalibration) {
                    try {
                        await prisma.$executeRaw`
                            UPDATE "AdscapePlayer"
                            SET "heightCalibration" = ${heightCalibrationValue}
                            WHERE "screenId" = ${String(screenId)}
                        `;
                    } catch (e) {
                        // Column doesn't exist, create it first
                        if (e.code === '42703' || e.message?.includes('does not exist')) {
                            console.log('[ADSCAPE] heightCalibration column does not exist, creating it...');
                            await prisma.$executeRawUnsafe(`
                                ALTER TABLE "AdscapePlayer" 
                                ADD COLUMN IF NOT EXISTS "heightCalibration" DOUBLE PRECISION DEFAULT 0
                            `);
                            // Now update it
                            await prisma.$executeRaw`
                                UPDATE "AdscapePlayer"
                                SET "heightCalibration" = ${heightCalibrationValue}
                                WHERE "screenId" = ${String(screenId)}
                            `;
                        } else {
                            throw e;
                        }
                    }
                }
                
                if (hasPaymentAmount) {
                    try {
                        await prisma.$executeRaw`
                            UPDATE "AdscapePlayer"
                            SET "paymentAmount" = ${paymentAmountValue}
                            WHERE "screenId" = ${String(screenId)}
                        `;
                    } catch (e) {
                        // Column doesn't exist, create it first
                        if (e.code === '42703' || e.message?.includes('does not exist')) {
                            console.log('[ADSCAPE] paymentAmount column does not exist, creating it...');
                            await prisma.$executeRawUnsafe(`
                                ALTER TABLE "AdscapePlayer" 
                                ADD COLUMN IF NOT EXISTS "paymentAmount" DOUBLE PRECISION
                            `);
                            // Now update it
                            await prisma.$executeRaw`
                                UPDATE "AdscapePlayer"
                                SET "paymentAmount" = ${paymentAmountValue}
                                WHERE "screenId" = ${String(screenId)}
                            `;
                        } else {
                            throw e;
                        }
                    }
                }
                
                // Fetch updated player using raw SQL to avoid Prisma error
                try {
                    const playerResult = await prisma.$queryRaw`
                        SELECT * FROM "AdscapePlayer" WHERE "screenId" = ${String(screenId)} LIMIT 1
                    `;
                    if (playerResult && playerResult.length > 0) {
                        player = playerResult[0];
                    }
                } catch (e) {
                    // Fallback to Prisma
                    player = await prisma.adscapePlayer.findUnique({
                        where: { screenId: String(screenId) }
                    });
                }
            } else {
                // No heightCalibration, use normal Prisma update
                player = await prisma.adscapePlayer.update({
                    where: { screenId: String(screenId) },
                    data: updateData
                });
            }
        } else {
            player = await prisma.adscapePlayer.findUnique({
                where: { screenId: String(screenId) }
            });
        }
        
        // Handle playlist assignment (store in a separate table or as metadata)
        // Always process playlist assignment if provided (even if null to clear)
        if (playlistId !== undefined || playlistStartDate !== undefined || playlistEndDate !== undefined) {
            try {
                console.log('[ADSCAPE] Processing playlist assignment:', { 
                    screenId, 
                    playlistId, 
                    playlistStartDate, 
                    playlistEndDate,
                    playlistIdType: typeof playlistId,
                    playlistIdUndefined: playlistId === undefined
                });
                
                // Check if screen_playlists table exists, if not create it
                await prisma.$executeRawUnsafe(`
                    CREATE TABLE IF NOT EXISTS screen_playlists (
                        screen_id VARCHAR(64) PRIMARY KEY,
                        playlist_id VARCHAR(255),
                        start_date TIMESTAMP,
                        end_date TIMESTAMP,
                        assigned_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW()
                    )
                `);
                
                // Check if date columns exist, if not add them
                // This handles the case where the table was created earlier without date columns
                try {
                    const columnCheck = await prisma.$queryRawUnsafe(`
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = 'screen_playlists' 
                        AND column_name IN ('start_date', 'end_date')
                    `);
                    const existingColumns = columnCheck.map((row) => row.column_name);
                    
                    if (!existingColumns.includes('start_date')) {
                        await prisma.$executeRawUnsafe(`
                            ALTER TABLE screen_playlists ADD COLUMN start_date TIMESTAMP;
                        `);
                        console.log('[ADSCAPE] Added start_date column');
                    }
                    
                    if (!existingColumns.includes('end_date')) {
                        await prisma.$executeRawUnsafe(`
                            ALTER TABLE screen_playlists ADD COLUMN end_date TIMESTAMP;
                        `);
                        console.log('[ADSCAPE] Added end_date column');
                    }
                    
                    if (existingColumns.includes('start_date') && existingColumns.includes('end_date')) {
                        console.log('[ADSCAPE] Table structure verified - all columns exist');
                    }
                } catch (alterError) {
                    console.error('[ADSCAPE] Error checking/adding columns:', alterError.message);
                    // If the check fails, try to add columns anyway (they might already exist)
                    try {
                        await prisma.$executeRawUnsafe(`
                            ALTER TABLE screen_playlists ADD COLUMN start_date TIMESTAMP;
                        `);
                        console.log('[ADSCAPE] Added start_date column (fallback)');
                    } catch (e) {
                        if (!e.message || (!e.message.includes('already exists') && !e.message.includes('duplicate'))) {
                            console.error('[ADSCAPE] Could not add start_date:', e.message);
                        }
                    }
                    try {
                        await prisma.$executeRawUnsafe(`
                            ALTER TABLE screen_playlists ADD COLUMN end_date TIMESTAMP;
                        `);
                        console.log('[ADSCAPE] Added end_date column (fallback)');
                    } catch (e) {
                        if (!e.message || (!e.message.includes('already exists') && !e.message.includes('duplicate'))) {
                            console.error('[ADSCAPE] Could not add end_date:', e.message);
                        }
                    }
                }
                
                // Get current assignment to preserve playlistId if not being updated
                let currentPlaylistId = null;
                try {
                    const currentResult = await prisma.$queryRaw`
                        SELECT playlist_id FROM screen_playlists WHERE screen_id = ${String(screenId)}
                    `;
                    if (currentResult && currentResult.length > 0) {
                        currentPlaylistId = currentResult[0].playlist_id;
                        console.log('[ADSCAPE] Current playlist found:', currentPlaylistId);
                    }
                } catch (e) {
                    console.log('[ADSCAPE] No current playlist found (table might not exist yet)');
                }
                
                // Determine the playlist ID to use
                const finalPlaylistId = playlistId !== undefined 
                    ? (playlistId && playlistId !== '' && playlistId !== 'none' ? String(playlistId) : null)
                    : currentPlaylistId;
                
                console.log('[ADSCAPE] Final playlist ID determined:', finalPlaylistId);
                
                if (finalPlaylistId) {
                    // Get current dates if not being updated
                    let currentStartDate = null;
                    let currentEndDate = null;
                    if (playlistStartDate === undefined || playlistEndDate === undefined) {
                        try {
                            const dateResult = await prisma.$queryRaw`
                                SELECT start_date, end_date FROM screen_playlists WHERE screen_id = ${String(screenId)}
                            `;
                            if (dateResult && dateResult.length > 0) {
                                currentStartDate = dateResult[0].start_date;
                                currentEndDate = dateResult[0].end_date;
                            }
                        } catch (e) {
                            // No existing record
                        }
                    }
                    
                    // Determine final date values
                    let finalStartDate = null;
                    let finalEndDate = null;
                    
                    if (playlistStartDate !== undefined) {
                        finalStartDate = playlistStartDate ? new Date(playlistStartDate) : null;
                    } else {
                        finalStartDate = currentStartDate;
                    }
                    
                    if (playlistEndDate !== undefined) {
                        finalEndDate = playlistEndDate ? new Date(playlistEndDate) : null;
                    } else {
                        finalEndDate = currentEndDate;
                    }
                    
                    console.log('[ADSCAPE] Final date values:', { 
                        finalStartDate, 
                        finalEndDate, 
                        playlistStartDate, 
                        playlistEndDate,
                        currentStartDate,
                        currentEndDate
                    });
                    
                    // Insert or update with dates - Prisma handles null values correctly
                    console.log('[ADSCAPE] Executing INSERT/UPDATE for playlist:', {
                        screenId,
                        finalPlaylistId,
                        finalStartDate,
                        finalEndDate
                    });
                    
                    const result = await prisma.$executeRaw`
                        INSERT INTO screen_playlists (screen_id, playlist_id, start_date, end_date, updated_at)
                        VALUES (${String(screenId)}, ${String(finalPlaylistId)}, ${finalStartDate}, ${finalEndDate}, NOW())
                        ON CONFLICT (screen_id) 
                        DO UPDATE SET 
                            playlist_id = ${String(finalPlaylistId)}, 
                            start_date = ${finalStartDate},
                            end_date = ${finalEndDate},
                            updated_at = NOW()
                    `;
                    console.log('[ADSCAPE] Playlist INSERT/UPDATE result:', result);
                    
                    // Verify the save by reading it back
                    const verifyResult = await prisma.$queryRaw`
                        SELECT * FROM screen_playlists WHERE screen_id = ${String(screenId)}
                    `;
                    console.log('[ADSCAPE] Verification - saved playlist data:', verifyResult);
                    
                    console.log('[ADSCAPE] Playlist assigned successfully:', { screenId, playlistId: finalPlaylistId, startDate: finalStartDate, endDate: finalEndDate });
                } else if (playlistId !== undefined && (!playlistId || playlistId === '' || playlistId === 'none')) {
                    // Remove playlist assignment only if explicitly set to none
                    await prisma.$executeRaw`
                        DELETE FROM screen_playlists WHERE screen_id = ${String(screenId)}
                    `;
                    console.log('[ADSCAPE] Playlist assignment removed:', { screenId });
                } else if (playlistStartDate !== undefined || playlistEndDate !== undefined) {
                    // Update dates only for existing assignment
                    // Get current values for fields not being updated
                    let currentStart = null;
                    let currentEnd = null;
                    try {
                        const currentResult = await prisma.$queryRaw`
                            SELECT start_date, end_date FROM screen_playlists WHERE screen_id = ${String(screenId)}
                        `;
                        if (currentResult && currentResult.length > 0) {
                            currentStart = currentResult[0].start_date;
                            currentEnd = currentResult[0].end_date;
                        }
                    } catch (e) {
                        // No existing record
                    }
                    
                    const updateStartDate = playlistStartDate !== undefined 
                        ? (playlistStartDate ? new Date(playlistStartDate) : null)
                        : currentStart;
                    const updateEndDate = playlistEndDate !== undefined 
                        ? (playlistEndDate ? new Date(playlistEndDate) : null)
                        : currentEnd;
                    
                    if (currentPlaylistId) {
                        // Update existing record
                        await prisma.$executeRaw`
                            UPDATE screen_playlists 
                            SET start_date = ${updateStartDate}, end_date = ${updateEndDate}, updated_at = NOW()
                            WHERE screen_id = ${String(screenId)}
                        `;
                        console.log('[ADSCAPE] Playlist dates updated:', { screenId, startDate: updateStartDate, endDate: updateEndDate });
                    }
                }
            } catch (playlistError) {
                console.error('[ADSCAPE] Error updating playlist assignment:', playlistError);
                console.error('[ADSCAPE] Error details:', playlistError.message);
                console.error('[ADSCAPE] Error stack:', playlistError.stack);
                // Log error but don't fail the whole request - screen config update can still succeed
                // The error will be visible in logs for debugging
            }
        } else {
            console.log('[ADSCAPE] No playlist assignment data provided - skipping playlist update');
        }
        
        console.log('[ADSCAPE] Screen config updated:', { screenId, ...updateData, playlistId });
        
        // Get current playlist assignment with date range
        let currentPlaylistId = null;
        let currentStartDate = null;
        let currentEndDate = null;
        try {
            const playlistResult = await prisma.$queryRaw`
                SELECT playlist_id, start_date, end_date FROM screen_playlists WHERE screen_id = ${String(screenId)}
            `;
            if (playlistResult && playlistResult.length > 0) {
                currentPlaylistId = playlistResult[0].playlist_id;
                currentStartDate = playlistResult[0].start_date;
                currentEndDate = playlistResult[0].end_date;
            }
        } catch (e) {
            // Table might not exist yet
        }
        
        // Format dates as ISO strings for the client
        const formattedStartDate = currentStartDate ? new Date(currentStartDate).toISOString() : null;
        const formattedEndDate = currentEndDate ? new Date(currentEndDate).toISOString() : null;
        
        // Emit real-time update if flowType changed
        if (io && updateData.flowType !== undefined) {
            io.to(`screen:${String(screenId)}`).emit('flow-type-changed', {
                screenId: String(screenId),
                flowType: updateData.flowType
            });
            console.log('[ADSCAPE] Flow type change emitted to screen:', screenId);
        }
        
        // Emit screen-config-changed event when playlist or config is updated
        // This allows Android app to immediately detect playlist changes
        // Emit if playlist was updated OR if screen config (isActive) was updated
        const playlistWasUpdated = playlistId !== undefined || playlistStartDate !== undefined || playlistEndDate !== undefined;
        const configWasUpdated = updateData.isActive !== undefined || updateData.deviceName !== undefined || updateData.location !== undefined;
        
        if (io && (playlistWasUpdated || configWasUpdated)) {
            io.to(`screen:${String(screenId)}`).emit('screen-config-changed', {
                screenId: String(screenId),
                playlistId: currentPlaylistId,
                playlistStartDate: formattedStartDate,
                playlistEndDate: formattedEndDate,
                isEnabled: player.isActive, // Map isActive to isEnabled for Android app
                flowType: player.flowType
            });
            console.log('[ADSCAPE] Screen config change emitted to screen:', screenId, {
                playlistId: currentPlaylistId,
                playlistStartDate: formattedStartDate,
                playlistEndDate: formattedEndDate,
                isEnabled: player.isActive,
                reason: playlistWasUpdated ? 'playlist_updated' : 'config_updated'
            });
        }
        
        // Get heightCalibration from player (it might be updated via raw SQL)
        let heightCalibrationValue = 0;
        try {
            const heightCalResult = await prisma.$queryRaw`
                SELECT COALESCE("heightCalibration", 0) as "heightCalibration" 
                FROM "AdscapePlayer" 
                WHERE "screenId" = ${String(screenId)} 
                LIMIT 1
            `;
            if (heightCalResult && heightCalResult.length > 0) {
                heightCalibrationValue = Number(heightCalResult[0].heightCalibration) || 0;
            }
        } catch (e) {
            // Column doesn't exist, use default 0
            heightCalibrationValue = 0;
        }
        
        // Get logoUrl from player
        let logoUrlValue = null;
        try {
            const logoResult = await prisma.$queryRaw`
                SELECT "logoUrl" 
                FROM "AdscapePlayer" 
                WHERE "screenId" = ${String(screenId)} 
                LIMIT 1
            `;
            if (logoResult && logoResult.length > 0) {
                logoUrlValue = logoResult[0].logoUrl || null;
            }
        } catch (e) {
            // Column doesn't exist yet or error, use null
            logoUrlValue = null;
        }

        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                flowType: player.flowType,
                isActive: player.isActive,
                isEnabled: player.isActive, // Also include isEnabled for Android app compatibility
                deviceName: player.deviceName,
                location: player.location,
                heightCalibration: heightCalibrationValue,
                playlistId: currentPlaylistId,
                playlistStartDate: formattedStartDate,
                playlistEndDate: formattedEndDate,
                logoUrl: logoUrlValue
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Update screen config error:', e);
        return res.status(500).json({ error: 'Failed to update screen config' });
    }
};

/**
 * Delete a player
 * DELETE /api/adscape/player/:screenId
 */
exports.deletePlayer = async (req, res) => {
    try {
        const { screenId } = req.params;
        
        await prisma.adscapePlayer.delete({
            where: { screenId: String(screenId) }
        });
        
        console.log('[ADSCAPE] Player deleted:', { screenId });
        
        return res.json({ ok: true, message: 'Player deleted successfully' });
    } catch (e) {
        console.error('[ADSCAPE] Delete player error:', e);
        return res.status(500).json({ error: 'Failed to delete player' });
    }
};



