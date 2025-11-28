const prisma = require('../db');

/**
 * Generate a random 8-digit code
 */
function generateRegistrationCode() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

/**
 * Ensure all required columns exist in AdscapePlayer table
 */
async function ensureAdscapePlayerColumns() {
    try {
        await prisma.$executeRawUnsafe(`
            DO $$ 
            BEGIN
                -- registrationCode
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'AdscapePlayer' AND column_name = 'registrationCode'
                ) THEN
                    ALTER TABLE "AdscapePlayer" ADD COLUMN "registrationCode" VARCHAR(8) UNIQUE;
                END IF;
                
                -- name
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'AdscapePlayer' AND column_name = 'name'
                ) THEN
                    ALTER TABLE "AdscapePlayer" ADD COLUMN "name" VARCHAR(255);
                END IF;
                
                -- address
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'AdscapePlayer' AND column_name = 'address'
                ) THEN
                    ALTER TABLE "AdscapePlayer" ADD COLUMN "address" VARCHAR(500);
                END IF;
                
                -- isEnabled
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'AdscapePlayer' AND column_name = 'isEnabled'
                ) THEN
                    ALTER TABLE "AdscapePlayer" ADD COLUMN "isEnabled" BOOLEAN DEFAULT true;
                END IF;
                
                -- displayName
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'AdscapePlayer' AND column_name = 'displayName'
                ) THEN
                    ALTER TABLE "AdscapePlayer" ADD COLUMN "displayName" VARCHAR(255);
                END IF;
                
                -- playlistId
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'AdscapePlayer' AND column_name = 'playlistId'
                ) THEN
                    ALTER TABLE "AdscapePlayer" ADD COLUMN "playlistId" VARCHAR(255);
                END IF;
                
                -- playlistStartDate
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'AdscapePlayer' AND column_name = 'playlistStartDate'
                ) THEN
                    ALTER TABLE "AdscapePlayer" ADD COLUMN "playlistStartDate" TIMESTAMP;
                END IF;
                
                -- playlistEndDate
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'AdscapePlayer' AND column_name = 'playlistEndDate'
                ) THEN
                    ALTER TABLE "AdscapePlayer" ADD COLUMN "playlistEndDate" TIMESTAMP;
                END IF;
            END $$;
        `);
    } catch (e) {
        console.warn('[ADSCAPE] Could not ensure columns exist:', e.message);
    }
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
        
        console.log('[ADSCAPE] Register player request:', { screenId, appVersion, flowType });
        
        if (!screenId || !appVersion) {
            return res.status(400).json({ error: 'screenId and appVersion required' });
        }
        
        // Ensure all columns exist
        await ensureAdscapePlayerColumns();
        
        // Check if player exists using raw query
        const existingPlayers = await prisma.$queryRawUnsafe(
            'SELECT * FROM "AdscapePlayer" WHERE "screenId" = $1 LIMIT 1',
            String(screenId)
        );
        const existingPlayer = existingPlayers[0] || null;
        
        let registrationCode = existingPlayer?.registrationCode;
        if (!registrationCode) {
            // Generate unique 8-digit code
            let code;
            let isUnique = false;
            while (!isUnique) {
                code = generateRegistrationCode();
                // Use raw query to check if code exists
                try {
                    const existing = await prisma.$queryRawUnsafe(
                        'SELECT * FROM "AdscapePlayer" WHERE "registrationCode" = $1 LIMIT 1',
                        code
                    );
                    if (!existing || existing.length === 0) {
                        isUnique = true;
                    }
                } catch (e) {
                    // If query fails, assume unique and continue
                    console.warn('[ADSCAPE] Could not check registration code uniqueness:', e.message);
                    isUnique = true;
                    break;
                }
            }
            registrationCode = code;
        }
        
        let player;
        if (existingPlayer) {
            // Update existing player
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;
            
            updateFields.push(`"appVersion" = $${paramIndex++}`);
            updateValues.push(String(appVersion));
            
            if (flowType !== undefined && flowType !== null) {
                updateFields.push(`"flowType" = $${paramIndex++}`);
                updateValues.push(String(flowType));
            }
            
            if (deviceName !== undefined) {
                updateFields.push(`"deviceName" = $${paramIndex++}`);
                updateValues.push(deviceName ? String(deviceName) : null);
            }
            
            if (screenWidth !== undefined) {
                updateFields.push(`"screenWidth" = $${paramIndex++}`);
                updateValues.push(screenWidth ? Number(screenWidth) : null);
            }
            
            if (screenHeight !== undefined) {
                updateFields.push(`"screenHeight" = $${paramIndex++}`);
                updateValues.push(screenHeight ? Number(screenHeight) : null);
            }
            
            if (ipAddress !== undefined) {
                updateFields.push(`"ipAddress" = $${paramIndex++}`);
                updateValues.push(ipAddress ? String(ipAddress) : null);
            }
            
            if (location !== undefined) {
                updateFields.push(`"location" = $${paramIndex++}`);
                updateValues.push(location ? String(location) : null);
            }
            
            if (osVersion !== undefined) {
                updateFields.push(`"osVersion" = $${paramIndex++}`);
                updateValues.push(osVersion ? String(osVersion) : null);
            }
            
            if (appVersionCode !== undefined) {
                updateFields.push(`"appVersionCode" = $${paramIndex++}`);
                updateValues.push(appVersionCode ? String(appVersionCode) : null);
            }
            
            updateFields.push(`"lastSeen" = NOW()`);
            updateFields.push(`"isActive" = true`);
            updateFields.push(`"updatedAt" = NOW()`);
            
            updateValues.push(String(screenId));
            
            const updateQuery = `UPDATE "AdscapePlayer" SET ${updateFields.join(', ')} WHERE "screenId" = $${paramIndex} RETURNING *`;
            
            const updatedPlayers = await prisma.$queryRawUnsafe(updateQuery, ...updateValues);
            player = updatedPlayers[0] || existingPlayer;
        } else {
            // Create new player
            const insertQuery = `
                INSERT INTO "AdscapePlayer" (
                    "id", "screenId", "registrationCode", "appVersion", "flowType",
                    "deviceName", "screenWidth", "screenHeight", "ipAddress", "location",
                    "osVersion", "appVersionCode", "lastSeen", "isActive", "isEnabled", "createdAt", "updatedAt"
                ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), true, true, NOW(), NOW()
                ) RETURNING *
            `;
            
            const newPlayers = await prisma.$queryRawUnsafe(
                insertQuery,
                String(screenId),
                registrationCode,
                String(appVersion),
                flowType ? String(flowType) : null,
                deviceName ? String(deviceName) : null,
                screenWidth ? Number(screenWidth) : null,
                screenHeight ? Number(screenHeight) : null,
                ipAddress ? String(ipAddress) : null,
                location ? String(location) : null,
                osVersion ? String(osVersion) : null,
                appVersionCode ? String(appVersionCode) : null
            );
            player = newPlayers[0];
        }
        
        console.log('[ADSCAPE] Player registered:', { 
            screenId, 
            appVersion, 
            flowType: player.flowType, 
            registrationCode: player.registrationCode || registrationCode,
            deviceName: player.deviceName,
            screenWidth: player.screenWidth,
            screenHeight: player.screenHeight,
            osVersion: player.osVersion
        });
        
        // Ensure isEnabled defaults to true if not set
        const playerIsEnabled = player.isEnabled !== undefined && player.isEnabled !== null 
            ? Boolean(player.isEnabled) 
            : true;
        
        console.log('[ADSCAPE] Registration response:', { 
            screenId, 
            flowType: player.flowType || null, 
            isEnabled: playerIsEnabled,
            registrationCode: player.registrationCode || registrationCode
        });
        
        return res.json({ 
            ok: true, 
            player: {
                id: player.id,
                screenId: player.screenId,
                registrationCode: player.registrationCode || registrationCode,
                appVersion: player.appVersion,
                flowType: player.flowType || null, // null means "Normal" player mode
                isActive: player.isActive,
                isEnabled: playerIsEnabled // Always return isEnabled, default to true
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Registration error:', e);
        return res.status(500).json({ error: 'internal_error', message: e.message });
    }
};

/**
 * Get a specific player by screenId
 * GET /api/adscape/player/:screenId
 */
exports.getPlayer = async (req, res) => {
    try {
        const { screenId } = req.params;
        
        // Ensure all columns exist
        await ensureAdscapePlayerColumns();
        
        // Use raw query to avoid Prisma client sync issues
        const players = await prisma.$queryRawUnsafe(
            'SELECT * FROM "AdscapePlayer" WHERE "screenId" = $1 LIMIT 1',
            String(screenId)
        );
        
        const player = players[0] || null;
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        // Ensure isEnabled defaults to true if not set
        const playerIsEnabled = player.isEnabled !== undefined && player.isEnabled !== null 
            ? Boolean(player.isEnabled) 
            : true;
        
        console.log('[ADSCAPE] Get player response:', { 
            screenId, 
            flowType: player.flowType || null, 
            isEnabled: playerIsEnabled 
        });
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                registrationCode: player.registrationCode || null,
                appVersion: player.appVersion,
                flowType: player.flowType || null, // null means "Normal" player mode - should still play ads
                deviceName: player.deviceName || null,
                displayName: player.displayName || null,
                name: player.displayName || player.name || null, // displayName takes priority
                address: player.address || null,
                screenWidth: player.screenWidth,
                screenHeight: player.screenHeight,
                ipAddress: player.ipAddress,
                location: player.location,
                osVersion: player.osVersion,
                appVersionCode: player.appVersionCode,
                isEnabled: playerIsEnabled, // Always return isEnabled, default to true
                playlistId: player.playlistId || null,
                playlistStartDate: player.playlistStartDate || null,
                playlistEndDate: player.playlistEndDate || null,
                lastSeen: player.lastSeen,
                isActive: player.isActive,
                createdAt: player.createdAt,
                updatedAt: player.updatedAt
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
        const players = await prisma.adscapePlayer.findMany({
            orderBy: { createdAt: 'desc' }
        });
        
        return res.json({
            ok: true,
            players: players.map(player => ({
                id: player.id,
                screenId: player.screenId,
                registrationCode: player.registrationCode,
                appVersion: player.appVersion,
                flowType: player.flowType,
                deviceName: player.deviceName,
                displayName: player.displayName,
                name: player.displayName || player.name, // displayName takes priority
                address: player.address,
                screenWidth: player.screenWidth,
                screenHeight: player.screenHeight,
                ipAddress: player.ipAddress,
                location: player.location,
                osVersion: player.osVersion,
                isEnabled: player.isEnabled,
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
 * Get player by registration code
 * GET /api/adscape/player-by-code/:code
 */
exports.getPlayerByCode = async (req, res) => {
    try {
        const { code } = req.params;
        
        console.log('[ADSCAPE] Get player by code:', code);
        
        if (!code || code.length !== 8) {
            return res.status(400).json({ error: 'Invalid registration code. Must be 8 digits.' });
        }
        
        // Ensure all columns exist
        await ensureAdscapePlayerColumns();
        
        // First, check if player exists at all by screenId
        let allPlayers = [];
        try {
            allPlayers = await prisma.$queryRawUnsafe(
                'SELECT "screenId", "registrationCode" FROM "AdscapePlayer" WHERE "screenId" = $1 LIMIT 1',
                String(code)
            );
            console.log('[ADSCAPE] All players with screenId:', code, ':', allPlayers.length, allPlayers);
        } catch (e) {
            console.error('[ADSCAPE] Error checking if player exists:', e.message);
        }
        
        // Use raw query to find player by registration code
        let players = [];
        let player = null;
        
        try {
            players = await prisma.$queryRawUnsafe(
                'SELECT * FROM "AdscapePlayer" WHERE "registrationCode" = $1 LIMIT 1',
                String(code)
            );
            player = players[0] || null;
            console.log('[ADSCAPE] Query by registrationCode result:', player ? 'found' : 'not found', players.length);
        } catch (e) {
            console.warn('[ADSCAPE] Query by registrationCode failed, trying by screenId:', e.message);
        }
        
        // If not found by registrationCode, try by screenId (in case code matches screenId)
        if (!player) {
            try {
                players = await prisma.$queryRawUnsafe(
                    'SELECT * FROM "AdscapePlayer" WHERE "screenId" = $1 LIMIT 1',
                    String(code)
                );
                player = players[0] || null;
                console.log('[ADSCAPE] Query by screenId result:', player ? 'found' : 'not found', players.length);
                if (player) {
                    console.log('[ADSCAPE] Player data:', {
                        screenId: player.screenId,
                        registrationCode: player.registrationCode,
                        appVersion: player.appVersion
                    });
                }
                
                // If found by screenId but registrationCode is null or doesn't match, update it
                if (player) {
                    console.log('[ADSCAPE] Found player by screenId:', {
                        screenId: player.screenId,
                        registrationCode: player.registrationCode,
                        hasRegistrationCode: !!player.registrationCode
                    });
                    
                    if (!player.registrationCode || player.registrationCode !== String(code)) {
                        try {
                            await prisma.$executeRawUnsafe(
                                'UPDATE "AdscapePlayer" SET "registrationCode" = $1 WHERE "screenId" = $2',
                                String(code),
                                String(code)
                            );
                            // Re-fetch the updated player
                            players = await prisma.$queryRawUnsafe(
                                'SELECT * FROM "AdscapePlayer" WHERE "screenId" = $1 LIMIT 1',
                                String(code)
                            );
                            player = players[0] || null;
                            console.log('[ADSCAPE] Updated registrationCode for player:', player?.screenId);
                        } catch (e) {
                            console.warn('[ADSCAPE] Could not update registrationCode:', e.message);
                        }
                    }
                }
            } catch (e) {
                console.error('[ADSCAPE] Query by screenId failed:', e.message);
            }
        }
        
        if (!player) {
            console.log('[ADSCAPE] Player not found with code:', code);
            return res.status(404).json({ error: 'Player not found with this registration code' });
        }
        
        console.log('[ADSCAPE] Player found:', player.screenId);
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                registrationCode: player.registrationCode,
                appVersion: player.appVersion,
                flowType: player.flowType,
                deviceName: player.deviceName,
                displayName: player.displayName,
                name: player.displayName || player.name, // displayName takes priority
                address: player.address,
                screenWidth: player.screenWidth,
                screenHeight: player.screenHeight,
                ipAddress: player.ipAddress,
                location: player.location,
                osVersion: player.osVersion,
                appVersionCode: player.appVersionCode,
                isEnabled: player.isEnabled,
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
 * Update screen configuration (admin only)
 * PUT /api/adscape/player/:screenId/config
 */
exports.updateScreenConfig = async (req, res, io) => {
    try {
        const { screenId } = req.params;
        const { name, displayName, address, location, flowType, isEnabled, playlistId, playlistStartDate, playlistEndDate } = req.body;
        
        console.log('[ADSCAPE] Update screen config request:', { screenId, name, displayName, address, location, flowType, isEnabled, playlistId, playlistStartDate, playlistEndDate });
        
        // Ensure all columns exist
        await ensureAdscapePlayerColumns();
        
        // Build update query dynamically
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;
        
        // displayName is the primary field for admin-entered name
        if (displayName !== undefined) {
            updateFields.push(`"displayName" = $${paramIndex++}`);
            updateValues.push(displayName ? String(displayName) : null);
        }
        // Also support 'name' for backward compatibility, but map it to displayName
        if (name !== undefined && displayName === undefined) {
            updateFields.push(`"displayName" = $${paramIndex++}`);
            updateValues.push(name ? String(name) : null);
        }
        if (address !== undefined) {
            updateFields.push(`"address" = $${paramIndex++}`);
            updateValues.push(address ? String(address) : null);
        }
        if (location !== undefined) {
            updateFields.push(`"location" = $${paramIndex++}`);
            updateValues.push(location ? String(location) : null);
        }
        if (flowType !== undefined) {
            const normalizedFlowType = flowType === 'Normal' || flowType === 'normal' || flowType === '' ? null : String(flowType);
            updateFields.push(`"flowType" = $${paramIndex++}`);
            updateValues.push(normalizedFlowType);
        }
        if (isEnabled !== undefined) {
            updateFields.push(`"isEnabled" = $${paramIndex++}`);
            updateValues.push(Boolean(isEnabled));
        }
        if (playlistId !== undefined) {
            updateFields.push(`"playlistId" = $${paramIndex++}`);
            updateValues.push(playlistId ? String(playlistId) : null);
        }
        if (playlistStartDate !== undefined) {
            updateFields.push(`"playlistStartDate" = $${paramIndex++}`);
            updateValues.push(playlistStartDate ? new Date(playlistStartDate) : null);
        }
        if (playlistEndDate !== undefined) {
            updateFields.push(`"playlistEndDate" = $${paramIndex++}`);
            updateValues.push(playlistEndDate ? new Date(playlistEndDate) : null);
        }
        
        // Always update updatedAt
        updateFields.push(`"updatedAt" = NOW()`);
        
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        // Add screenId as the last parameter
        updateValues.push(String(screenId));
        
        const updateQuery = `UPDATE "AdscapePlayer" SET ${updateFields.join(', ')} WHERE "screenId" = $${paramIndex} RETURNING *`;
        
        console.log('[ADSCAPE] Update query:', updateQuery);
        console.log('[ADSCAPE] Update values:', updateValues);
        
        const updatedPlayers = await prisma.$queryRawUnsafe(updateQuery, ...updateValues);
        const player = updatedPlayers[0];
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        console.log('[ADSCAPE] Screen config updated:', { screenId, displayName: player.displayName, address: player.address, location: player.location, flowType: player.flowType, isEnabled: player.isEnabled, playlistId: player.playlistId, playlistStartDate: player.playlistStartDate, playlistEndDate: player.playlistEndDate });
        
        // Ensure isEnabled is properly set
        const playerIsEnabled = player.isEnabled !== undefined && player.isEnabled !== null 
            ? Boolean(player.isEnabled) 
            : true;
        
        // Emit real-time update to Android app via WebSocket
        if (io) {
            const configUpdate = {
                screenId: String(screenId),
                displayName: player.displayName || null,
                address: player.address || null,
                location: player.location || null,
                flowType: player.flowType || null, // null means "Normal" - should still play ads
                isEnabled: playerIsEnabled, // Always include isEnabled, default to true
                playlistId: player.playlistId || null,
                playlistStartDate: player.playlistStartDate || null,
                playlistEndDate: player.playlistEndDate || null
            };
            io.to(`screen:${String(screenId)}`).emit('screen-config-changed', configUpdate);
            console.log('[ADSCAPE] Screen config change emitted to screen:', screenId, configUpdate);
        }
        
        // Ensure isEnabled is properly set
        const updatedPlayerIsEnabled = player.isEnabled !== undefined && player.isEnabled !== null 
            ? Boolean(player.isEnabled) 
            : true;
        
        console.log('[ADSCAPE] Update screen config response:', { 
            screenId, 
            flowType: player.flowType || null, 
            isEnabled: updatedPlayerIsEnabled,
            note: 'flowType null = Normal mode, should still play ads if isEnabled=true'
        });
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                displayName: player.displayName || null,
                name: player.displayName || null, // For backward compatibility
                address: player.address || null,
                location: player.location || null,
                flowType: player.flowType || null, // null = "Normal" mode - should still play ads
                isEnabled: updatedPlayerIsEnabled, // Always return isEnabled, default to true
                playlistId: player.playlistId || null,
                playlistStartDate: player.playlistStartDate || null,
                playlistEndDate: player.playlistEndDate || null
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Update screen config error:', e);
        return res.status(500).json({ error: 'Failed to update screen configuration', message: e.message });
    }
};

/**
 * Update player status (last seen, isActive)
 * POST /api/players/update-status
 */
exports.updatePlayerStatus = async (req, res) => {
    try {
        const { machineId, screenId } = req.body;
        const id = machineId || screenId;
        
        if (!id) {
            return res.status(400).json({ error: 'machineId or screenId required' });
        }
        
        // Ensure columns exist
        await ensureAdscapePlayerColumns();
        
        // Update lastSeen and isActive
        const updateQuery = `
            UPDATE "AdscapePlayer" 
            SET "lastSeen" = NOW(), "isActive" = true, "updatedAt" = NOW()
            WHERE "screenId" = $1
            RETURNING "screenId", "lastSeen", "isActive"
        `;
        
        const updatedPlayers = await prisma.$queryRawUnsafe(updateQuery, String(id));
        
        if (updatedPlayers.length === 0) {
            // Player doesn't exist, return success anyway (might be registering soon)
            return res.json({ ok: true, message: 'Status update received' });
        }
        
        console.log('[ADSCAPE] Player status updated:', { screenId: id, lastSeen: updatedPlayers[0].lastSeen });
        
        return res.json({
            ok: true,
            player: {
                screenId: updatedPlayers[0].screenId,
                lastSeen: updatedPlayers[0].lastSeen,
                isActive: updatedPlayers[0].isActive
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Update player status error:', e);
        return res.status(500).json({ error: 'Failed to update player status' });
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



