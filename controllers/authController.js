const prisma = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '60d';

// Helper function to generate JWT token
const generateToken = (admin) => {
  return jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
};

// Helper function to exclude password from admin object
const excludePassword = (admin) => {
  const { password, ...adminWithoutPassword } = admin;
  return adminWithoutPassword;
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find admin by email
    const admin = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        assignedScreens: {
          select: {
            screenId: true,
            messageLimit: true,
          },
        },
      },
    });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!admin.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(admin);

    // Return admin data without password
    const adminData = excludePassword(admin);
    adminData.assignedScreenIds = admin.assignedScreens.map((a) => a.screenId);
    adminData.totalMessageLimit = admin.totalMessageLimit ?? null;
    adminData.screenLimits = admin.assignedScreens.map((a) => ({ screenId: a.screenId, messageLimit: a.messageLimit }));

    res.json({
      token,
      user: adminData,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    const adminId = req.user.id;

    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      include: {
        assignedScreens: {
          select: {
            screenId: true,
            messageLimit: true,
          },
        },
      },
    });

    if (!admin) {
      return res.status(404).json({ error: 'User not found' });
    }

    const adminData = excludePassword(admin);
    adminData.assignedScreenIds = admin.assignedScreens.map((a) => a.screenId);
    adminData.totalMessageLimit = admin.totalMessageLimit ?? null;
    adminData.screenLimits = admin.assignedScreens.map((a) => ({ screenId: a.screenId, messageLimit: a.messageLimit }));

    res.json({ user: adminData });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Register new admin (Super Admin only)
exports.registerAdmin = async (req, res) => {
  try {
    const { email, password, name, role, screenIds, totalMessageLimit } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (role && !['admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "admin" or "super_admin"' });
    }

    const effectiveRole = role || 'admin';
    if (effectiveRole === 'admin' && totalMessageLimit !== undefined) {
      const n = parseInt(totalMessageLimit, 10);
      if (isNaN(n) || n < 0) {
        return res.status(400).json({ error: 'totalMessageLimit must be a non-negative integer' });
      }
    }

    // Check if email already exists
    const existingAdmin = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingAdmin) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const createData = {
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role: effectiveRole,
      isActive: true,
    };
    if (effectiveRole === 'admin' && totalMessageLimit !== undefined) {
      createData.totalMessageLimit = parseInt(totalMessageLimit, 10);
    }

    // Create admin
    const newAdmin = await prisma.adminUser.create({
      data: createData,
    });

    // Assign screens if provided
    if (screenIds && Array.isArray(screenIds) && screenIds.length > 0) {
      await prisma.adminScreenAssignment.createMany({
        data: screenIds.map((screenId) => ({
          adminId: newAdmin.id,
          screenId: String(screenId),
        })),
        skipDuplicates: true,
      });
    }

    // Fetch admin with assigned screens and totalMessageLimit
    const adminWithScreens = await prisma.adminUser.findUnique({
      where: { id: newAdmin.id },
      include: {
        assignedScreens: {
          select: {
            screenId: true,
            messageLimit: true,
          },
        },
      },
    });

    const adminData = excludePassword(adminWithScreens);
    adminData.assignedScreenIds = adminWithScreens.assignedScreens.map((a) => a.screenId);
    adminData.screenLimits = adminWithScreens.assignedScreens.map((a) => ({ screenId: a.screenId, messageLimit: a.messageLimit }));

    res.status(201).json({ user: adminData });
  } catch (error) {
    console.error('Register admin error:', error);
    res.status(500).json({ error: 'Failed to register admin' });
  }
};

