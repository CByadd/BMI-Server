const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  getTypeFromMimetype,
  ensureAssetDirs,
  getTempUploadsDir,
  safeFilename,
} = require('../config/assets');

ensureAssetDirs();

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, getTempUploadsDir());
  },
  filename(req, file, cb) {
    const type = getTypeFromMimetype(file.mimetype);
    cb(null, safeFilename(`${type}-${file.originalname}`));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB
    files: 50,
  },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  },
});

module.exports = (io) => {
  const mediaController = require('../controllers/mediaController')(io);

  router.post('/upload', authenticateToken, upload.array('files', 50), mediaController.uploadMedia);
  router.get('/', authenticateToken, mediaController.getAllMedia);
  router.delete('/delete', authenticateToken, mediaController.deleteMedia);
  router.post('/move', authenticateToken, mediaController.moveMedia);
  router.post('/bulk-delete', authenticateToken, mediaController.bulkDeleteMedia);
  router.post('/bulk-move', authenticateToken, mediaController.bulkMoveMedia);

  return router;
};
