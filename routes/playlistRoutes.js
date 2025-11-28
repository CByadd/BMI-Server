const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlistController');

// Playlist routes
router.get('/playlists', playlistController.getAllPlaylists);
router.get('/playlists/:id', playlistController.getPlaylistById);
router.post('/playlists', playlistController.createPlaylist);
router.put('/playlists/:id', playlistController.updatePlaylist);
router.delete('/playlists/:id', playlistController.deletePlaylist);

module.exports = router;





