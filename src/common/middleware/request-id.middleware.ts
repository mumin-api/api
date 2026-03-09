import { Injectable, NestMiddleware } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
    use(req: any, res: any, next: () => void) {
        const requestId = uuidv4();
        req['id'] = requestId;
        res.setHeader('X-Request-ID', requestId);
        next();
    }
}
