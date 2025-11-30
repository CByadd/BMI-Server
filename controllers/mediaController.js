const { PrismaClient } = require('@prisma/client');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (fileBuffer, folder, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: folder || 'bmi-media',
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
    };

    cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    ).end(fileBuffer);
  });
};

// Upload media files to Cloudinary
exports.uploadMedia = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const { name, tags } = req.body;
    const tagArray = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

    const uploadedMedia = [];

    // Upload each file to Cloudinary
    for (const file of req.files) {
      try {
        // Determine resource type (image or video)
        const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image';
        
        // Upload to Cloudinary
        const result = await uploadToCloudinary(file.buffer, 'bmi-media', resourceType);

        // Store media info in database (if you have a media table)
        // For now, we'll return the Cloudinary URLs
        const mediaItem = {
          id: uuidv4(),
          name: name || file.originalname,
          type: resourceType,
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
          size: result.bytes,
          duration: result.duration || null, // For videos
          tags: tagArray,
          createdAt: new Date().toISOString()
        };

        uploadedMedia.push(mediaItem);

        console.log(`[MEDIA] Uploaded ${file.originalname} to Cloudinary: ${result.secure_url}`);
      } catch (error) {
        console.error(`[MEDIA] Error uploading ${file.originalname}:`, error);
        // Continue with other files even if one fails
      }
    }

    if (uploadedMedia.length === 0) {
      return res.status(500).json({ error: 'Failed to upload any files' });
    }

    res.status(201).json({
      ok: true,
      media: uploadedMedia,
      message: `Successfully uploaded ${uploadedMedia.length} file(s)`
    });
  } catch (error) {
    console.error('[MEDIA] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
};

// Get all media files
exports.getAllMedia = async (req, res) => {
  try {
    const { type, search, tags } = req.query;

    // For now, return empty array since we're not storing in DB yet
    // You can implement database storage if needed
    // const media = await prisma.media.findMany({...});
    
    // Option 1: Fetch from Cloudinary API (if you want to list all uploaded files)
    // This requires Cloudinary Admin API
    // const result = await cloudinary.search.expression('folder:bmi-media').execute();
    
    // Option 2: Store media metadata in database and fetch from there
    // For now, return empty array
    res.json({
      ok: true,
      media: [],
      total: 0
    });
  } catch (error) {
    console.error('[MEDIA] Get media error:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
};

// Delete media from Cloudinary
exports.deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({ error: 'Public ID required' });
    }

    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'auto'
    });

    if (result.result === 'ok') {
      console.log(`[MEDIA] Deleted media from Cloudinary: ${publicId}`);
      res.json({
        ok: true,
        message: 'Media deleted successfully'
      });
    } else {
      res.status(404).json({ error: 'Media not found' });
    }
  } catch (error) {
    console.error('[MEDIA] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
};

