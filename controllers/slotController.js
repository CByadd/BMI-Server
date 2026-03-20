const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { ASSETS_DIR, ASSET_BASE_URL } = require('../config/assets');
const prisma = new PrismaClient();

function normalizeAssetBaseUrl() {
  return (ASSET_BASE_URL || '').replace(/\/$/, '');
}

function tryResolveOwnAssetPath(assetUrl) {
  if (!assetUrl || typeof assetUrl !== 'string') return null;

  const baseUrl = normalizeAssetBaseUrl();
  if (!baseUrl || !assetUrl.startsWith(`${baseUrl}/`)) {
    return null;
  }

  const relativePath = assetUrl
    .slice(baseUrl.length)
    .replace(/^\//, '')
    .split('?')[0]
    .replace(/\//g, path.sep);

  return path.join(ASSETS_DIR, relativePath);
}

function extractManagedMediaId(assetUrl) {
  if (!assetUrl || typeof assetUrl !== 'string') return null;

  const baseUrl = normalizeAssetBaseUrl();
  if (!baseUrl || !assetUrl.startsWith(`${baseUrl}/media/`)) {
    return null;
  }

  const rest = assetUrl.slice(`${baseUrl}/media/`.length);
  const mediaId = rest.split('/')[0];
  return mediaId ? decodeURIComponent(mediaId) : null;
}

async function isPlaylistAssetAvailable(slot) {
  if (!slot || typeof slot !== 'object') return false;

  const assetUrl = slot.asset_url || slot.url;
  if (!assetUrl || typeof assetUrl !== 'string' || !assetUrl.trim()) {
    return false;
  }

  const ownAssetPath = tryResolveOwnAssetPath(assetUrl);
  if (ownAssetPath) {
    return fs.existsSync(ownAssetPath);
  }

  const mediaId = slot.id || slot.publicId || slot.mediaId || extractManagedMediaId(assetUrl) || null;
  if (!mediaId) {
    // External URLs are treated as valid here because the server cannot
    // cheaply guarantee their reachability at playlist fetch time.
    return true;
  }

  try {
    const mediaRows = await prisma.$queryRawUnsafe(
      'SELECT id FROM media WHERE id = $1 LIMIT 1',
      String(mediaId)
    );
    return Array.isArray(mediaRows) && mediaRows.length > 0;
  } catch (error) {
    console.warn('[ASSETS] Failed to validate media row for playlist slot:', mediaId, error.message);
    return true;
  }
}

async function ensureGeneratedSlotsTable() {
  try {
    // Ensure campaigns table exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id VARCHAR(255) PRIMARY KEY,
        user_name VARCHAR(255),
        campaign_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'PENDING',
        total_amount DECIMAL(10, 2),
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        billboards JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Ensure billboards table exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS billboards (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        location VARCHAR(512),
        city VARCHAR(255),
        state VARCHAR(255),
        type VARCHAR(100),
        orientation VARCHAR(50),
        daily_viewership INTEGER,
        price_per_day DECIMAL(10, 2),
        available BOOLEAN DEFAULT TRUE,
        width FLOAT,
        height FLOAT,
        unit VARCHAR(20),
        category VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Ensure generated_slots table exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS generated_slots (
        id SERIAL PRIMARY KEY,
        screen_id VARCHAR(64),
        billboard_id INTEGER,
        campaign_id VARCHAR(255),
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        slot_number INTEGER NOT NULL,
        asset_url TEXT,
        duration INTEGER DEFAULT 10,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_generated_slots_screen_id ON generated_slots(screen_id)
    `);
  } catch (e) {
    console.warn('[SLOTS] ensureTables warning:', e.message);
  }
}

// Get all slots
exports.getAllSlots = async (req, res) => {
  try {
    await ensureGeneratedSlotsTable();
    const slots = await prisma.$queryRaw`
      SELECT 
        gs.*,
        c.campaign_name,
        c.status as campaign_status,
        b.location,
        b.city
      FROM generated_slots gs
      LEFT JOIN campaigns c ON gs.campaign_id = c.id
      LEFT JOIN billboards b ON gs.billboard_id = b.id
      ORDER BY gs.start_date DESC
    `;
    res.json(slots);
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
};

// Get slots by billboard
exports.getSlotsByBillboard = async (req, res) => {
  try {
    const { billboard_id } = req.query;
    if (!billboard_id) {
      return res.status(400).json({ error: 'billboard_id is required' });
    }

    await ensureGeneratedSlotsTable();
    const slots = await prisma.$queryRaw`
      SELECT id, start_date, end_date, slot_number
      FROM generated_slots
      WHERE billboard_id = ${billboard_id}
      ORDER BY start_date ASC, slot_number ASC
    `;

    res.json(slots);
  } catch (error) {
    console.error('Error fetching slots by billboard:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
};

// Get assets by screen ID
exports.getAssetsByScreen = async (req, res) => {
  try {
    const { screen_id } = req.params;
    const { date } = req.query; // Optional date parameter (YYYY-MM-DD format)
    
    // Determine the target date (use provided date or today)
    let targetDate = new Date();
    if (date) {
      targetDate = new Date(date + 'T00:00:00.000Z');
    }
    targetDate.setHours(0, 0, 0, 0);
    
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    console.log('[ASSETS] Fetching assets for screen:', screen_id, 'date:', date || 'today');

    // First, check if screen has a playlist assigned
    let playlistId = null;
    
    try {
      const playlistResult = await prisma.$queryRaw`
        SELECT "playlistId" 
        FROM "AdscapePlayer" 
        WHERE "screenId" = ${String(screen_id)} 
        LIMIT 1
      `;
      
      if (playlistResult && playlistResult.length > 0) {
        playlistId = playlistResult[0].playlistId || null;
        console.log('[ASSETS] Found playlist assignment:', { playlistId });
      }
    } catch (e) {
      // Column might not exist, that's okay
      console.log('[ASSETS] No playlist assignment found');
    }

    // Check if we should use playlist assets (if playlistId is assigned, always use it)
    const usePlaylist = !!playlistId;

    if (usePlaylist) {
      // Get assets from playlist
      try {
        const playlistResult = await prisma.$queryRaw`
          SELECT slots FROM playlists WHERE id = ${String(playlistId)}
        `;
        
        if (playlistResult && playlistResult.length > 0 && playlistResult[0].slots) {
          const slots = JSON.parse(playlistResult[0].slots);
          console.log('[ASSETS] Found playlist with', slots.length, 'slots');
          
          // Convert playlist slots to asset format
          // Filter out empty slots (null or undefined) and slots without URLs
          const playlistAssets = await Promise.all(slots
            .map(async (slot, index) => {
              // Skip null/undefined slots
              if (!slot || slot === null) return null;
              
              // Get asset URL
              const assetUrl = slot.asset_url || slot.url;
              
              // Skip slots without URLs
              if (!assetUrl || assetUrl.trim() === '') return null;

              const assetAvailable = await isPlaylistAssetAvailable(slot);
              if (!assetAvailable) {
                console.warn('[ASSETS] Skipping missing playlist asset:', {
                  screenId: screen_id,
                  playlistId,
                  slotNumber: slot.slot_number || (index + 1),
                  assetUrl,
                });
                return null;
              }
              
              // Filter slots that are active for the target date
              if (slot.start_date && slot.end_date) {
                const slotStart = new Date(slot.start_date);
                const slotEnd = new Date(slot.end_date);
                slotStart.setHours(0, 0, 0, 0);
                slotEnd.setHours(23, 59, 59, 999);
                const isInDateRange = targetDate >= slotStart && targetDate <= slotEnd;
                if (!isInDateRange) return null;
              }
              
              // Return valid asset
              return {
                asset_url: assetUrl,
                slot_number: slot.slot_number || (index + 1),
                duration: slot.duration || 10,
                start_date: slot.start_date || start.toISOString(),
                end_date: slot.end_date || end.toISOString()
              };
            })
          );
          const assets = playlistAssets.filter(asset => asset !== null); // Remove null entries
          
          console.log('[ASSETS] Returning', assets.length, 'assets from playlist (filtered empty slots)');
          return res.json(assets);
        }
      } catch (playlistError) {
        console.error('[ASSETS] Error fetching playlist assets:', playlistError);
        // Fall through to default behavior
      }
    }

    // Default behavior: get assets from generated_slots
    const tomorrowEnd = new Date(targetDate);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    await ensureGeneratedSlotsTable();
    const slots = await prisma.$queryRaw`
      SELECT *
      FROM generated_slots
      WHERE screen_id = ${screen_id}
      AND start_date >= ${start}
      AND end_date <= ${tomorrowEnd}
      ORDER BY start_date ASC, slot_number ASC
    `;

    if (slots.length === 0) {
      console.log('[ASSETS] No assets found for screen (fallback to generated_slots)');
      return res.json([]);
    }

    const assets = slots.map(slot => ({
      asset_url: slot.asset_url,
      slot_number: slot.slot_number || 1,
      duration: slot.duration || 10,
      start_date: slot.start_date,
      end_date: slot.end_date
    }));

    console.log('[ASSETS] Returning', assets.length, 'assets from generated_slots');
    res.json(assets);
  } catch (error) {
    console.error('[ASSETS] Error fetching assets by screen:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
};




