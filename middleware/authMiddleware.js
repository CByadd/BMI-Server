const jwt = require('jsonwebtoken');
const prisma = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to authenticate token
exports.authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get admin user with assigned screens
    const admin = await prisma.adminUser.findUnique({
      where: { id: decoded.id },
      include: {
        assignedScreens: {
          select: {
            screenId: true,
          },
        },
      },
    });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!admin.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Attach user to request
    req.user = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      assignedScreenIds: admin.assignedScreens.map((a) => a.screenId),
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Middleware to require super admin role
exports.requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};

// Middleware to check if user has access to specific screen
exports.checkScreenAccess = (req, res, next) => {
  const { screenId } = req.params;

  // Super admin has access to all screens
  if (req.user.role === 'super_admin') {
    return next();
  }

  // Regular admin must have the screen assigned
  if (!req.user.assignedScreenIds.includes(screenId)) {
    return res.status(403).json({ error: 'Access denied to this screen' });
  }

  next();
};

// Helper function to get screen filter for queries
exports.getScreenFilter = (user) => {
  // Super admin sees all screens
  if (user.role === 'super_admin') {
    return {};
  }

  // Regular admin only sees assigned screens
  if (user.assignedScreenIds.length === 0) {
    // No assigned screens, return filter that matches nothing
    return { screenId: { in: [] } };
  }

  return { screenId: { in: user.assignedScreenIds } };
};





