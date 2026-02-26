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

// Load message and WhatsApp limits via raw SQL (works even if Prisma client wasn't regenerated)
let _messageLimitColumnsExist = null;
let _whatsappLimitColumnsExist = null;
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

async function getWhatsAppLimitColumnsExist() {
  if (_whatsappLimitColumnsExist !== null) return _whatsappLimitColumnsExist;
  try {
    await prisma.$queryRaw`SELECT "totalWhatsAppLimit" FROM "AdminUser" LIMIT 0`;
    await prisma.$queryRaw`SELECT "whatsappLimit" FROM "AdminScreenAssignment" LIMIT 0`;
    _whatsappLimitColumnsExist = true;
  } catch {
    _whatsappLimitColumnsExist = false;
  }
  return _whatsappLimitColumnsExist;
}

let _toggleColumnsExist = null;
async function getTogglesColumnsExist() {
  if (_toggleColumnsExist !== null) return _toggleColumnsExist;
  try {
    await prisma.$queryRaw`SELECT "smsEnabled", "whatsappEnabled" FROM "AdminScreenAssignment" LIMIT 0`;
    _toggleColumnsExist = true;
  } catch {
    _toggleColumnsExist = false;
  }
  return _toggleColumnsExist;
}

async function getAdminMessageLimitMaps() {
  const exist = await getMessageLimitColumnsExist();
  if (!exist) {
    return { adminTotal: new Map(), adminUsed: new Map(), assignmentLimits: new Map() };
  }
  try {
    // Check if usage columns exist
    let usageColumnsExist = false;
    try {
      await prisma.$queryRaw`SELECT "smsUsedCount" FROM "AdminUser" LIMIT 0`;
      usageColumnsExist = true;
    } catch (_) {
      usageColumnsExist = false;
    }

    let adminRows;
    if (usageColumnsExist) {
      adminRows = await prisma.$queryRaw`SELECT id, "totalMessageLimit", COALESCE("smsUsedCount", 0) as "smsUsedCount" FROM "AdminUser"`;
    } else {
      adminRows = await prisma.$queryRaw`SELECT id, "totalMessageLimit" FROM "AdminUser"`;
    }

    const assignmentRows = await prisma.$queryRaw`SELECT "adminId", "screenId", "messageLimit" FROM "AdminScreenAssignment"`;
    const adminTotal = new Map(adminRows.map((r) => [r.id, r.totalMessageLimit ?? null]));
    const adminUsed = new Map(adminRows.map((r) => [r.id, usageColumnsExist && r.smsUsedCount != null ? Number(r.smsUsedCount) || 0 : 0]));
    const assignmentLimits = new Map();
    for (const r of assignmentRows) {
      if (!assignmentLimits.has(r.adminId)) assignmentLimits.set(r.adminId, new Map());
      assignmentLimits.get(r.adminId).set(r.screenId, r.messageLimit ?? null);
    }
    return { adminTotal, adminUsed, assignmentLimits };
  } catch (e) {
    return { adminTotal: new Map(), adminUsed: new Map(), assignmentLimits: new Map() };
  }
}

async function getAdminWhatsAppLimitMaps() {
  const exist = await getWhatsAppLimitColumnsExist();
  if (!exist) {
    return { adminTotal: new Map(), adminUsed: new Map(), assignmentLimits: new Map() };
  }
  try {
    // Check if usage columns exist
    let usageColumnsExist = false;
    try {
      await prisma.$queryRaw`SELECT "whatsappUsedCount" FROM "AdminUser" LIMIT 0`;
      usageColumnsExist = true;
    } catch (_) {
      usageColumnsExist = false;
    }

    let adminRows;
    if (usageColumnsExist) {
      adminRows = await prisma.$queryRaw`SELECT id, "totalWhatsAppLimit", COALESCE("whatsappUsedCount", 0) as "whatsappUsedCount" FROM "AdminUser"`;
    } else {
      adminRows = await prisma.$queryRaw`SELECT id, "totalWhatsAppLimit" FROM "AdminUser"`;
    }

    const assignmentRows = await prisma.$queryRaw`SELECT "adminId", "screenId", "whatsappLimit" FROM "AdminScreenAssignment"`;
    const adminTotal = new Map(adminRows.map((r) => [r.id, r.totalWhatsAppLimit ?? null]));
    const adminUsed = new Map(adminRows.map((r) => [r.id, usageColumnsExist && r.whatsappUsedCount != null ? Number(r.whatsappUsedCount) || 0 : 0]));
    const assignmentLimits = new Map();
    for (const r of assignmentRows) {
      if (!assignmentLimits.has(r.adminId)) assignmentLimits.set(r.adminId, new Map());
      assignmentLimits.get(r.adminId).set(r.screenId, r.whatsappLimit ?? null);
    }
    return { adminTotal, adminUsed, assignmentLimits };
  } catch (e) {
    return { adminTotal: new Map(), adminUsed: new Map(), assignmentLimits: new Map() };
  }
}

