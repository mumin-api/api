import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import * as cookieParser from 'cookie-parser'
import helmet from 'helmet'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    // 1. Manual CORS/OPTIONS handling for early response (Bypasses complexity)
    app.use((req: any, res: any, next: any) => {
        if (req.method === 'OPTIONS') {
            res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, Accept, X-Requested-With, Origin');
            res.header('Access-Control-Allow-Credentials', 'true');
            return res.sendStatus(204);
        }
        next();
    });

    // 2. Security Middleware
    app.use(helmet({
        crossOriginResourcePolicy: false, // Allows cross-origin requests
    }));
    app.use(cookieParser())

    // 3. NestJS CORS (For GET/POST requests)
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || origin.endsWith('mumin.ink') || origin.includes('localhost') || origin.includes('railway.app')) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-API-Key'],
    })

    // 4. Pipes & Prefix
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