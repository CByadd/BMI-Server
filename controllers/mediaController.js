const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();
const {
  ASSETS_DIR,
  ensureDir,
  getTypeFromMimetype,
  ensureAssetDirs,
  managedMediaUrl,
} = require('../config/assets');

const MEDIA_TABLE = 'media';

async function ensureMediaTable() {
  try {
    // Ensure extension exists for uuid generation
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    
    // Ensure media_folders table exists
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

    // Ensure media table exists with folder_id column
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS media (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL,
        path VARCHAR(512) NOT NULL,
        url TEXT NOT NULL,
        size BIGINT,
        format VARCHAR(20),
        duration FLOAT,
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        tags TEXT,
        folder_id UUID REFERENCES media_folders(id) ON DELETE SET NULL
      )
    `);

    // Add folder_id if it doesn't exist (for existing tables)
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='media' AND column_name='folder_id') THEN
          ALTER TABLE media ADD COLUMN folder_id UUID REFERENCES media_folders(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_media_created_by ON media(created_by)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_media_type ON media(type)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_media_folder_id ON media(folder_id)
    `);
  } catch (e) {
    console.error('[MEDIA] ensureMediaTable error:', e.message);
  }
}

async function getFolderPathSegments(folderId) {
  if (!folderId) return ['root'];

  const segments = [];
  let currentId = String(folderId);

  while (currentId) {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT id, parent_id FROM media_folders WHERE id = $1::uuid LIMIT 1',
      currentId
    );

    if (!rows || rows.length === 0) break;

    const folder = rows[0];
    segments.unshift(String(folder.id));
    currentId = folder.parent_id ? String(folder.parent_id) : null;
  }

  return segments.length > 0 ? segments : ['root'];
}

async function buildManagedMediaLocation({ mediaId, originalName, resourceType, folderId }) {
  const base = path.basename(originalName || 'file');
  const ext = path.extname(base) || '';
  const name = path.basename(base, ext) || 'file';
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file';
  const filename = `${mediaId}-${safe}${ext.toLowerCase()}`;
  const folderSegments = await getFolderPathSegments(folderId);
  const relativePath = path.join('media', ...folderSegments, resourceType, filename).replace(/\\/g, '/');
  const absolutePath = path.join(ASSETS_DIR, relativePath.replace(/\//g, path.sep));

  return {
    filename,
    relativePath,
    absolutePath,
    url: managedMediaUrl(mediaId, filename),
  };
}

function cleanupFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('[MEDIA] Failed to remove file:', filePath, error.message);
  }
}