// Get all admins (Super Admin only)
exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await prisma.adminUser.findMany({
      include: {
        assignedScreens: {
          select: {
            screenId: true,
            messageLimit: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const adminsData = admins.map((admin) => {
      const adminData = excludePassword(admin);
      adminData.assignedScreenIds = admin.assignedScreens.map((a) => a.screenId);
      adminData.totalMessageLimit = admin.totalMessageLimit ?? null;
      adminData.screenLimits = admin.assignedScreens.map((a) => ({ screenId: a.screenId, messageLimit: a.messageLimit }));
      return adminData;
    });

    res.json({ admins: adminsData });
  } catch (error) {
    console.error('Get all admins error:', error);
    res.status(500).json({ error: 'Failed to get admins' });
  }
};

// Update admin (Super Admin only)
exports.updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, name, role, isActive, screenIds, screenLimits, totalMessageLimit } = req.body;

    const updateData = {};

    if (email) updateData.email = email.toLowerCase();
    if (name) updateData.name = name;
    if (role && ['admin', 'super_admin'].includes(role)) updateData.role = role;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    if (totalMessageLimit !== undefined) {
      if (totalMessageLimit === null || totalMessageLimit === '') {
        updateData.totalMessageLimit = null;
      } else {
        const n = parseInt(totalMessageLimit, 10);
        if (isNaN(n) || n < 0) {
          return res.status(400).json({ error: 'totalMessageLimit must be a non-negative integer or empty' });
        }
        updateData.totalMessageLimit = n;
      }
    }

    // Update admin
    const updatedAdmin = await prisma.adminUser.update({
      where: { id },
      data: updateData,
      include: {
        assignedScreens: {
          select: {
            screenId: true,
            messageLimit: true,
          },
        },
      },
    });

    // Update screen assignments if provided
    if (screenIds !== undefined) {
      const parseLimit = (v) => {
        if (v == null || v === '') return null;
        const n = parseInt(v, 10);
        return !isNaN(n) && n >= 0 ? n : null;
      };
      const limitsMap = Array.isArray(screenLimits)
        ? Object.fromEntries(screenLimits.map((s) => [String(s.screenId), parseLimit(s.messageLimit)]))
        : {};

      // Delete existing assignments
      await prisma.adminScreenAssignment.deleteMany({
        where: { adminId: id },
      });

      // Create new assignments
      if (Array.isArray(screenIds) && screenIds.length > 0) {
        await prisma.adminScreenAssignment.createMany({
          data: screenIds.map((screenId) => ({
            adminId: id,
            screenId: String(screenId),
            messageLimit: limitsMap[String(screenId)] ?? null,
          })),
          skipDuplicates: true,
        });
      }

      // Fetch updated admin with screens
      const adminWithScreens = await prisma.adminUser.findUnique({
        where: { id },
        include: {
          assignedScreens: {
            select: {
              screenId: true,
              messageLimit: true,
            },
          },
        },
      });

      const adminData = excludePassword(adminWithScreens);
      adminData.assignedScreenIds = adminWithScreens.assignedScreens.map((a) => a.screenId);
      adminData.totalMessageLimit = adminWithScreens.totalMessageLimit ?? null;
      adminData.screenLimits = adminWithScreens.assignedScreens.map((a) => ({ screenId: a.screenId, messageLimit: a.messageLimit }));
      return res.json({ user: adminData });
    }

    const adminData = excludePassword(updatedAdmin);
    adminData.assignedScreenIds = updatedAdmin.assignedScreens.map((a) => a.screenId);
    adminData.totalMessageLimit = updatedAdmin.totalMessageLimit ?? null;
    adminData.screenLimits = updatedAdmin.assignedScreens.map((a) => ({ screenId: a.screenId, messageLimit: a.messageLimit }));

    res.json({ user: adminData });
  } catch (error) {
    console.error('Update admin error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.status(500).json({ error: 'Failed to update admin' });
  }
};

// Delete admin (Super Admin only)
exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await prisma.adminUser.delete({
      where: { id },
    });

    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.status(500).json({ error: 'Failed to delete admin' });
  }
};

// Assign screens to admin (Super Admin only)
exports.assignScreens = async (req, res) => {
  try {
    const { id } = req.params;
    const { screenIds, screenLimits } = req.body;

    if (!Array.isArray(screenIds)) {
      return res.status(400).json({ error: 'screenIds must be an array' });
    }

    const parseLimit = (v) => {
      if (v == null || v === '') return null;
      const n = parseInt(v, 10);
      return !isNaN(n) && n >= 0 ? n : null;
    };
    const limitsMap = Array.isArray(screenLimits)
      ? Object.fromEntries(screenLimits.map((s) => [String(s.screenId), parseLimit(s.messageLimit)]))
      : {};

    // Delete existing assignments
    await prisma.adminScreenAssignment.deleteMany({
      where: { adminId: id },
    });

    // Create new assignments
    if (screenIds.length > 0) {
      await prisma.adminScreenAssignment.createMany({
        data: screenIds.map((screenId) => ({
          adminId: id,
          screenId: String(screenId),
          messageLimit: limitsMap[String(screenId)] ?? null,
        })),
        skipDuplicates: true,
      });
    }

    // Fetch updated admin with screens
    const adminWithScreens = await prisma.adminUser.findUnique({
      where: { id },
      include: {
        assignedScreens: {
          select: {
            screenId: true,
            messageLimit: true,
          },
        },
      },
    });

    const adminData = excludePassword(adminWithScreens);
    adminData.assignedScreenIds = adminWithScreens.assignedScreens.map((a) => a.screenId);
    adminData.totalMessageLimit = adminWithScreens.totalMessageLimit ?? null;
    adminData.screenLimits = adminWithScreens.assignedScreens.map((a) => ({ screenId: a.screenId, messageLimit: a.messageLimit }));

    res.json({ user: adminData });
  } catch (error) {
    console.error('Assign screens error:', error);
    res.status(500).json({ error: 'Failed to assign screens' });
  }
};

