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
        
        // Check if player already exists to preserve admin-configured values
        const existingPlayer = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });
        
        // Preserve admin-configured deviceName and location if they exist
        // Device registration should NOT overwrite admin-configured values
        const updateData = {
            appVersion: String(appVersion),
            ...(flowType !== undefined && flowType !== null ? { flowType: String(flowType) } : {}),
            screenWidth: screenWidth ? Number(screenWidth) : null,
            screenHeight: screenHeight ? Number(screenHeight) : null,
            ipAddress: ipAddress ? String(ipAddress) : null,
            osVersion: osVersion ? String(osVersion) : null,
            appVersionCode: appVersionCode ? String(appVersionCode) : null,
            lastSeen: new Date(),
            isActive: true,
            updatedAt: new Date()
        };
        
        // Preserve admin-configured deviceName - only update if not already set
        if (existingPlayer && existingPlayer.deviceName && existingPlayer.deviceName.trim() !== '') {
            // Admin has configured a deviceName, preserve it (don't overwrite with device-sent value)
            updateData.deviceName = existingPlayer.deviceName;
            console.log('[ADSCAPE] Preserving admin-configured deviceName:', existingPlayer.deviceName);
        } else {
            // No existing deviceName, use incoming value (or null)
            updateData.deviceName = deviceName ? String(deviceName) : null;
        }
        
        // Preserve admin-configured location - only update if not already set
        if (existingPlayer && existingPlayer.location && existingPlayer.location.trim() !== '') {
            // Admin has configured a location, preserve it (don't overwrite with device-sent value)
            updateData.location = existingPlayer.location;
            console.log('[ADSCAPE] Preserving admin-configured location:', existingPlayer.location);
        } else {
            // No existing location, use incoming value (or null)
            updateData.location = location ? String(location) : null;
        }
        
        // Upsert Adscape player registration
        const player = await prisma.adscapePlayer.upsert({
            where: { screenId: String(screenId) },
            update: updateData,
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
        
        // Get playlistId, heightCalibration, heightCalibrationEnabled, paymentAmount, logoUrl, flowDrawerEnabled, flowDrawerSlotCount, flowDrawerSlots, and flow drawer images using raw SQL (columns might not exist yet)
        let playlistId = null;
        let heightCalibration = 0;
        let heightCalibrationEnabled = true;
        let paymentAmount = null;
        let logoUrl = null;
        let flowDrawerEnabled = true;
        let flowDrawerSlotCount = 2;
        let flowDrawerSlots = [];
        let flowDrawerImage1Url = null;
        let flowDrawerImage2Url = null;
        try {
            const configResult = await prisma.$queryRaw`
                SELECT "playlistId", "heightCalibration", "heightCalibrationEnabled", "paymentAmount", "logoUrl", "flowDrawerEnabled", "flowDrawerSlotCount", "flowDrawerSlots", "flowDrawerImage1Url", "flowDrawerImage2Url" FROM "AdscapePlayer" WHERE "screenId" = ${String(screenId)} LIMIT 1
            `;
            if (configResult && configResult.length > 0) {
                playlistId = configResult[0].playlistId || null;
                if (configResult[0].heightCalibration !== null && configResult[0].heightCalibration !== undefined) {
                    heightCalibration = configResult[0].heightCalibration;
                }
                if (configResult[0].heightCalibrationEnabled !== null && configResult[0].heightCalibrationEnabled !== undefined) {
                    heightCalibrationEnabled = Boolean(configResult[0].heightCalibrationEnabled);
                }
                if (configResult[0].paymentAmount !== null && configResult[0].paymentAmount !== undefined) {
                    paymentAmount = configResult[0].paymentAmount;
                }
                if (configResult[0].logoUrl !== null && configResult[0].logoUrl !== undefined) {
                    logoUrl = configResult[0].logoUrl;
                }
                if (configResult[0].flowDrawerEnabled !== null && configResult[0].flowDrawerEnabled !== undefined) {
                    flowDrawerEnabled = Boolean(configResult[0].flowDrawerEnabled);
                }
                if (configResult[0].flowDrawerSlotCount !== null && configResult[0].flowDrawerSlotCount !== undefined) {
                    flowDrawerSlotCount = parseInt(configResult[0].flowDrawerSlotCount) || 2;
                }
                if (configResult[0].flowDrawerSlots !== null && configResult[0].flowDrawerSlots !== undefined) {
                    flowDrawerSlots = JSON.parse(JSON.stringify(configResult[0].flowDrawerSlots));
                }
                
                console.log('[ADSCAPE] Loaded flow drawer config:', {
                    slotCount: flowDrawerSlotCount,
                    slotsLength: flowDrawerSlots.length,
                    enabled: flowDrawerEnabled
                });
                if (configResult[0].flowDrawerImage1Url !== null && configResult[0].flowDrawerImage1Url !== undefined) {
                    flowDrawerImage1Url = configResult[0].flowDrawerImage1Url;
                }
                if (configResult[0].flowDrawerImage2Url !== null && configResult[0].flowDrawerImage2Url !== undefined) {
                    flowDrawerImage2Url = configResult[0].flowDrawerImage2Url;
                }
                
                // Migrate legacy fields to slots if slots is empty
                if (flowDrawerSlots.length === 0 && (flowDrawerImage1Url || flowDrawerImage2Url)) {
                    flowDrawerSlots = [flowDrawerImage1Url, flowDrawerImage2Url];
                    flowDrawerSlotCount = 2;
                }
                
                // Ensure slots array has correct length
                while (flowDrawerSlots.length < flowDrawerSlotCount) {
                    flowDrawerSlots.push(null);
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
                heightCalibrationEnabled: heightCalibrationEnabled,
                paymentAmount: paymentAmount,
                flowDrawerEnabled: flowDrawerEnabled,
                flowDrawerSlotCount: flowDrawerSlotCount,
                flowDrawerSlots: flowDrawerSlots,
                lastSeen: player.lastSeen,
                isActive: player.isActive,
                isEnabled: player.isActive, // Also include isEnabled for Android app compatibility
                createdAt: player.createdAt,
                updatedAt: player.updatedAt,
                playlistId: playlistId,
                logoUrl: logoUrl,
                flowDrawerImage1Url: flowDrawerImage1Url, // Legacy support
                flowDrawerImage2Url: flowDrawerImage2Url  // Legacy support
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
 * Delete logo for screen
 * DELETE /api/adscape/player/:screenId/logo
 */
exports.deleteLogo = async (req, res) => {
    try {
        const { screenId } = req.params;
        
        // Check if player exists
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });

        if (!player) {
            return res.status(404).json({ ok: false, error: 'Player not found' });
        }

        // Delete logo from Cloudinary if exists
        if (player.logoUrl) {
            try {
                // Extract public_id from Cloudinary URL
                const urlParts = player.logoUrl.split('/');
                const filename = urlParts[urlParts.length - 1].split('.')[0];
                const folder = 'well2day-logos';
                const publicId = `${folder}/${filename}`;
                await cloudinary.uploader.destroy(publicId);
                console.log('[ADSCAPE] Logo deleted from Cloudinary:', publicId);
            } catch (deleteError) {
                console.error('[ADSCAPE] Error deleting logo from Cloudinary:', deleteError);
                // Continue even if deletion fails - we'll still remove the URL from database
            }
        }

        // Update player to remove logoUrl
        const updatedPlayer = await prisma.adscapePlayer.update({
            where: { screenId: String(screenId) },
            data: { logoUrl: null, updatedAt: new Date() }
        });

        return res.json({
            ok: true,
            message: 'Logo deleted successfully',
            player: {
                screenId: updatedPlayer.screenId,
                logoUrl: null
            }
        });
    } catch (error) {
        console.error('[ADSCAPE] Delete logo error:', error);
        return res.status(500).json({ ok: false, error: 'Failed to delete logo' });
    }
};

/**
 * Upload flow drawer image for screen
 * POST /api/adscape/player/:screenId/flow-drawer-image/:imageNumber
 */
exports.uploadFlowDrawerImage = async (req, res) => {
    try {
        const { screenId, imageNumber } = req.params;
        
        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'No image file provided' });
        }

        const slotIndex = parseInt(imageNumber) - 1; // Convert to 0-based index
        if (slotIndex < 0) {
            return res.status(400).json({ ok: false, error: 'Image number must be 1 or greater' });
        }

        // Check if player exists
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });

        if (!player) {
            return res.status(404).json({ ok: false, error: 'Player not found' });
        }

        // Get current slot count
        let slotCount = 2; // Default
        let oldImageUrl = null;
        
        try {
            const configResult = await prisma.$queryRaw`
                SELECT "flowDrawerSlotCount", "flowDrawerImage1Url", "flowDrawerImage2Url",
                       "flowDrawerImage3Url", "flowDrawerImage4Url", "flowDrawerImage5Url"
                FROM "AdscapePlayer" 
                WHERE "screenId" = ${String(screenId)} 
                LIMIT 1
            `;
            if (configResult && configResult.length > 0) {
                slotCount = configResult[0].flowDrawerSlotCount || 2;
                // Get old image URL for the slot being updated
                if (slotIndex === 0) oldImageUrl = configResult[0].flowDrawerImage1Url;
                else if (slotIndex === 1) oldImageUrl = configResult[0].flowDrawerImage2Url;
                else if (slotIndex === 2) oldImageUrl = configResult[0].flowDrawerImage3Url;
                else if (slotIndex === 3) oldImageUrl = configResult[0].flowDrawerImage4Url;
                else if (slotIndex === 4) oldImageUrl = configResult[0].flowDrawerImage5Url;
            }
        } catch (e) {
            // Columns might not exist yet, use defaults
            console.log('[ADSCAPE] Flow drawer slot columns might not exist yet, using defaults');
        }

        // Validate slot index
        if (slotIndex >= slotCount || slotIndex >= 5) {
            return res.status(400).json({ ok: false, error: `Image number must be between 1 and ${Math.min(slotCount, 5)}` });
        }

        // Delete old image from Cloudinary if exists
        if (oldImageUrl) {
            try {
                const urlParts = oldImageUrl.split('/');
                const filename = urlParts[urlParts.length - 1].split('.')[0];
                const folder = 'well2day-flow-drawer';
                const publicId = `${folder}/${filename}`;
                await cloudinary.uploader.destroy(publicId);
                console.log('[ADSCAPE] Old flow drawer image deleted from Cloudinary:', publicId);
            } catch (deleteError) {
                console.error('[ADSCAPE] Error deleting old flow drawer image:', deleteError);
                // Continue even if deletion fails
            }
        }

        // Upload new image to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                {
                    folder: 'well2day-flow-drawer',
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

        // Determine which field to update based on slot index
        const fieldMap = {
            0: 'flowDrawerImage1Url',
            1: 'flowDrawerImage2Url',
            2: 'flowDrawerImage3Url',
            3: 'flowDrawerImage4Url',
            4: 'flowDrawerImage5Url'
        };
        
        const fieldName = fieldMap[slotIndex];
        if (!fieldName) {
            return res.status(400).json({ ok: false, error: 'Invalid slot number' });
        }

        // Update player with individual URL field using raw SQL
        try {
            await prisma.$executeRawUnsafe(`
                UPDATE "AdscapePlayer"
                SET "${fieldName}" = $1,
                    "updatedAt" = NOW()
                WHERE "screenId" = $2
            `, uploadResult.secure_url, String(screenId));
        } catch (e) {
            console.error('[ADSCAPE] Error updating flow drawer image field:', e);
            throw e;
        }

        // Fetch updated URLs to return in response
        let updatedSlots = [];
        try {
            const updatedResult = await prisma.$queryRaw`
                SELECT "flowDrawerImage1Url", "flowDrawerImage2Url",
                       "flowDrawerImage3Url", "flowDrawerImage4Url", "flowDrawerImage5Url"
                FROM "AdscapePlayer" 
                WHERE "screenId" = ${String(screenId)} 
                LIMIT 1
            `;
            if (updatedResult && updatedResult.length > 0) {
                if (slotCount >= 1) updatedSlots.push(updatedResult[0].flowDrawerImage1Url || null);
                if (slotCount >= 2) updatedSlots.push(updatedResult[0].flowDrawerImage2Url || null);
                if (slotCount >= 3) updatedSlots.push(updatedResult[0].flowDrawerImage3Url || null);
                if (slotCount >= 4) updatedSlots.push(updatedResult[0].flowDrawerImage4Url || null);
                if (slotCount >= 5) updatedSlots.push(updatedResult[0].flowDrawerImage5Url || null);
            }
        } catch (e) {
            console.log('[ADSCAPE] Error fetching updated slots:', e.message);
        }

        console.log(`[ADSCAPE] Flow drawer image ${slotIndex + 1} uploaded for screen:`, screenId);

        return res.json({
            ok: true,
            imageUrl: uploadResult.secure_url,
            imageNumber: slotIndex + 1,
            slots: updatedSlots,
            slotCount: slotCount
        });
    } catch (error) {
        console.error('[ADSCAPE] Upload flow drawer image error:', error);
        return res.status(500).json({ ok: false, error: 'Failed to upload flow drawer image' });
    }
};