async function relocateMediaFile(mediaRow, folderId) {
  const currentFullPath = path.join(ASSETS_DIR, String(mediaRow.path).replace(/\//g, path.sep));
  if (!fs.existsSync(currentFullPath)) {
    return {
      path: mediaRow.path,
      url: mediaRow.url,
    };
  }

  const inferredType = mediaRow.type === 'video' ? 'videos' : mediaRow.type === 'image' ? 'images' : 'files';
  const managedLocation = await buildManagedMediaLocation({
    mediaId: mediaRow.id,
    originalName: mediaRow.name || path.basename(String(mediaRow.path)),
    resourceType: inferredType,
    folderId: folderId || null,
  });

  ensureDir(path.dirname(managedLocation.absolutePath));
  fs.renameSync(currentFullPath, managedLocation.absolutePath);

  return {
    path: managedLocation.relativePath,
    url: managedLocation.url,
  };
}

module.exports = (io) => {
  const exports = {};

  /**
   * Upload media files into managed folder-aware storage under:
   * ASSETS_DIR/media/<folder-chain>/<type>/<media-id>-<filename>
   *
   * Public URLs stay stable as:
   * ASSET_BASE_URL/media/<media-id>/<filename>
   */
  exports.uploadMedia = async (req, res) => {
    try {
      ensureAssetDirs();
      await ensureMediaTable();

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      const { name, tags, folderId } = req.body || {};
      let fileMetadata = [];
      try {
        fileMetadata = req.body?.fileMetadata ? JSON.parse(req.body.fileMetadata) : [];
      } catch (error) {
        console.warn('[MEDIA] Failed to parse fileMetadata payload:', error.message);
        fileMetadata = [];
      }
      const tagArray = tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : [];
      const adminId = req.user?.id || null;
      const userRole = req.user?.role || 'admin';
      if (adminId) tagArray.push(`admin:${adminId}`);

      if (folderId) {
        const folderRows = await prisma.$queryRawUnsafe(
          'SELECT id, created_by FROM media_folders WHERE id = $1::uuid LIMIT 1',
          folderId
        );

        if (!folderRows || folderRows.length === 0) {
          return res.status(400).json({ error: 'Selected folder does not exist' });
        }

        const folder = folderRows[0];
        const ownerId = folder.created_by != null ? String(folder.created_by) : null;
        if (userRole !== 'super_admin' && adminId && ownerId !== String(adminId)) {
          return res.status(403).json({ error: 'You can only upload into folders you created' });
        }
      }

      const uploadedMedia = [];

      for (const [index, file] of req.files.entries()) {
        try {
          const resourceType = getTypeFromMimetype(file.mimetype);
          if (!file.path) {
            console.error('[MEDIA] File has no temp path:', file.originalname);
            continue;
          }

          const metadata = Array.isArray(fileMetadata)
            ? fileMetadata.find((item) =>
                Number(item?.index) === index &&
                String(item?.originalName || '') === String(file.originalname || '') &&
                Number(item?.size) === Number(file.size || 0)
              ) || null
            : null;
          const parsedDuration = metadata && Number.isFinite(Number(metadata.duration)) && Number(metadata.duration) > 0
            ? Number(metadata.duration)
            : null;

          const id = uuidv4();
          const managedLocation = await buildManagedMediaLocation({
            mediaId: id,
            originalName: file.originalname,
            resourceType,
            folderId: folderId || null,
          });
          ensureDir(path.dirname(managedLocation.absolutePath));
          fs.renameSync(file.path, managedLocation.absolutePath);

          const mediaRow = {
            id,
            name: name || file.originalname || managedLocation.filename,
            type: resourceType === 'images' ? 'image' : resourceType === 'videos' ? 'video' : 'file',
            path: managedLocation.relativePath,
            url: managedLocation.url,
            size: file.size || null,
            format: file.mimetype ? file.mimetype.split('/')[1] : null,
            duration: resourceType === 'videos' ? parsedDuration : null,
            created_by: adminId,
            tags: JSON.stringify(tagArray),
            folder_id: folderId || null,
          };

          await prisma.$executeRawUnsafe(
            `INSERT INTO media (id, name, type, path, url, size, format, duration, created_by, tags, folder_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10, $11::uuid)`,
            mediaRow.id,
            mediaRow.name,
            mediaRow.type,
            mediaRow.path,
            mediaRow.url,
            mediaRow.size,
            mediaRow.format,
            mediaRow.duration,
            mediaRow.created_by,
            mediaRow.tags,
            mediaRow.folder_id
          );

          const item = {
            id: mediaRow.id,
            name: mediaRow.name,
            type: mediaRow.type,
            url: mediaRow.url,
            publicId: mediaRow.id,
            format: mediaRow.format,
            width: null,
            height: null,
            size: mediaRow.size,
            duration: mediaRow.duration,
            tags: tagArray,
            folderId: mediaRow.folder_id,
            createdAt: new Date().toISOString(),
          };
          uploadedMedia.push(item);
          console.log('[MEDIA] Uploaded', file.originalname, '→', managedLocation.url);
        } catch (err) {
          console.error('[MEDIA] Error uploading', file.originalname, err);
          cleanupFile(file.path);
        }
      }

      if (uploadedMedia.length === 0) {
        return res.status(500).json({ error: 'Failed to upload any files' });
      }

      // Notify all players
      if (io) {
        io.emit('assets-updated', { type: 'media', action: 'upload' });
        console.log('[SOCKET] Emitted assets-updated for media upload');
      }

      res.status(201).json({
        ok: true,
        media: uploadedMedia,
        message: `Successfully uploaded ${uploadedMedia.length} file(s)`,
      });
    } catch (error) {
      console.error('[MEDIA] Upload error:', error);
      res.status(500).json({ error: 'Failed to upload media' });
    }
  };

  /**
   * Get all media from DB. Backward-compatible shape: id, publicId, name, type, url, secure_url, etc.
   */
  exports.getAllMedia = async (req, res) => {
    try {
      await ensureMediaTable();
      const { type, search, tags, folderId } = req.query || {};
      const adminId = req.user?.id || null;
      const userRole = req.user?.role || 'admin';

      let where = '1=1';
      const params = [];
      let p = 0;
      if (userRole !== 'super_admin' && adminId) {
        p++;
        where += ` AND created_by = $${p}::uuid`;
        params.push(adminId);
      }
      if (type === 'image' || type === 'images') {
        p++;
        where += ` AND type = $${p}`;
        params.push('image');
      } else if (type === 'video' || type === 'videos') {
        p++;
        where += ` AND type = $${p}`;
        params.push('video');
      }
      if (search && String(search).trim()) {
        p++;
        where += ` AND (name ILIKE $${p} OR path ILIKE $${p})`;
        params.push(`%${String(search).trim()}%`);
      }

      if (folderId && folderId !== 'all') {
        p++;
        where += ` AND folder_id = $${p}::uuid`;
        params.push(folderId);
      } else if (folderId !== 'all') {
        // If folderId is not provided and not 'all', return root media
        where += ` AND folder_id IS NULL`;
      }

      const rows = await prisma.$queryRawUnsafe(
        `SELECT id, name, type, path, url, size, format, duration, created_by, created_at, tags, folder_id
         FROM media WHERE ${where} ORDER BY created_at DESC LIMIT 500`,
        ...params
      );

      const media = (rows || []).map((r) => {
        const tagsArr = (r.tags && (typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags)) || [];
        return {
          id: r.id,
          publicId: r.id,
          name: r.name || 'Untitled',
          type: r.type === 'video' ? 'video' : 'image',
          resource_type: r.type === 'video' ? 'video' : 'image',
          url: r.url,
          secure_url: r.url,
          format: r.format,
          width: null,
          height: null,
          size: r.size != null ? Number(r.size) : null,
          duration: r.duration != null ? Number(r.duration) : null,
          tags: Array.isArray(tagsArr) ? tagsArr : [],
          folderId: r.folder_id,
          created_at: r.created_at,
          createdAt: r.created_at,
          updatedAt: r.created_at,
        };
      });

      res.json({ ok: true, media, total: media.length });
    } catch (error) {
      console.error('[MEDIA] Get media error:', error);
      res.status(500).json({ error: 'Failed to fetch media' });
    }
  };

  /**
   * Delete media by id or publicId. Removes DB row and deletes file from disk.
   */
  exports.deleteMedia = async (req, res) => {
    try {
      const { publicId, resourceType } = req.body || {};
      const id = publicId || req.body?.id;
      const adminId = req.user?.id;
      const userRole = req.user?.role;

      if (!id) {
        return res.status(400).json({ error: 'Public ID or id required' });
      }

      const row = await prisma.$queryRawUnsafe(
        'SELECT id, path, created_by FROM media WHERE id = $1 LIMIT 1',
        id
      ).then((r) => (r && r[0]) || null);

      if (!row) {
        return res.status(404).json({ error: 'Media not found' });
      }

      if (userRole !== 'super_admin' && adminId && row.created_by !== adminId) {
        return res.status(403).json({ error: 'You can only delete media files you uploaded' });
      }

      const fullPath = path.join(ASSETS_DIR, row.path.replace(/\//g, path.sep));
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
          console.log('[MEDIA] Deleted file:', fullPath);
        } catch (e) {
          console.error('[MEDIA] Error deleting file:', fullPath, e.message);
        }
      }

      await prisma.$executeRawUnsafe('DELETE FROM media WHERE id = $1', id);

      // Notify all players
      if (io) {
        io.emit('assets-updated', { type: 'media', action: 'delete', id });
        console.log('[SOCKET] Emitted assets-updated for media deletion');
      }

      res.json({ ok: true, message: 'Media deleted successfully' });
    } catch (error) {
      console.error('[MEDIA] Delete error:', error);
      res.status(500).json({ error: 'Failed to delete media' });
    }
  };

  /**
   * Move media to a different folder
   */
  exports.moveMedia = async (req, res) => {
    try {
      const { mediaId, folderId } = req.body || {};
      const adminId = req.user?.id;
      const userRole = req.user?.role;

      if (!mediaId) {
        return res.status(400).json({ error: 'Media ID is required' });
      }

      // Check if media exists and user has permission
      const row = await prisma.$queryRawUnsafe(
        'SELECT id, created_by, path, url, type, name FROM media WHERE id = $1 LIMIT 1',
        mediaId
      ).then((r) => (r && r[0]) || null);

      if (!row) {
        return res.status(404).json({ error: 'Media not found' });
      }

      if (userRole !== 'super_admin' && adminId && row.created_by !== adminId) {
        return res.status(403).json({ error: 'You can only move media files you uploaded' });
      }

      const relocated = await relocateMediaFile(row, folderId || null);

      await prisma.$executeRawUnsafe(
        'UPDATE media SET folder_id = $1::uuid, path = $2, url = $3 WHERE id = $4',
        folderId || null,
        relocated.path,
        relocated.url,
        mediaId
      );

      // Notify all players
      if (io) {
        io.emit('assets-updated', { type: 'media', action: 'move', id: mediaId, folderId });
      }

      res.json({ ok: true, message: 'Media moved successfully' });
    } catch (error) {
      console.error('[MEDIA] Move error:', error);
      res.status(500).json({ error: 'Failed to move media' });
    }
  };

  /**
   * Bulk delete media files
   */
  exports.bulkDeleteMedia = async (req, res) => {
    try {
      const { ids } = req.body || {};
      const adminId = req.user?.id;
      const userRole = req.user?.role;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Media IDs are required' });
      }

      // Fetch all media items to check permissions and get paths
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      const rows = await prisma.$queryRawUnsafe(
        `SELECT id, path, created_by FROM media WHERE id IN (${placeholders})`,
        ...ids
      );

      const deletedIds = [];
      for (const row of rows) {
        if (userRole === 'super_admin' || !adminId || row.created_by === adminId) {
          const fullPath = path.join(ASSETS_DIR, row.path.replace(/\//g, path.sep));
          if (fs.existsSync(fullPath)) {
            try {
              fs.unlinkSync(fullPath);
            } catch (e) {
              console.error('[MEDIA] Error deleting file:', fullPath, e.message);
            }
          }
          deletedIds.push(row.id);
        }
      }

      if (deletedIds.length > 0) {
        const deletePlaceholders = deletedIds.map((_, i) => `$${i + 1}`).join(',');
        await prisma.$executeRawUnsafe(
          `DELETE FROM media WHERE id IN (${deletePlaceholders})`,
          ...deletedIds
        );

        if (io) {
          io.emit('assets-updated', { type: 'media', action: 'bulk-delete', ids: deletedIds });
        }
      }

      res.json({ 
        ok: true, 
        message: `Successfully deleted ${deletedIds.length} file(s)`,
        totalRequested: ids.length,
        totalDeleted: deletedIds.length
      });
    } catch (error) {
      console.error('[MEDIA] Bulk delete error:', error);
      res.status(500).json({ error: 'Failed to bulk delete media' });
    }
  };

  /**
   * Bulk move media files
   */
  exports.bulkMoveMedia = async (req, res) => {
    try {
      const { ids, folderId } = req.body || {};
      const adminId = req.user?.id;
      const userRole = req.user?.role;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Media IDs required' });
      }

      // Fetch to check permissions
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      const rows = await prisma.$queryRawUnsafe(
        `SELECT id, created_by, path, url, type, name FROM media WHERE id IN (${placeholders})`,
        ...ids
      );

      const allowedRows = rows
        .filter(r => userRole === 'super_admin' || !adminId || r.created_by === adminId);

      if (allowedRows.length > 0) {
        for (const row of allowedRows) {
          const relocated = await relocateMediaFile(row, folderId || null);
          await prisma.$executeRawUnsafe(
            'UPDATE media SET folder_id = $1::uuid, path = $2, url = $3 WHERE id = $4',
            folderId || null,
            relocated.path,
            relocated.url,
            row.id
          );
        }

        if (io) {
          io.emit('assets-updated', { type: 'media', action: 'bulk-move', ids: allowedRows.map(r => r.id), folderId });
        }
      }

      res.json({ 
        ok: true, 
        message: `Successfully moved ${allowedRows.length} media items`,
        totalMoved: allowedRows.length
      });
    } catch (error) {
      console.error('[MEDIA] Bulk move error:', error);
      res.status(500).json({ error: 'Failed to bulk move media' });
    }
  };

  exports.serveMediaAsset = async (req, res) => {
    try {
      const { mediaId } = req.params;

      if (!mediaId) {
        return res.status(400).json({ error: 'Media ID is required' });
      }

      const row = await prisma.$queryRawUnsafe(
        'SELECT id, path, name FROM media WHERE id = $1 LIMIT 1',
        String(mediaId)
      ).then((r) => (r && r[0]) || null);

      if (!row || !row.path) {
        return res.status(404).json({ error: 'Media not found' });
      }

      const fullPath = path.join(ASSETS_DIR, String(row.path).replace(/\//g, path.sep));
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Media file not found on disk' });
      }

      return res.sendFile(fullPath);
    } catch (error) {
      console.error('[MEDIA] Serve asset error:', error);
      return res.status(500).json({ error: 'Failed to serve media asset' });
    }
  };

  return exports;
};
