const prisma = require('../db');

// Get all schedules
exports.getAllSchedules = async (req, res) => {
  try {
    let schedules = [];
    try {
      schedules = await prisma.$queryRaw`
        SELECT * FROM schedules ORDER BY updated_at DESC
      `;
    } catch (dbError) {
      console.log('[SCHEDULE] Table may not exist, returning empty array');
    }

    // Transform database results to match frontend format
    const formattedSchedules = schedules.map((schedule) => {
      const events = schedule.events ? JSON.parse(schedule.events) : [];
      
      // Calculate time ago
      const updatedAt = new Date(schedule.updated_at);
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

      return {
        id: schedule.id,
        name: schedule.name,
        description: schedule.description || '',
        eventCount: events.length,
        lastUpdated: lastUpdated,
        status: schedule.status || 'active',
      };
    });

    res.json({ ok: true, schedules: formattedSchedules });
  } catch (error) {
    console.error('[SCHEDULE] Get all error:', error);
    res.status(500).json({ error: 'Failed to get schedules' });
  }
};

// Get schedule by ID
exports.getScheduleById = async (req, res) => {
  try {
    const { id } = req.params;
    
    let schedule = null;
    try {
      const results = await prisma.$queryRaw`
        SELECT * FROM schedules WHERE id = ${id}
      `;
      schedule = results[0] || null;
    } catch (dbError) {
      console.log('[SCHEDULE] Table may not exist');
    }

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const events = schedule.events ? JSON.parse(schedule.events) : [];

    res.json({
      ok: true,
      schedule: {
        id: schedule.id,
        name: schedule.name,
        description: schedule.description || '',
        events: events,
        status: schedule.status || 'active',
      },
    });
  } catch (error) {
    console.error('[SCHEDULE] Get by ID error:', error);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
};

// Create schedule
exports.createSchedule = async (req, res) => {
  try {
    const { name, description, events } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Schedule name is required' });
    }

    const id = req.body.id === "new" ? `schedule-${Date.now()}` : (req.body.id || `schedule-${Date.now()}`);
    const eventsArray = events || [];

    // Ensure table exists first
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS schedules (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          events TEXT,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP,
          updated_at TIMESTAMP
        )
      `);
    } catch (createTableError) {
      console.log('[SCHEDULE] Table creation check:', createTableError.message);
    }

    // Insert schedule - escape single quotes properly
    try {
      const escapedName = name.replace(/'/g, "''");
      const escapedDescription = (description || '').replace(/'/g, "''");
      const escapedEvents = JSON.stringify(eventsArray).replace(/'/g, "''");
      
      const insertQuery = `
        INSERT INTO schedules (id, name, description, events, status, created_at, updated_at)
        VALUES ('${id.replace(/'/g, "''")}', '${escapedName}', '${escapedDescription}', '${escapedEvents}', 'active', NOW(), NOW())
      `;
      await prisma.$executeRawUnsafe(insertQuery);
    } catch (insertError) {
      console.error('[SCHEDULE] Insert error:', insertError);
      throw insertError;
    }

    res.json({
      ok: true,
      schedule: {
        id,
        name,
        description: description || '',
        events: eventsArray,
        status: 'active',
      },
    });
  } catch (error) {
    console.error('[SCHEDULE] Create error:', error);
    res.status(500).json({ error: 'Failed to create schedule', details: error.message });
  }
};

// Update schedule
exports.updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, events, status } = req.body;

    try {
      const updates = [];
      if (name !== undefined) updates.push(`name = '${name.replace(/'/g, "''")}'`);
      if (description !== undefined) updates.push(`description = '${(description || '').replace(/'/g, "''")}'`);
      if (events !== undefined) updates.push(`events = '${JSON.stringify(events).replace(/'/g, "''")}'`);
      if (status !== undefined) updates.push(`status = '${status.replace(/'/g, "''")}'`);
      updates.push(`updated_at = NOW()`);

      if (updates.length > 0) {
        await prisma.$executeRawUnsafe(`
          UPDATE schedules 
          SET ${updates.join(', ')}
          WHERE id = '${id.replace(/'/g, "''")}'
        `);
      }
    } catch (dbError) {
      console.error('[SCHEDULE] Update error:', dbError);
      return res.status(500).json({ error: 'Failed to update schedule' });
    }

    const results = await prisma.$queryRaw`
      SELECT * FROM schedules WHERE id = ${id}
    `;
    const schedule = results[0];

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const scheduleEvents = schedule.events ? JSON.parse(schedule.events) : [];

    res.json({
      ok: true,
      schedule: {
        id: schedule.id,
        name: schedule.name,
        description: schedule.description || '',
        events: scheduleEvents,
        status: schedule.status || 'active',
      },
    });
  } catch (error) {
    console.error('[SCHEDULE] Update error:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
};

// Delete schedule
exports.deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    try {
      await prisma.$executeRaw`
        DELETE FROM schedules WHERE id = ${id}
      `;
    } catch (dbError) {
      console.error('[SCHEDULE] Delete error:', dbError);
      return res.status(500).json({ error: 'Failed to delete schedule' });
    }

    res.json({ ok: true, message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('[SCHEDULE] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
};

