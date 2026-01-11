const express = require('express');
const router = express.Router();
const slotController = require('../controllers/slotController');

// Slot routes
router.get('/slota', slotController.getAllSlots);
router.get('/slotz', slotController.getSlotsByBillboard);

// Asset routes
router.get('/assets/:screen_id', slotController.getAssetsByScreen);

module.exports = router;



