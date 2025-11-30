const prisma = require('../db');

/**
 * Get default asset
 * GET /api/default-asset?screenId=xxx (optional - if provided, returns screen-specific default asset)
 */
exports.getDefaultAsset = async (req, res) => {
    try {
        const { screenId } = req.query;
        
        let assetUrl = process.env.DEFAULT_ASSET_URL || 'https://via.placeholder.com/1920x1080/000000/FFFFFF?text=Default+Asset';
        
        // If screenId is provided, try to get screen-specific default asset
        if (screenId) {
            try {
                // Ensure defaultAssetUrl column exists
                await prisma.$executeRawUnsafe(`
                    DO $$ 
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'AdscapePlayer' AND column_name = 'defaultAssetUrl'
                        ) THEN
                            ALTER TABLE "AdscapePlayer" ADD COLUMN "defaultAssetUrl" VARCHAR(500);
                        END IF;
                    END $$;
                `);
                
                // Get screen-specific default asset
                const players = await prisma.$queryRawUnsafe(
                    'SELECT "defaultAssetUrl" FROM "AdscapePlayer" WHERE "screenId" = $1 LIMIT 1',
                    String(screenId)
                );
                
                if (players && players.length > 0 && players[0].defaultAssetUrl) {
                    assetUrl = players[0].defaultAssetUrl;
                    console.log('[DEFAULT_ASSET] Using screen-specific default asset for screenId:', screenId, 'URL:', assetUrl);
                } else {
                    console.log('[DEFAULT_ASSET] No screen-specific default asset found for screenId:', screenId, 'using global default');
                }
            } catch (e) {
                console.warn('[DEFAULT_ASSET] Error fetching screen-specific asset:', e.message);
                // Fall back to global default
            }
        }
        
        const defaultAsset = {
            id: 1,
            assetUrl: assetUrl,
            assetName: 'Default Asset',
            assetType: 'image',
            duration: 10, // seconds - how long to display the asset
            isActive: true
        };
        
        const response = {
            success: true,
            defaultAsset: {
                id: defaultAsset.id || 1,
                assetUrl: defaultAsset.assetUrl,
                assetName: defaultAsset.assetName || 'Default Asset',
                assetType: defaultAsset.assetType || 'image',
                duration: defaultAsset.duration || 10,
                isActive: defaultAsset.isActive !== undefined ? defaultAsset.isActive : true
            }
        };
        
        return res.json(response);
    } catch (e) {
        console.error('[DEFAULT_ASSET] Error:', e);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to get default asset',
            message: e.message 
        });
    }
};

/**
 * Check for default asset updates
 * GET /api/default-asset/check-update?screenId=xxx&lastUpdate=xxx
 */
exports.checkDefaultAssetUpdate = async (req, res) => {
    try {
        const { screenId, lastUpdate } = req.query;
        
        let assetUrl = process.env.DEFAULT_ASSET_URL || 'https://via.placeholder.com/1920x1080/000000/FFFFFF?text=Default+Asset';
        
        // If screenId is provided, try to get screen-specific default asset
        if (screenId) {
            try {
                // Ensure defaultAssetUrl column exists
                await prisma.$executeRawUnsafe(`
                    DO $$ 
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'AdscapePlayer' AND column_name = 'defaultAssetUrl'
                        ) THEN
                            ALTER TABLE "AdscapePlayer" ADD COLUMN "defaultAssetUrl" VARCHAR(500);
                        END IF;
                    END $$;
                `);
                
                // Get screen-specific default asset
                const players = await prisma.$queryRawUnsafe(
                    'SELECT "defaultAssetUrl" FROM "AdscapePlayer" WHERE "screenId" = $1 LIMIT 1',
                    String(screenId)
                );
                
                if (players && players.length > 0 && players[0].defaultAssetUrl) {
                    assetUrl = players[0].defaultAssetUrl;
                }
            } catch (e) {
                console.warn('[DEFAULT_ASSET] Error fetching screen-specific asset:', e.message);
            }
        }
        
        const defaultAsset = {
            id: 1,
            assetUrl: assetUrl,
            assetName: 'Default Asset',
            assetType: 'image',
            duration: 10,
            isActive: true
        };

        // Simple check: if lastUpdate is provided and recent, return no update
        // Otherwise, return the asset
        const hasUpdate = !lastUpdate || lastUpdate === '';

        return res.json({
            success: true,
            hasUpdate: hasUpdate,
            ...(hasUpdate ? { defaultAsset: defaultAsset } : {})
        });
    } catch (e) {
        console.error('[DEFAULT_ASSET] Check update error:', e);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to check default asset update',
            message: e.message 
        });
    }
};

