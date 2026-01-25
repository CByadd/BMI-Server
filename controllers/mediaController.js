const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();
const {
  ASSETS_DIR,
  getTypeFromMimetype,
  ensureAssetDirs,
  assetUrl,
} = require('../config/assets');

const MEDIA_TABLE = 'media';

async function ensureMediaTable() {
  try {
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
        tags TEXT
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_media_created_by ON media(created_by)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_media_type ON media(type)
    `);
  } catch (e) {
    console.error('[MEDIA] ensureMediaTable error:', e.message);
  }
}

/**
 * Upload media files to local storage under ASSETS_DIR/<type>/
 * No compression or transformation. Returns URLs: ASSET_BASE_URL/<type>/<filename>
 */
exports.uploadMedia = async (req, res) => {
  try {
    ensureAssetDirs();
    await ensureMediaTable();

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const { name, tags } = req.body || {};
    const tagArray = tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : [];
    const adminId = req.user?.id || null;
    if (adminId) tagArray.push(`admin:${adminId}`);

    const uploadedMedia = [];

    for (const file of req.files) {
      try {
        const resourceType = getTypeFromMimetype(file.mimetype);
        const relPath = file.path ? path.relative(ASSETS_DIR, file.path) : null;
        if (!relPath) {
          console.error('[MEDIA] File has no path (multer disk did not set path):', file.originalname);
          continue;
        }
        const pathSegs = relPath.split(path.sep);
        const typeDir = pathSegs[0];
        const filename = pathSegs.slice(1).join(path.sep) || file.filename || path.basename(file.originalname);
        const url = assetUrl(typeDir, filename);

        const id = uuidv4();
        const mediaRow = {
          id,
          name: name || file.originalname || filename,
          type: resourceType === 'images' ? 'image' : resourceType === 'videos' ? 'video' : 'file',
          path: relPath.replace(/\\/g, '/'),
          url,
          size: file.size || null,
          format: file.mimetype ? file.mimetype.split('/')[1] : null,
          duration: null,
          created_by: adminId,
          tags: JSON.stringify(tagArray),
        };

        await prisma.$executeRawUnsafe(
          `INSERT INTO media (id, name, type, path, url, size, format, duration, created_by, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10)`,
          mediaRow.id,
          mediaRow.name,
          mediaRow.type,
          mediaRow.path,
          mediaRow.url,
          mediaRow.size,
          mediaRow.format,
          mediaRow.duration,
          mediaRow.created_by,
          mediaRow.tags
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
          createdAt: new Date().toISOString(),
        };
        uploadedMedia.push(item);
        console.log('[MEDIA] Uploaded', file.originalname, '→', url);
      } catch (err) {
        console.error('[MEDIA] Error uploading', file.originalname, err);
      }
    }

    if (uploadedMedia.length === 0) {
      return res.status(500).json({ error: 'Failed to upload any files' });
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
    const { type, search, tags } = req.query || {};
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

    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, name, type, path, url, size, format, duration, created_by, created_at, tags
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
    res.json({ ok: true, message: 'Media deleted successfully' });
  } catch (error) {
    console.error('[MEDIA] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
};