function mergeMessageLimitsIntoAdmin(adminData, adminId, { adminTotal, adminUsed, assignmentLimits }) {
  adminData.totalMessageLimit = adminTotal.has(adminId) ? adminTotal.get(adminId) : null;
  adminData.smsUsedCount = adminUsed.has(adminId) ? adminUsed.get(adminId) : 0;
  const screenMap = assignmentLimits.get(adminId);
  adminData.screenLimits = (adminData.assignedScreenIds || []).map((screenId) => ({
    screenId,
    messageLimit: screenMap && screenMap.has(screenId) ? screenMap.get(screenId) : null,
  }));
  return adminData;
}

async function mergeWhatsAppLimitsIntoAdmin(adminData, adminId, { adminTotal, adminUsed, assignmentLimits }) {
  adminData.totalWhatsAppLimit = adminTotal.has(adminId) ? adminTotal.get(adminId) : null;
  adminData.whatsappUsedCount = adminUsed.has(adminId) ? adminUsed.get(adminId) : 0;

  const screenMap = assignmentLimits.get(adminId);
  if (!adminData.screenLimits) {
    adminData.screenLimits = (adminData.assignedScreenIds || []).map((screenId) => ({ screenId, messageLimit: null, whatsappLimit: null }));
  }

  // also get toggle states
  const togglesExist = await getTogglesColumnsExist();
  let toggleRows = [];
  if (togglesExist) {
    try {
      toggleRows = await prisma.$queryRaw`SELECT "screenId", "smsEnabled", "whatsappEnabled" FROM "AdminScreenAssignment" WHERE "adminId" = CAST(${adminId} AS uuid)`;
    } catch (_) { }
  }
  const toggleMap = new Map(toggleRows.map(r => [r.screenId, { smsEnabled: r.smsEnabled, whatsappEnabled: r.whatsappEnabled }]));

  adminData.screenLimits = adminData.screenLimits.map((s) => ({
    ...s,
    whatsappLimit: screenMap && screenMap.has(s.screenId) ? screenMap.get(s.screenId) : null,
    smsEnabled: toggleMap.has(s.screenId) ? toggleMap.get(s.screenId).smsEnabled : true,
    whatsappEnabled: toggleMap.has(s.screenId) ? toggleMap.get(s.screenId).whatsappEnabled : true,
  }));
  return adminData;
}

