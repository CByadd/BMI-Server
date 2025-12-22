const express = require('express');
const playlistController = require('../controllers/playlistController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Export router factory function that accepts io
module.exports = (io) => {
    const router = express.Router();
    
    // Playlist routes (require auth, filtered by role)
    router.get('/playlists', authenticateToken, playlistController.getAllPlaylists);
    router.get('/playlists/:id', authenticateToken, playlistController.getPlaylistById);
    router.post('/playlists', authenticateToken, (req, res) => playlistController.createPlaylist(req, res, io));
    router.put('/playlists/:id', authenticateToken, (req, res) => playlistController.updatePlaylist(req, res, io));
    router.delete('/playlists/:id', authenticateToken, (req, res) => playlistController.deletePlaylist(req, res, io));
    
    return router;
};

















