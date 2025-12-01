const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all slots
exports.getAllSlots = async (req, res) => {
  try {
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
    let playlistStartDate = null;
    let playlistEndDate = null;
    
    try {
      const playlistResult = await prisma.$queryRaw`
        SELECT playlist_id, start_date, end_date 
        FROM screen_playlists 
        WHERE screen_id = ${String(screen_id)}
      `;
      
      if (playlistResult && playlistResult.length > 0) {
        playlistId = playlistResult[0].playlist_id;
        playlistStartDate = playlistResult[0].start_date;
        playlistEndDate = playlistResult[0].end_date;
        console.log('[ASSETS] Found playlist assignment:', { playlistId, playlistStartDate, playlistEndDate });
      }
    } catch (e) {
      // Table might not exist, that's okay
      console.log('[ASSETS] No playlist assignment table or no assignment found');
    }

    // Check if we should use playlist assets
    let usePlaylist = false;
    if (playlistId) {
      // Check if target date is within playlist date range
      const isAfterStart = !playlistStartDate || targetDate >= new Date(playlistStartDate);
      const isBeforeEnd = !playlistEndDate || targetDate <= new Date(playlistEndDate);
      usePlaylist = isAfterStart && isBeforeEnd;
      console.log('[ASSETS] Playlist date check:', { 
        targetDate, 
        playlistStartDate, 
        playlistEndDate, 
        isAfterStart, 
        isBeforeEnd, 
        usePlaylist 
      });
    }

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
          const assets = slots
            .filter((slot) => {
              // Filter slots that are active for the target date
              if (slot.start_date && slot.end_date) {
                const slotStart = new Date(slot.start_date);
                const slotEnd = new Date(slot.end_date);
                slotStart.setHours(0, 0, 0, 0);
                slotEnd.setHours(23, 59, 59, 999);
                return targetDate >= slotStart && targetDate <= slotEnd;
              }
              // If no date range, include the slot
              return true;
            })
            .map((slot, index) => ({
              asset_url: slot.asset_url || slot.url,
              slot_number: slot.slot_number || (index + 1),
              duration: slot.duration || 10,
              start_date: slot.start_date || start.toISOString(),
              end_date: slot.end_date || end.toISOString()
            }));
          
          console.log('[ASSETS] Returning', assets.length, 'assets from playlist');
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

// Track asset play
exports.trackAssetPlay = async (req, res) => {
  try {
    const { screenId, assetUrl, campaignId } = req.body;

    // Insert play log
    await prisma.$queryRaw`
      INSERT INTO asset_play_logs (screen_id, asset_url, campaign_id, played_at)
      VALUES (${screenId}, ${assetUrl}, ${campaignId || null}, NOW())
    `;

    res.json({ ok: true, message: 'Play tracked successfully' });
  } catch (error) {
    console.error('Error tracking play:', error);
    res.status(500).json({ error: 'Failed to track play' });
  }
};

// Get asset logs
exports.getAssetLogs = async (req, res) => {
  try {
    const { screenId, campaignId, limit = 100 } = req.query;

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
    params.push(parseInt(limit));

    const logs = await prisma.$queryRawUnsafe(query, ...params);

    res.json(logs);
  } catch (error) {
    console.error('Error fetching asset logs:', error);
    res.status(500).json({ error: 'Failed to fetch asset logs' });
  }
};



