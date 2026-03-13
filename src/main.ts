import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyHelmet from '@fastify/helmet'
import compression from '@fastify/compress'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
    // 0. ENV Validation (Fail-fast if critical secrets are missing)
    const requiredEnv = ['JWT_SECRET', 'INTERNAL_BOT_KEY', 'MEILISEARCH_API_KEY'];
    for (const key of requiredEnv) {
        if (!process.env[key]) {
            console.error(`❌ CRITICAL STARTUP ERROR: Missing environment variable: ${key}`);
            process.exit(1);
        }
    }

    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({ trustProxy: true })
    )

    // 1. Security Middleware
    await app.register(fastifyHelmet, {
        crossOriginResourcePolicy: false, // Allows cross-origin requests
    })
    
    // 2. Cookie & Compression
    await app.register(fastifyCookie, {
        secret: process.env.JWT_SECRET || 'fallback-secret', // For signed cookies
    })
    await app.register(compression, { encodings: ['gzip', 'deflate'] })

    // 3. NestJS CORS (For GET/POST requests)
    app.enableCors({
        origin: (origin, callback) => {
            // Allow ALL origins so the SDK works on any website (React/Vue/etc)
            callback(null, true);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-API-Key'],
    })

    // 4. Swagger Documentation
    const config = new DocumentBuilder()
        .setTitle('Mumin Hadith API')
        .setDescription('API for Islamic Hadiths with AI explanations and semantic search')
        .setVersion('2.0')
        .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('v1/docs', app, document, {
        swaggerOptions: {
            persistAuthorization: true,
        },
    });

    // 5. Pipes & Prefix
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.setGlobalPrefix('v1')

    // 5. Port Binding (Crucial for Railway)
    const port = process.env.PORT || 3333
    await app.listen(port, '0.0.0.0')

    console.log(`🚀 Server running on http://0.0.0.0:${port}/v1`)
}

bootstrap()