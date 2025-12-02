const express = require('express');
const router = express.Router();
const screenController = require('../controllers/screenController');
const { authenticateToken, checkScreenAccess } = require('../middleware/authMiddleware');

// Export a function that accepts io for real-time updates
module.exports = (io) => {
    // Update player status (last seen, isActive) - legacy endpoint for Android app (no auth for Android)
    router.post('/players/update-status', screenController.updatePlayerStatus);
    
    // Register or update an Adscape player (no auth for Android)
    router.post('/adscape/register', screenController.registerPlayer);

    // Get a specific player by screenId (require auth and screen access)
    router.get('/adscape/player/:screenId', authenticateToken, checkScreenAccess, screenController.getPlayer);

    // Get player by registration code (8-digit) - no auth for Android
    router.get('/adscape/player-by-code/:code', screenController.getPlayerByCode);

    // Get all players (require auth, filtered by role)
    router.get('/adscape/players', authenticateToken, screenController.getAllPlayers);

    // Update player flow type (with real-time notification, require auth and screen access)
    router.put('/adscape/player/:screenId/flow-type', authenticateToken, checkScreenAccess, (req, res) => 
        screenController.updateFlowType(req, res, io)
    );

    // Update screen configuration (require auth and screen access)
    router.put('/adscape/player/:screenId/config', authenticateToken, checkScreenAccess, (req, res) => 
        screenController.updateScreenConfig(req, res, io)
    );

    // Delete a player (require auth and screen access)
    router.delete('/adscape/player/:screenId', authenticateToken, checkScreenAccess, screenController.deletePlayer);

    return router;
};



