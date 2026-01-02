require('dotenv').config();
const prisma = require('../db');

async function checkScreen(screenId) {
    try {
        // Check if screen exists
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });
        
        if (!player) {
            console.log(`Screen ${screenId} not found in AdscapePlayer table`);
            return;
        }
        
        console.log(`Screen found: ${player.deviceName || screenId}`);
        console.log(`Location: ${player.location || 'N/A'}`);
        console.log(`Is Active: ${player.isActive}`);
        
        // Check current playlist assignment
        try {
            const assignment = await prisma.$queryRaw`
                SELECT * FROM screen_playlists WHERE screen_id = ${String(screenId)}
            `;
            
            if (assignment && assignment.length > 0) {
                const a = assignment[0];
                console.log('\nCurrent playlist assignment:');
                console.log(`  Playlist ID: ${a.playlist_id || 'null'}`);
                console.log(`  Start Date: ${a.start_date ? new Date(a.start_date).toISOString() : 'null'}`);
                console.log(`  End Date: ${a.end_date ? new Date(a.end_date).toISOString() : 'null'}`);
            } else {
                console.log('\nNo playlist assignment found');
            }
        } catch (e) {
            console.log('\nNo playlist assignment (table might not exist or error):', e.message);
        }
        
        // List available playlists
        try {
            const playlists = await prisma.$queryRaw`
                SELECT id, name, created_at FROM playlists ORDER BY created_at DESC LIMIT 10
            `;
            
            if (playlists && playlists.length > 0) {
                console.log('\nAvailable playlists:');
                playlists.forEach(p => {
                    console.log(`  - ${p.id}: ${p.name || 'Unnamed'}`);
                });
            } else {
                console.log('\nNo playlists found in database');
            }
        } catch (e) {
            console.log('\nCould not fetch playlists:', e.message);
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

const screenId = process.argv[2] || '38668350';
checkScreen(screenId);

