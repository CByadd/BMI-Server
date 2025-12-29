const express = require('express');
const router = express.Router();
const otpController = require('../controllers/otpController');

// Public routes - no authentication required
router.post('/otp/generate', otpController.generateOTP);
router.post('/otp/verify', otpController.verifyOTP);

module.exports = router;

