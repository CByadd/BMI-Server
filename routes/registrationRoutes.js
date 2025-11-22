const express = require('express');
const router = express.Router();
const registrationController = require('../controllers/registrationController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/registrations';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Create registration (no auth required)
router.post('/', upload.fields([
  { name: 'documents[idProof]', maxCount: 1 },
  { name: 'documents[addressProof]', maxCount: 1 },
  { name: 'documents[businessLicense]', maxCount: 1 },
  { name: 'documents[bankStatement]', maxCount: 1 },
  { name: 'documents[gstCertificate]', maxCount: 1 }
]), registrationController.createRegistration);

// Get all registrations (admin only)
router.get('/', registrationController.getAllRegistrations);

// Get registration by ID
router.get('/:id', registrationController.getRegistrationById);

// Approve registration
router.put('/:id/approve', registrationController.approveRegistration);

// Reject registration
router.put('/:id/reject', registrationController.rejectRegistration);

// Get registration status by email
router.get('/status/:email', registrationController.getRegistrationStatus);

module.exports = router;



