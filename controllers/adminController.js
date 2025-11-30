const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    // Get total billboards
    const totalBillboards = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM billboards
    `;
    
    // Get billboard status counts
    const billboardStatus = await prisma.$queryRaw`
      SELECT status, COUNT(*)::int as count 
      FROM billboards 
      GROUP BY status
    `;
    
    const statusCounts = {
      active: 0,
      maintenance: 0,
      offline: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };
    
    billboardStatus.forEach(status => {
      if (status.status) {
        const statusKey = (status.status || '').toLowerCase();
        if (statusCounts.hasOwnProperty(statusKey)) {
          statusCounts[statusKey] = status.count;
        }
      }
    });
    
    // Get total publishers
    const totalPublishers = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count 
      FROM publishers 
      WHERE status = 'active'
    `;
    
    // Get total bookings (campaigns)
    const totalBookings = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM campaigns
    `;
    
    // Calculate total revenue from campaigns
    const revenueResult = await prisma.$queryRaw`
      SELECT COALESCE(SUM(total_amount::numeric), 0) as total
      FROM campaigns
    `;
    const totalRevenue = parseFloat(revenueResult[0]?.total || 0);
    
    // Get recent activity data
    const recentCampaigns = await prisma.$queryRaw`
      SELECT id, campaign_name, status, total_amount, created_at, user_name
      FROM campaigns
      ORDER BY created_at DESC
      LIMIT 5
    `;
    
    const recentActivity = recentCampaigns.map(campaign => ({
      id: campaign.id,
      type: 'campaign',
      title: 'New campaign created',
      description: `${campaign.campaign_name || 'Unnamed'} was created by ${campaign.user_name || 'Unknown'}`,
      amount: campaign.total_amount,
      status: campaign.status,
      timestamp: campaign.created_at
    }));
    
    // Get revenue data for charts (last 12 months)
    const revenueData = [];
    const currentDate = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const monthRevenueResult = await prisma.$queryRaw`
        SELECT COALESCE(SUM(total_amount::numeric), 0) as total
        FROM campaigns
        WHERE created_at >= ${monthStart}
        AND created_at <= ${monthEnd}
      `;
      
      const monthRevenue = parseFloat(monthRevenueResult[0]?.total || 0);
      
      revenueData.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        amount: monthRevenue
      });
    }
    
    res.json({
      totalBillboards: totalBillboards[0]?.count || 0,
      totalPublishers: totalPublishers[0]?.count || 0,
      totalBookings: totalBookings[0]?.count || 0,
      totalRevenue,
      billboardStatus: statusCounts,
      recentActivity,
      revenueData
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

// GET top performing billboards
exports.getTopPerformers = async (req, res) => {
  try {
    const topBillboards = await prisma.$queryRaw`
      SELECT id, name, location, city, price_per_day, daily_viewership
      FROM billboards
      WHERE status = 'approved'
      AND price_per_day IS NOT NULL
      ORDER BY price_per_day DESC
      LIMIT 10
    `;
    
    const performers = topBillboards.map(billboard => ({
      id: billboard.id,
      name: billboard.name || 'Unnamed Billboard',
      location: billboard.location || 'Unknown Location',
      revenue: (billboard.price_per_day || 0) * 30, // Monthly revenue estimate
      growth: Math.floor(Math.random() * 20) + 1 // Random growth for demo
    }));
    
    res.json({ items: performers });
  } catch (error) {
    console.error('Error fetching top performers:', error);
    res.status(500).json({ error: 'Failed to fetch top performers' });
  }
};

// GET BMI statistics for admin dashboard
exports.getBMIStats = async (req, res) => {
  try {
    // Get total BMI records
    const totalBMIRecords = await prisma.bMI.count();
    
    // Get total unique users
    const totalUsers = await prisma.user.count();
    
    // Get daily users (users who checked BMI today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const dailyUsers = await prisma.bMI.count({
      where: {
        timestamp: {
          gte: today,
          lte: todayEnd
        }
      }
    });
    
    // Get total screens
    const totalScreens = await prisma.adscapePlayer.count({
      where: { isActive: true }
    });
    
    // Get active screens (online - seen within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeScreens = await prisma.adscapePlayer.count({
      where: {
        isActive: true,
        lastSeen: {
          gte: fiveMinutesAgo
        }
      }
    });
    
    res.json({
      totalUsers: totalBMIRecords,
      totalUniqueUsers: totalUsers,
      dailyUsers,
      totalScreens,
      activeScreens
    });
  } catch (error) {
    console.error('Error fetching BMI stats:', error);
    res.status(500).json({ error: 'Failed to fetch BMI statistics' });
  }
};

// GET user activity data for charts (last 7 days)
exports.getUserActivity = async (req, res) => {
  try {
    const data = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const count = await prisma.bMI.count({
        where: {
          timestamp: {
            gte: date,
            lt: nextDate
          }
        }
      });
      
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      data.push({
        name: dayNames[date.getDay()],
        users: count
      });
    }
    
    res.json({ data });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ error: 'Failed to fetch user activity' });
  }
};

// GET weight classification distribution
exports.getWeightClassification = async (req, res) => {
  try {
    const classifications = await prisma.$queryRaw`
      SELECT category, COUNT(*)::int as count
      FROM "BMI"
      GROUP BY category
    `;
    
    const total = classifications.reduce((sum, item) => sum + item.count, 0);
    
    const data = classifications.map(item => ({
      name: item.category,
      value: total > 0 ? Math.round((item.count / total) * 100) : 0,
      count: item.count
    }));
    
    res.json({ data });
  } catch (error) {
    console.error('Error fetching weight classification:', error);
    res.status(500).json({ error: 'Failed to fetch weight classification' });
  }
};



