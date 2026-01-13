import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { generateFingerprint } from '../utils/crypto.util';

@Injectable()
export class DeviceFingerprintMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        const components = [
            req.ip,
            req.headers['user-agent'] || '',
            req.headers['accept-language'] || '',
            req.headers['accept-encoding'] || '',
            req.headers['accept'] || '',
        ];

        req['deviceFingerprint'] = generateFingerprint(components);

        next();
    }
}
