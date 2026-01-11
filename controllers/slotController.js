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
          const assets = slots
            .map((slot, index) => {
              // Skip null/undefined slots
              if (!slot || slot === null) return null;
              
              // Get asset URL
              const assetUrl = slot.asset_url || slot.url;
              
              // Skip slots without URLs
              if (!assetUrl || assetUrl.trim() === '') return null;
              
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
            .filter(asset => asset !== null); // Remove null entries
          
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




