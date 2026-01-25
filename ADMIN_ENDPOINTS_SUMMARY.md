# Admin Panel Endpoints - Server Project

All admin panel endpoints have been created in the `server` project. The admin panel should now connect to the `server` instead of `Adscape-Server`.

## Base URL

```
http://localhost:4000
```

Or your production server URL.

## Created Routes and Controllers

### 1. Dashboard Routes (`routes/adminRoutes.js`)
- `GET /api/admin-dashboard-stats` - Get dashboard statistics
- `GET /api/admin-top-performers` - Get top performing billboards

### 2. Screen Registration Routes (`routes/screenRoutes.js`)
- `POST /api/adscape/register` - Register or update a screen/player
- `GET /api/adscape/player/:screenId` - Get player by screenId
- `GET /api/adscape/players` - Get all players
- `PUT /api/adscape/player/:screenId/flow-type` - Update player flow type
- `DELETE /api/adscape/player/:screenId` - Delete player

### 3. Billboard Management Routes (`routes/billboardRoutes.js`)
- `GET /api/billboards` - Get all billboards
- `GET /api/billboards/approved` - Get approved billboards (public)
- `GET /api/billboards/pending` - Get pending billboards
- `GET /api/billboards/search` - Search billboards
- `GET /api/billboards/states` - Get states with approved billboards
- `GET /api/billboards/city` - Get cities by state
- `GET /api/billboards/:id` - Get billboard by ID
- `POST /api/billboards` - Create new billboard
- `PUT /api/billboards/:id` - Update billboard
- `PUT /api/billboards/:id/approve` - Approve billboard
- `PUT /api/billboards/:id/reject` - Reject billboard
- `PUT /api/billboards/:id/resubmit` - Resubmit billboard
- `DELETE /api/billboards/:id` - Delete billboard

### 4. Campaign/Booking Routes (`routes/campaignRoutes.js`)
- `POST /api/create-campaign` - Create new campaign/booking (with file upload)
- `GET /api/campaigns` - Get campaigns by user
- `GET /api/campaignsu` - Get all campaigns (admin view)
- `GET /api/campaignsuz` - Get campaigns by user email (billboard owner view)
- `GET /api/campaigns/:id` - Get campaign by ID
- `GET /api/campaigns/:id/with-billboard-statuses` - Get campaign with billboard statuses
- `PUT /api/campaigns/:id/status` - Update campaign status
- `PUT /api/campaigns/:campaignId/billboards/:billboardId/status` - Update billboard status in campaign
- `PUT /api/update-campaign-name` - Update campaign name
- `DELETE /api/campaigns/:id` - Delete campaign
- `DELETE /api/campaigns/:campaignId/billboards/:billboardId` - Delete billboard from campaign

### 5. Slot Routes (`routes/slotRoutes.js`)
- `GET /api/slota` - Get all slots
- `GET /api/slotz` - Get slots by billboard
- `GET /api/assets/:screen_id` - Get assets by screen ID
- `POST /api/track-play` - Track asset play
- `GET /api/asset-logs` - Get asset logs

### 6. Publisher Registration Routes (`routes/registrationRoutes.js`)
- `POST /api/registrations` - Submit publisher registration (with file upload)
- `GET /api/registrations` - Get all registrations (admin only)
- `GET /api/registrations/:id` - Get registration by ID
- `PUT /api/registrations/:id/approve` - Approve registration
- `PUT /api/registrations/:id/reject` - Reject registration
- `GET /api/registrations/status/:email` - Get registration status by email

## Implementation Notes

1. **Database Queries**: All endpoints use Prisma's `$queryRaw` to work with existing database tables that may not be in the Prisma schema.

2. **File Uploads**: 
   - Campaign creation supports file uploads via `multer`
   - Registration supports document uploads
   - Files are currently stored with placeholder URLs - in production, upload to local assets (ASSET_BASE_URL) or S3

3. **Slot Generation**: 
   - Slots are automatically generated when campaigns are created
   - The slot generation logic is simplified - in production, use the full slot generator from Adscape-Server

4. **Authentication**: 
   - Currently, endpoints don't have authentication middleware
   - Add authentication middleware as needed (JWT tokens, role-based access, etc.)

## Dependencies Added

- `multer` - For file uploads

## Next Steps

1. **Install Dependencies**: Run `npm install` in the server directory
2. **Add Authentication**: Implement JWT authentication middleware
3. **File Upload**: Uses local asset storage at ASSETS_DIR; Nginx serves at ASSET_BASE_URL
4. **Slot Generation**: Implement full slot generation logic
5. **Error Handling**: Enhance error handling and validation
6. **Testing**: Test all endpoints with the admin panel

## Route Mounting

All routes are mounted in `server/index.js`:
```javascript
app.use('/api', adminRoutes);
app.use('/api', screenRoutes);
app.use('/api/billboards', billboardRoutes);
app.use('/api', campaignRoutes);
app.use('/api', slotRoutes);
app.use('/api/registrations', registrationRoutes);
```

## Admin Panel Configuration

Update the admin panel's API base URL to point to the server:
```javascript
const API_BASE_URL = 'http://localhost:4000'; // or your production URL
```



