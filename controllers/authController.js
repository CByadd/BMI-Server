const prisma = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

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
          },
        },
      },
    });

    if (!admin) {
      return res.status(404).json({ error: 'User not found' });
    }

    const adminData = excludePassword(admin);
    adminData.assignedScreenIds = admin.assignedScreens.map((a) => a.screenId);

    res.json({ user: adminData });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Register new admin (Super Admin only)
exports.registerAdmin = async (req, res) => {
  try {
    const { email, password, name, role, screenIds } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (role && !['admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "admin" or "super_admin"' });
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

    // Create admin
    const newAdmin = await prisma.adminUser.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role: role || 'admin',
        isActive: true,
      },
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

    // Fetch admin with assigned screens
    const adminWithScreens = await prisma.adminUser.findUnique({
      where: { id: newAdmin.id },
      include: {
        assignedScreens: {
          select: {
            screenId: true,
          },
        },
      },
    });

    const adminData = excludePassword(adminWithScreens);
    adminData.assignedScreenIds = adminWithScreens.assignedScreens.map((a) => a.screenId);

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
    const { email, password, name, role, isActive, screenIds } = req.body;

    const updateData = {};

    if (email) updateData.email = email.toLowerCase();
    if (name) updateData.name = name;
    if (role && ['admin', 'super_admin'].includes(role)) updateData.role = role;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update admin
    const updatedAdmin = await prisma.adminUser.update({
      where: { id },
      data: updateData,
      include: {
        assignedScreens: {
          select: {
            screenId: true,
          },
        },
      },
    });

    // Update screen assignments if provided
    if (screenIds !== undefined) {
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
            },
          },
        },
      });

      const adminData = excludePassword(adminWithScreens);
      adminData.assignedScreenIds = adminWithScreens.assignedScreens.map((a) => a.screenId);
      return res.json({ user: adminData });
    }

    const adminData = excludePassword(updatedAdmin);
    adminData.assignedScreenIds = updatedAdmin.assignedScreens.map((a) => a.screenId);

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
    const { screenIds } = req.body;

    if (!Array.isArray(screenIds)) {
      return res.status(400).json({ error: 'screenIds must be an array' });
    }

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
          },
        },
      },
    });

    const adminData = excludePassword(adminWithScreens);
    adminData.assignedScreenIds = adminWithScreens.assignedScreens.map((a) => a.screenId);

    res.json({ user: adminData });
  } catch (error) {
    console.error('Assign screens error:', error);
    res.status(500).json({ error: 'Failed to assign screens' });
  }
};

// Get admin screens (Super Admin only)
exports.getAdminScreens = async (req, res) => {
  try {
    const { id } = req.params;

    const assignments = await prisma.adminScreenAssignment.findMany({
      where: { adminId: id },
      select: {
        screenId: true,
      },
    });

    res.json({ screenIds: assignments.map((a) => a.screenId) });
  } catch (error) {
    console.error('Get admin screens error:', error);
    res.status(500).json({ error: 'Failed to get admin screens' });
  }
};


