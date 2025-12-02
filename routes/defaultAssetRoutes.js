const express = require('express');
const router = express.Router();
const defaultAssetController = require('../controllers/defaultAssetController');

// Get default asset
router.get('/default-asset', defaultAssetController.getDefaultAsset);

// Check for default asset updates
router.get('/default-asset/check-update', defaultAssetController.checkDefaultAssetUpdate);

module.exports = router;



















