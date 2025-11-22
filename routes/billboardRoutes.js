const express = require('express');
const router = express.Router();
const billboardController = require('../controllers/billboardController');

// GET routes
router.get('/', billboardController.getAllBillboards);
router.get('/approved', billboardController.getApprovedBillboards);
router.get('/pending', billboardController.getPendingBillboards);
router.get('/search', billboardController.searchBillboards);
router.get('/states', billboardController.getStates);
router.get('/city', billboardController.getCitiesByState);
router.get('/:id', billboardController.getBillboardById);

// POST routes
router.post('/', billboardController.createBillboard);

// PUT routes
router.put('/:id', billboardController.updateBillboard);
router.put('/:id/approve', billboardController.approveBillboard);
router.put('/:id/reject', billboardController.rejectBillboard);
router.put('/:id/resubmit', billboardController.resubmitBillboard);

// DELETE routes
router.delete('/:id', billboardController.deleteBillboard);

module.exports = router;


