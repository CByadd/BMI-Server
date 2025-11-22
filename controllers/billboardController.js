const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all billboards
exports.getAllBillboards = async (req, res) => {
  try {
    const billboards = await prisma.$queryRaw`
      SELECT * FROM billboards
      ORDER BY created_at DESC
    `;
    res.json(billboards);
  } catch (error) {
    console.error('Error fetching billboards:', error);
    res.status(500).json({ error: 'Failed to fetch billboards' });
  }
};

// Get approved billboards (public)
exports.getApprovedBillboards = async (req, res) => {
  try {
    const billboards = await prisma.$queryRaw`
      SELECT * FROM billboards
      WHERE status = 'approved' OR status = 'APPROVED'
      ORDER BY created_at DESC
    `;
    res.json(billboards);
  } catch (error) {
    console.error('Error fetching approved billboards:', error);
    res.status(500).json({ error: 'Failed to fetch approved billboards' });
  }
};

// Get pending billboards
exports.getPendingBillboards = async (req, res) => {
  try {
    const billboards = await prisma.$queryRaw`
      SELECT * FROM billboards
      WHERE status = 'pending' OR status = 'PENDING'
      ORDER BY created_at DESC
    `;
    res.json(billboards);
  } catch (error) {
    console.error('Error fetching pending billboards:', error);
    res.status(500).json({ error: 'Failed to fetch pending billboards' });
  }
};

// Get billboard by ID
exports.getBillboardById = async (req, res) => {
  try {
    const { id } = req.params;
    const billboards = await prisma.$queryRaw`
      SELECT * FROM billboards WHERE id = ${id}
    `;
    
    if (billboards.length === 0) {
      return res.status(404).json({ error: 'Billboard not found' });
    }
    
    res.json(billboards[0]);
  } catch (error) {
    console.error('Error fetching billboard:', error);
    res.status(500).json({ error: 'Failed to fetch billboard' });
  }
};

// Search billboards
exports.searchBillboards = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }
    
    const billboards = await prisma.$queryRaw`
      SELECT * FROM billboards
      WHERE 
        name ILIKE ${'%' + q + '%'} OR
        location ILIKE ${'%' + q + '%'} OR
        city ILIKE ${'%' + q + '%'} OR
        state ILIKE ${'%' + q + '%'}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    res.json(billboards);
  } catch (error) {
    console.error('Error searching billboards:', error);
    res.status(500).json({ error: 'Failed to search billboards' });
  }
};

// Get states
exports.getStates = async (req, res) => {
  try {
    const states = await prisma.$queryRaw`
      SELECT DISTINCT state
      FROM billboards
      WHERE (status = 'approved' OR status = 'APPROVED')
      AND state IS NOT NULL
      ORDER BY state
    `;
    res.json(states.map(s => s.state));
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ error: 'Failed to fetch states' });
  }
};

// Get cities by state
exports.getCitiesByState = async (req, res) => {
  try {
    const { state } = req.query;
    if (!state) {
      return res.status(400).json({ error: 'State parameter required' });
    }
    
    const cities = await prisma.$queryRaw`
      SELECT DISTINCT city
      FROM billboards
      WHERE (status = 'approved' OR status = 'APPROVED')
      AND state = ${state}
      AND city IS NOT NULL
      ORDER BY city
    `;
    res.json(cities.map(c => c.city));
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
};

// Create billboard
exports.createBillboard = async (req, res) => {
  try {
    const billboardData = req.body;
    // Insert billboard using raw SQL
    const result = await prisma.$queryRaw`
      INSERT INTO billboards (
        name, location, city, state, type, orientation,
        daily_viewership, price_per_day, available,
        width, height, unit, category, status, created_at
      )
      VALUES (
        ${billboardData.name || null},
        ${billboardData.location || null},
        ${billboardData.city || null},
        ${billboardData.state || null},
        ${billboardData.type || null},
        ${billboardData.orientation || null},
        ${billboardData.dailyViewership || null},
        ${billboardData.pricePerDay || null},
        ${billboardData.available !== false},
        ${billboardData.width || null},
        ${billboardData.height || null},
        ${billboardData.unit || null},
        ${billboardData.category || null},
        ${billboardData.status || 'pending'},
        NOW()
      )
      RETURNING *
    `;
    
    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating billboard:', error);
    res.status(500).json({ error: 'Failed to create billboard' });
  }
};

// Update billboard
exports.updateBillboard = async (req, res) => {
  try {
    const { id } = req.params;
    const billboardData = req.body;
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (billboardData.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(billboardData.name);
    }
    if (billboardData.location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(billboardData.location);
    }
    if (billboardData.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(billboardData.status);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const query = `
      UPDATE billboards
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await prisma.$queryRawUnsafe(query, ...values);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Billboard not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating billboard:', error);
    res.status(500).json({ error: 'Failed to update billboard' });
  }
};

// Approve billboard
exports.approveBillboard = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await prisma.$queryRaw`
      UPDATE billboards
      SET status = 'approved', updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Billboard not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error approving billboard:', error);
    res.status(500).json({ error: 'Failed to approve billboard' });
  }
};

// Reject billboard
exports.rejectBillboard = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const result = await prisma.$queryRaw`
      UPDATE billboards
      SET status = 'rejected', 
          rejection_reason = ${reason || null},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Billboard not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error rejecting billboard:', error);
    res.status(500).json({ error: 'Failed to reject billboard' });
  }
};

// Resubmit billboard
exports.resubmitBillboard = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await prisma.$queryRaw`
      UPDATE billboards
      SET status = 'pending', 
          rejection_reason = NULL,
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Billboard not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error resubmitting billboard:', error);
    res.status(500).json({ error: 'Failed to resubmit billboard' });
  }
};

// Delete billboard
exports.deleteBillboard = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.$queryRaw`
      DELETE FROM billboards WHERE id = ${id}
    `;
    
    res.json({ message: 'Billboard deleted successfully' });
  } catch (error) {
    console.error('Error deleting billboard:', error);
    res.status(500).json({ error: 'Failed to delete billboard' });
  }
};


