const express = require('express');
const router = express.Router();
const screenController = require('../controllers/screenController');

// Export a function that accepts io for real-time updates
module.exports = (io) => {
    // Update player status (last seen, isActive) - legacy endpoint for Android app
    router.post('/players/update-status', screenController.updatePlayerStatus);
    
    // Register or update an Adscape player
    router.post('/adscape/register', screenController.registerPlayer);

    // Get a specific player by screenId
    router.get('/adscape/player/:screenId', screenController.getPlayer);

    // Get player by registration code (8-digit)
    router.get('/adscape/player-by-code/:code', screenController.getPlayerByCode);

    // Get all players
    router.get('/adscape/players', screenController.getAllPlayers);

    // Update player flow type (with real-time notification)
    router.put('/adscape/player/:screenId/flow-type', (req, res) => 
        screenController.updateFlowType(req, res, io)
    );

    // Update screen configuration (name, address, location, flowType, isEnabled)
    router.put('/adscape/player/:screenId/config', (req, res) => 
        screenController.updateScreenConfig(req, res, io)
    );

    // Delete a player
    router.delete('/adscape/player/:screenId', screenController.deletePlayer);

    return router;
};



