import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
    constructor(private config: ConfigService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers['x-admin-key'];

        if (!authHeader) {
            throw new ForbiddenException({
                statusCode: 403,
                error: 'ADMIN_KEY_REQUIRED',
                message: 'Admin API key required',
            });
        }

        const adminKey = this.config.get<string>('ADMIN_API_KEY') || '';
        const providedKeyHash = createHash('sha256').update(authHeader).digest('hex');
        const validKeyHash = createHash('sha256').update(adminKey).digest('hex');

        if (providedKeyHash !== validKeyHash) {
            throw new ForbiddenException({
                statusCode: 403,
                error: 'INVALID_ADMIN_KEY',
                message: 'Invalid admin API key',
            });
        }

        return true;
    }
}
