const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getScreenFilter } = require('../middleware/authMiddleware');

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
    const screenFilter = getScreenFilter(req.user);
    
    // Get total BMI records (filtered by screen)
    const totalBMIRecords = await prisma.bMI.count({
      where: screenFilter
    });
    
    // Get total unique users (filtered by screen)
    const uniqueUserIds = await prisma.bMI.findMany({
      where: screenFilter,
      select: { userId: true },
      distinct: ['userId']
    });
    const totalUsers = uniqueUserIds.filter(u => u.userId !== null).length;
    
    // Get daily users (users who checked BMI today, filtered by screen)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const dailyUsers = await prisma.bMI.count({
      where: {
        ...screenFilter,
        timestamp: {
          gte: today,
          lte: todayEnd
        }
      }
    });
    
    // Get total screens (filtered by role)
    const screenWhere = req.user.role === 'super_admin' 
      ? { isActive: true }
      : { isActive: true, screenId: { in: req.user.assignedScreenIds } };
    
    const totalScreens = await prisma.adscapePlayer.count({
      where: screenWhere
    });
    
    // Get active screens (online - seen within last 5 minutes, filtered by role)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeScreens = await prisma.adscapePlayer.count({
      where: {
        ...screenWhere,
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
    const screenFilter = getScreenFilter(req.user);
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
          ...screenFilter,
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
    const screenFilter = getScreenFilter(req.user);
    
    // Build WHERE clause for screen filter
    let whereClause = '';
    if (req.user.role !== 'super_admin' && req.user.assignedScreenIds.length > 0) {
      const screenIds = req.user.assignedScreenIds.map(id => `'${id}'`).join(',');
      whereClause = `WHERE "screenId" IN (${screenIds})`;
    }
    
    const classifications = await prisma.$queryRawUnsafe(`
      SELECT category, COUNT(*)::int as count
      FROM "BMI"
      ${whereClause}
      GROUP BY category
    `);
    
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

// GET all users (filtered by assigned screens)
exports.getAllUsers = async (req, res) => {
  try {
    const screenFilter = getScreenFilter(req.user);
    
    // Get unique user IDs from BMI records that match the screen filter
    let userIds = [];
    
    if (req.user.role === 'super_admin') {
      // Super admin sees all users
      const allUsers = await prisma.user.findMany({
        select: { id: true },
      });
      userIds = allUsers.map(u => u.id);
    } else if (req.user.assignedScreenIds.length > 0) {
      // Regular admin: get users who have BMI records from assigned screens
      const bmiRecords = await prisma.bMI.findMany({
        where: {
          screenId: { in: req.user.assignedScreenIds },
          userId: { not: null }
        },
        select: { userId: true },
        distinct: ['userId']
      });
      userIds = bmiRecords.map(b => b.userId).filter(id => id !== null);
    }
    
    // Get users with their BMI data
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds }
      },
      include: {
        bmiData: {
          where: screenFilter,
          orderBy: { timestamp: 'desc' },
          take: 1 // Get latest BMI record
        },
        _count: {
          select: {
            bmiData: {
              where: screenFilter
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Format response
    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      createdAt: user.createdAt,
      totalBMIRecords: user._count.bmiData,
      latestBMI: user.bmiData.length > 0 ? {
        bmi: user.bmiData[0].bmi,
        category: user.bmiData[0].category,
        timestamp: user.bmiData[0].timestamp,
        screenId: user.bmiData[0].screenId
      } : null
    }));
    
    res.json({
      ok: true,
      users: formattedUsers,
      total: formattedUsers.length
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// GET BMI records for a specific screen
exports.getScreenBMIRecords = async (req, res) => {
  try {
    console.log('[ADMIN] getScreenBMIRecords called:', req.params, req.query);
    const { screenId } = req.params;
    
    if (!screenId) {
      return res.status(400).json({ error: 'screenId is required' });
    }
    
    // Check if user has access to this screen
    if (req.user.role !== 'super_admin' && !req.user.assignedScreenIds.includes(screenId)) {
      return res.status(403).json({ error: 'Access denied to this screen' });
    }
    
    // Get date filter from query params
    const { dateFilter = 'all', startDate, endDate } = req.query;
    
    // Date filter is no longer used for the main query
    // but we'll keep it for the today's stats calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Get BMI records for this screen with pagination
    const [bmiRecords, totalCount] = await Promise.all([
      prisma.bMI.findMany({
        where: {
          screenId: String(screenId)
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              mobile: true
            }
          }
        },
        orderBy: {
          timestamp: 'desc'
        },
        take: limit,
        skip: skip
      }),
      prisma.bMI.count({
        where: {
          screenId: String(screenId)
        }
      })
    ]);
    
    // Format response
    const formattedRecords = bmiRecords.map(record => ({
      id: record.id,
      date: record.timestamp.toISOString(),
      userName: record.user?.name || 'Anonymous',
      mobile: record.user?.mobile || '-',
      weight: record.weightKg,
      height: record.heightCm,
      bmi: record.bmi,
      category: record.category,
      location: record.location || '-',
      waterIntake: null // Not stored in BMI table, can be calculated or added later
    }));
    
    // Calculate stats
    // Today's stats are still calculated using the date filter
    
    const todayRecords = await prisma.bMI.count({
      where: {
        screenId: String(screenId),
        timestamp: {
          gte: today,
          lte: todayEnd
        }
      }
    });
    
    const totalRecords = await prisma.bMI.count({
      where: {
        screenId: String(screenId)
      }
    });
    
    const avgBMIResult = await prisma.bMI.aggregate({
      where: {
        screenId: String(screenId),
        timestamp: {
          gte: today,
          lte: todayEnd
        }
      },
      _avg: {
        bmi: true
      }
    });
    
    res.json({
      ok: true,
      records: formattedRecords,
      pagination: {
        total: totalCount,
        page: page,
        limit: limit,
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: (page * limit) < totalCount,
        hasPreviousPage: page > 1
      },
      stats: {
        todayUsers: todayRecords,
        totalUsers: totalRecords,
        avgBMI: avgBMIResult._avg.bmi ? parseFloat(avgBMIResult._avg.bmi.toFixed(1)) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching screen BMI records:', error);
    res.status(500).json({ error: 'Failed to fetch BMI records' });
  }
};



