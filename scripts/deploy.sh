#!/bin/bash
# ==========================================================
# deploy.sh — Production deployment script for Hostinger
# ==========================================================

set -e  # Exit on any error

echo "🚀 Starting deployment..."

# 1. Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# 2. Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# 3. Build all apps
echo "🔨 Building all apps..."
pnpm turbo build

# 4. Run database migrations
echo "🗄️  Running database migrations..."
node scripts/run-migrations.js

# 5. Restart PM2 processes
echo "🔄 Restarting PM2 processes..."
pm2 reload ecosystem.config.js --env production

# 6. Save PM2 process list
pm2 save

echo "✅ Deployment complete!"
echo "API:   http://localhost:4000"
echo "Web:   http://localhost:3000"
echo "Admin: http://localhost:3001"