async function mergeAllLimitsIntoAdmin(adminData, adminId) {
  const msgLimits = await getAdminMessageLimitMaps();
  mergeMessageLimitsIntoAdmin(adminData, adminId, msgLimits);
  const waLimits = await getAdminWhatsAppLimitMaps();
  await mergeWhatsAppLimitsIntoAdmin(adminData, adminId, waLimits);
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
    await mergeAllLimitsIntoAdmin(adminData, admin.id);

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
    await mergeAllLimitsIntoAdmin(adminData, admin.id);

    res.json({ user: adminData });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Register new admin (Super Admin only)
exports.registerAdmin = async (req, res) => {
  try {
    const { email, password, name, role, screenIds, totalMessageLimit, totalWhatsAppLimit } = req.body;

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
    if (effectiveRole === 'admin' && totalWhatsAppLimit !== undefined) {
      const n = parseInt(totalWhatsAppLimit, 10);
      if (isNaN(n) || n < 0) {
        return res.status(400).json({ error: 'totalWhatsAppLimit must be a non-negative integer' });
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
        await prisma.$executeRaw`UPDATE "AdminUser" SET "totalMessageLimit" = ${parseInt(totalMessageLimit, 10)} WHERE id = CAST(${newAdmin.id} AS uuid)`;
      }
    }
    if (effectiveRole === 'admin' && totalWhatsAppLimit !== undefined) {
      const exist = await getWhatsAppLimitColumnsExist();
      if (exist) {
        await prisma.$executeRaw`UPDATE "AdminUser" SET "totalWhatsAppLimit" = ${parseInt(totalWhatsAppLimit, 10)} WHERE id = CAST(${newAdmin.id} AS uuid)`;
      }
    }

    const limitsMap = {};
    const whatsappLimitsMap = {};
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
          const sid = String(s.screenId);
          limitsMap[sid] = parseLimit(s.messageLimit);
          whatsappLimitsMap[sid] = parseLimit(s.whatsappLimit);
          if (s.smsEnabled !== undefined) {
            if (!togglesMap) togglesMap = {};
            if (!togglesMap[sid]) togglesMap[sid] = {};
            togglesMap[sid].smsEnabled = Boolean(s.smsEnabled);
          }
          if (s.whatsappEnabled !== undefined) {
            if (!togglesMap) togglesMap = {};
            if (!togglesMap[sid]) togglesMap[sid] = {};
            togglesMap[sid].whatsappEnabled = Boolean(s.whatsappEnabled);
          }
        }
      }
      const msgExist = await getMessageLimitColumnsExist();
      if (msgExist && Object.keys(limitsMap).length > 0) {
        for (const screenId of screenIds) {
          const lim = limitsMap[String(screenId)];
          if (lim !== undefined) {
            await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "messageLimit" = ${lim} WHERE "adminId" = CAST(${newAdmin.id} AS uuid) AND "screenId" = ${String(screenId)}`;
          }
        }
      }
      const waExist = await getWhatsAppLimitColumnsExist();
      if (waExist && Object.keys(whatsappLimitsMap).length > 0) {
        for (const screenId of screenIds) {
          const lim = whatsappLimitsMap[String(screenId)];
          if (lim !== undefined) {
            await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "whatsappLimit" = ${lim} WHERE "adminId" = CAST(${newAdmin.id} AS uuid) AND "screenId" = ${String(screenId)}`;
          }
        }
      }
      const togglesExist = await getTogglesColumnsExist();
      if (togglesExist && togglesMap && Object.keys(togglesMap).length > 0) {
        for (const screenId of screenIds) {
          const sid = String(screenId);
          if (togglesMap[sid]) {
            if (togglesMap[sid].smsEnabled !== undefined) {
              await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "smsEnabled" = ${togglesMap[sid].smsEnabled} WHERE "adminId" = CAST(${newAdmin.id} AS uuid) AND "screenId" = ${sid}`;
            }
            if (togglesMap[sid].whatsappEnabled !== undefined) {
              await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "whatsappEnabled" = ${togglesMap[sid].whatsappEnabled} WHERE "adminId" = CAST(${newAdmin.id} AS uuid) AND "screenId" = ${sid}`;
            }
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
    await mergeAllLimitsIntoAdmin(adminData, newAdmin.id);

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

    const msgLimits = await getAdminMessageLimitMaps();
    const waLimits = await getAdminWhatsAppLimitMaps();
    const adminsData = await Promise.all(admins.map(async (admin) => {
      const adminData = excludePassword(admin);
      adminData.assignedScreenIds = admin.assignedScreens.map((a) => a.screenId);
      mergeMessageLimitsIntoAdmin(adminData, admin.id, msgLimits);
      await mergeWhatsAppLimitsIntoAdmin(adminData, admin.id, waLimits);
      return adminData;
    }));

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
    const { email, password, name, role, isActive, screenIds, screenLimits, totalMessageLimit, totalWhatsAppLimit } = req.body;

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
    }
    if (totalWhatsAppLimit !== undefined) {
      if (totalWhatsAppLimit !== null && totalWhatsAppLimit !== '') {
        const n = parseInt(totalWhatsAppLimit, 10);
        if (isNaN(n) || n < 0) {
          return res.status(400).json({ error: 'totalWhatsAppLimit must be a non-negative integer or empty' });
        }
      }
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
        await prisma.$executeRaw`UPDATE "AdminUser" SET "totalMessageLimit" = ${val} WHERE id = CAST(${id} AS uuid)`;
      }
    }
    if (totalWhatsAppLimit !== undefined) {
      const exist = await getWhatsAppLimitColumnsExist();
      if (exist) {
        const val = totalWhatsAppLimit === null || totalWhatsAppLimit === '' ? null : parseInt(totalWhatsAppLimit, 10);
        await prisma.$executeRaw`UPDATE "AdminUser" SET "totalWhatsAppLimit" = ${val} WHERE id = CAST(${id} AS uuid)`;
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
      const whatsappLimitsMap = Array.isArray(screenLimits)
        ? Object.fromEntries(screenLimits.map((s) => [String(s.screenId), parseLimit(s.whatsappLimit)]))
        : {};
      const togglesMap = Array.isArray(screenLimits)
        ? Object.fromEntries(screenLimits.map((s) => [String(s.screenId), { smsEnabled: s.smsEnabled, whatsappEnabled: s.whatsappEnabled }]))
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
        const msgExist = await getMessageLimitColumnsExist();
        if (msgExist) {
          for (const screenId of screenIds) {
            const lim = limitsMap[String(screenId)] ?? null;
            await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "messageLimit" = ${lim} WHERE "adminId" = CAST(${id} AS uuid) AND "screenId" = ${String(screenId)}`;
          }
        }
        const waExist = await getWhatsAppLimitColumnsExist();
        if (waExist) {
          for (const screenId of screenIds) {
            const lim = whatsappLimitsMap[String(screenId)] ?? null;
            await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "whatsappLimit" = ${lim} WHERE "adminId" = CAST(${id} AS uuid) AND "screenId" = ${String(screenId)}`;
          }
        }
        const togglesExist = await getTogglesColumnsExist();
        if (togglesExist) {
          for (const screenId of screenIds) {
            const sid = String(screenId);
            const t = togglesMap[sid];
            if (t) {
              if (t.smsEnabled !== undefined) {
                await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "smsEnabled" = ${Boolean(t.smsEnabled)} WHERE "adminId" = CAST(${id} AS uuid) AND "screenId" = ${sid}`;
              }
              if (t.whatsappEnabled !== undefined) {
                await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "whatsappEnabled" = ${Boolean(t.whatsappEnabled)} WHERE "adminId" = CAST(${id} AS uuid) AND "screenId" = ${sid}`;
              }
            }
          }
        }
      }

      const adminData = excludePassword(updatedAdmin);
      adminData.assignedScreenIds = updatedAdmin.assignedScreens.map((a) => a.screenId);
      await mergeAllLimitsIntoAdmin(adminData, id);
      return res.json({ user: adminData });
    }

    const adminData = excludePassword(updatedAdmin);
    adminData.assignedScreenIds = updatedAdmin.assignedScreens.map((a) => a.screenId);
    await mergeAllLimitsIntoAdmin(adminData, id);

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
          await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "messageLimit" = ${lim} WHERE "adminId" = CAST(${id} AS uuid) AND "screenId" = ${String(screenId)}`;
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

    const screens = assignments.map((a) => ({ screenId: a.screenId, messageLimit: null, whatsappLimit: null }));
    const msgExist = await getMessageLimitColumnsExist();
    if (msgExist) {
      try {
        const rows = await prisma.$queryRaw`SELECT "screenId", "messageLimit" FROM "AdminScreenAssignment" WHERE "adminId" = CAST(${id} AS uuid)`;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const s = screens.find((x) => x.screenId === r.screenId);
          if (s) s.messageLimit = r.messageLimit ?? null;
        }
      } catch (_) { }
    }
    const waExist = await getWhatsAppLimitColumnsExist();
    if (waExist) {
      try {
        const rows = await prisma.$queryRaw`SELECT "screenId", "whatsappLimit" FROM "AdminScreenAssignment" WHERE "adminId" = CAST(${id} AS uuid)`;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const s = screens.find((x) => x.screenId === r.screenId);
          if (s) s.whatsappLimit = r.whatsappLimit ?? null;
        }
      } catch (_) { }
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
      return res.status(400).json({ error: 'screenLimits must be an array of { screenId, messageLimit?, whatsappLimit? }' });
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
    let totalMsgLimit = 0;
    let totalWaLimit = 0;
    const msgExist = await getMessageLimitColumnsExist();
    if (msgExist) {
      try {
        const [row] = await prisma.$queryRaw`SELECT "totalMessageLimit" FROM "AdminUser" WHERE id = CAST(${id} AS uuid)`;
        if (row && row.totalMessageLimit != null) totalMsgLimit = Number(row.totalMessageLimit);
      } catch (_) { }
    }
    const waExist = await getWhatsAppLimitColumnsExist();
    if (waExist) {
      try {
        const [row] = await prisma.$queryRaw`SELECT "totalWhatsAppLimit" FROM "AdminUser" WHERE id = CAST(${id} AS uuid)`;
        if (row && row.totalWhatsAppLimit != null) totalWaLimit = Number(row.totalWhatsAppLimit);
      } catch (_) { }
    }

    let msgSum = 0;
    let waSum = 0;
    const msgUpdates = [];
    const waUpdates = [];
    const toggleUpdates = [];
    for (const item of screenLimits) {
      const screenId = String(item.screenId);
      if (!assignedScreenIds.includes(screenId)) {
        return res.status(400).json({ error: `Screen ${screenId} is not assigned to this admin` });
      }
      if (item.messageLimit !== undefined) {
        const limit = item.messageLimit == null || item.messageLimit === '' ? null : parseInt(item.messageLimit, 10);
        if (limit !== null && (isNaN(limit) || limit < 0)) {
          return res.status(400).json({ error: `messageLimit for screen ${screenId} must be a non-negative integer` });
        }
        msgSum += limit ?? 0;
        msgUpdates.push({ screenId, messageLimit: limit });
      }
      if (item.whatsappLimit !== undefined) {
        const limit = item.whatsappLimit == null || item.whatsappLimit === '' ? null : parseInt(item.whatsappLimit, 10);
        if (limit !== null && (isNaN(limit) || limit < 0)) {
          return res.status(400).json({ error: `whatsappLimit for screen ${screenId} must be a non-negative integer` });
        }
        waSum += limit ?? 0;
        waUpdates.push({ screenId, whatsappLimit: limit });
      }
      if (item.smsEnabled !== undefined || item.whatsappEnabled !== undefined) {
        toggleUpdates.push({
          screenId,
          smsEnabled: item.smsEnabled !== undefined ? Boolean(item.smsEnabled) : undefined,
          whatsappEnabled: item.whatsappEnabled !== undefined ? Boolean(item.whatsappEnabled) : undefined
        });
      }
    }

    if (totalMsgLimit > 0 && msgSum > totalMsgLimit) {
      return res.status(400).json({
        error: `Total allocated message limit (${msgSum}) cannot exceed admin total message limit (${totalMsgLimit})`,
      });
    }
    if (totalWaLimit > 0 && waSum > totalWaLimit) {
      return res.status(400).json({
        error: `Total allocated WhatsApp limit (${waSum}) cannot exceed admin total WhatsApp limit (${totalWaLimit})`,
      });
    }

    if (msgExist && msgUpdates.length > 0) {
      for (const { screenId, messageLimit } of msgUpdates) {
        await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "messageLimit" = ${messageLimit} WHERE "adminId" = CAST(${id} AS uuid) AND "screenId" = ${screenId}`;
      }
    }
    if (waExist && waUpdates.length > 0) {
      for (const { screenId, whatsappLimit } of waUpdates) {
        await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "whatsappLimit" = ${whatsappLimit} WHERE "adminId" = CAST(${id} AS uuid) AND "screenId" = ${screenId}`;
      }
    }
    const togglesExist = await getTogglesColumnsExist();
    if (togglesExist && toggleUpdates.length > 0) {
      for (const { screenId, smsEnabled, whatsappEnabled } of toggleUpdates) {
        if (smsEnabled !== undefined) {
          await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "smsEnabled" = ${smsEnabled} WHERE "adminId" = CAST(${id} AS uuid) AND "screenId" = ${screenId}`;
        }
        if (whatsappEnabled !== undefined) {
          await prisma.$executeRaw`UPDATE "AdminScreenAssignment" SET "whatsappEnabled" = ${whatsappEnabled} WHERE "adminId" = CAST(${id} AS uuid) AND "screenId" = ${screenId}`;
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
    await mergeAllLimitsIntoAdmin(adminData, id);

    res.json({ user: adminData });
  } catch (error) {
    console.error('Set admin screen limits error:', error);
    res.status(500).json({ error: 'Failed to set screen limits' });
  }
};

