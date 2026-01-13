# 🚀 Deployment Guide - Mumin Hadith API

## Prerequisites

- Node.js 20.x LTS
- PostgreSQL 15+
- Redis 7.x
- SendGrid account (for emails)

## Step 1: Environment Setup

```bash
# Clone/navigate to project
cd mumin-hadith-api

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mumin_hadith"

# Redis
REDIS_URL="redis://localhost:6379/0"

# Admin
ADMIN_API_KEY="your-secure-admin-key-min-32-chars"

# SendGrid
SENDGRID_API_KEY="SG.your-sendgrid-api-key"
EMAIL_FROM_ADDRESS="noreply@yourdomain.com"

# App
NODE_ENV="production"
PORT=3000
APP_URL="https://api.yourdomain.com"
DASHBOARD_URL="https://dashboard.yourdomain.com"
```

## Step 2: Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# (Optional) Seed with sample hadith data
npm run seed
```

## Step 3: Build & Start

```bash
# Build for production
npm run build

# Start production server
npm run start:prod

# OR use PM2 for process management
pm2 start dist/main.js --name mumin-api
```

## Step 4: Verify Deployment

```bash
# Check health
curl http://localhost:3000/v1/health

# Check API docs
open http://localhost:3000/docs
```

## Step 5: Configure SendGrid Webhook

In SendGrid dashboard, add webhook URL:
```
https://api.yourdomain.com/v1/webhooks/sendgrid
```

Enable events: delivered, open, click, bounce, dropped

## Production Checklist

- [ ] Set strong `ADMIN_API_KEY` (32+ characters)
- [ ] Configure PostgreSQL with connection pooling
- [ ] Set up Redis persistence
- [ ] Configure CORS allowed origins
- [ ] Set up SSL/TLS certificates
- [ ] Configure rate limiting (default: 100 req/min)
- [ ] Set up monitoring (Sentry, DataDog, etc.)
- [ ] Configure log rotation
- [ ] Set up automated backups
- [ ] Test email delivery
- [ ] Test fraud detection
- [ ] Verify cron jobs are running

## Monitoring

```bash
# View logs
pm2 logs mumin-api

# Monitor performance
pm2 monit

# Check database connections
npx prisma studio
```

## Cron Jobs

The following cron jobs run automatically:

- **Daily 2 AM**: Inactivity checks (warnings at 335/358 days, dormant at 365)
- **Daily 4 AM**: GDPR deletion execution
- **Monthly 1st**: Inactivity fee charging ($5/month for dormant accounts)

## Scaling Recommendations

1. **Database**: Use connection pooling (PgBouncer)
2. **Redis**: Use Redis Cluster for high availability
3. **API**: Deploy multiple instances behind load balancer
4. **Caching**: Enable response caching for GET endpoints
5. **CDN**: Use CDN for static assets

## Troubleshooting

### Database connection errors
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql $DATABASE_URL
```

### Redis connection errors
```bash
# Check Redis is running
redis-cli ping

# Should return: PONG
```

### Email not sending
- Verify SendGrid API key is valid
- Check SendGrid dashboard for errors
- Verify `EMAIL_FROM_ADDRESS` is verified in SendGrid

## Security Notes

- API keys are hashed with SHA-256 before storage
- All requests are logged for 90 days (chargeback defense)
- Fraud detection runs on every request
- CRITICAL fraud events auto-suspend accounts
- Admin endpoints require separate admin key

---

**Need help?** Check the [README.md](./README.md) or [PROGRESS.md](./PROGRESS.md)
