const express = require('express');
const router = express.Router();
const screenController = require('../controllers/screenController');

// Register or update an Adscape player
router.post('/adscape/register', screenController.registerPlayer);

// Get a specific player by screenId
router.get('/adscape/player/:screenId', screenController.getPlayer);

// Get all players
router.get('/adscape/players', screenController.getAllPlayers);

// Update player flow type
router.put('/adscape/player/:screenId/flow-type', screenController.updateFlowType);

// Delete a player
router.delete('/adscape/player/:screenId', screenController.deletePlayer);

module.exports = router;


