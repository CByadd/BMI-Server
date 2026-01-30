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

// Load totalMessageLimit and messageLimit via raw SQL (works even if Prisma client wasn't regenerated)
let _messageLimitColumnsExist = null;
async function getMessageLimitColumnsExist() {
  if (_messageLimitColumnsExist !== null) return _messageLimitColumnsExist;
  try {
    await prisma.$queryRaw`SELECT "totalMessageLimit" FROM "AdminUser" LIMIT 0`;
    await prisma.$queryRaw`SELECT "messageLimit" FROM "AdminScreenAssignment" LIMIT 0`;
    _messageLimitColumnsExist = true;
  } catch {
    _messageLimitColumnsExist = false;
  }
  return _messageLimitColumnsExist;
}

async function getAdminMessageLimitMaps() {
  const exist = await getMessageLimitColumnsExist();
  if (!exist) {
    return { adminTotal: new Map(), assignmentLimits: new Map() };
  }
  try {
    const adminRows = await prisma.$queryRaw`SELECT id, "totalMessageLimit" FROM "AdminUser"`;
    const assignmentRows = await prisma.$queryRaw`SELECT "adminId", "screenId", "messageLimit" FROM "AdminScreenAssignment"`;
    const adminTotal = new Map(adminRows.map((r) => [r.id, r.totalMessageLimit ?? null]));
    const assignmentLimits = new Map();
    for (const r of assignmentRows) {
      if (!assignmentLimits.has(r.adminId)) assignmentLimits.set(r.adminId, new Map());
      assignmentLimits.get(r.adminId).set(r.screenId, r.messageLimit ?? null);
    }
    return { adminTotal, assignmentLimits };
  } catch (e) {
    return { adminTotal: new Map(), assignmentLimits: new Map() };
  }
}

