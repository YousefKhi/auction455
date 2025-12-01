# Deployment Guide - Auction 45

## Quick Start: Deploy Worldwide in 10 Minutes

Your game is currently on Vercel, but the WebSocket server needs to be deployed separately because Vercel doesn't support WebSocket servers.

### Step 1: Deploy WebSocket Server to Railway (Easiest)

1. **Push your code to GitHub** (if not already done)
   ```bash
   git add .
   git commit -m "Add WebSocket server"
   git push origin main
   ```

2. **Sign up for Railway**
   - Go to https://railway.app
   - Sign up with GitHub (free)

3. **Deploy**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your auction45 repository
   - Railway will automatically detect Node.js and deploy
   - Wait 2-3 minutes for deployment

4. **Get your WebSocket URL**
   - Once deployed, click on your service
   - Click "Settings" → "Networking" → "Generate Domain"
   - Copy the domain (e.g., `your-app-production-abc123.up.railway.app`)

### Step 2: Connect Vercel to Railway

1. **Go to your Vercel dashboard**
   - Open your project settings
   - Go to "Environment Variables"

2. **Add the WebSocket URL**
   - Variable name: `NEXT_PUBLIC_WS_URL`
   - Value: `wss://your-app-production-abc123.up.railway.app`
   - Click "Save"

3. **Redeploy**
   - Go to "Deployments"
   - Click "..." on the latest deployment
   - Click "Redeploy"

### Step 3: Test It!

1. Open your Vercel URL (e.g., `https://your-app.vercel.app`)
2. Create a room
3. Open the same URL on your phone or another device
4. You should see the room appear in the "Active Rooms" list
5. Join and play!

---

## Alternative: Deploy to Render.com

If Railway doesn't work, try Render:

1. **Sign up at https://render.com**

2. **Create a new Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Name: `auction45-websocket`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `node server/ws-server.js`
   - Free plan is fine

3. **Get your URL**
   - After deployment, copy the URL (e.g., `https://auction45-websocket.onrender.com`)

4. **Update Vercel**
   - Add environment variable: `NEXT_PUBLIC_WS_URL=wss://auction45-websocket.onrender.com`
   - Redeploy

---

## Troubleshooting

### "No active rooms" on other devices
- Make sure you added `NEXT_PUBLIC_WS_URL` to Vercel environment variables
- Make sure you redeployed after adding the variable
- Check Railway/Render logs to see if the WebSocket server is running

### "Connection failed"
- Verify the WebSocket URL starts with `wss://` (not `ws://`)
- Check if Railway/Render service is running (not sleeping)
- Try redeploying the WebSocket server

### Railway/Render service keeps sleeping
- Free tier services sleep after inactivity
- Upgrade to a paid plan ($5-10/month) for always-on service
- Or use a service like UptimeRobot to ping your server every 5 minutes

---

## Cost Breakdown

- **Next.js (Vercel)**: Free
- **WebSocket Server (Railway)**: Free tier (500 hours/month) or $5/month for always-on
- **WebSocket Server (Render)**: Free tier (sleeps after 15 min inactivity) or $7/month for always-on

**Total for always-on worldwide access: $5-7/month**

---

## Environment Variables Reference

### Vercel (Next.js app)
- `NEXT_PUBLIC_WS_URL`: Full WebSocket URL (e.g., `wss://your-app.railway.app`)

### Railway/Render (WebSocket server)
- `PORT`: Automatically set by the platform (don't change)
- `WS_HOST`: Automatically set to `0.0.0.0` (don't change)

---

## Need Help?

If you're stuck:
1. Check Railway/Render logs for errors
2. Check browser console (F12) for WebSocket connection errors
3. Verify environment variables are set correctly in Vercel
4. Make sure you redeployed after adding environment variables