/**
 * Get flow drawer images for screen
 * GET /api/adscape/player/:screenId/flow-drawer-images
 */
exports.getFlowDrawerImages = async (req, res) => {
    try {
        const { screenId } = req.params;
        
        // Use raw SQL to fetch flow drawer slot count and slots array
        let slotCount = 2; // Default
        let slots = [];
        let flowDrawerImage1Url = null;
        let flowDrawerImage2Url = null;

        try {
            const imageResult = await prisma.$queryRaw`
                SELECT "flowDrawerSlotCount", "flowDrawerImage1Url", "flowDrawerImage2Url", 
                       "flowDrawerImage3Url", "flowDrawerImage4Url", "flowDrawerImage5Url"
                FROM "AdscapePlayer" 
                WHERE "screenId" = ${String(screenId)} 
                LIMIT 1
            `;

            if (imageResult && imageResult.length > 0) {
                slotCount = imageResult[0].flowDrawerSlotCount || 2;
                flowDrawerImage1Url = imageResult[0].flowDrawerImage1Url || null;
                flowDrawerImage2Url = imageResult[0].flowDrawerImage2Url || null;
                const flowDrawerImage3Url = imageResult[0].flowDrawerImage3Url || null;
                const flowDrawerImage4Url = imageResult[0].flowDrawerImage4Url || null;
                const flowDrawerImage5Url = imageResult[0].flowDrawerImage5Url || null;
                
                // Build slots array from individual URL fields based on slot count
                slots = [];
                if (slotCount >= 1) slots.push(flowDrawerImage1Url);
                if (slotCount >= 2) slots.push(flowDrawerImage2Url);
                if (slotCount >= 3) slots.push(flowDrawerImage3Url);
                if (slotCount >= 4) slots.push(flowDrawerImage4Url);
                if (slotCount >= 5) slots.push(flowDrawerImage5Url);
            }
        } catch (e) {
            console.log('[ADSCAPE] Flow drawer image columns might not exist yet or error:', e.message);
            // Return empty if columns don't exist
            return res.json({
                ok: true,
                slotCount: 2,
                slots: [],
                flowDrawerImage1Url: null,
                flowDrawerImage2Url: null,
                flowDrawerImage3Url: null,
                flowDrawerImage4Url: null,
                flowDrawerImage5Url: null
            });
        }

        return res.json({
            ok: true,
            slotCount: slotCount,
            slots: slots,
            flowDrawerImage1Url: slots[0] || null,
            flowDrawerImage2Url: slots[1] || null,
            flowDrawerImage3Url: slots[2] || null,
            flowDrawerImage4Url: slots[3] || null,
            flowDrawerImage5Url: slots[4] || null
        });
    } catch (error) {
        console.error('[ADSCAPE] Get flow drawer images error:', error);
        return res.status(500).json({ ok: false, error: 'Failed to get flow drawer images' });
    }
};

