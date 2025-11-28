const prisma = require('../db');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');

// Configure Cloudinary
const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
};

// Validate Cloudinary configuration
const isCloudinaryConfigured = () => {
  return cloudinaryConfig.cloud_name && 
         cloudinaryConfig.api_key && 
         cloudinaryConfig.api_secret &&
         cloudinaryConfig.cloud_name !== 'your_cloud_name_here';
};

if (isCloudinaryConfigured()) {
  cloudinary.config(cloudinaryConfig);
  const mediaFolder = process.env.CLOUDINARY_MEDIA_FOLDER || 'well2day-media';
  console.log('[CLOUDINARY] Configuration loaded successfully');
  console.log(`[CLOUDINARY] Media folder: ${mediaFolder} (images: ${mediaFolder}/images, videos: ${mediaFolder}/videos)`);
} else {
  console.warn('[CLOUDINARY] Configuration missing. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env file');
}

// Get media folder from environment or use default
const getMediaFolder = (resourceType = 'auto') => {
  const baseFolder = process.env.CLOUDINARY_MEDIA_FOLDER || 'well2day-media';
  // Organize by type: well2day-media/images or well2day-media/videos
  const typeFolder = resourceType === 'video' ? 'videos' : 'images';
  return `${baseFolder}/${typeFolder}`;
};

// Helper function to upload to Cloudinary
const uploadToCloudinary = (fileBuffer, folder, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: folder || getMediaFolder(resourceType),
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
    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured()) {
      return res.status(500).json({ 
        error: 'Cloudinary not configured', 
        message: 'Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env file' 
      });
    }

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
        
        // Get the appropriate folder for this media type
        const mediaFolder = getMediaFolder(resourceType);
        
        // Upload to Cloudinary
        const result = await uploadToCloudinary(file.buffer, mediaFolder, resourceType);

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

        console.log(`[MEDIA] Uploaded ${file.originalname} to Cloudinary folder: ${mediaFolder}`);
        console.log(`[MEDIA] URL: ${result.secure_url}`);
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
    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured()) {
      return res.json({
        ok: true,
        media: [],
        total: 0
      });
    }

    const { type, search, tags } = req.query;
    const baseFolder = process.env.CLOUDINARY_MEDIA_FOLDER || 'well2day-media';
    
    // Fetch from Cloudinary using Admin API
    try {
      // Build search expression
      let expression = `folder:${baseFolder}/*`;
      
      // Filter by type if specified
      if (type === 'image') {
        expression = `folder:${baseFolder}/images/* AND resource_type:image`;
      } else if (type === 'video') {
        expression = `folder:${baseFolder}/videos/* AND resource_type:video`;
      }
      
      // Execute search - Note: sort_by removed due to SDK serialization issue
      // We'll sort the results in JavaScript instead
      const result = await cloudinary.search
        .expression(expression)
        .max_results(500)
        .execute();
      
      console.log('[MEDIA] Cloudinary search result:', result.total_count, 'items found');
      
      // Transform Cloudinary results to our media format
      let media = result.resources.map((resource) => {
        const folderParts = resource.folder ? resource.folder.split('/') : [];
        const mediaType = folderParts.length > 0 && folderParts[folderParts.length - 1] === 'videos' ? 'video' : 'image';
        
        // Use a URL-safe ID (encode the public_id to avoid path issues)
        const safeId = encodeURIComponent(resource.public_id);
        
        return {
          id: safeId, // URL-encoded public_id for use in routes
          name: resource.filename || resource.public_id.split('/').pop(),
          type: mediaType,
          url: resource.secure_url,
          publicId: resource.public_id, // Original public_id for Cloudinary operations
          format: resource.format,
          width: resource.width,
          height: resource.height,
          size: resource.bytes,
          duration: resource.duration || null, // For videos
          tags: resource.tags || [],
          createdAt: resource.created_at,
          uploadDate: new Date(resource.created_at).toISOString().split('T')[0]
        };
      });
      
      // Sort by created_at descending (newest first)
      media = media.sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      // Apply search filter if provided
      let filteredMedia = media;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredMedia = media.filter((item) => 
          item.name.toLowerCase().includes(searchLower) ||
          item.tags.some((tag) => tag.toLowerCase().includes(searchLower))
        );
      }
      
      // Apply tag filter if provided
      if (tags) {
        const tagArray = tags.split(',').map(t => t.trim().toLowerCase());
        filteredMedia = filteredMedia.filter((item) =>
          item.tags.some((tag) => tagArray.includes(tag.toLowerCase()))
        );
      }
      
      res.json({
        ok: true,
        media: filteredMedia,
        total: filteredMedia.length
      });
    } catch (cloudinaryError) {
      console.error('[MEDIA] Cloudinary search error:', cloudinaryError);
      // If Cloudinary search fails, return empty array
      res.json({
        ok: true,
        media: [],
        total: 0
      });
    }
  } catch (error) {
    console.error('[MEDIA] Get media error:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
};

// Delete media from Cloudinary
exports.deleteMedia = async (req, res) => {
  try {
    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured()) {
      return res.status(500).json({ 
        error: 'Cloudinary not configured', 
        message: 'Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env file' 
      });
    }

    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({ error: 'Public ID required in request body' });
    }

    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(actualPublicId, {
      resource_type: 'auto'
    });

    if (result.result === 'ok') {
      console.log(`[MEDIA] Deleted media from Cloudinary: ${actualPublicId}`);
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

