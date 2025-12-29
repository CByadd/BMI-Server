# Asset Cleanup and Payment Configuration

## Overview
This document describes two new features:
1. **Automatic Asset Deletion System** - Automatically deletes assets older than a configured retention period
2. **Per-Screen Payment Amount Configuration** - Configure individual payment amounts for each screen

---

## 1. Automatic Asset Deletion System

### Configuration
The asset retention period can be configured via environment variable in `server/.env`:

```env
ASSET_RETENTION_DAYS=30
```

Default: 30 days if not specified

### How It Works

#### Server-Side
- **Service**: `server/services/assetCleanupService.js`
- **API Endpoints**:
  - `POST /api/assets/cleanup` - Manually trigger asset cleanup
    - Body: `{ "directoryPath": "/path/to/assets", "retentionDays": 30 }`
  - `GET /api/assets/stats` - Get asset statistics
    - Query: `?directoryPath=/path/to/assets&retentionDays=30`
- **Scheduled Task**: Runs automatically every 24 hours (can be configured)

#### Android App
- **Function**: `Repository.cleanupOldAssets(context, retentionDays)`
- **Automatic Cleanup**: 
  - Runs 1 hour after app startup
  - Then runs every 24 hours
  - Deletes assets older than the retention period based on file modification time
- **Location**: Assets stored in `context.filesDir` with names like:
  - `asset-{slotNumber}` (today's assets)
  - `asset-{slotNumber}-{date}` (future-dated assets)
  - `default-asset` (default asset)

### Usage

#### Manual Cleanup (Server)
```bash
curl -X POST http://your-server/api/assets/cleanup \
  -H "Content-Type: application/json" \
  -d '{"directoryPath": "/path/to/assets", "retentionDays": 30}'
```

#### Get Asset Statistics
```bash
curl "http://your-server/api/assets/stats?directoryPath=/path/to/assets&retentionDays=30"
```

#### Android App
The cleanup runs automatically. To manually trigger:
```kotlin
val (deleted, errors) = Repository.cleanupOldAssets(context, 30)
```

---

## 2. Per-Screen Payment Amount Configuration

### Database Schema
Added `paymentAmount` field to `AdscapePlayer` model:
```prisma
paymentAmount Float? // Payment amount in currency (e.g., 9.0 for ₹9)
```

### Admin Panel Configuration
1. Navigate to Screens page
2. Click "Edit" on any screen
3. Find "Payment Amount (₹)" field in the edit modal
4. Enter the desired payment amount (leave empty for default ₹9)
5. Save changes

### Web Client Display
- The payment page automatically fetches the configured payment amount for the screen
- If no amount is configured, defaults to ₹9
- The amount is displayed in:
  - Payment card header
  - Payment button text

### API Changes

#### Get Player (includes paymentAmount)
```
GET /api/adscape/player/:screenId
Response: {
  "ok": true,
  "player": {
    ...
    "paymentAmount": 9.0, // or null if not configured
    ...
  }
}
```

#### Update Screen Config (save paymentAmount)
```
PUT /api/adscape/player/:screenId/config
Body: {
  "paymentAmount": 10.0, // or null to clear
  ...
}
```

### Implementation Details

#### Server
- `server/prisma/schema.prisma` - Added `paymentAmount` field
- `server/controllers/screenController.js`:
  - `getPlayer()` - Fetches and returns `paymentAmount`
  - `updateScreenConfig()` - Handles saving `paymentAmount` (with raw SQL for compatibility)

#### Admin Panel
- `admin/src/components/screens/EditScreenModal.tsx`:
  - Added payment amount input field
  - Loads current payment amount on modal open
  - Saves payment amount on form submit

#### Web Client
- `client/src/pages/PaymentPage.jsx`:
  - Fetches payment amount from server on mount
  - Displays configured amount or defaults to ₹9
  - Updates button text dynamically

---

## Migration Notes

### Database Migration
Run Prisma migration to add the `paymentAmount` column:
```bash
cd server
npx prisma db push
```

Or manually add the column:
```sql
ALTER TABLE "AdscapePlayer" 
ADD COLUMN IF NOT EXISTS "paymentAmount" DOUBLE PRECISION;
```

### Environment Variables
Add to `server/.env`:
```env
ASSET_RETENTION_DAYS=30
```

---

## Testing

### Test Asset Cleanup
1. Create test assets with old modification dates
2. Call cleanup API or wait for scheduled task
3. Verify old assets are deleted

### Test Payment Amount Configuration
1. Edit a screen in admin panel
2. Set a custom payment amount (e.g., ₹15)
3. Visit payment page for that screen
4. Verify the configured amount is displayed
5. Test with empty amount (should default to ₹9)

---

## Notes
- Asset cleanup uses file modification time (mtime) to determine age
- Payment amount is optional - if null, defaults to ₹9
- Asset cleanup runs automatically on Android devices every 24 hours
- Server-side cleanup can be triggered manually via API


