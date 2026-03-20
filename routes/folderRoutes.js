const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');

module.exports = (io) => {
  const folderController = require('../controllers/folderController')(io);

  router.post('/', authenticateToken, folderController.createFolder);
  router.get('/', authenticateToken, folderController.getAllFolders);
  router.put('/:id', authenticateToken, folderController.updateFolder);
  router.delete('/:id', authenticateToken, folderController.deleteFolder);

  return router;
};
