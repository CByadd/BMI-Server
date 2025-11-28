const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Dashboard routes
router.get('/admin-dashboard-stats', adminController.getDashboardStats);
router.get('/admin-top-performers', adminController.getTopPerformers);

// BMI Analytics routes
router.get('/admin/bmi-stats', adminController.getBMIStats);
router.get('/admin/user-activity', adminController.getUserActivity);
router.get('/admin/weight-classification', adminController.getWeightClassification);

// Users management routes
router.get('/admin/users', adminController.getAllUsers);

module.exports = router;



