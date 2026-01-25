# Nginx config for Socket.IO (VPS / unmanaged Nginx)

If the app runs behind Nginx and `[SOCKET_STATUS] Connections established: NO` never changes, Nginx is likely not forwarding WebSocket traffic. Socket.IO uses the path **`/socket.io/`** and needs **HTTP/1.1** and **Upgrade / Connection** headers.

## 1. App and Socket.IO

- App listens on `http://127.0.0.1:PORT` (e.g. `PORT=4000`).
- Socket.IO is on the **same server** at path **`/socket.io/`** (default).

## 2. Nginx: proxy with WebSocket support

Use one of the following, depending on how you proxy the app.

### Option A – Single `location /` (app + Socket.IO on same origin)

If your API and Socket.IO are both under the same domain/path (e.g. `https://api.example.com/` and `https://api.example.com/socket.io/`):

```nginx
location / {
    proxy_pass http://127.0.0.1:4000;   # use your PORT

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Longer timeouts for WebSocket / Socket.IO
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}
```

### Option B – Separate `location` for Socket.IO

If you already have a `location /` for the API and want a dedicated block for Socket.IO:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:4000;   # use your PORT

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}

# Your existing API location
location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Replace `4000` with your app’s `PORT` if different.

### Option C – api.well2day.in (SSL + map for Connection)

Recommended pattern when using HTTPS and a dedicated Socket.IO location. The `map` sets `Connection: upgrade` only when the client sends `Upgrade`, otherwise `close` (keeps non-WebSocket requests clean).

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl http2;
    server_name api.well2day.in;

    ssl_certificate /etc/letsencrypt/live/api.well2day.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.well2day.in/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Socket.IO (WebSocket)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # REST API
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.well2day.in;
    return 301 https://$host$request_uri;
}
```

The `map` must live in the `http` context (e.g. top of the file or inside `http { }`), not inside `server`. Changes vs a minimal setup: `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` in `/socket.io/` (for logging and any app logic that needs them), and `proxy_send_timeout 86400` for long-lived writes.

## 3. Reload Nginx

After editing the config (e.g. under `/etc/nginx/sites-available/` or `/etc/nginx/conf.d/`):

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Client URL

Clients must connect to the **same host and scheme** they use for the API, e.g.:

- `https://api.well2day.in` → Socket.IO client base URL: `https://api.well2day.in`
- The client library will then use `https://api.well2day.in/socket.io/` internally.

If the client uses a different origin than the one Nginx exposes, connections can be blocked by CORS or fail entirely.

## 5. Quick checks

- From the VPS: `curl -i http://127.0.0.1:4000/socket.io/?EIO=4&transport=polling` should return HTTP 200 and a body (Socket.IO handshake).
- From outside: same URL but with your public host and scheme; Nginx must proxy it to the app and preserve the path.
