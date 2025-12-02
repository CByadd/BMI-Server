const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const multer = require('multer');
const { authenticateToken } = require('../middleware/authMiddleware');

// Configure multer to use memory storage (for Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 10 // Max 10 files at once
  },
  fileFilter: (req, file, cb) => {
    // Accept images and videos only
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

// Upload media files (require auth)
router.post('/upload', authenticateToken, upload.array('files', 10), mediaController.uploadMedia);

// Get all media files (require auth, filtered by role)
router.get('/', authenticateToken, mediaController.getAllMedia);

// Delete media file - use delete endpoint with publicId in body (require auth)
router.delete('/delete', authenticateToken, mediaController.deleteMedia);

module.exports = router;

