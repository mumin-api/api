# 🕌 Mumin Hadith API - The Definitive Technical Ecosystem

```text
███████╗███████╗ ██████╗██╗   ██╗██████╗ ███████╗
██╔════╝██╔════╝██╔════╝██║   ██║██╔══██╗██╔════╝
███████╗█████╗  ██║     ██║   ██║██████╔╝█████╗
╚════██║██╔══╝  ██║     ██║   ██║██╔══██╗██╔══╝
███████║███████╗╚██████╗╚██████╔╝██║  ██║███████╗
╚══════╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝
```

> **A Secure, Premium, and Legal-Hardened API for Sacred Knowledge.**

This is the comprehensive technical documentation for the **Mumin Hadith API**. It covers architecture, security, database design, fraud detection, and operational protocols in exhaustive detail.

---

## 📖 Extended Table of Contents

1.  [Vision & Islamic Philosophy](#1-vision--islamic-philosophy)
2.  [The 7 Pillars of Mumin Engineering](#2-the-7-pillars-of-mumin-engineering)
3.  [Technology Stack Deep Dive](#3-technology-stack-deep-dive)
    - [The Power of NestJS](#the-power-of-nestjs)
    - [Prisma & Relational Data Security](#prisma--relational-data-security)
    - [Redis Caching Strategy](#redis-caching-strategy)
4.  [Folder Structure: The Anatomy of the API](#4-folder-structure-the-anatomy-of-the-api)
    - [Centralized Logic (`/src/common`)](#centralized-logic-srccommon)
    - [Feature Modules (`/src/modules`)](#feature-modules-srcmodules)
5.  [MuminAI: The Scholarly AI Engine](#5-muminai-the-scholarly-ai-engine)
    - [AI Provider Strategy (Gemini, GPT-4, Claude)](#ai-provider-strategy-gemini-gpt-4-claude)
    - [Scholarly Constraints & Safety](#scholarly-constraints--safety)
6.  [Database Schema Architecture](#6-database-schema-architecture)
    - [Detailed Model Reference (17 Models)](#detailed-model-reference-17-models)
7.  [The Mumin Shield (Fraud Detection)](#6-the-mumin-shield-fraud-detection)
    - [Level 1: Rate Limiting](#level-1-rate-limiting)
    - [Level 2: Behavioral Pattern Recognition](#level-2-behavioral-pattern-recognition)
    - [Level 3: Device & Geo Fingerprinting](#level-3-device--geo-fingerprinting)
8.  [Security & Cryptography](#7-security--cryptography)
    - [API Key Hashing (SHA-256)](#api-key-hashing-sha-256)
    - [httpOnly Session Management](#httponly-session-management)
    - [Argon2/BCrypt Password Safety](#argon2bcrypt-password-safety)
9.  [Financial & Lifecycle Operations](#8-financial--lifecycle-operations)
    - [Credit Model ($1 = 1000 Credits)](#credit-model-1--1000-credits)
    - [The Inactivity & Dormancy Engine](#the-inactivity--dormancy-engine)
10. [Legal & GDPR Compliance Framework](#9-legal--gdpr-compliance-framework)
    - [Data Portability Exports](#data-portability-exports)
    - [Account Anonymization Procedures](#account-anonymization-procedures)
11. [Setup & Installation Guide](#10-setup--installation-guide)
    - [Local Development Setup](#local-development-setup)
    - [Docker Containerization](#docker-containerization)
12. [API Endpoint Reference (Main Channels)](#11-api-endpoint-reference-main-channels)
13. [Middleware & Request Pipeline](#12-middleware--request-pipeline)
14. [Testing & QA Lifecycle](#13-testing--qa-lifecycle)
15. [Operational Maintenance & Monitoring](#14-operational-maintenance--monitoring)
16. [Project Roadmap (Q1 - Q4)](#15-project-roadmap-q1---q4)
17. [Frequently Asked Questions (FAQ)](#16-frequently-asked-questions-faq)
18. [Troubleshooting & Support](#17-troubleshooting--support)
19. [Glossary of Terms](#18-glossary-of-terms)
20. [Final Technical Word](#19-final-technical-word)

---

## 1. Vision & Islamic Philosophy

The **Mumin Hadith API** is not merely a piece of software; it is a digital **Amanah** (trust). We recognize that the data we serve—the words and actions of the Prophet Muhammad (PBUH)—carry a weight of responsibility. Our vision is to serve these words to the world with the highest degree of technical excellence and scholarly respect.

---

## 2. The 7 Pillars of Mumin Engineering

Every line of code in this repository is guided by these seven principles:

1.  **Excellence (Ihsaan)**: Striving for the most efficient and clean implementation.
2.  **Trust (Amanah)**: Protecting user data and the integrity of the hadith text.
3.  **Justice (Adl)**: Transparent billing and fair treatment of all developers.
4.  **Patience (Sabr)**: Building stable, sustainable architectures that last years.
5.  **Clarity (Kashf)**: Comprehensive logging and clear documentation.
6.  **Protection (Hifz)**: Multi-layered defense against bad actors.
7.  **Truthfulness (Sidq)**: Honest metrics, honest limits, and honest communication.

---

## 3. Technology Stack Deep Dive

### The Power of NestJS

NestJS provides a robust, opinionated structure. Its use of **TypeScript decorators** makes the code highly readable and allows us to verify security policies (like `@Admin()`) directly at the controller level.

### Prisma & Relational Data Security

Prisma acts as our guardian. By generating a client that is **100% typed**, we eliminate the most common cause of database errors: mismatched data types. Our schema uses **JSONB** for flexibility while maintaining strict relations for financial integrity.

### MuminAI: Generative Scholarly Intelligence

The API features a sophisticated AI layer that provides deep, academic explanations for hadiths based on classical commentaries (Sharhs). It is a **white-labeled AI ecosystem** branded as **MuminAI**.

- **Multi-Provider Resilience**: Dynamically switches between Google Gemini 2.5, OpenAI GPT-4o, and Anthropic Claude 3.
- **Multilingual Support**: Supports 5+ languages including Russian, Uzbek (Latin), Turkish, and English.
- **Scholarly Prompting**: Hardened prompts ensure accuracy, preventing hallucinations and ad-hoc interpretations.

---

## 5. MuminAI: The Scholarly AI Engine

**MuminAI** is a core component of the Mumin ecosystem, designed to provide context and depth to the sacred texts.

### AI Provider Strategy (Gemini, GPT-4, Claude)

We employ a **Multi-Model Strategy** to ensure high availability and output quality:

- **Google Gemini 2.5 Flash**: Primary provider for high-speed, cost-effective multilingual explanations.
- **OpenAI GPT-4o-mini**: Secondary/Failover provider known for high logical reasoning.
- **Anthropic Claude 3 Haiku**: Specialized provider for nuanced linguistic analysis.

### Scholarly Constraints & Safety

Every AI-generated explanation is governed by a **9-layer Scholarly Constraint System**:

1. **Academic Neutrality**: No personal opinions, only consensus-based Sharh (commentary).
2. **Citation Guard**: Strict prohibition of fabricated sources or "fake" hadiths.
3. **Dual-Layer Meaning**: Separation between a concise "Short Meaning" and a "Long Meaning" for deep study.
4. **Contextual Enrichment**: Built-in definitions for complex terms (e.g., _Guylul_, _Tahara_).
5. **Human-in-the-loop Reporting**: Users can report AI inaccuracies, which trigger instant **Admin Notifications** for review.

### Redis Caching Strategy

We use an **LRU (Least Recently Used)** eviction policy in Redis.

- **Hadith Objects**: Cached for 24 hours.
- **Rate Limit Buckets**: Cached for 60 seconds.
- **Session Metadata**: Cached for the duration of the TTL.

---

## 4. Folder Structure: The Anatomy of the API

```text
/src
  /common                   # Shared Global Resources
    /decorators             # Custom Meta-programming (@Public, @Admin)
    /filters               # Error Mapping (HTTP 500 -> User Friendly)
    /guards                # Gatekeepers (Auth, API-Key, Fingerprint)
    /interceptors          # Response Shapers (Logging, Caching, Transfom)
    /middleware            # Pre-Request Processing (Logger, Cors)
    /pipes                 # Input Sanitization (Validation, Transform)
    /utils                 # Pure Functions (Crypto, Time, Geo)
  /config                   # Centralized Environment Schemas
  /modules                  # Domain-Driven Capsules
    /admin                 # Global Command & Control
    /api-keys              # Key Lifecycle & Security
    /auth                  # User Identity and Session
    /billing               # The Financial Ledger
    /email                 # Template Engine & Resend Integration
    /fraud                 # The "Mumin Shield" Behavioral Engine
    /gdpr                  # Privacy Compliance & Portability
    /hadiths               # Content Delivery & Multi-lang logic
    /health                # System Vitals & Monitoring
    /inactivity            # The Dormancy Reaper Logic
```

---

## 5. Database Schema Architecture

### Detailed Model Reference

| Model                 | Purpose                   | Key Fields                                 |
| :-------------------- | :------------------------ | :----------------------------------------- |
| `User`                | Internal Dashboard Access | `email`, `passwordHash`, `role`            |
| `ApiKey`              | External Developer ID     | `keyHash`, `balance`, `trustScore`         |
| `Hadith`              | The Prophetic Text        | `arabicText`, `collection`, `hadithNumber` |
| `Translation`         | Language Variant          | `languageCode`, `text`, `grade`            |
| `HadithExplanation`   | **MuminAI Content**       | `content` (JSON), `provider`, `model`      |
| `ExplanationFeedback` | AI Reporting System       | `message`, `status`, `userId`              |
| `RequestLog`          | The Flight Recorder       | `method`, `path`, `responseTime`           |
| `Transaction`         | Credit Movement           | `amount`, `balanceAfter`, `type`           |
| `FraudEvent`          | Evidence of Attack        | `evidence`, `severity`                     |

---

## 6. The Mumin Shield (Fraud Detection)

### Level 1: Volumetric Analysis

We use a **Token Bucket Algorithm** to permit bursts of traffic while ensuring long-term adherence to the 100 RPM limit.

### Level 2: Behavioral Pattern Recognition

Our `FraudService` calculates the "Entropy" of a user's requests. If a user only requests consecutive primary keys, the system flags a **Crawler anomaly**.

---

## 7. Security & Cryptography

### API Key Hashing

We follow a "No-Secret-Stored" policy.

- Generated key: `sk_mumin_abcdef...`
- Key stored in DB: `sha256('sk_mumin_abcdef...')`
- Even with DB access, keys cannot be stolen.

---

## 8. Financial & Lifecycle Operations

### Credit Model

1 Credit = 1 Hadeeth Request.
Users purchase credits in blocks:

- **Small**: 10,000 Credits ($10)
- **Medium**: 60,000 Credits ($50)
- **Ummah Pack**: 150,000 Credits ($100)

---

## 9. Legal & GDPR Compliance Framework

### Data Portability

Our `GdprService` runs outside the main request loop to generate JSON dumps of user activity, ensuring the API remains fast while serving legal requests.

---

## 10. Setup & Installation Guide

### Local Setup

1. `npm install`
2. `npx prisma generate`
3. `npm run start:dev`

---

## 11. API Endpoint Reference

- `GET /v1/hadiths`: Search by text or ID.
- `POST /v1/auth/register`: The entry-point for developers.
- `GET /v1/admin/stats`: Real-time system monitoring.

---

### Q1: The Foundation

- [x] Core API implementation.
- [x] Res Meilisearch Search Suite (Fuzzy, Spell Suggest, Layout Correction).
- [x] **MuminAI v1.0** (Multi-provider, scholarly explanations).
- [x] **Multilingual Support** (RU, UZ, TR, EN).
- [x] Basic Analytics & Fraud Detection.

### Q2: Expansion

- [x] **Admin Notification System** (Email reports for AI fixes).
- [x] **Geo-Hardening** (Middle-east & Central Asia compliance).
- [ ] Automated scholarly dataset ingestion.
- [ ] Webhook support for Billing events.

### Q3: Optimization

- [ ] GraphQL interface.
- [ ] Real-time Fraud blocking Dashboard.

---

## 16. FAQ

**Q: Can I share my API key?**
A: No. Shared keys are automatically detected by our fingerprinting engine and suspended.

---

## 17. Troubleshooting

**Error `P2002`**: Unique constraint violation. Check if the user email already exists.

---

## 19. Final Technical Word

The Mumin Hadith API is built to be a resilient, professional-grade infrastructure. We invite all developers to use it for the betterment of the world.

---

🕌 Mumin Technical Team
[mumin.ink](https://mumin.ink)
