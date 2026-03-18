import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';

async function test() {
    console.log('Starting test...');
    try {
        const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
        console.log('App context created.');
        const redis = app.get(REDIS_CLIENT);
        console.log('Redis client acquired:', !!redis);
        await app.close();
    } catch (e: any) {
        console.error('Test failed:', e);
    }
}

test();
