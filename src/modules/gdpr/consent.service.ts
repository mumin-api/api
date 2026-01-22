import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ConsentService {
    constructor(private prisma: PrismaService) { }

    async getConsent(userId?: number, apiKeyId?: number) {
        if (userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { cookieConsent: true },
            });
            if (user?.cookieConsent) return user.cookieConsent;
        }

        if (apiKeyId) {
            const apiKey = await this.prisma.apiKey.findUnique({
                where: { id: apiKeyId },
                select: { cookieConsent: true },
            });
            return apiKey?.cookieConsent || {};
        }

        return {};
    }

    async updateConsent(consent: any, userId?: number, apiKeyId?: number) {
        if (userId) {
            return this.prisma.user.update({
                where: { id: userId },
                data: { cookieConsent: consent },
                select: { cookieConsent: true },
            });
        }

        if (apiKeyId) {
            return this.prisma.apiKey.update({
                where: { id: apiKeyId },
                data: { cookieConsent: consent },
                select: { cookieConsent: true },
            });
        }

        throw new Error('Neither userId nor apiKeyId provided for consent update');
    }
}