/**
 * Delete flow drawer image for screen
 * DELETE /api/adscape/player/:screenId/flow-drawer-image/:imageNumber
 */
exports.deleteFlowDrawerImage = async (req, res) => {
    try {
        const { screenId, imageNumber } = req.params;
        
        const slotIndex = parseInt(imageNumber) - 1; // Convert to 0-based index
        if (slotIndex < 0) {
            return res.status(400).json({ ok: false, error: 'Image number must be 1 or greater' });
        }

        // Check if player exists
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });

        if (!player) {
            return res.status(404).json({ ok: false, error: 'Player not found' });
        }

        // Get current slot count and image URL for the slot
        let slotCount = 2; // Default
        let imageUrl = null;
        
        try {
            const configResult = await prisma.$queryRaw`
                SELECT "flowDrawerSlotCount", "flowDrawerImage1Url", "flowDrawerImage2Url",
                       "flowDrawerImage3Url", "flowDrawerImage4Url", "flowDrawerImage5Url"
                FROM "AdscapePlayer" 
                WHERE "screenId" = ${String(screenId)} 
                LIMIT 1
            `;
            if (configResult && configResult.length > 0) {
                slotCount = configResult[0].flowDrawerSlotCount || 2;
                // Get image URL for the slot being deleted
                if (slotIndex === 0) imageUrl = configResult[0].flowDrawerImage1Url;
                else if (slotIndex === 1) imageUrl = configResult[0].flowDrawerImage2Url;
                else if (slotIndex === 2) imageUrl = configResult[0].flowDrawerImage3Url;
                else if (slotIndex === 3) imageUrl = configResult[0].flowDrawerImage4Url;
                else if (slotIndex === 4) imageUrl = configResult[0].flowDrawerImage5Url;
            }
        } catch (e) {
            // Columns might not exist yet, try legacy fields
            console.log('[ADSCAPE] Flow drawer slot columns might not exist yet, trying legacy fields');
            if (slotIndex === 0) imageUrl = player.flowDrawerImage1Url;
            else if (slotIndex === 1) imageUrl = player.flowDrawerImage2Url;
        }

        // Validate slot index
        if (slotIndex >= slotCount || slotIndex >= 5) {
            return res.status(400).json({ ok: false, error: `Image number must be between 1 and ${Math.min(slotCount, 5)}` });
        }
        if (!imageUrl) {
            return res.status(404).json({ ok: false, error: 'Flow drawer image not found' });
        }

        // Delete image from Cloudinary if exists
        try {
            const urlParts = imageUrl.split('/');
            const filename = urlParts[urlParts.length - 1].split('.')[0];
            const folder = 'well2day-flow-drawer';
            const publicId = `${folder}/${filename}`;
            await cloudinary.uploader.destroy(publicId);
            console.log('[ADSCAPE] Flow drawer image deleted from Cloudinary:', publicId);
        } catch (deleteError) {
            console.error('[ADSCAPE] Error deleting flow drawer image from Cloudinary:', deleteError);
            // Continue even if deletion fails
        }

        // Determine which field to clear based on slot index
        const fieldMap = {
            0: 'flowDrawerImage1Url',
            1: 'flowDrawerImage2Url',
            2: 'flowDrawerImage3Url',
            3: 'flowDrawerImage4Url',
            4: 'flowDrawerImage5Url'
        };
        
        const fieldName = fieldMap[slotIndex];
        if (!fieldName) {
            return res.status(400).json({ ok: false, error: 'Invalid slot number' });
        }

        // Update player to clear the individual URL field using raw SQL
        try {
            await prisma.$executeRawUnsafe(`
                UPDATE "AdscapePlayer"
                SET "${fieldName}" = NULL,
                    "updatedAt" = NOW()
                WHERE "screenId" = $1
            `, String(screenId));
        } catch (e) {
            console.error('[ADSCAPE] Error updating flow drawer image field:', e);
            throw e;
        }

        // Fetch updated URLs to return in response
        let updatedSlots = [];
        try {
            const updatedResult = await prisma.$queryRaw`
                SELECT "flowDrawerImage1Url", "flowDrawerImage2Url",
                       "flowDrawerImage3Url", "flowDrawerImage4Url", "flowDrawerImage5Url"
                FROM "AdscapePlayer" 
                WHERE "screenId" = ${String(screenId)} 
                LIMIT 1
            `;
            if (updatedResult && updatedResult.length > 0) {
                if (slotCount >= 1) updatedSlots.push(updatedResult[0].flowDrawerImage1Url || null);
                if (slotCount >= 2) updatedSlots.push(updatedResult[0].flowDrawerImage2Url || null);
                if (slotCount >= 3) updatedSlots.push(updatedResult[0].flowDrawerImage3Url || null);
                if (slotCount >= 4) updatedSlots.push(updatedResult[0].flowDrawerImage4Url || null);
                if (slotCount >= 5) updatedSlots.push(updatedResult[0].flowDrawerImage5Url || null);
            }
        } catch (e) {
            console.log('[ADSCAPE] Error fetching updated slots:', e.message);
        }

        return res.json({
            ok: true,
            message: 'Flow drawer image deleted successfully',
            imageNumber: slotIndex + 1,
            slots: updatedSlots,
            slotCount: slotCount
        });
    } catch (error) {
        console.error('[ADSCAPE] Delete flow drawer image error:', error);
        return res.status(500).json({ ok: false, error: 'Failed to delete flow drawer image' });
    }
};

