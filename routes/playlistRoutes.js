const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlistController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Playlist routes (require auth, filtered by role)
router.get('/playlists', authenticateToken, playlistController.getAllPlaylists);
router.get('/playlists/:id', authenticateToken, playlistController.getPlaylistById);
router.post('/playlists', authenticateToken, playlistController.createPlaylist);
router.put('/playlists/:id', authenticateToken, playlistController.updatePlaylist);
router.delete('/playlists/:id', authenticateToken, playlistController.deletePlaylist);

module.exports = router;

















