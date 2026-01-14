import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ConsentService {
    constructor(private prisma: PrismaService) { }

    async getConsent(apiKeyId?: number) {
        if (!apiKeyId) {
            return {};
        }

        const apiKey = await this.prisma.apiKey.findUnique({
            where: { id: apiKeyId },
            select: { cookieConsent: true },
        });

        if (!apiKey) {
            return {};
        }

        return apiKey.cookieConsent || {};
    }

    async updateConsent(apiKeyId: number, consent: any) {
        return this.prisma.apiKey.update({
            where: { id: apiKeyId },
            data: {
                cookieConsent: consent,
            },
            select: { cookieConsent: true },
        });
    }
}