// Reset admin usage and optionally update limits (Super Admin only)
exports.resetAdminUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const { resetSmsUsage, resetWhatsAppUsage, resetSmsLimit, resetWhatsAppLimit } = req.body;

    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id },
    });

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "smsUsedCount" INTEGER DEFAULT 0`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "whatsappUsedCount" INTEGER DEFAULT 0`);
    } catch (_) { }

    if (resetSmsUsage === true) {
      await prisma.$executeRaw`UPDATE "AdminUser" SET "smsUsedCount" = 0 WHERE id = CAST(${id} AS uuid)`;
    }
    if (resetWhatsAppUsage === true) {
      await prisma.$executeRaw`UPDATE "AdminUser" SET "whatsappUsedCount" = 0 WHERE id = CAST(${id} AS uuid)`;
    }
    if (resetSmsLimit === true) {
      const exist = await getMessageLimitColumnsExist();
      if (exist) {
        await prisma.$executeRaw`UPDATE "AdminUser" SET "totalMessageLimit" = NULL WHERE id = CAST(${id} AS uuid)`;
      }
    }
    if (resetWhatsAppLimit === true) {
      const exist = await getWhatsAppLimitColumnsExist();
      if (exist) {
        await prisma.$executeRaw`UPDATE "AdminUser" SET "totalWhatsAppLimit" = NULL WHERE id = CAST(${id} AS uuid)`;
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
    await mergeAllLimitsIntoAdmin(adminData, id);

    res.json({ user: adminData });
  } catch (error) {
    console.error('Reset admin usage error:', error);
    res.status(500).json({ error: 'Failed to reset admin usage' });
  }
};






