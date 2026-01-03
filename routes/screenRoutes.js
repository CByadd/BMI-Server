const express = require('express');
const router = express.Router();
const screenController = require('../controllers/screenController');
const { authenticateToken, checkScreenAccess } = require('../middleware/authMiddleware');
const multer = require('multer');

// Configure multer for logo uploads (memory storage for Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size for logos
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Export a function that accepts io for real-time updates
module.exports = (io) => {
    // Update player status (last seen, isActive) - legacy endpoint for Android app (no auth for Android)
    router.post('/players/update-status', screenController.updatePlayerStatus);
    
    // Register or update an Adscape player (no auth for Android)
    router.post('/adscape/register', screenController.registerPlayer);

    // Get a specific player by screenId (no auth for Android app to check own flow type)
    router.get('/adscape/player/:screenId', screenController.getPlayer);

    // Get player by registration code (8-digit) - no auth for Android
    router.get('/adscape/player-by-code/:code', screenController.getPlayerByCode);

    // Get all players (require auth, filtered by role)
    router.get('/adscape/players', authenticateToken, screenController.getAllPlayers);

    // Update player flow type (with real-time notification, require auth and screen access)
    router.put('/adscape/player/:screenId/flow-type', authenticateToken, checkScreenAccess, (req, res) => 
        screenController.updateFlowType(req, res, io)
    );

    // Upload logo for screen (require auth and screen access)
    router.post('/adscape/player/:screenId/logo', authenticateToken, checkScreenAccess, upload.single('logo'), (req, res) => 
        screenController.uploadLogo(req, res)
    );

    // Get logo for screen (no auth required for Android app)
    router.get('/adscape/player/:screenId/logo', screenController.getLogo);

    // Delete logo for screen (require auth and screen access)
    router.delete('/adscape/player/:screenId/logo', authenticateToken, checkScreenAccess, screenController.deleteLogo);

    // Upload flow drawer image for screen (require auth and screen access)
    router.post('/adscape/player/:screenId/flow-drawer-image/:imageNumber', authenticateToken, checkScreenAccess, upload.single('image'), (req, res) => 
        screenController.uploadFlowDrawerImage(req, res)
    );

    // Get flow drawer images for screen (no auth required for Android app)
    router.get('/adscape/player/:screenId/flow-drawer-images', screenController.getFlowDrawerImages);

    // Delete flow drawer image for screen (require auth and screen access)
    router.delete('/adscape/player/:screenId/flow-drawer-image/:imageNumber', authenticateToken, checkScreenAccess, screenController.deleteFlowDrawerImage);

    // Update screen configuration (require auth and screen access)
    router.put('/adscape/player/:screenId/config', authenticateToken, checkScreenAccess, (req, res) => 
        screenController.updateScreenConfig(req, res, io)
    );

    // Delete a player (require auth and screen access)
    router.delete('/adscape/player/:screenId', authenticateToken, checkScreenAccess, screenController.deletePlayer);

    return router;
};



