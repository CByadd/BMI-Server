const prisma = require('../db');

// Get all playlists
exports.getAllPlaylists = async (req, res) => {
  try {
    const adminId = req.user?.id;
    const userRole = req.user?.role;

    // Try to get from database first
    let playlists = [];
    try {
      // Filter by creator: super_admin sees all, regular admin sees only their own
      if (userRole === 'super_admin') {
        playlists = await prisma.$queryRaw`
          SELECT * FROM playlists ORDER BY updated_at DESC
        `;
      } else if (adminId) {
        // Use parameterized query; compare as text so it works whether created_by is UUID or VARCHAR
        playlists = await prisma.$queryRawUnsafe(
          'SELECT * FROM playlists WHERE created_by::text = $1 ORDER BY updated_at DESC',
          String(adminId)
        );
      } else {
        playlists = [];
      }
    } catch (dbError) {
      // If table doesn't exist or created_by column/type mismatch, return empty array
      console.log('[PLAYLIST] Table may not exist or query error:', dbError?.message);
    }

    // Transform database results to match frontend format
    const formattedPlaylists = playlists.map((playlist) => {
      const slots = playlist.slots ? JSON.parse(playlist.slots) : [];
      const filledSlots = slots.filter(slot => slot !== null && slot !== undefined).length;
      const totalDuration = slots.reduce((sum, slot) => {
        return sum + (slot?.duration || 0);
      }, 0);
      const minutes = Math.floor(totalDuration / 60);
      const seconds = totalDuration % 60;
      const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      // Calculate time ago
      const updatedAt = new Date(playlist.updated_at);
      const timeDiff = Date.now() - updatedAt.getTime();
      const minutesAgo = Math.floor(timeDiff / (1000 * 60));
      const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
      const daysAgo = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      
      let lastUpdated = "";
      if (minutesAgo < 60) {
        lastUpdated = `${minutesAgo} ${minutesAgo === 1 ? 'min' : 'mins'} ago`;
      } else if (hoursAgo < 24) {
        lastUpdated = `${hoursAgo} ${hoursAgo === 1 ? 'hour' : 'hours'} ago`;
      } else {
        lastUpdated = `${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago`;
      }

      const tags = playlist.tags ? (typeof playlist.tags === 'string' ? JSON.parse(playlist.tags) : playlist.tags) : [];

      return {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || '',
        tags: tags,
        totalDuration: durationStr,
        lastUpdated: lastUpdated,
        slotCount: filledSlots,
      };
    });

    res.json({ ok: true, playlists: formattedPlaylists });
  } catch (error) {
    console.error('[PLAYLIST] Get all error:', error);
    res.status(500).json({ error: 'Failed to get playlists' });
  }
};

// Get playlist by ID
exports.getPlaylistById = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;
    const userRole = req.user?.role;
    
    let playlist = null;
    try {
      const results = await prisma.$queryRaw`
        SELECT * FROM playlists WHERE id = ${id}
      `;
      playlist = results[0] || null;
    } catch (dbError) {
      console.log('[PLAYLIST] Table may not exist');
    }

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Check access: super_admin can access all, regular admin can only access their own
    const creatorId = playlist.created_by != null ? String(playlist.created_by) : null;
    if (userRole !== 'super_admin' && adminId && creatorId !== String(adminId)) {
      return res.status(403).json({ error: 'Access denied to this playlist' });
    }

    const slots = playlist.slots ? JSON.parse(playlist.slots) : [];
    const tags = playlist.tags ? (typeof playlist.tags === 'string' ? JSON.parse(playlist.tags) : playlist.tags) : [];

    res.json({
      ok: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || '',
        tags: tags,
        slots: slots,
      },
    });
  } catch (error) {
    console.error('[PLAYLIST] Get by ID error:', error);
    res.status(500).json({ error: 'Failed to get playlist' });
  }
};

