import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
        const request = context.switchToHttp().getRequest();

        return next.handle().pipe(
            map((data) => {
                // If response was already handled by other interceptors (like Zstd or MessagePack)
                // or via SSE, skip transformation
                if (context.switchToHttp().getResponse().headersSent) {
                    return data;
                }

                return {
                    success: true,
                    data,
                    meta: {
                        requestId: request['id'],
                        timestamp: new Date().toISOString(),
                    },
                };
            }),
        );
    }
}
