import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    constructor() {
        const isProduction = process.env.NODE_ENV === 'production';
        super({
            log: isProduction ? ['error', 'warn'] : ['query', 'info', 'warn', 'error'],
        });
    }

    async onModuleInit() {
        try {
            await this.$connect();
            this.logger.log('Database connected successfully');
        } catch (error) {
            this.logger.error('Failed to connect to database:', error);
            throw error;
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
        this.logger.log('Database disconnected');
    }

    async cleanDatabase() {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Cannot clean database in production');
        }

        const models = Object.keys(this).filter(
            (key): key is string => typeof key === 'string' && key[0] !== '_' && key !== 'constructor',
        );

        return Promise.all(models.map((modelKey) => {
            if ((this as any)[modelKey]?.deleteMany) {
                return (this as any)[modelKey].deleteMany();
            }
        }));
    }
}
