const express = require('express');
const router = express.Router();
const bmiFlowController = require('../controllers/bmiFlowController');

// Export a function that accepts io
module.exports = (io) => {
    // POST /api/bmi -> Create BMI record
    router.post('/bmi', (req, res) => bmiFlowController.createBMI(req, res, io));

    // OTP endpoints
    router.post('/otp/generate', bmiFlowController.generateOTP);
    router.post('/otp/validate', bmiFlowController.validateOTP);

    // POST /api/user -> Create or find user (DEPRECATED - Use OTP flow)
    router.post('/user', bmiFlowController.createUser);

    // POST /api/payment-success -> Link user to BMI and emit to Android
    router.post('/payment-success', (req, res) => bmiFlowController.paymentSuccess(req, res, io));

    // POST /api/progress-start -> Emit progress start to both web and Android
    router.post('/progress-start', (req, res) => bmiFlowController.progressStart(req, res, io));

    // POST /api/fortune-generate -> Generate fortune and emit to both web and Android
    router.post('/fortune-generate', (req, res) => bmiFlowController.fortuneGenerate(req, res, io));

    // GET /api/user/:userId/analytics -> Return user analytics data
    router.get('/user/:userId/analytics', bmiFlowController.getUserAnalytics);

    // POST /api/bmi/:id/link-user -> Link BMI record to user
    router.post('/bmi/:id/link-user', bmiFlowController.linkUserToBMI);

    // GET /api/bmi/:id -> Return stored payload
    router.get('/bmi/:id', bmiFlowController.getBMI);

    // GET /api/debug/connections -> Debug socket connections
    router.get('/debug/connections', (req, res) => bmiFlowController.debugConnections(req, res, io));

    return router;
};



