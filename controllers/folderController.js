const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function ensureMediaFoldersTable() {
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS media_folders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        parent_id UUID REFERENCES media_folders(id) ON DELETE CASCADE,
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.error('[FOLDER] ensureMediaFoldersTable error:', e.message);
  }
}

module.exports = (io) => {
  const exports = {};

  /**
   * Create a new folder
   */
  exports.createFolder = async (req, res) => {
    try {
      await ensureMediaFoldersTable();
      const { name, parentId } = req.body || {};
      const adminId = req.user?.id || null;

      if (!name) {
        return res.status(400).json({ error: 'Folder name is required' });
      }

      const rows = await prisma.$queryRawUnsafe(
        `INSERT INTO media_folders (name, parent_id, created_by)
         VALUES ($1, $2::uuid, $3::uuid)
         RETURNING id, name, parent_id, created_at`,
        name,
        parentId || null,
        adminId
      );

      const folder = rows[0];

      res.status(201).json({
        ok: true,
        folder,
        message: 'Folder created successfully'
      });
    } catch (error) {
      console.error('[FOLDER] Create error:', error);
      res.status(500).json({ error: 'Failed to create folder' });
    }
  };

  /**
   * Get all folders for the current user/context
   */
  exports.getAllFolders = async (req, res) => {
    try {
      await ensureMediaFoldersTable();
      const adminId = req.user?.id || null;
      const userRole = req.user?.role || 'admin';
      const { parentId } = req.query || {};

      let where = '1=1';
      const params = [];
      let p = 0;

      if (userRole !== 'super_admin' && adminId) {
        p++;
        where += ` AND created_by = $${p}::uuid`;
        params.push(adminId);
      }

      if (parentId) {
        p++;
        where += ` AND parent_id = $${p}::uuid`;
        params.push(parentId);
      } else {
        where += ` AND parent_id IS NULL`;
      }

      const folders = await prisma.$queryRawUnsafe(
        `SELECT id, name, parent_id, created_at, updated_at
         FROM media_folders WHERE ${where} ORDER BY name ASC`,
        ...params
      );

      res.json({ ok: true, folders });
    } catch (error) {
      console.error('[FOLDER] Get folders error:', error);
      res.status(500).json({ error: 'Failed to fetch folders' });
    }
  };

  /**
   * Update folder (rename or move)
   */
  exports.updateFolder = async (req, res) => {
    try {
      const { id } = req.params;
      const { name, parentId } = req.body || {};
      const adminId = req.user?.id;
      const userRole = req.user?.role;

      // Check permissions
      const checkRows = await prisma.$queryRawUnsafe(
        'SELECT created_by FROM media_folders WHERE id = $1::uuid LIMIT 1',
        id
      );

      if (checkRows.length === 0) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      if (userRole !== 'super_admin' && adminId && checkRows[0].created_by !== adminId) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      const updates = [];
      const params = [id];
      let p = 1;

      if (name) {
        p++;
        updates.push(`name = $${p}`);
        params.push(name);
      }

      if (parentId !== undefined) {
        p++;
        updates.push(`parent_id = $${p}::uuid`);
        params.push(parentId || null);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
      }

      updates.push('updated_at = NOW()');

      await prisma.$executeRawUnsafe(
        `UPDATE media_folders SET ${updates.join(', ')} WHERE id = $1::uuid`,
        ...params
      );

      res.json({ ok: true, message: 'Folder updated successfully' });
    } catch (error) {
      console.error('[FOLDER] Update error:', error);
      res.status(500).json({ error: 'Failed to update folder' });
    }
  };

  /**
   * Delete folder
   */
  exports.deleteFolder = async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user?.id;
      const userRole = req.user?.role;

      // Check permissions
      const checkRows = await prisma.$queryRawUnsafe(
        'SELECT created_by FROM media_folders WHERE id = $1::uuid LIMIT 1',
        id
      );

      if (checkRows.length === 0) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      if (userRole !== 'super_admin' && adminId && checkRows[0].created_by !== adminId) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      // Note: CASCADE in DB will handle children folders and set NULL for media items
      await prisma.$executeRawUnsafe('DELETE FROM media_folders WHERE id = $1::uuid', id);

      res.json({ ok: true, message: 'Folder deleted successfully' });
    } catch (error) {
      console.error('[FOLDER] Delete error:', error);
      res.status(500).json({ error: 'Failed to delete folder' });
    }
  };

  return exports;
};
