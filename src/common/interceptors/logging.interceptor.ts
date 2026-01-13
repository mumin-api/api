import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger('API');

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const { method, url, ip } = request;
        const userAgent = request.get('user-agent') || '';
        const startTime = Date.now();

        return next.handle().pipe(
            tap({
                next: () => {
                    const responseTime = Date.now() - startTime;
                    this.logger.log(`${method} ${url} ${responseTime}ms - ${ip}`);
                },
                error: (error) => {
                    const responseTime = Date.now() - startTime;
                    this.logger.error(
                        `${method} ${url} ${error.status || 500} ${responseTime}ms - ${ip}`,
                        error.stack,
                    );
                },
            }),
        );
    }
}
