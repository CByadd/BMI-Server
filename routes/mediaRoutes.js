const express = require('express');
const router = express.Router();
const multer = require('multer');
const mediaController = require('../controllers/mediaController');
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  getTypeFromMimetype,
  getTypeDir,
  ensureAssetDirs,
  safeFilename,
} = require('../config/assets');

ensureAssetDirs();

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const type = getTypeFromMimetype(file.mimetype);
    cb(null, getTypeDir(type));
  },
  filename(req, file, cb) {
    cb(null, safeFilename(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10,
  },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  },
});

router.post('/upload', authenticateToken, upload.array('files', 10), mediaController.uploadMedia);
router.get('/', authenticateToken, mediaController.getAllMedia);
router.delete('/delete', authenticateToken, mediaController.deleteMedia);

module.exports = router;
