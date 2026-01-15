import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import * as cookieParser from 'cookie-parser'
import helmet from 'helmet'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    // Security
    app.use(helmet())

    // Cookie parser (для httpOnly cookies)
    app.use(cookieParser())

    // CORS - ВАЖНО для httpOnly cookies!
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || origin.endsWith('mumin.ink') || origin.includes('localhost') || origin.includes('railway.app')) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        },
        credentials: true, // ← КРИТИЧНО! Разрешает cookies
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'Origin',
            'X-API-Key',  // ← ДОБАВЬТЕ ЭТУ СТРОКУ!
        ],
        preflightContinue: false,
        optionsSuccessStatus: 204,
    })

    // Global validation pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    )

    // Global prefix
    app.setGlobalPrefix('v1')

    const port = process.env.PORT || 3333  // ← Также исправил порт на 3333
    await app.listen(port)

    console.log(`🚀 Server running on http://localhost:${port}/v1`)
}

bootstrap()