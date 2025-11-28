const prisma = require('../db');

// Get all slots
exports.getAllSlots = async (req, res) => {
  try {
    let slots = [];
    try {
      slots = await prisma.$queryRaw`
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
    } catch (dbError) {
      // If table doesn't exist, create it and return empty array
      console.log('[SLOT] generated_slots table may not exist, creating...');
      try {
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS generated_slots (
            id VARCHAR(255) PRIMARY KEY,
            screen_id VARCHAR(255),
            billboard_id VARCHAR(255),
            campaign_id VARCHAR(255),
            asset_url TEXT,
            slot_number INTEGER,
            duration INTEGER DEFAULT 10,
            start_date TIMESTAMP,
            end_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;
      } catch (createError) {
        console.error('[SLOT] Create table error:', createError);
      }
    }
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

    let slots = [];
    try {
      slots = await prisma.$queryRaw`
        SELECT id, start_date, end_date, slot_number
        FROM generated_slots
        WHERE billboard_id = ${billboard_id}
        ORDER BY start_date ASC, slot_number ASC
      `;
    } catch (dbError) {
      // If table doesn't exist, create it and return empty array
      console.log('[SLOT] generated_slots table may not exist, creating...');
      try {
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS generated_slots (
            id VARCHAR(255) PRIMARY KEY,
            screen_id VARCHAR(255),
            billboard_id VARCHAR(255),
            campaign_id VARCHAR(255),
            asset_url TEXT,
            slot_number INTEGER,
            duration INTEGER DEFAULT 10,
            start_date TIMESTAMP,
            end_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;
      } catch (createError) {
        console.error('[SLOT] Create table error:', createError);
      }
    }

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
    const { date } = req.query;
    
    // Get current date for checking playlist date range
    const currentDate = date ? new Date(date) : new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    // First, check if screen has a playlist assigned and if it's within date range
    let player = null;
    try {
      const players = await prisma.$queryRawUnsafe(
        'SELECT "playlistId", "playlistStartDate", "playlistEndDate" FROM "AdscapePlayer" WHERE "screenId" = $1 LIMIT 1',
        String(screen_id)
      );
      player = players[0] || null;
    } catch (e) {
      console.log('[SLOT] Could not check for playlist assignment:', e.message);
    }
    
    // Check if playlist is assigned and date is within range
    if (player && player.playlistId) {
      const startDate = player.playlistStartDate ? new Date(player.playlistStartDate) : null;
      const endDate = player.playlistEndDate ? new Date(player.playlistEndDate) : null;
      
      // Check if current date is within playlist date range
      const isWithinRange = (!startDate || currentDate >= startDate) && (!endDate || currentDate <= endDate);
      
      if (isWithinRange) {
        // Fetch playlist and return its slots as assets
        try {
          const playlists = await prisma.$queryRawUnsafe(
            'SELECT * FROM playlists WHERE id = $1 LIMIT 1',
            String(player.playlistId)
          );
          
          if (playlists.length > 0) {
            const playlist = playlists[0];
            const slots = playlist.slots ? JSON.parse(playlist.slots) : [];
            
            // Convert playlist slots to assets format
            const assets = slots
              .map((slot, index) => {
                if (!slot || !slot.url) return null;
                return {
                  asset_url: slot.url,
                  slot_number: index + 1, // Playlist slots are 1-8
                  duration: slot.duration || 10
                };
              })
              .filter(asset => asset !== null);
            
            console.log(`[SLOT] Returning ${assets.length} assets from playlist ${player.playlistId} for screen ${screen_id}`);
            return res.json(assets);
          }
        } catch (playlistError) {
          console.error('[SLOT] Error fetching playlist:', playlistError);
          // Fall through to generated_slots
        }
      } else {
        console.log(`[SLOT] Playlist assigned but date ${currentDate.toISOString()} is outside range (${startDate?.toISOString()} - ${endDate?.toISOString()})`);
        // Fall through to generated_slots
      }
    }
    
    // If no playlist or date out of range, use generated_slots (existing logic)
    let start, end;
    if (date) {
      // Use provided date
      start = new Date(date);
      start.setHours(0, 0, 0, 0);
      end = new Date(date);
      end.setHours(23, 59, 59, 999);
    } else {
      // Use today
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setDate(end.getDate() + 1);
      end.setHours(23, 59, 59, 999);
    }

    let slots = [];
    try {
      slots = await prisma.$queryRawUnsafe(`
        SELECT *
        FROM generated_slots
        WHERE screen_id = $1
        AND start_date >= $2
        AND end_date <= $3
        ORDER BY start_date ASC, slot_number ASC
      `, screen_id, start, end);
      
      // Ensure slots is an array
      if (!Array.isArray(slots)) {
        console.warn('[SLOT] Query result is not an array, converting...', typeof slots);
        slots = slots ? [slots] : [];
      }
    } catch (dbError) {
      // If table doesn't exist, create it and return empty array
      console.log('[SLOT] Table may not exist, creating...');
      try {
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS generated_slots (
            id VARCHAR(255) PRIMARY KEY,
            screen_id VARCHAR(255),
            billboard_id VARCHAR(255),
            campaign_id VARCHAR(255),
            asset_url TEXT,
            slot_number INTEGER,
            duration INTEGER DEFAULT 10,
            start_date TIMESTAMP,
            end_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;
      } catch (createError) {
        console.error('[SLOT] Create table error:', createError);
      }
      return res.json([]);
    }

    if (slots.length === 0) {
      return res.json([]);
    }

    const assets = slots.map(slot => ({
      asset_url: slot.asset_url,
      slot_number: slot.slot_number || 1,
      duration: slot.duration || 10,
      start_date: slot.start_date,
      end_date: slot.end_date
    }));

    res.json(assets);
  } catch (error) {
    console.error('Error fetching assets by screen:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
};

// Track asset play
exports.trackAssetPlay = async (req, res) => {
  try {
    // Support both camelCase and snake_case parameter names
    const screenId = req.body.screenId || req.body.screen_id;
    const assetUrl = req.body.assetUrl || req.body.asset_url;
    const campaignId = req.body.campaignId || req.body.campaign_id;
    const playedAt = req.body.playedAt || req.body.played_at;

    if (!screenId || !assetUrl) {
      return res.status(400).json({ error: 'screen_id and asset_url are required' });
    }

    try {
      // Insert play log
      const playTimestamp = playedAt ? new Date(playedAt) : new Date();
      await prisma.$executeRawUnsafe(`
        INSERT INTO asset_play_logs (screen_id, asset_url, campaign_id, played_at)
        VALUES ($1, $2, $3, $4)
      `, screenId, assetUrl, campaignId || null, playTimestamp);
    } catch (dbError) {
      // If table doesn't exist, create it
      console.log('[SLOT] asset_play_logs table may not exist, creating...');
      try {
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS asset_play_logs (
            id SERIAL PRIMARY KEY,
            screen_id VARCHAR(255),
            asset_url TEXT,
            campaign_id VARCHAR(255),
            played_at TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;
        // Retry insert after creating table
        const playTimestamp = playedAt ? new Date(playedAt) : new Date();
        await prisma.$executeRawUnsafe(`
          INSERT INTO asset_play_logs (screen_id, asset_url, campaign_id, played_at)
          VALUES ($1, $2, $3, $4)
        `, screenId, assetUrl, campaignId || null, playTimestamp);
      } catch (createError) {
        console.error('[SLOT] Create table or insert error:', createError);
        return res.status(500).json({ error: 'Failed to track play' });
      }
    }

    res.json({ ok: true, message: 'Play tracked successfully' });
  } catch (error) {
    console.error('Error tracking play:', error);
    res.status(500).json({ error: 'Failed to track play' });
  }
};

// Get asset logs
exports.getAssetLogs = async (req, res) => {
  try {
    const screenId = req.query.screenId || req.query.screen_id;
    const campaignId = req.query.campaignId || req.query.campaign_id;
    const limit = parseInt(req.query.limit || 100);

    let logs = [];
    try {
      let query = 'SELECT * FROM asset_play_logs WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (screenId) {
        query += ` AND screen_id = $${paramIndex++}`;
        params.push(screenId);
      }

      if (campaignId) {
        query += ` AND campaign_id = $${paramIndex++}`;
        params.push(campaignId);
      }

      query += ` ORDER BY played_at DESC LIMIT $${paramIndex++}`;
      params.push(limit);

      logs = await prisma.$queryRawUnsafe(query, ...params);
    } catch (dbError) {
      // If table doesn't exist, create it and return empty array
      console.log('[SLOT] asset_play_logs table may not exist, creating...');
      try {
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS asset_play_logs (
            id SERIAL PRIMARY KEY,
            screen_id VARCHAR(255),
            asset_url TEXT,
            campaign_id VARCHAR(255),
            played_at TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;
      } catch (createError) {
        console.error('[SLOT] Create table error:', createError);
      }
    }

    res.json(logs);
  } catch (error) {
    console.error('Error fetching asset logs:', error);
    res.status(500).json({ error: 'Failed to fetch asset logs' });
  }
};



