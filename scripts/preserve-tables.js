require('dotenv').config();
const prisma = require('../db');

/**
 * This script ensures that tables used by raw SQL queries are preserved
 * even though they're not in the Prisma schema
 */
async function preserveTables() {
  try {
    console.log('Ensuring required tables exist...');

    // Ensure screen_playlists table exists (used in screenController.js)
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
    console.log('✓ screen_playlists table verified');

    // Ensure playlists table exists (used in playlistController.js)
    // Note: This is a simplified version - adjust columns as needed
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS playlists (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        description TEXT,
        slots TEXT,
        tags TEXT,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Add index for faster queries
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_playlists_created_by ON playlists(created_by);
    `);
    console.log('✓ playlists table verified');

    // Ensure asset_play_logs table exists (used in slotController.js)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS asset_play_logs (
        id SERIAL PRIMARY KEY,
        screen_id VARCHAR(64) NOT NULL,
        asset_url TEXT NOT NULL,
        campaign_id VARCHAR(255),
        played_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Add indexes for faster queries
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_asset_play_logs_screen_id ON asset_play_logs(screen_id);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_asset_play_logs_campaign_id ON asset_play_logs(campaign_id);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_asset_play_logs_played_at ON asset_play_logs(played_at);
    `);
    console.log('✓ asset_play_logs table verified');

    console.log('\n✓ All required tables are preserved');
    console.log('You can now safely run: npx prisma db push --accept-data-loss');
    
  } catch (error) {
    console.error('Error preserving tables:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

preserveTables();

