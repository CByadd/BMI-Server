const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Dashboard routes
router.get('/admin-dashboard-stats', adminController.getDashboardStats);
router.get('/admin-top-performers', adminController.getTopPerformers);

module.exports = router;


