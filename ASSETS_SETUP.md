# Self-Hosted Asset Storage

Assets are uploaded by the Node.js backend and served by Nginx. No compression or transformation is applied; files are stored and served byte-for-byte.

## Environment

In `server/.env`:

```env
ASSETS_DIR=/var/www/assets
ASSET_BASE_URL=https://api.well2day.in/assets
```

- **ASSETS_DIR**: Directory on the server where uploaded files are stored. Subfolders `images/`, `videos/`, and `files/` are created automatically.
- **ASSET_BASE_URL**: Base URL for built asset links. In production, Nginx should serve this path from `ASSETS_DIR`.

## Nginx

Ensure Nginx serves static files at `https://api.well2day.in/assets/` from `/var/www/assets`:

```nginx
location /assets/ {
    alias /var/www/assets/;
    # optional: cache, CORS, etc.
}
```

## URL Format

Uploaded files get URLs like:

- `https://api.well2day.in/assets/images/<filename>`
- `https://api.well2day.in/assets/videos/<filename>`
- `https://api.well2day.in/assets/files/<filename>`

## Media Library

The admin Media library uses a `media` table (created automatically). List/delete use this table; uploads write to `ASSETS_DIR/<type>/` and insert a row.

## Logo / Flow-Drawer Images

Screen logos and flow-drawer images are saved under `ASSETS_DIR/images/` with names like `logo-<screenId>-<timestamp>.<ext>` and `flow-<screenId>-<slot>-<timestamp>.<ext>`.

## Default / Placeholder Logo

Place your app logo at `/var/www/assets/images/logo.png` so that `https://well2day.in/assets/img/Group%202325.png` works for the client and admin. You can also set `DEFAULT_ASSET_URL` in `.env` to any fallback image URL.
