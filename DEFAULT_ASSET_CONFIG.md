# Default Asset Configuration

## Overview
The default asset is displayed when:
- The screen is disabled (`isEnabled = false`)
- No regular assets are available for the day
- As slot 9 in the asset rotation (after slots 1-8)

## Configuration

### Option 1: Environment Variable (Recommended)
Set the `DEFAULT_ASSET_URL` environment variable in your `.env` file:

```env
DEFAULT_ASSET_URL=https://your-cdn.com/path/to/default-asset.jpg
```

The default asset endpoint (`GET /api/default-asset`) will return this URL.

### Option 2: Database Configuration (Future)
In the future, you can store default asset configuration in the database:
- Create a `default_assets` table
- Store asset URL, name, type, duration, etc.
- Update `defaultAssetController.js` to fetch from database

### Option 3: Direct Code Modification
Edit `server/controllers/defaultAssetController.js`:

```javascript
const defaultAsset = {
    id: 1,
    assetUrl: 'https://your-cdn.com/path/to/default-asset.jpg', // Change this
    assetName: 'Default Asset',
    assetType: 'image', // 'image' or 'video'
    duration: 10, // seconds
    isActive: true
};
```

## Endpoints

### Get Default Asset
```
GET /api/default-asset
```

Response:
```json
{
    "success": true,
    "defaultAsset": {
        "id": 1,
        "assetUrl": "https://...",
        "assetName": "Default Asset",
        "assetType": "image",
        "duration": 10,
        "isActive": true
    }
}
```

### Check for Updates
```
GET /api/default-asset/check-update?lastUpdate=2024-01-01T00:00:00Z
```

Response:
```json
{
    "success": true,
    "hasUpdate": true,
    "defaultAsset": { ... }
}
```

## Android App Behavior

1. On app startup, the Android app calls `GET /api/default-asset`
2. The asset is downloaded and cached locally as `default-asset` file
3. The app checks for updates every 5 minutes
4. If the server is unreachable, the app uses the cached version

## Asset Requirements

- **Format**: Image (JPG, PNG) or Video (MP4)
- **Recommended Size**: 1920x1080 (Full HD) or match your screen resolution
- **Duration**: For images, this is the display duration in seconds (default: 10)
- **File Size**: Keep under 10MB for faster downloads

## Testing

1. Set `DEFAULT_ASSET_URL` in `.env`
2. Restart the server
3. Test the endpoint: `curl http://localhost:4000/api/default-asset`
4. The Android app should download and display the asset












