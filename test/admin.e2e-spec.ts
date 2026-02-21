process.env.NODE_ENV = 'test';

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('AdminController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let adminKey: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        app.setGlobalPrefix('v1');
        await app.init();

        prisma = app.get(PrismaService);
        const config = app.get(ConfigService);
        adminKey = config.get<string>('ADMIN_API_KEY') || 'test-admin-key';
        
        await prisma.cleanDatabase();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('/v1/admin/stats (GET)', () => {
        it('should return 403 if no admin key provided', () => {
            return request(app.getHttpServer())
                .get('/v1/admin/stats')
                .expect(403);
        });

        it('should return 403 if invalid admin key provided', () => {
            return request(app.getHttpServer())
                .get('/v1/admin/stats')
                .set('x-admin-key', 'wrong-key')
                .expect(403);
        });

        it('should allow access with correct admin key', () => {
            return request(app.getHttpServer())
                .get('/v1/admin/stats')
                .set('x-admin-key', adminKey)
                .expect(200);
        });
    });

    describe('/v1/admin/keys (GET)', () => {
        it('should list API keys', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'admin-test@example.com',
                    password: 'password',
                }
            });

            await prisma.apiKey.create({
                data: {
                    keyPrefix: 'test',
                    keyHash: 'hash',
                    userEmail: 'admin-test@example.com',
                    isActive: true,
                    userId: user.id,
                }
            });

            const response = await request(app.getHttpServer())
                .get('/v1/admin/keys')
                .set('x-admin-key', adminKey)
                .expect(200);

            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data.data)).toBe(true);
        });
    });
});
