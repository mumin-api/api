process.env.NODE_ENV = 'test';

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HadithFactory, CollectionFactory } from './factories/hadith.factory';
import { PrismaService } from '../src/prisma/prisma.service';

describe('HadithsController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let apiKey: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix('v1');
        await app.init();

        prisma = app.get(PrismaService);

        // Clean database before tests
        await prisma.cleanDatabase();

        // Create test API key
        // Create test API key
        const validApiKey = 'sk_mumin_' + 'a'.repeat(32); // 41 chars
        const keyHash = crypto.createHash('sha256').update(validApiKey).digest('hex');

        await prisma.apiKey.create({
            data: {
                keyPrefix: validApiKey.substring(0, 15),
                keyHash: keyHash,
                isActive: true,
                balance: 1000,
                totalRequests: 0,
                userEmail: 'test@example.com',
            }
        });
        apiKey = validApiKey;

        // Seed Data
        await CollectionFactory.create({ nameEnglish: 'Sahih Bukhari', slug: 'bukhari' });
        await HadithFactory.create({
            collection: 'Sahih Bukhari',
            bookNumber: 1,
            hadithNumber: 1,
            arabicText: 'Test Hadith'
        });
    });

    afterAll(async () => {
        await app.close();
    });

    it('/v1/hadiths (GET) - finding all hadiths', () => {
        return request(app.getHttpServer())
            .get('/v1/hadiths')
            .set('Authorization', `Bearer ${apiKey}`)
            .expect(200)
            .expect((res) => {
                expect(res.body.data).toHaveProperty('data');
                expect(res.body.data).toHaveProperty('pagination');
                expect(Array.isArray(res.body.data.data)).toBe(true);
            });
    });

    it('/v1/hadiths/daily (GET) - getting daily hadith', () => {
        return request(app.getHttpServer())
            .get('/v1/hadiths/daily')
            .set('Authorization', `Bearer ${apiKey}`)
            .expect(200)
            .expect((res) => {
                expect(res.body.data).toHaveProperty('id');
                expect(res.body.data).toHaveProperty('arabicText');
            });
    });

    it('/v1/hadiths/search (GET) - searching hadiths', () => {
        return request(app.getHttpServer())
            .get('/v1/hadiths/search?query=belief')
            .set('Authorization', `Bearer ${apiKey}`)
            .expect(200)
            .expect((res) => {
                expect(res.body.data).toHaveProperty('data');
                expect(Array.isArray(res.body.data.data)).toBe(true);
            });
    });
});