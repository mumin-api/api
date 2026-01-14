import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

export const ApiKeyFactory = {
    async create(overrides: any = {}) {
        const rawKey = `sk_test_${crypto.randomBytes(16).toString('hex')}`;
        const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

        const apiKey = await prisma.apiKey.create({
            data: {
                keyHash: hash,
                keyPrefix: 'sk_test_',
                isActive: true,
                balance: 1000,
                trustScore: 100,
                userEmail: faker.internet.email(),
                ...overrides,
            },
        });

        return { apiKey, rawKey };
    }
};
