import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { pack } from 'msgpackr';

@Injectable()
export class MessagePackInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    const accept = request.headers['accept'] || '';

    if (accept !== 'application/x-msgpack') {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        if (!data || response.headersSent) return data;

        // Skip binary serialization for streams (SSE)
        if (request.url.includes('stream') || response.getHeader('Content-Type') === 'text/event-stream') {
          return data;
        }

        const packed = pack(data);
        response.setHeader('Content-Type', 'application/x-msgpack');
        
        response.send(Buffer.from(packed));
        return undefined;
      }),
    );
  }
}
