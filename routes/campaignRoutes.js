const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 20
  }
});

module.exports = (io) => {
  const campaignController = require('../controllers/campaignController')(io);

  // Campaign creation with file upload
  router.post('/create-campaign', upload.array('files'), campaignController.createCampaign);

  // Get campaigns
  router.get('/campaigns', campaignController.getCampaignsByUser);
  router.get('/campaignsu', campaignController.getAllCampaigns);
  router.get('/campaignsuz', campaignController.getCampaignsByUserEmail);
  router.get('/campaigns/:id', campaignController.getCampaignById);
  router.get('/campaigns/:id/with-billboard-statuses', campaignController.getCampaignWithBillboardStatuses);

  // Update campaign
  router.put('/campaigns/:id/status', campaignController.updateCampaignStatus);
  router.put('/campaigns/:campaignId/billboards/:billboardId/status', campaignController.updateBillboardStatus);
  router.put('/update-campaign-name', campaignController.updateCampaignName);

  // Delete campaign
  router.delete('/campaigns/:id', campaignController.deleteCampaign);
  router.delete('/campaigns/:campaignId/billboards/:billboardId', campaignController.deleteBillboardFromCampaign);

  return router;
};



