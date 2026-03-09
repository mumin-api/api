import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');

    use(req: any, res: any, next: () => void) {
        // req / res здесь это стандартные Node.js IncomingMessage / ServerResponse (Middie)
        const method = req.method;
        const originalUrl = req.originalUrl || req.url;
        const ip = req.ip || req.socket?.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';
        const startTime = Date.now();

        res.on('finish', () => {
            const statusCode = res.statusCode;
            const responseTime = Date.now() - startTime;

            this.logger.log(
                `${method} ${originalUrl} ${statusCode} ${responseTime}ms - ${ip} ${userAgent}`,
            );
        });

        next();
    }
}