function mergeMessageLimitsIntoAdmin(adminData, adminId, { adminTotal, assignmentLimits }) {
  adminData.totalMessageLimit = adminTotal.has(adminId) ? adminTotal.get(adminId) : null;
  const screenMap = assignmentLimits.get(adminId);
  adminData.screenLimits = (adminData.assignedScreenIds || []).map((screenId) => ({
    screenId,
    messageLimit: screenMap && screenMap.has(screenId) ? screenMap.get(screenId) : null,
  }));
  return adminData;
}

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find admin by email (only screenId to avoid Prisma client schema mismatch)
    const admin = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        assignedScreens: {
          select: { screenId: true },
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

    // Return admin data without password; message limits from raw SQL
    const adminData = excludePassword(admin);
    adminData.assignedScreenIds = admin.assignedScreens.map((a) => a.screenId);
    const limits = await getAdminMessageLimitMaps();
    mergeMessageLimitsIntoAdmin(adminData, admin.id, limits);

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
          select: { screenId: true },
        },
      },
    });

    if (!admin) {
      return res.status(404).json({ error: 'User not found' });
    }

    const adminData = excludePassword(admin);
    adminData.assignedScreenIds = admin.assignedScreens.map((a) => a.screenId);
    const limits = await getAdminMessageLimitMaps();
    mergeMessageLimitsIntoAdmin(adminData, admin.id, limits);

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

    // Create admin (omit totalMessageLimit so old Prisma client works)
    const newAdmin = await prisma.adminUser.create({
      data: createData,
    });

    if (effectiveRole === 'admin' && totalMessageLimit !== undefined) {
      const exist = await getMessageLimitColumnsExist();
      if (exist) {
        await prisma.$executeRaw`UPDATE "AdminUser" SET "totalMessageLimit" = ${parseInt(totalMessageLimit, 10)} WHERE id = ${newAdmin.id}`;
      }
    }

    const limitsMap = {};
    if (screenIds && Array.isArray(screenIds) && screenIds.length > 0) {
      await prisma.adminScreenAssignment.createMany({
        data: screenIds.map((screenId) => ({
          adminId: newAdmin.id,
          screenId: String(screenId),
        })),
        skipDuplicates: true,
      });
      if (req.body.screenLimits && Array.isArray(req.body.screenLimits)) {
        const parseLimit = (v) => {
          if (v == null || v === '') return null;
          const n = parseInt(v, 10);
          return !isNaN(n) && n >= 0 ? n : null;
        };
        for (const s of req.body.screenLimits) {
          limitsMap[String(s.screenId)] = parseLimit(s.messageLimit);
        }
      }
      const exist = await getMessageLimitColumnsExist();
      if (exist && Object.keys(limitsMap).length > 0) {
        for (const screenId of screenIds) {
          const lim = limitsMap[String(screenId)];
          if (lim !== undefined) {
            await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "messageLimit" = ${lim} WHERE "adminId" = ${newAdmin.id} AND "screenId" = ${String(screenId)}`;
          }
        }
      }
    }

    const adminWithScreens = await prisma.adminUser.findUnique({
      where: { id: newAdmin.id },
      include: {
        assignedScreens: { select: { screenId: true } },
      },
    });

    const adminData = excludePassword(adminWithScreens);
    adminData.assignedScreenIds = adminWithScreens.assignedScreens.map((a) => a.screenId);
    const limits = await getAdminMessageLimitMaps();
    mergeMessageLimitsIntoAdmin(adminData, newAdmin.id, limits);

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
          select: { screenId: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const limits = await getAdminMessageLimitMaps();
    const adminsData = admins.map((admin) => {
      const adminData = excludePassword(admin);
      adminData.assignedScreenIds = admin.assignedScreens.map((a) => a.screenId);
      mergeMessageLimitsIntoAdmin(adminData, admin.id, limits);
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
      if (totalMessageLimit !== null && totalMessageLimit !== '') {
        const n = parseInt(totalMessageLimit, 10);
        if (isNaN(n) || n < 0) {
          return res.status(400).json({ error: 'totalMessageLimit must be a non-negative integer or empty' });
        }
      }
      // Don't put in updateData; set via raw so old Prisma client works
    }

    // Update admin (omit totalMessageLimit from Prisma update)
    const updatedAdmin = await prisma.adminUser.update({
      where: { id },
      data: updateData,
      include: {
        assignedScreens: { select: { screenId: true } },
      },
    });

    if (totalMessageLimit !== undefined) {
      const exist = await getMessageLimitColumnsExist();
      if (exist) {
        const val = totalMessageLimit === null || totalMessageLimit === '' ? null : parseInt(totalMessageLimit, 10);
        await prisma.$executeRaw`UPDATE "AdminUser" SET "totalMessageLimit" = ${val} WHERE id = ${id}`;
      }
    }

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

      await prisma.adminScreenAssignment.deleteMany({
        where: { adminId: id },
      });

      if (Array.isArray(screenIds) && screenIds.length > 0) {
        await prisma.adminScreenAssignment.createMany({
          data: screenIds.map((screenId) => ({
            adminId: id,
            screenId: String(screenId),
          })),
          skipDuplicates: true,
        });
        const exist = await getMessageLimitColumnsExist();
        if (exist) {
          for (const screenId of screenIds) {
            const lim = limitsMap[String(screenId)] ?? null;
            await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "messageLimit" = ${lim} WHERE "adminId" = ${id} AND "screenId" = ${String(screenId)}`;
          }
        }
      }

      const limits = await getAdminMessageLimitMaps();
      const adminData = excludePassword(updatedAdmin);
      adminData.assignedScreenIds = updatedAdmin.assignedScreens.map((a) => a.screenId);
      mergeMessageLimitsIntoAdmin(adminData, id, limits);
      return res.json({ user: adminData });
    }

    const limits = await getAdminMessageLimitMaps();
    const adminData = excludePassword(updatedAdmin);
    adminData.assignedScreenIds = updatedAdmin.assignedScreens.map((a) => a.screenId);
    mergeMessageLimitsIntoAdmin(adminData, id, limits);

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
        })),
        skipDuplicates: true,
      });
      const exist = await getMessageLimitColumnsExist();
      if (exist) {
        for (const screenId of screenIds) {
          const lim = limitsMap[String(screenId)] ?? null;
          await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "messageLimit" = ${lim} WHERE "adminId" = ${id} AND "screenId" = ${String(screenId)}`;
        }
      }
    }

    const adminWithScreens = await prisma.adminUser.findUnique({
      where: { id },
      include: {
        assignedScreens: { select: { screenId: true } },
      },
    });

    const adminData = excludePassword(adminWithScreens);
    adminData.assignedScreenIds = adminWithScreens.assignedScreens.map((a) => a.screenId);
    const limits = await getAdminMessageLimitMaps();
    mergeMessageLimitsIntoAdmin(adminData, id, limits);

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
      select: { screenId: true },
    });

    const screens = assignments.map((a) => ({ screenId: a.screenId, messageLimit: null }));
    const exist = await getMessageLimitColumnsExist();
    if (exist) {
      try {
        const rows = await prisma.$queryRaw`SELECT "screenId", "messageLimit" FROM "AdminScreenAssignment" WHERE "adminId" = ${id}`;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const s = screens.find((x) => x.screenId === r.screenId);
          if (s) s.messageLimit = r.messageLimit ?? null;
        }
      } catch (_) {}
    }

    res.json({
      screenIds: assignments.map((a) => a.screenId),
      screens,
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
        assignedScreens: { select: { screenId: true } },
      },
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const assignedScreenIds = admin.assignedScreens.map((a) => a.screenId);
    let totalLimit = 0;
    const exist = await getMessageLimitColumnsExist();
    if (exist) {
      try {
        const [row] = await prisma.$queryRaw`SELECT "totalMessageLimit" FROM "AdminUser" WHERE id = ${id}`;
        if (row && row.totalMessageLimit != null) totalLimit = Number(row.totalMessageLimit);
      } catch (_) {}
    }

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

    const columnsExist = await getMessageLimitColumnsExist();
    if (columnsExist) {
      for (const { screenId, messageLimit } of updates) {
        await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "messageLimit" = ${messageLimit} WHERE "adminId" = ${id} AND "screenId" = ${screenId}`;
      }
    }

    const adminWithScreens = await prisma.adminUser.findUnique({
      where: { id },
      include: {
        assignedScreens: { select: { screenId: true } },
      },
    });

    const adminData = excludePassword(adminWithScreens);
    adminData.assignedScreenIds = adminWithScreens.assignedScreens.map((a) => a.screenId);
    const limits = await getAdminMessageLimitMaps();
    mergeMessageLimitsIntoAdmin(adminData, id, limits);

    res.json({ user: adminData });
  } catch (error) {
    console.error('Set admin screen limits error:', error);
    res.status(500).json({ error: 'Failed to set screen limits' });
  }
};






