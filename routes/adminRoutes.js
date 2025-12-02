const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Dashboard routes (require authentication)
router.get('/admin-dashboard-stats', authenticateToken, adminController.getDashboardStats);
router.get('/admin-top-performers', authenticateToken, adminController.getTopPerformers);

// BMI Analytics routes (require authentication)
router.get('/admin/bmi-stats', authenticateToken, adminController.getBMIStats);
router.get('/admin/user-activity', authenticateToken, adminController.getUserActivity);
router.get('/admin/weight-classification', authenticateToken, adminController.getWeightClassification);
router.get('/admin/users', authenticateToken, adminController.getAllUsers);

module.exports = router;



