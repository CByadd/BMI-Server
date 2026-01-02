require('dotenv').config();
const prisma = require('../db');

/**
 * Script to assign a playlist to a screen
 * Usage: node server/scripts/assignPlaylist.js <screenId> <playlistId> [startDate] [endDate]
 * 
 * Examples:
 *   node server/scripts/assignPlaylist.js 38668350 playlist-123
 *   node server/scripts/assignPlaylist.js 38668350 playlist-123 2025-01-01 2025-01-31
 *   node server/scripts/assignPlaylist.js 38668350 playlist-123 "2025-01-01T00:00:00Z" "2025-01-31T23:59:59Z"
 */

async function assignPlaylist(screenId, playlistId, startDate, endDate) {
    try {
        console.log('Assigning playlist to screen...');
        console.log('Screen ID:', screenId);
        console.log('Playlist ID:', playlistId);
        console.log('Start Date:', startDate || 'null (no start date)');
        console.log('End Date:', endDate || 'null (no end date)');
        
        // Check if screen exists
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });
        
        if (!player) {
            console.error(`Error: Screen with ID ${screenId} not found in AdscapePlayer table`);
            process.exit(1);
        }
        
        console.log(`✓ Screen found: ${player.deviceName || screenId}`);
        
        // Check if playlist exists (if playlistId is provided)
        if (playlistId) {
            try {
                const playlistResult = await prisma.$queryRaw`
                    SELECT id, name FROM playlists WHERE id = ${String(playlistId)} LIMIT 1
                `;
                
                if (!playlistResult || playlistResult.length === 0) {
                    console.warn(`Warning: Playlist with ID ${playlistId} not found in playlists table`);
                    console.warn('Continuing anyway - playlist might be created later...');
                } else {
                    console.log(`✓ Playlist found: ${playlistResult[0].name || playlistId}`);
                }
            } catch (e) {
                console.warn('Warning: Could not verify playlist exists:', e.message);
                console.warn('Continuing anyway...');
            }
        }
        
        // Ensure screen_playlists table exists
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
        
        // Check if date columns exist
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
                console.log('✓ Added start_date column');
            }
            
            if (!existingColumns.includes('end_date')) {
                await prisma.$executeRawUnsafe(`
                    ALTER TABLE screen_playlists ADD COLUMN end_date TIMESTAMP;
                `);
                console.log('✓ Added end_date column');
            }
        } catch (e) {
            console.warn('Warning: Could not verify/add date columns:', e.message);
        }
        
        // Parse dates
        let parsedStartDate = null;
        let parsedEndDate = null;
        
        if (startDate) {
            parsedStartDate = new Date(startDate);
            if (isNaN(parsedStartDate.getTime())) {
                console.error(`Error: Invalid start date format: ${startDate}`);
                console.error('Please use ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ');
                process.exit(1);
            }
        }
        
        if (endDate) {
            parsedEndDate = new Date(endDate);
            if (isNaN(parsedEndDate.getTime())) {
                console.error(`Error: Invalid end date format: ${endDate}`);
                console.error('Please use ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ');
                process.exit(1);
            }
        }
        
        // Validate date range
        if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
            console.error('Error: Start date must be before or equal to end date');
            process.exit(1);
        }
        
        // Insert or update playlist assignment
        const result = await prisma.$executeRaw`
            INSERT INTO screen_playlists (screen_id, playlist_id, start_date, end_date, updated_at)
            VALUES (${String(screenId)}, ${playlistId ? String(playlistId) : null}, ${parsedStartDate}, ${parsedEndDate}, NOW())
            ON CONFLICT (screen_id) 
            DO UPDATE SET 
                playlist_id = ${playlistId ? String(playlistId) : null}, 
                start_date = ${parsedStartDate},
                end_date = ${parsedEndDate},
                updated_at = NOW()
        `;
        
        console.log('✓ Playlist assignment saved successfully');
        
        // Verify the assignment
        const verifyResult = await prisma.$queryRaw`
            SELECT * FROM screen_playlists WHERE screen_id = ${String(screenId)}
        `;
        
        if (verifyResult && verifyResult.length > 0) {
            const assignment = verifyResult[0];
            console.log('\n✓ Verification - Current assignment:');
            console.log('  Screen ID:', assignment.screen_id);
            console.log('  Playlist ID:', assignment.playlist_id || 'null');
            console.log('  Start Date:', assignment.start_date ? new Date(assignment.start_date).toISOString() : 'null');
            console.log('  End Date:', assignment.end_date ? new Date(assignment.end_date).toISOString() : 'null');
            console.log('  Updated At:', assignment.updated_at ? new Date(assignment.updated_at).toISOString() : 'null');
        }
        
        console.log('\n✓ Done!');
        
    } catch (error) {
        console.error('Error assigning playlist:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 1) {
    console.error('Usage: node server/scripts/assignPlaylist.js <screenId> [playlistId] [startDate] [endDate]');
    console.error('');
    console.error('Examples:');
    console.error('  node server/scripts/assignPlaylist.js 38668350 playlist-123');
    console.error('  node server/scripts/assignPlaylist.js 38668350 playlist-123 2025-01-01 2025-01-31');
    console.error('  node server/scripts/assignPlaylist.js 38668350 playlist-123 "2025-01-01T00:00:00Z" "2025-01-31T23:59:59Z"');
    console.error('');
    console.error('To remove playlist assignment:');
    console.error('  node server/scripts/assignPlaylist.js 38668350 null');
    process.exit(1);
}

const screenId = args[0];
const playlistId = args[1] === 'null' || args[1] === '' ? null : args[1];
const startDate = args[2] || null;
const endDate = args[3] || null;

assignPlaylist(screenId, playlistId, startDate, endDate);

