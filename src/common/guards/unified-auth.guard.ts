import {
    Injectable,
    CanActivate,
    ExecutionContext,
} from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') { }

@Injectable()
export class UnifiedAuthGuard implements CanActivate {
    constructor(
        private apiKeyGuard: ApiKeyGuard,
        private jwtGuard: JwtAuthGuard,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // 1. Try ApiKeyGuard
        try {
            const isApiKeyOk = await this.apiKeyGuard.canActivate(context);
            if (isApiKeyOk) return true;
        } catch (e) {
            // apiKeyGuard throws exceptions on failure, catch them
        }

        // 2. Try JWT Guard
        try {
            // AuthGuard('jwt') will return true or throw Unauthorized
            return (await this.jwtGuard.canActivate(context)) as boolean;
        } catch (e) {
            // Both failed
        }

        return false;
    }
}
