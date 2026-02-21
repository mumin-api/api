process.env.NODE_ENV = 'test';

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as cookieParser from 'cookie-parser';

describe('BillingController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let accessToken: string;
    let userId: number;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.use(cookieParser());
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        app.setGlobalPrefix('v1');
        await app.init();

        prisma = app.get(PrismaService);
        await prisma.cleanDatabase();

        const uniqueEmail = `billing-test-${Date.now()}@example.com`;

        // Create test user and get token
        await request(app.getHttpServer())
            .post('/v1/auth/register')
            .send({
                email: uniqueEmail,
                password: 'Password123!',
                firstName: 'Billing',
                lastName: 'Tester',
            })
            .expect(201);
        
        // Manually verify email for subsequent tests
        await prisma.user.update({
            where: { email: uniqueEmail },
            data: { emailVerified: true, emailVerifiedAt: new Date() }
        });
        
        const loginRes = await request(app.getHttpServer())
            .post('/v1/auth/login')
            .send({
                email: uniqueEmail,
                password: 'Password123!',
            })
            .expect(200);

        const cookies = loginRes.headers['set-cookie'] || [];
        const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
        const accessTokenCookie = cookieArr.find((c: string) => c.startsWith('access_token='));
        accessToken = accessTokenCookie?.split(';')[0].split('=')[1] || '';
        userId = loginRes.body.data.user.id;
    });

    afterAll(async () => {
        await app.close();
    });

    describe('/v1/billing/balance (GET)', () => {
        it('should return initial balance', () => {
            return request(app.getHttpServer())
                .get('/v1/billing/balance')
                .set('Cookie', [`access_token=${accessToken}`])
                .expect(200)
                .expect((res) => {
                    expect(res.body.data.balance).toBe(100); // Registration bonus
                });
        });
    });

        describe('/v1/billing/transactions (GET)', () => {
        it('should return transaction history', () => {
            return request(app.getHttpServer())
                .get('/v1/billing/transactions')
                .set('Cookie', [`access_token=${accessToken}`])
                .expect(200)
                .expect((res) => {
                    expect(res.body.data.data).toHaveLength(1); // Bonus transaction
                    expect(res.body.data.data[0].type).toBe('bonus');
                });
        });
    });

    describe('/v1/billing/stats (GET)', () => {
        it('should return usage stats', () => {
            return request(app.getHttpServer())
                .get('/v1/billing/stats')
                .set('Cookie', [`access_token=${accessToken}`])
                .expect(200)
                .expect((res) => {
                    expect(res.body.data).toHaveProperty('totalRequests');
                });
        });
    });
});
