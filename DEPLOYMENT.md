# Deployment Guide

## Quick Deployment Checklist

### Server (Railway - Auto-Deploy)
- ✅ Connected to GitHub repository
- ✅ Auto-deploys on push to `main` branch
- Railway URL: `https://improv-score-production.up.railway.app`
- No manual steps needed - just push to GitHub

### Client (FTP Deployment)

1. **Set Environment Variable**
   - File: `client/.env.production`
   - Content: `VITE_SERVER_URL=https://improv-score-production.up.railway.app`

2. **Build Client**
   ```bash
   cd client
   npm run build
   ```

3. **Upload to FTP**
   - FTP Server: clarkerobinsondesign.com
   - Remote Path: `/improvScore/`
   - Upload all contents of `client/build/` directory
   - Use FileZilla or similar FTP client

## Full Deployment Process

### Step 1: Deploy Server Changes
```bash
cd digital-score
git add .
git commit -m "Your commit message"
git push origin main
```
Railway will automatically detect the push and deploy.

### Step 2: Build and Deploy Client
```bash
cd client
# Verify .env.production has correct VITE_SERVER_URL
npm run build
# Upload build/ contents to FTP server
```

## Important URLs
- **Production Site**: https://clarkerobinsondesign.com/improvScore/
- **Railway Server**: https://improv-score-production.up.railway.app
- **Base Path**: `/improvScore` (configured in `client/config/base-path.js`)

## Notes
- Server auto-deploys via Railway when pushing to GitHub
- Client must be built locally and uploaded via FTP
- `VITE_SERVER_URL` is baked into the build at build time (optional: runtime fallback uses Railway URL when loaded from non-localhost)
- Always use `https://` for Railway URL (not `http://`)

