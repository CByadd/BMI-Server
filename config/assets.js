/**
 * Self-hosted asset storage config.
 * Files are stored under ASSETS_DIR and served at ASSET_BASE_URL (Nginx serves /assets from /var/www/assets).
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ASSETS_DIR = process.env.ASSETS_DIR || '/var/www/assets';
const ASSET_BASE_URL = (process.env.ASSET_BASE_URL || 'https://api.well2day.in/assets').replace(/\/$/, '');

const TYPES = {
  IMAGES: 'images',
  VIDEOS: 'videos',
  FILES: 'files',
};

const MANAGED_MEDIA_ROOT = 'media';
const TEMP_UPLOADS_DIRNAME = '_tmp';

function getTypeFromMimetype(mimetype) {
  if (mimetype && mimetype.startsWith('video/')) return TYPES.VIDEOS;
  if (mimetype && mimetype.startsWith('image/')) return TYPES.IMAGES;
  return TYPES.FILES;
}

function getTypeDir(type) {
  return path.join(ASSETS_DIR, type);
}

function getManagedMediaRootDir() {
  return path.join(ASSETS_DIR, MANAGED_MEDIA_ROOT);
}

function getTempUploadsDir() {
  return path.join(ASSETS_DIR, TEMP_UPLOADS_DIRNAME);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureAssetDirs() {
  ensureDir(ASSETS_DIR);
  ensureDir(getTypeDir(TYPES.IMAGES));
  ensureDir(getTypeDir(TYPES.VIDEOS));
  ensureDir(getTypeDir(TYPES.FILES));
  ensureDir(getManagedMediaRootDir());
  ensureDir(getTempUploadsDir());
}

/** Sanitize filename for storage: keep extension, avoid path traversal */
function safeFilename(originalName) {
  const base = path.basename(originalName || 'file');
  const ext = path.extname(base) || '';
  const name = path.basename(base, ext) || 'file';
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  return `${unique}-${safe}${ext.toLowerCase()}`;
}

/** Build public URL for a stored file: ASSET_BASE_URL/<type>/<filename> */
function assetUrl(type, filename) {
  return `${ASSET_BASE_URL}/${type}/${filename}`;
}

function managedMediaUrl(mediaId, filename) {
  return `${ASSET_BASE_URL}/media/${encodeURIComponent(String(mediaId))}/${encodeURIComponent(filename)}`;
}

module.exports = {
  ASSETS_DIR,
  ASSET_BASE_URL,
  TYPES,
  MANAGED_MEDIA_ROOT,
  TEMP_UPLOADS_DIRNAME,
  getTypeFromMimetype,
  getTypeDir,
  getManagedMediaRootDir,
  getTempUploadsDir,
  ensureDir,
  ensureAssetDirs,
  safeFilename,
  assetUrl,
  managedMediaUrl,
};