// Create playlist
exports.createPlaylist = async (req, res, io) => {
  try {
    const { name, description, tags, slots } = req.body;
    const adminId = req.user?.id;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    const id = `playlist-${Date.now()}`;
    const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : tags) : [];
    // Use provided slots or default to empty array of 8 nulls
    const playlistSlots = slots && Array.isArray(slots) ? slots : Array(8).fill(null);

    try {
      // Try to insert into database with created_by (cast to uuid for PostgreSQL)
      await prisma.$executeRawUnsafe(
        `INSERT INTO playlists (id, name, description, tags, slots, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::uuid, NOW(), NOW())`,
        id, name, description || '', JSON.stringify(tagsArray), JSON.stringify(playlistSlots), adminId
      );
    } catch (dbError) {
      // If table doesn't exist, create it
      console.log('[PLAYLIST] Table may not exist, creating...');
      try {
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS playlists (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            tags TEXT,
            slots TEXT,
            created_by UUID,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
          )
        `;
        // Add index if it doesn't exist
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS idx_playlists_created_by ON playlists(created_by);
        `);
        await prisma.$executeRawUnsafe(
          `INSERT INTO playlists (id, name, description, tags, slots, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::uuid, NOW(), NOW())`,
          id, name, description || '', JSON.stringify(tagsArray), JSON.stringify(playlistSlots), adminId
        );
      } catch (createError) {
        console.error('[PLAYLIST] Create table error:', createError);
        // Continue anyway - will work with in-memory for now
      }
    }

    res.json({
      ok: true,
      playlist: {
        id,
        name,
        description: description || '',
        tags: tagsArray,
        slots: playlistSlots,
      },
    });
  } catch (error) {
    console.error('[PLAYLIST] Create error:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
};

// Update playlist
exports.updatePlaylist = async (req, res, io) => {
  try {
    const { id } = req.params;
    const { name, description, tags, slots } = req.body;
    const adminId = req.user?.id;
    const userRole = req.user?.role;

    console.log('[PLAYLIST] Update request:', { id, hasName: name !== undefined, hasSlots: slots !== undefined });

    // First check if playlist exists
    const existingResult = await prisma.$queryRaw`
      SELECT id, created_by FROM playlists WHERE id = ${id}
    `;
    
    // Check access if playlist exists
    if (existingResult && existingResult.length > 0) {
      const playlist = existingResult[0];
      const creatorId = playlist.created_by != null ? String(playlist.created_by) : null;
      if (userRole !== 'super_admin' && adminId && creatorId !== String(adminId)) {
        return res.status(403).json({ error: 'You can only update playlists you created' });
      }
    }
    
    if (!existingResult || existingResult.length === 0) {
      console.log('[PLAYLIST] Playlist not found, creating new one:', id);
      // Playlist doesn't exist, create it
      const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : tags) : [];
      const playlistName = name || `Playlist ${id}`;
      
      await prisma.$executeRawUnsafe(
        `INSERT INTO playlists (id, name, description, tags, slots, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::uuid, NOW(), NOW())`,
        id, playlistName, description || '', JSON.stringify(tagsArray), JSON.stringify(slots || []), adminId
      );
      console.log('[PLAYLIST] Created new playlist:', id);
    } else {
      // Playlist exists, update it
      const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : tags) : [];

      try {
        // Build update query dynamically
        const updates = [];
        if (name !== undefined) updates.push(`name = '${name.replace(/'/g, "''")}'`);
        if (description !== undefined) updates.push(`description = '${(description || '').replace(/'/g, "''")}'`);
        if (tags !== undefined) updates.push(`tags = '${JSON.stringify(tagsArray).replace(/'/g, "''")}'`);
        if (slots !== undefined) updates.push(`slots = '${JSON.stringify(slots).replace(/'/g, "''")}'`);
        updates.push(`updated_at = NOW()`);

        if (updates.length > 0) {
          const updateResult = await prisma.$executeRawUnsafe(`
            UPDATE playlists 
            SET ${updates.join(', ')}
            WHERE id = '${id.replace(/'/g, "''")}'
          `);
          console.log('[PLAYLIST] Update query executed, rows affected:', updateResult);
        }
      } catch (dbError) {
        console.error('[PLAYLIST] Update error:', dbError);
        return res.status(500).json({ error: 'Failed to update playlist' });
      }
    }

    // Get updated/created playlist
    const results = await prisma.$queryRaw`
      SELECT * FROM playlists WHERE id = ${id}
    `;
    const playlist = results[0];

    if (!playlist) {
      console.error('[PLAYLIST] Playlist still not found after create/update:', id);
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const playlistSlots = playlist.slots ? JSON.parse(playlist.slots) : [];
    const playlistTags = playlist.tags ? (typeof playlist.tags === 'string' ? JSON.parse(playlist.tags) : playlist.tags) : [];

    // Find all screens using this playlist and notify them to refresh
    if (io) {
      try {
        const screensUsingPlaylist = await prisma.$queryRaw`
          SELECT screen_id, playlist_id, start_date, end_date 
          FROM screen_playlists 
          WHERE playlist_id = ${String(id)}
        `;
        
        if (screensUsingPlaylist && screensUsingPlaylist.length > 0) {
          console.log(`[PLAYLIST] Notifying ${screensUsingPlaylist.length} screen(s) about playlist update: ${id}`);
          
          for (const screen of screensUsingPlaylist) {
            const screenId = screen.screen_id;
            const formattedStartDate = screen.start_date ? new Date(screen.start_date).toISOString() : null;
            const formattedEndDate = screen.end_date ? new Date(screen.end_date).toISOString() : null;
            
            // Emit playlist-content-changed event to trigger immediate refresh
            io.to(`screen:${screenId}`).emit('playlist-content-changed', {
              playlistId: id,
              screenId: screenId,
              playlistStartDate: formattedStartDate,
              playlistEndDate: formattedEndDate,
              reason: 'playlist_content_updated'
            });
            
            console.log(`[PLAYLIST] Emitted playlist-content-changed to screen: ${screenId}`);
          }
        }
      } catch (e) {
        console.error('[PLAYLIST] Error notifying screens about playlist update:', e);
        // Don't fail the request if notification fails
      }
    }

    res.json({
      ok: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || '',
        tags: playlistTags,
        slots: playlistSlots,
      },
    });
  } catch (error) {
    console.error('[PLAYLIST] Update error:', error);
    res.status(500).json({ error: 'Failed to update playlist' });
  }
};

// Delete playlist
exports.deletePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;
    const userRole = req.user?.role;

    // Check if playlist exists and user has permission
    try {
      const existingResult = await prisma.$queryRaw`
        SELECT id, created_by FROM playlists WHERE id = ${id}
      `;
      
      if (!existingResult || existingResult.length === 0) {
        return res.status(404).json({ error: 'Playlist not found' });
      }

      const playlist = existingResult[0];
      const creatorId = playlist.created_by != null ? String(playlist.created_by) : null;
      if (userRole !== 'super_admin' && adminId && creatorId !== String(adminId)) {
        return res.status(403).json({ error: 'You can only delete playlists you created' });
      }

      await prisma.$executeRaw`
        DELETE FROM playlists WHERE id = ${id}
      `;
    } catch (dbError) {
      console.error('[PLAYLIST] Delete error:', dbError);
      return res.status(500).json({ error: 'Failed to delete playlist' });
    }

    res.json({ ok: true, message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('[PLAYLIST] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
};

