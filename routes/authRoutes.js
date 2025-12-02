const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireSuperAdmin } = require('../middleware/authMiddleware');

// Public routes
router.post('/auth/login', authController.login);
router.get('/auth/me', authenticateToken, authController.getCurrentUser);

// Super admin only routes
router.post('/auth/admin/register', authenticateToken, requireSuperAdmin, authController.registerAdmin);
router.get('/auth/admins', authenticateToken, requireSuperAdmin, authController.getAllAdmins);
router.put('/auth/admin/:id', authenticateToken, requireSuperAdmin, authController.updateAdmin);
router.delete('/auth/admin/:id', authenticateToken, requireSuperAdmin, authController.deleteAdmin);
router.post('/auth/admin/:id/assign-screens', authenticateToken, requireSuperAdmin, authController.assignScreens);
router.get('/auth/admin/:id/screens', authenticateToken, requireSuperAdmin, authController.getAdminScreens);

module.exports = router;



