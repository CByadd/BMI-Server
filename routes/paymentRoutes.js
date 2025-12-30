const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// GET /api/payment/key -> Get Razorpay key ID
router.get('/payment/key', paymentController.getKey);

// POST /api/payment/create-order -> Create Razorpay order
router.post('/payment/create-order', paymentController.createOrder);

// POST /api/payment/verify -> Verify payment signature
router.post('/payment/verify', paymentController.verifyPayment);

module.exports = router;



