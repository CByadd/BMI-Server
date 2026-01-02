require('dotenv').config();
const prisma = require('../db');

/**
 * Playlist Cleanup Service
 * Automatically clears expired playlist assignments from screen_playlists table
 * 
 * A playlist is considered expired if:
 * - end_date is set and the current date/time is after end_date
 * - start_date is set and end_date is null, but current date/time is after start_date + 1 day (default expiration)
 */

/**
 * Clean up expired playlist assignments
 * @returns {Promise<{cleared: number, errors: number, details: Array}>}
 */
async function cleanupExpiredPlaylists() {
    const results = {
        cleared: 0,
        errors: 0,
        details: []
    };

    try {
        console.log('[PLAYLIST_CLEANUP] Starting cleanup of expired playlist assignments...');
        
        // Ensure screen_playlists table exists before querying
        try {
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
        } catch (createError) {
            // Table might already exist, which is fine
            if (!createError.message?.includes('already exists')) {
                console.warn('[PLAYLIST_CLEANUP] Warning: Could not ensure table exists:', createError.message);
            }
        }
        
        // Get current timestamp
        const now = new Date();
        
        // Find all playlist assignments that have expired
        // A playlist is expired if end_date is set and current time is after end_date
        const expiredAssignments = await prisma.$queryRaw`
            SELECT screen_id, playlist_id, start_date, end_date
            FROM screen_playlists
            WHERE end_date IS NOT NULL 
            AND end_date < ${now}
        `;

        console.log(`[PLAYLIST_CLEANUP] Found ${expiredAssignments.length} expired playlist assignment(s)`);

        // Delete expired assignments
        for (const assignment of expiredAssignments) {
            try {
                await prisma.$executeRaw`
                    DELETE FROM screen_playlists
                    WHERE screen_id = ${String(assignment.screen_id)}
                `;
                
                results.cleared++;
                results.details.push({
                    screenId: assignment.screen_id,
                    playlistId: assignment.playlist_id,
                    endDate: assignment.end_date,
                    action: 'cleared'
                });
                
                console.log(`[PLAYLIST_CLEANUP] Cleared expired playlist assignment for screen: ${assignment.screen_id}, playlist: ${assignment.playlist_id}, end_date: ${assignment.end_date}`);
            } catch (error) {
                results.errors++;
                results.details.push({
                    screenId: assignment.screen_id,
                    playlistId: assignment.playlist_id,
                    error: error.message,
                    action: 'error'
                });
                console.error(`[PLAYLIST_CLEANUP] Error clearing assignment for screen ${assignment.screen_id}:`, error.message);
            }
        }

        console.log(`[PLAYLIST_CLEANUP] Cleanup complete. Cleared: ${results.cleared}, Errors: ${results.errors}`);
        
        return results;
    } catch (error) {
        // Handle table not found errors gracefully
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.log('[PLAYLIST_CLEANUP] Table screen_playlists does not exist, skipping cleanup (this is normal if no playlists have been assigned)');
            return results;
        }
        console.error('[PLAYLIST_CLEANUP] Fatal error during cleanup:', error);
        results.errors++;
        return results;
    }
}

/**
 * Initialize the cleanup service with periodic scheduling
 * @param {number} intervalMinutes - Interval in minutes to run cleanup (default: 60 minutes)
 */
function startPlaylistCleanupService(intervalMinutes = 60) {
    console.log(`[PLAYLIST_CLEANUP] Starting playlist cleanup service (interval: ${intervalMinutes} minutes)`);
    
    // Run cleanup immediately on startup (after 1 minute delay)
    setTimeout(async () => {
        console.log('[PLAYLIST_CLEANUP] Running initial cleanup check...');
        await cleanupExpiredPlaylists();
    }, 60000); // 1 minute delay
    
    // Run cleanup periodically
    const intervalMs = intervalMinutes * 60 * 1000;
    setInterval(async () => {
        await cleanupExpiredPlaylists();
    }, intervalMs);
    
    console.log(`[PLAYLIST_CLEANUP] Playlist cleanup service started (running every ${intervalMinutes} minutes)`);
}

module.exports = {
    cleanupExpiredPlaylists,
    startPlaylistCleanupService
};

