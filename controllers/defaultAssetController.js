const prisma = require('../db');

/**
 * Get default asset
 * GET /api/default-asset
 */
exports.getDefaultAsset = async (req, res) => {
    try {
        // Debug: Log environment variable
        console.log('[DEFAULT_ASSET] process.env.DEFAULT_ASSET_URL:', process.env.DEFAULT_ASSET_URL);
        console.log('[DEFAULT_ASSET] Type of DEFAULT_ASSET_URL:', typeof process.env.DEFAULT_ASSET_URL);
        console.log('[DEFAULT_ASSET] Is DEFAULT_ASSET_URL undefined?', process.env.DEFAULT_ASSET_URL === undefined);
        console.log('[DEFAULT_ASSET] Is DEFAULT_ASSET_URL empty?', !process.env.DEFAULT_ASSET_URL);
        
        // Get default asset URL from environment variable or use placeholder
        // To configure: Add DEFAULT_ASSET_URL to your .env file
        // Example: DEFAULT_ASSET_URL=https://your-cdn.com/path/to/default-asset.jpg
        const assetUrl = process.env.DEFAULT_ASSET_URL || 'https://via.placeholder.com/1920x1080/000000/FFFFFF?text=Default+Asset';
        
        console.log('[DEFAULT_ASSET] Using asset URL:', assetUrl);
        console.log('[DEFAULT_ASSET] Asset URL length:', assetUrl.length);
        
        const defaultAsset = {
            id: 1,
            assetUrl: assetUrl,
            assetName: 'Default Asset',
            assetType: 'image',
            duration: 10, // seconds - how long to display the asset
            isActive: true
        };

        console.log('[DEFAULT_ASSET] Returning default asset:', JSON.stringify(defaultAsset, null, 2));
        
        // Ensure all required fields are present
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
        
        console.log('[DEFAULT_ASSET] Response:', JSON.stringify(response, null, 2));
        
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
 * GET /api/default-asset/check-update
 */
exports.checkDefaultAssetUpdate = async (req, res) => {
    try {
        const { lastUpdate } = req.query;
        
        // For now, always return no update
        // In production, compare lastUpdate with database timestamp
        const defaultAsset = {
            id: 1,
            assetUrl: process.env.DEFAULT_ASSET_URL || 'https://via.placeholder.com/1920x1080/000000/FFFFFF?text=Default+Asset',
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

