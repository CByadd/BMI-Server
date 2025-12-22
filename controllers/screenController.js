const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

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
        
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
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
                heightCalibration: player.heightCalibration,
                lastSeen: player.lastSeen,
                isActive: player.isActive,
                isEnabled: player.isActive, // Also include isEnabled for Android app compatibility
                createdAt: player.createdAt,
                updatedAt: player.updatedAt,
                playlistId: playlistId,
                playlistStartDate: formattedStartDate,
                playlistEndDate: formattedEndDate
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
        
        const players = await prisma.adscapePlayer.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
        });
        
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
                heightCalibration: player.heightCalibration,
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
 * Update screen configuration
 * PUT /api/adscape/player/:screenId/config
 */
exports.updateScreenConfig = async (req, res, io) => {
    try {
        const { screenId } = req.params;
        const { flowType, isActive, deviceName, location, heightCalibration, playlistId, playlistStartDate, playlistEndDate } = req.body || {};
        
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
            // Allow null to clear the calibration (will use default 0 from database)
            updateData.heightCalibration = heightCalibration === null || heightCalibration === undefined ? null : Number(heightCalibration);
        }
        
        if (Object.keys(updateData).length === 0 && playlistId === undefined) {
            return res.status(400).json({ error: 'At least one field required for update' });
        }
        
        // Update player config
        let player = null;
        if (Object.keys(updateData).length > 0) {
            player = await prisma.adscapePlayer.update({
                where: { screenId: String(screenId) },
                data: updateData
            });
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
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                flowType: player.flowType,
                isActive: player.isActive,
                isEnabled: player.isActive, // Also include isEnabled for Android app compatibility
                deviceName: player.deviceName,
                location: player.location,
                playlistId: currentPlaylistId,
                playlistStartDate: formattedStartDate,
                playlistEndDate: formattedEndDate
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



