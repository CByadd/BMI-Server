const { PrismaClient } = require('@prisma/client');
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
                appVersion: player.appVersion,
                flowType: player.flowType,
                deviceName: player.deviceName,
                screenWidth: player.screenWidth,
                screenHeight: player.screenHeight,
                ipAddress: player.ipAddress,
                location: player.location,
                osVersion: player.osVersion,
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



