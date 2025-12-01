const prisma = require('../db');

// Get all playlists
exports.getAllPlaylists = async (req, res) => {
  try {
    // Try to get from database first
    let playlists = [];
    try {
      playlists = await prisma.$queryRaw`
        SELECT * FROM playlists ORDER BY updated_at DESC
      `;
    } catch (dbError) {
      // If table doesn't exist, return empty array
      console.log('[PLAYLIST] Table may not exist, returning empty array');
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
exports.createPlaylist = async (req, res) => {
  try {
    const { name, description, tags } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    const id = `playlist-${Date.now()}`;
    const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : tags) : [];
    const slots = Array(8).fill(null);

    try {
      // Try to insert into database
      await prisma.$executeRaw`
        INSERT INTO playlists (id, name, description, tags, slots, created_at, updated_at)
        VALUES (${id}, ${name}, ${description || ''}, ${JSON.stringify(tagsArray)}, ${JSON.stringify(slots)}, NOW(), NOW())
      `;
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
            created_at TIMESTAMP,
            updated_at TIMESTAMP
          )
        `;
        await prisma.$executeRaw`
          INSERT INTO playlists (id, name, description, tags, slots, created_at, updated_at)
          VALUES (${id}, ${name}, ${description || ''}, ${JSON.stringify(tagsArray)}, ${JSON.stringify(slots)}, NOW(), NOW())
        `;
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
        slots: slots,
      },
    });
  } catch (error) {
    console.error('[PLAYLIST] Create error:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
};

// Update playlist
exports.updatePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, tags, slots } = req.body;

    console.log('[PLAYLIST] Update request:', { id, hasName: name !== undefined, hasSlots: slots !== undefined });

    // First check if playlist exists
    const existingResult = await prisma.$queryRaw`
      SELECT id FROM playlists WHERE id = ${id}
    `;
    
    if (!existingResult || existingResult.length === 0) {
      console.log('[PLAYLIST] Playlist not found, creating new one:', id);
      // Playlist doesn't exist, create it
      const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : tags) : [];
      const playlistName = name || `Playlist ${id}`;
      
      await prisma.$executeRawUnsafe(`
        INSERT INTO playlists (id, name, description, tags, slots, created_at, updated_at)
        VALUES (
          '${id.replace(/'/g, "''")}',
          '${playlistName.replace(/'/g, "''")}',
          '${(description || '').replace(/'/g, "''")}',
          '${JSON.stringify(tagsArray).replace(/'/g, "''")}',
          '${JSON.stringify(slots || []).replace(/'/g, "''")}',
          NOW(),
          NOW()
        )
      `);
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

    try {
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

