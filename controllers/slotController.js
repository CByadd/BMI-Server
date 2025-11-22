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
    const now = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date();
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