// Get admin screens (Super Admin for any admin, or admin for self)
exports.getAdminScreens = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== 'super_admin' && req.user.id !== id) {
      return res.status(403).json({ error: 'You can only view your own screen assignments' });
    }

    const assignments = await prisma.adminScreenAssignment.findMany({
      where: { adminId: id },
      select: {
        screenId: true,
        messageLimit: true,
      },
    });

    res.json({
      screenIds: assignments.map((a) => a.screenId),
      screens: assignments.map((a) => ({ screenId: a.screenId, messageLimit: a.messageLimit })),
    });
  } catch (error) {
    console.error('Get admin screens error:', error);
    res.status(500).json({ error: 'Failed to get admin screens' });
  }
};

// Set message limits per screen for an admin (Super Admin for any admin, or Admin for self)
exports.setAdminScreenLimits = async (req, res) => {
  try {
    const { id } = req.params;
    const { screenLimits } = req.body;
    const isSuperAdmin = req.user.role === 'super_admin';
    const isSelf = req.user.id === id;

    if (!isSuperAdmin && !isSelf) {
      return res.status(403).json({ error: 'You can only set screen limits for your own account' });
    }

    if (!Array.isArray(screenLimits)) {
      return res.status(400).json({ error: 'screenLimits must be an array of { screenId, messageLimit }' });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id },
      include: {
        assignedScreens: {
          select: { screenId: true, messageLimit: true },
        },
      },
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const assignedScreenIds = admin.assignedScreens.map((a) => a.screenId);
    const totalLimit = admin.totalMessageLimit ?? 0;

    let sum = 0;
    const updates = [];
    for (const item of screenLimits) {
      const screenId = String(item.screenId);
      if (!assignedScreenIds.includes(screenId)) {
        return res.status(400).json({ error: `Screen ${screenId} is not assigned to this admin` });
      }
      const limit = item.messageLimit == null || item.messageLimit === '' ? null : parseInt(item.messageLimit, 10);
      if (limit !== null && (isNaN(limit) || limit < 0)) {
        return res.status(400).json({ error: `messageLimit for screen ${screenId} must be a non-negative integer` });
      }
      sum += limit ?? 0;
      updates.push({ screenId, messageLimit: limit });
    }

    if (totalLimit > 0 && sum > totalLimit) {
      return res.status(400).json({
        error: `Total allocated message limit (${sum}) cannot exceed admin total message limit (${totalLimit})`,
      });
    }

    for (const { screenId, messageLimit } of updates) {
      await prisma.adminScreenAssignment.updateMany({
        where: { adminId: id, screenId },
        data: { messageLimit },
      });
    }

    const adminWithScreens = await prisma.adminUser.findUnique({
      where: { id },
      include: {
        assignedScreens: {
          select: { screenId: true, messageLimit: true },
        },
      },
    });

    const adminData = excludePassword(adminWithScreens);
    adminData.assignedScreenIds = adminWithScreens.assignedScreens.map((a) => a.screenId);
    adminData.totalMessageLimit = adminWithScreens.totalMessageLimit ?? null;
    adminData.screenLimits = adminWithScreens.assignedScreens.map((a) => ({ screenId: a.screenId, messageLimit: a.messageLimit }));

    res.json({ user: adminData });
  } catch (error) {
    console.error('Set admin screen limits error:', error);
    res.status(500).json({ error: 'Failed to set screen limits' });
  }
};






