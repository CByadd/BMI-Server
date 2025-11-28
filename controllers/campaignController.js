const prisma = require('../db');
const { v4: uuidv4 } = require('uuid');

// Create campaign with file upload
exports.createCampaign = async (req, res) => {
  try {
    if (!req.body.data) {
      return res.status(400).json({ error: 'Missing campaign data' });
    }

    let campaignData;
    try {
      campaignData = JSON.parse(req.body.data);
    } catch (parseError) {
      return res.status(400).json({ error: 'Invalid JSON data' });
    }

    const { userName, billboards, campaignName } = campaignData;
    
    if (!userName || !billboards || !Array.isArray(billboards)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const campaignId = uuidv4();
    const uploadedFiles = req.files || [];

    // Process billboards and files
    const enrichedBillboards = billboards.map((billboard, index) => {
      const matchingFiles = uploadedFiles.filter(file =>
        file && file.originalname && file.originalname.startsWith(`${billboard.id}_`)
      );

      // For now, store file URLs as placeholders
      // In production, upload to Cloudinary or S3
      const fileUrls = matchingFiles.map(file => `https://placeholder.com/${file.originalname}`);

      const { startDate, endDate } = billboard.bookingDetails || {};
      const days = startDate && endDate ? 
        (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1 : 1;
      const totalPrice = days * (billboard.pricePerDay || 0);

      return {
        ...billboard,
        files: fileUrls,
        totalPrice,
        billboardCampaignId: `${campaignId}_${billboard.id}`
      };
    });

    const startDate = enrichedBillboards[0]?.bookingDetails?.startDate;
    const endDate = enrichedBillboards[0]?.bookingDetails?.endDate;

    const totalAmount = enrichedBillboards.reduce((sum, b) => sum + (b.totalPrice || 0), 0);

    // Insert campaign
    const result = await prisma.$queryRaw`
      INSERT INTO campaigns (
        id, user_name, campaign_name, status, total_amount,
        start_date, end_date, billboards, created_at, updated_at
      )
      VALUES (
        ${campaignId},
        ${userName},
        ${campaignName || null},
        ${'PENDING'},
        ${totalAmount},
        ${startDate ? new Date(startDate) : null},
        ${endDate ? new Date(endDate) : null},
        ${JSON.stringify(enrichedBillboards)}::jsonb,
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    // Generate slots for each billboard (simplified - in production use proper slot generator)
    // This is a placeholder - actual slot generation should be done properly

    res.status(201).json({
      ok: true,
      campaign: result[0],
      message: 'Campaign created successfully'
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
};

// Get campaigns by user
exports.getCampaignsByUser = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }

    const campaigns = await prisma.$queryRaw`
      SELECT * FROM campaigns
      WHERE user_name = ${email}
      ORDER BY created_at DESC
    `;

    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
};

// Get all campaigns (admin)
exports.getAllCampaigns = async (req, res) => {
  try {
    const campaigns = await prisma.$queryRaw`
      SELECT * FROM campaigns
      ORDER BY created_at DESC
    `;

    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching all campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
};

// Get campaigns by user email (billboard owner)
exports.getCampaignsByUserEmail = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }

    // Get campaigns where billboards have this owner
    const campaigns = await prisma.$queryRaw`
      SELECT * FROM campaigns
      WHERE billboards::text LIKE ${'%' + email + '%'}
      ORDER BY created_at DESC
    `;

    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns by email:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
};

// Get campaign by ID
exports.getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;
    const campaigns = await prisma.$queryRaw`
      SELECT * FROM campaigns WHERE id = ${id}
    `;

    if (campaigns.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaigns[0]);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
};

// Get campaign with billboard statuses
exports.getCampaignWithBillboardStatuses = async (req, res) => {
  try {
    const { id } = req.params;
    const campaigns = await prisma.$queryRaw`
      SELECT * FROM campaigns WHERE id = ${id}
    `;

    if (campaigns.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaigns[0]);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
};

// Update campaign status
exports.updateCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await prisma.$queryRaw`
      UPDATE campaigns
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating campaign status:', error);
    res.status(500).json({ error: 'Failed to update campaign status' });
  }
};

// Update billboard status in campaign
exports.updateBillboardStatus = async (req, res) => {
  try {
    const { campaignId, billboardId } = req.params;
    const { status } = req.body;

    // Get campaign
    const campaigns = await prisma.$queryRaw`
      SELECT * FROM campaigns WHERE id = ${campaignId}
    `;

    if (campaigns.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = campaigns[0];
    const billboards = campaign.billboards || [];

    // Update billboard status in the array
    const updatedBillboards = billboards.map(b => 
      b.id === billboardId ? { ...b, status } : b
    );

    // Update campaign
    const result = await prisma.$queryRaw`
      UPDATE campaigns
      SET billboards = ${JSON.stringify(updatedBillboards)}::jsonb,
          updated_at = NOW()
      WHERE id = ${campaignId}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating billboard status:', error);
    res.status(500).json({ error: 'Failed to update billboard status' });
  }
};

// Update campaign name
exports.updateCampaignName = async (req, res) => {
  try {
    const { campaignId, campaignName } = req.body;

    const result = await prisma.$queryRaw`
      UPDATE campaigns
      SET campaign_name = ${campaignName}, updated_at = NOW()
      WHERE id = ${campaignId}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating campaign name:', error);
    res.status(500).json({ error: 'Failed to update campaign name' });
  }
};

// Delete campaign
exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.$queryRaw`
      DELETE FROM campaigns WHERE id = ${id}
    `;

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
};

// Delete billboard from campaign
exports.deleteBillboardFromCampaign = async (req, res) => {
  try {
    const { campaignId, billboardId } = req.params;

    const campaigns = await prisma.$queryRaw`
      SELECT * FROM campaigns WHERE id = ${campaignId}
    `;

    if (campaigns.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = campaigns[0];
    const billboards = (campaign.billboards || []).filter(b => b.id !== billboardId);

    const result = await prisma.$queryRaw`
      UPDATE campaigns
      SET billboards = ${JSON.stringify(billboards)}::jsonb,
          updated_at = NOW()
      WHERE id = ${campaignId}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    console.error('Error deleting billboard from campaign:', error);
    res.status(500).json({ error: 'Failed to delete billboard from campaign' });
  }
};



