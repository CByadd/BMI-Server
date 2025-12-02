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
const uploadToCloudinary = (fileBuffer, folder, resourceType = 'auto', additionalOptions = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: folder || 'well2day-media',
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
      ...additionalOptions, // Merge any additional options (tags, context, etc.)
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
    const adminId = req.user?.id; // Get admin ID from authenticated user

    // Add admin ID to tags so we can filter by creator
    if (adminId) {
      tagArray.push(`admin:${adminId}`);
    }

    const uploadedMedia = [];

    // Upload each file to Cloudinary
    for (const file of req.files) {
      try {
        // Determine resource type (image or video)
        const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image';
        
        // Upload to Cloudinary with admin ID in tags and context
        const additionalOptions = {
          tags: tagArray,
          context: adminId ? { admin_id: adminId } : undefined,
        };

        const result = await uploadToCloudinary(file.buffer, 'well2day-media', resourceType, additionalOptions);

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
    const adminId = req.user?.id;
    const userRole = req.user?.role;

    // Fetch from Cloudinary using Admin API
    try {
      // Build search expression - search in well2day-media folder and all subfolders
      // Cloudinary syntax: folder:well2day-media/* finds files in folder and all subfolders
      // folder:well2day-media (without /*) finds only files directly in the folder
      let expression = 'folder:well2day-media/*';
      
      // Filter by creator: super_admin sees all, regular admin sees only their own
      if (userRole !== 'super_admin' && adminId) {
        expression += ` AND tags:admin:${adminId}`;
      }
      
      // Also include legacy bmi-media folder if it exists
      // expression = '(folder:well2day-media/* OR folder:bmi-media/*)';
      
      if (type) {
        if (type === 'image') {
          expression += ' AND resource_type:image';
        } else if (type === 'video') {
          expression += ' AND resource_type:video';
        }
      }
      
      if (search) {
        expression += ` AND filename:*${search}*`;
      }
      
      if (tags && Array.isArray(tags)) {
        tags.forEach(tag => {
          // Don't add admin tag filter if it's already in the expression
          if (!tag.startsWith('admin:')) {
            expression += ` AND tags:${tag}`;
          }
        });
      } else if (tags && !tags.startsWith('admin:')) {
        expression += ` AND tags:${tags}`;
      }

      console.log('[MEDIA] Fetching media with expression:', expression);
      console.log('[MEDIA] Cloudinary config check:', {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME ? 'set' : 'missing',
        apiKey: process.env.CLOUDINARY_API_KEY ? 'set' : 'missing',
        apiSecret: process.env.CLOUDINARY_API_SECRET ? 'set' : 'missing'
      });
      
      // Use Cloudinary Admin API to search for resources
      // sort_by syntax: .sort_by('field_name', 'asc'|'desc')
      const result = await cloudinary.search
        .expression(expression)
        .sort_by('created_at', 'desc')
        .max_results(500)
        .execute();
      
      console.log('[MEDIA] Cloudinary search result:', {
        totalCount: result.total_count,
        resourcesFound: result.resources?.length || 0
      });

      // Transform Cloudinary results to match expected format
      const media = result.resources.map((resource) => {
        const isVideo = resource.resource_type === 'video';
        return {
          id: resource.public_id,
          publicId: resource.public_id,
          name: resource.filename || resource.public_id.split('/').pop() || 'Untitled',
          type: isVideo ? 'video' : 'image',
          resource_type: resource.resource_type,
          url: resource.secure_url,
          secure_url: resource.secure_url,
          format: resource.format,
          width: resource.width,
          height: resource.height,
          size: resource.bytes,
          duration: resource.duration || null, // For videos
          tags: resource.tags || [],
          createdAt: resource.created_at,
          updatedAt: resource.updated_at || resource.created_at
        };
      });

      console.log(`[MEDIA] Found ${media.length} media items`);
      
      res.json({
        ok: true,
        media: media,
        total: media.length
      });
    } catch (cloudinaryError) {
      console.error('[MEDIA] Cloudinary search error:', cloudinaryError);
      // If Cloudinary search fails, try to check if it's a permissions issue
      if (cloudinaryError.message && cloudinaryError.message.includes('401')) {
        console.error('[MEDIA] Cloudinary authentication failed. Check API credentials.');
        return res.status(500).json({ 
          error: 'Cloudinary authentication failed',
          details: 'Check API credentials in environment variables'
        });
      }
      // Return empty array if search fails (might be permissions issue)
      res.json({
        ok: true,
        media: [],
        total: 0,
        warning: 'Could not fetch from Cloudinary. Check API credentials.'
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
    const { publicId, resourceType } = req.body;
    const adminId = req.user?.id;
    const userRole = req.user?.role;

    if (!publicId) {
      return res.status(400).json({ error: 'Public ID required' });
    }

    // Check if user has permission to delete this media
    // Super admin can delete any, regular admin can only delete their own
    if (userRole !== 'super_admin' && adminId) {
      try {
        // Get resource details from Cloudinary to check tags
        const resource = await cloudinary.api.resource(publicId, {
          resource_type: resourceType || 'image'
        });
        
        // Check if the media has the admin tag
        const hasAdminTag = resource.tags && resource.tags.some(tag => tag === `admin:${adminId}`);
        if (!hasAdminTag) {
          return res.status(403).json({ error: 'You can only delete media files you uploaded' });
        }
      } catch (checkError) {
        console.error('[MEDIA] Error checking media ownership:', checkError);
        // If we can't verify, deny access for safety
        return res.status(403).json({ error: 'Unable to verify media ownership' });
      }
    }
    
    // Determine resource type from publicId or use provided type
    // Check if publicId contains video-related paths or extensions
    let finalResourceType = resourceType || 'image';
    if (!resourceType) {
      // Try to determine from publicId path
      if (publicId.toLowerCase().includes('/videos/') || 
          publicId.toLowerCase().endsWith('.mp4') || 
          publicId.toLowerCase().endsWith('.mov') ||
          publicId.toLowerCase().endsWith('.avi')) {
        finalResourceType = 'video';
      } else {
        finalResourceType = 'image';
      }
    }
    
    console.log('[MEDIA] Deleting media with publicId:', publicId, 'resourceType:', finalResourceType);

    // Delete from Cloudinary - must specify resource_type explicitly
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: finalResourceType
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

