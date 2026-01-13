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
        origin: [
            'http://localhost:3001', // Dashboard dev
            'http://localhost:3002', // Docs dev
            process.env.DASHBOARD_URL || 'https://dashboard.mumin.ink',
            process.env.DOCS_URL || 'https://docs.mumin.ink',
        ],
        credentials: true, // ← КРИТИЧНО! Разрешает cookies
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
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

    const port = process.env.PORT || 3000
    await app.listen(port)

    console.log(`🚀 Server running on http://localhost:${port}/v1`)
}

bootstrap()
