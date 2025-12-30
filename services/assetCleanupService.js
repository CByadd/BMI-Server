require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

/**
 * Asset Cleanup Service
 * Automatically deletes assets that have been present for longer than the configured retention period
 */

// Get retention period from environment variable (in days), default to 30 days
const ASSET_RETENTION_DAYS = parseInt(process.env.ASSET_RETENTION_DAYS || '30', 10);

/**
 * Clean up old assets from a directory
 * @param {string} directoryPath - Path to the directory containing assets
 * @param {number} retentionDays - Number of days to retain assets (default: from env or 30)
 * @returns {Promise<{deleted: number, errors: number, details: Array}>}
 */
async function cleanupAssets(directoryPath, retentionDays = ASSET_RETENTION_DAYS) {
    const results = {
        deleted: 0,
        errors: 0,
        details: []
    };

    try {
        // Check if directory exists
        try {
            await fs.access(directoryPath);
        } catch {
            console.log(`[ASSET_CLEANUP] Directory does not exist: ${directoryPath}`);
            return results;
        }

        const files = await fs.readdir(directoryPath);
        const now = Date.now();
        const retentionMs = retentionDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
        const cutoffTime = now - retentionMs;

        console.log(`[ASSET_CLEANUP] Starting cleanup in ${directoryPath}`);
        console.log(`[ASSET_CLEANUP] Retention period: ${retentionDays} days`);
        console.log(`[ASSET_CLEANUP] Deleting files older than: ${new Date(cutoffTime).toISOString()}`);

        for (const file of files) {
            const filePath = path.join(directoryPath, file);
            
            try {
                const stats = await fs.stat(filePath);
                
                // Check if file is older than retention period
                // Use modification time (mtime) as the creation/download time
                const fileAge = stats.mtime.getTime();
                
                if (fileAge < cutoffTime) {
                    const ageDays = Math.floor((now - fileAge) / (24 * 60 * 60 * 1000));
                    
                    // Only delete asset files (not other files)
                    if (file.startsWith('asset-') || file === 'default-asset') {
                        await fs.unlink(filePath);
                        results.deleted++;
                        results.details.push({
                            file,
                            age: `${ageDays} days`,
                            deleted: true
                        });
                        console.log(`[ASSET_CLEANUP] Deleted: ${file} (age: ${ageDays} days)`);
                    }
                }
            } catch (error) {
                results.errors++;
                results.details.push({
                    file,
                    error: error.message,
                    deleted: false
                });
                console.error(`[ASSET_CLEANUP] Error processing ${file}:`, error.message);
            }
        }

        console.log(`[ASSET_CLEANUP] Cleanup complete. Deleted: ${results.deleted}, Errors: ${results.errors}`);
        return results;
    } catch (error) {
        console.error(`[ASSET_CLEANUP] Fatal error during cleanup:`, error);
        throw error;
    }
}

/**
 * Get asset cleanup statistics
 * @param {string} directoryPath - Path to the directory containing assets
 * @param {number} retentionDays - Number of days to retain assets
 * @returns {Promise<{total: number, old: number, recent: number, details: Array}>}
 */
async function getAssetStats(directoryPath, retentionDays = ASSET_RETENTION_DAYS) {
    const stats = {
        total: 0,
        old: 0,
        recent: 0,
        details: []
    };

    try {
        try {
            await fs.access(directoryPath);
        } catch {
            return stats;
        }

        const files = await fs.readdir(directoryPath);
        const now = Date.now();
        const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = now - retentionMs;

        for (const file of files) {
            if (file.startsWith('asset-') || file === 'default-asset') {
                const filePath = path.join(directoryPath, file);
                try {
                    const fileStats = await fs.stat(filePath);
                    const fileAge = fileStats.mtime.getTime();
                    const ageDays = Math.floor((now - fileAge) / (24 * 60 * 60 * 1000));
                    const isOld = fileAge < cutoffTime;

                    stats.total++;
                    if (isOld) {
                        stats.old++;
                    } else {
                        stats.recent++;
                    }

                    stats.details.push({
                        file,
                        age: `${ageDays} days`,
                        size: fileStats.size,
                        modified: fileStats.mtime.toISOString(),
                        isOld
                    });
                } catch (error) {
                    console.error(`[ASSET_CLEANUP] Error getting stats for ${file}:`, error.message);
                }
            }
        }

        return stats;
    } catch (error) {
        console.error(`[ASSET_CLEANUP] Error getting asset stats:`, error);
        throw error;
    }
}

module.exports = {
    cleanupAssets,
    getAssetStats,
    ASSET_RETENTION_DAYS
};



