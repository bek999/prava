# prava

## Deploy model

- `docs/` is frontend for GitHub Pages.
- Backend API (`server.js`) must be deployed as a separate service.

## Frontend config

Set your backend URL in [docs/config.js](/d:/dev/antigravity/prava1/docs/config.js):

```js
window.APP_CONFIG = {
    API_BASE_URL: 'https://your-backend.example.com'
};
```

If empty, frontend will use same-origin `/api` (local combined setup).

## Backend env vars

- `PORT` (provided by host)
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `CORS_ORIGIN` (comma-separated origins), example:
  - `https://username.github.io`
  - `https://username.github.io,https://custom-domain.com`

Run backend:

```bash
npm start
```
