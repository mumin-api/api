process.env.NODE_ENV = 'test';

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/email/email.service';
import * as cookieParser from 'cookie-parser';

describe('AuthController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const mockEmailService = {
        sendVerificationCode: jest.fn().mockResolvedValue(true),
        sendWelcomeEmail: jest.fn().mockResolvedValue(true),
    };

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
        .overrideProvider(EmailService)
        .useValue(mockEmailService)
        .compile();

        app = moduleFixture.createNestApplication();
        app.use(cookieParser());
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        app.setGlobalPrefix('v1');
        await app.init();

        prisma = app.get(PrismaService);
        await prisma.cleanDatabase();
    });

    afterAll(async () => {
        await app.close();
    });

    const testUser = {
        email: 'e2e-test@example.com',
        password: 'Password123!',
        firstName: 'E2E',
        lastName: 'Tester',
    };

    describe('/v1/auth/register (POST)', () => {
        it('should register a new user', async () => {
            const uniqueEmail = `new-user-${Date.now()}@example.com`;
            const res = await request(app.getHttpServer())
                .post('/v1/auth/register')
                .send({ ...testUser, email: uniqueEmail })
                .expect(201);
            
            expect(res.body.success).toBe(true);
        });

        it('should fail to register if email already exists', async () => {
            const existingEmail = `existing-${Date.now()}@example.com`;
            // First registration
            await request(app.getHttpServer())
                .post('/v1/auth/register')
                .send({ ...testUser, email: existingEmail })
                .expect(201);
                
            // Second registration with same email
            await request(app.getHttpServer())
                .post('/v1/auth/register')
                .send({ ...testUser, email: existingEmail })
                .expect(403);
        });
    });

    describe('/v1/auth/login (POST)', () => {
        it('should login and return user data (tokens in cookies)', async () => {
            const loginEmail = `login-test-${Date.now()}@example.com`;
            // 1. Register
            await request(app.getHttpServer())
                .post('/v1/auth/register')
                .send({ ...testUser, email: loginEmail })
                .expect(201);
                
            // 2. Verify Email
            await prisma.user.update({
                where: { email: loginEmail },
                data: { emailVerified: true, emailVerifiedAt: new Date() }
            });
            
            // 3. Login
            const response = await request(app.getHttpServer())
                .post('/v1/auth/login')
                .send({
                    email: loginEmail,
                    password: testUser.password,
                })
                .expect(200);

            expect(response.headers['set-cookie']).toBeDefined();
            expect(response.body.data.user.email).toBe(loginEmail);
            
            // Extract access token
            const cookies = response.headers['set-cookie'] || [];
            const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
            const accessTokenCookie = cookieArr.find((c: string) => c.startsWith('access_token='));
            const accessToken = accessTokenCookie?.split(';')[0].split('=')[1];

            // 4. Verify Access
            await request(app.getHttpServer())
                .get('/v1/auth/me')
                .set('Cookie', [`access_token=${accessToken}`])
                .expect(200)
                .expect((res) => {
                    expect(res.body.data.email).toBe(loginEmail);
                });
        });

        it('should fail with wrong credentials', async () => {
            const failEmail = `fail-test-${Date.now()}@example.com`;
            // Register
            await request(app.getHttpServer())
                .post('/v1/auth/register')
                .send({ ...testUser, email: failEmail })
                .expect(201);
                
            // Login with wrong password
            await request(app.getHttpServer())
                .post('/v1/auth/login')
                .send({
                    email: failEmail,
                    password: 'wrongpassword',
                })
                .expect(401);
        });
    });
});