/**
 * Update screen configuration
 * PUT /api/adscape/player/:screenId/config
 */
exports.updateScreenConfig = async (req, res, io) => {
    try {
        const { screenId } = req.params;
        const { flowType, isActive, deviceName, location, heightCalibration, heightCalibrationEnabled, paymentAmount, playlistId, logoUrl, flowDrawerEnabled, flowDrawerSlotCount } = req.body || {};
        
        console.log('[ADSCAPE] Update screen config request:', { 
            screenId, 
            playlistId,
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
        
        if (heightCalibrationEnabled !== undefined) {
            updateData.heightCalibrationEnabled = Boolean(heightCalibrationEnabled);
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
        
        if (flowDrawerEnabled !== undefined) {
            updateData.flowDrawerEnabled = Boolean(flowDrawerEnabled);
        }
        
        if (flowDrawerSlotCount !== undefined) {
            const slotCount = parseInt(flowDrawerSlotCount);
            if (slotCount !== 2 && slotCount !== 3 && slotCount !== 5) {
                return res.status(400).json({ error: 'flowDrawerSlotCount must be 2, 3, or 5' });
            }
            console.log('[ADSCAPE] Updating flowDrawerSlotCount to:', slotCount, 'for screen:', screenId);
            // Handle slot count update using raw SQL
            try {
                await prisma.$executeRaw`
                    UPDATE "AdscapePlayer"
                    SET "flowDrawerSlotCount" = ${slotCount},
                        "updatedAt" = NOW()
                    WHERE "screenId" = ${String(screenId)}
                `;
                console.log('[ADSCAPE] Successfully updated flowDrawerSlotCount');
            } catch (e) {
                // Column doesn't exist, create it first
                if (e.code === '42703' || e.message?.includes('does not exist')) {
                    console.log('[ADSCAPE] flowDrawerSlotCount column does not exist, creating it...');
                    await prisma.$executeRawUnsafe(`
                        ALTER TABLE "AdscapePlayer" 
                        ADD COLUMN IF NOT EXISTS "flowDrawerSlotCount" INTEGER DEFAULT 2
                    `);
                    // Now update it
                    await prisma.$executeRaw`
                        UPDATE "AdscapePlayer"
                        SET "flowDrawerSlotCount" = ${slotCount},
                            "updatedAt" = NOW()
                        WHERE "screenId" = ${String(screenId)}
                    `;
                } else {
                    throw e;
                }
            }
            
            // Resize slots array if needed
            try {
                const configResult = await prisma.$queryRaw`
                    SELECT "flowDrawerSlots" 
                    FROM "AdscapePlayer" 
                    WHERE "screenId" = ${String(screenId)} 
                    LIMIT 1
                `;
                let slots = [];
                if (configResult && configResult.length > 0 && configResult[0].flowDrawerSlots) {
                    slots = JSON.parse(JSON.stringify(configResult[0].flowDrawerSlots));
                }
                
                // Resize array to match new slot count
                while (slots.length < slotCount) {
                    slots.push(null);
                }
                if (slots.length > slotCount) {
                    slots = slots.slice(0, slotCount);
                }
                
                // Update slots array
                await prisma.$executeRaw`
                    UPDATE "AdscapePlayer"
                    SET "flowDrawerSlots" = ${JSON.stringify(slots)}::jsonb,
                        "updatedAt" = NOW()
                    WHERE "screenId" = ${String(screenId)}
                `;
            } catch (e) {
                // Column might not exist yet, create it
                if (e.code === '42703' || e.message?.includes('does not exist')) {
                    console.log('[ADSCAPE] flowDrawerSlots column does not exist, creating it...');
                    await prisma.$executeRawUnsafe(`
                        ALTER TABLE "AdscapePlayer" 
                        ADD COLUMN IF NOT EXISTS "flowDrawerSlots" JSONB
                    `);
                    // Initialize with empty array
                    const emptySlots = Array(slotCount).fill(null);
                    await prisma.$executeRaw`
                        UPDATE "AdscapePlayer"
                        SET "flowDrawerSlots" = ${JSON.stringify(emptySlots)}::jsonb,
                            "updatedAt" = NOW()
                        WHERE "screenId" = ${String(screenId)}
                    `;
                }
            }
        }
        
        if (Object.keys(updateData).length === 0 && playlistId === undefined && flowDrawerSlotCount === undefined) {
            return res.status(400).json({ error: 'At least one field required for update' });
        }
        
        // Update player config
        let player = null;
        if (Object.keys(updateData).length > 0) {
            // Check if heightCalibration, heightCalibrationEnabled, paymentAmount, or flowDrawerEnabled is in updateData - if so, use raw SQL to update them
            // (This is a workaround until Prisma client is regenerated on Vercel)
            const hasHeightCalibration = 'heightCalibration' in updateData;
            const hasHeightCalibrationEnabled = 'heightCalibrationEnabled' in updateData;
            const hasPaymentAmount = 'paymentAmount' in updateData;
            const hasFlowDrawerEnabled = 'flowDrawerEnabled' in updateData;
            const heightCalibrationValue = updateData.heightCalibration;
            const heightCalibrationEnabledValue = updateData.heightCalibrationEnabled;
            const paymentAmountValue = updateData.paymentAmount;
            const flowDrawerEnabledValue = updateData.flowDrawerEnabled;
            
            if (hasHeightCalibration || hasHeightCalibrationEnabled || hasPaymentAmount || hasFlowDrawerEnabled) {
                // Remove heightCalibration, heightCalibrationEnabled, paymentAmount, and flowDrawerEnabled from updateData for Prisma update
                const { heightCalibration, heightCalibrationEnabled, paymentAmount, flowDrawerEnabled, ...prismaUpdateData } = updateData;
                
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
                
                if (hasHeightCalibrationEnabled) {
                    try {
                        await prisma.$executeRaw`
                            UPDATE "AdscapePlayer"
                            SET "heightCalibrationEnabled" = ${heightCalibrationEnabledValue}
                            WHERE "screenId" = ${String(screenId)}
                        `;
                    } catch (e) {
                        // Column doesn't exist, create it first
                        if (e.code === '42703' || e.message?.includes('does not exist')) {
                            console.log('[ADSCAPE] heightCalibrationEnabled column does not exist, creating it...');
                            await prisma.$executeRawUnsafe(`
                                ALTER TABLE "AdscapePlayer" 
                                ADD COLUMN IF NOT EXISTS "heightCalibrationEnabled" BOOLEAN DEFAULT true
                            `);
                            // Now update it
                            await prisma.$executeRaw`
                                UPDATE "AdscapePlayer"
                                SET "heightCalibrationEnabled" = ${heightCalibrationEnabledValue}
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
                
                if (hasFlowDrawerEnabled) {
                    try {
                        await prisma.$executeRaw`
                            UPDATE "AdscapePlayer"
                            SET "flowDrawerEnabled" = ${flowDrawerEnabledValue}
                            WHERE "screenId" = ${String(screenId)}
                        `;
                    } catch (e) {
                        // Column doesn't exist, create it first
                        if (e.code === '42703' || e.message?.includes('does not exist')) {
                            console.log('[ADSCAPE] flowDrawerEnabled column does not exist, creating it...');
                            await prisma.$executeRawUnsafe(`
                                ALTER TABLE "AdscapePlayer" 
                                ADD COLUMN IF NOT EXISTS "flowDrawerEnabled" BOOLEAN DEFAULT true
                            `);
                            // Now update it
                            await prisma.$executeRaw`
                                UPDATE "AdscapePlayer"
                                SET "flowDrawerEnabled" = ${flowDrawerEnabledValue}
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
        
        // Handle playlist assignment (store directly in AdscapePlayer table)
        // Always process playlist assignment if provided (even if null to clear)
        if (playlistId !== undefined) {
            try {
                console.log('[ADSCAPE] Processing playlist assignment:', { 
                    screenId, 
                    playlistId,
                    playlistIdType: typeof playlistId
                });
                
                // Determine the playlist ID to use (null if empty string or 'none')
                const finalPlaylistId = playlistId && playlistId !== '' && playlistId !== 'none' 
                    ? String(playlistId) 
                    : null;
                
                console.log('[ADSCAPE] Final playlist ID determined:', finalPlaylistId);
                
                // Update playlistId in AdscapePlayer table using raw SQL (column might not exist yet)
                try {
                    await prisma.$executeRaw`
                        UPDATE "AdscapePlayer"
                        SET "playlistId" = ${finalPlaylistId}
                        WHERE "screenId" = ${String(screenId)}
                    `;
                    console.log('[ADSCAPE] PlaylistId updated successfully in AdscapePlayer table');
                } catch (e) {
                    // Column doesn't exist, create it first
                    if (e.code === '42703' || e.message?.includes('does not exist')) {
                        console.log('[ADSCAPE] playlistId column does not exist, creating it...');
                        await prisma.$executeRawUnsafe(`
                            ALTER TABLE "AdscapePlayer" 
                            ADD COLUMN IF NOT EXISTS "playlistId" VARCHAR(255)
                        `);
                        // Now update it
                        await prisma.$executeRaw`
                            UPDATE "AdscapePlayer"
                            SET "playlistId" = ${finalPlaylistId}
                            WHERE "screenId" = ${String(screenId)}
                        `;
                        console.log('[ADSCAPE] playlistId column created and updated successfully');
                    } else {
                        throw e;
                    }
                }
                
                // Verify the save by reading it back
                try {
                    const verifyResult = await prisma.$queryRaw`
                        SELECT "playlistId" FROM "AdscapePlayer" WHERE "screenId" = ${String(screenId)} LIMIT 1
                    `;
                    console.log('[ADSCAPE] Verification - saved playlistId:', verifyResult[0]?.playlistId);
                } catch (e) {
                    console.log('[ADSCAPE] Could not verify playlistId (column might not exist yet)');
                }
                
                console.log('[ADSCAPE] Playlist assignment completed:', { screenId, playlistId: finalPlaylistId });
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
        
        // Get current playlistId from AdscapePlayer
        let currentPlaylistId = null;
        try {
            const playlistResult = await prisma.$queryRaw`
                SELECT "playlistId" FROM "AdscapePlayer" WHERE "screenId" = ${String(screenId)} LIMIT 1
            `;
            if (playlistResult && playlistResult.length > 0) {
                currentPlaylistId = playlistResult[0].playlistId || null;
            }
        } catch (e) {
            // Column might not exist yet
        }
        
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
        const playlistWasUpdated = playlistId !== undefined;
        const configWasUpdated = updateData.isActive !== undefined || updateData.deviceName !== undefined || updateData.location !== undefined;
        
        if (io && (playlistWasUpdated || configWasUpdated)) {
            io.to(`screen:${String(screenId)}`).emit('screen-config-changed', {
                screenId: String(screenId),
                playlistId: currentPlaylistId,
                isEnabled: player.isActive, // Map isActive to isEnabled for Android app
                flowType: player.flowType
            });
            console.log('[ADSCAPE] Screen config change emitted to screen:', screenId, {
                playlistId: currentPlaylistId,
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
        
        // Get flowDrawerEnabled from player
        let flowDrawerEnabledValue = true;
        try {
            const drawerResult = await prisma.$queryRaw`
                SELECT COALESCE("flowDrawerEnabled", true) as "flowDrawerEnabled" 
                FROM "AdscapePlayer" 
                WHERE "screenId" = ${String(screenId)} 
                LIMIT 1
            `;
            if (drawerResult && drawerResult.length > 0) {
                flowDrawerEnabledValue = Boolean(drawerResult[0].flowDrawerEnabled);
            }
        } catch (e) {
            // Column doesn't exist yet, use default true
            flowDrawerEnabledValue = true;
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
                logoUrl: logoUrlValue,
                flowDrawerEnabled: flowDrawerEnabledValue
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



