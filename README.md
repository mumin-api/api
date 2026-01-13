# Mumin Hadith API - Legal-Hardened Edition v2.0

🕌 Production-ready, legal-compliant RESTful API for Islamic hadiths with fraud detection and GDPR compliance.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database and API keys

# Run database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Start development server
npm run start:dev

# Access API documentation
open http://localhost:3000/docs
```

## 📋 Features

✅ **Legal Compliance**
- ToS/Privacy Policy acceptance tracking
- Comprehensive request logging (chargeback defense)
- GDPR data export and deletion
- 90-day log retention

✅ **Fraud Detection**
- Tiered severity approach (CRITICAL auto-suspend, MEDIUM/HIGH flag)
- 5 detection patterns (sequential access, rapid requests, honeypots, etc.)
- Trust score system (0-100)
- Fraud event logging with evidence

✅ **Security**
- Enhanced API key authentication
- IP whitelisting
- Daily rate limits (graduated access)
- Device fingerprinting
- Helmet security headers

✅ **Inactivity Policy**
- Automated warnings at 335 and 358 days
- $5/month fee for dormant accounts (365+ days)
- Account closure on zero balance

## 🏗️ Architecture

- **Framework**: NestJS 10.x with TypeScript strict mode
- **Database**: PostgreSQL 15+ with Prisma ORM
- **Cache**: Redis 7.x
- **Email**: SendGrid integration
- **Documentation**: Swagger/OpenAPI

## 📊 Database Schema

15 comprehensive models:
- Core data: `Hadith`, `Translation`
- Auth: `ApiKey` (25+ legal compliance fields)
- Logging: `RequestLog` (chargeback defense)
- Billing: `Transaction`, `Payment`
- Email: `EmailLog`
- Fraud: `FraudEvent`
- GDPR: `DataExportRequest`, `AccountDeletionRequest`
- Analytics: `EndpointStats`, `GeoStats`
- Admin: `AdminAuditLog`

## 🔑 API Key Registration

```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "acceptTerms": true,
    "termsVersion": "2.0",
    "acceptPrivacyPolicy": true,
    "privacyPolicyVersion": "1.0"
  }'
```

Response includes your API key (save it securely - shown only once):
```json
{
  "apiKey": "sk_mumin_abc123...",
  "balance": 100,
  "message": "API key created successfully. Save this key securely - it will not be shown again."
}
```

## 📚 API Usage

All endpoints require authentication via Bearer token:

```bash
curl -H "Authorization: Bearer sk_mumin_abc123..." \
  http://localhost:3000/v1/hadiths
```

## 🛠️ Development

```bash
# Run tests
npm test

# Run e2e tests
npm run test:e2e

# Lint code
npm run lint

# Format code
npm run format

# Open Prisma Studio
npm run prisma:studio
```

## 📝 Environment Variables

See `.env.example` for all required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `ADMIN_API_KEY` - Admin authentication key (min 32 chars)
- `SENDGRID_API_KEY` - SendGrid API key for emails
- `EMAIL_FROM_ADDRESS` - Sender email address

## 🔒 Security

- API keys hashed with SHA-256
- Helmet security headers
- CORS configuration
- Rate limiting (100 req/min default)
- Request timeout (30s)
- IP whitelisting support

## 📖 Documentation

- **API Docs**: http://localhost:3000/docs (Swagger UI)
- **Progress**: See `PROGRESS.md` for development status
- **Implementation Plan**: See `.gemini/antigravity/brain/.../implementation_plan.md`

## 🤝 Contributing

This is a private project. For questions, contact the development team.

## 📄 License

UNLICENSED - Private project

---

Built with ❤️ using NestJS, Prisma, and TypeScript
