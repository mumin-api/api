import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        const request = ctx.getRequest<FastifyRequest>();
        const status = exception.getStatus();
        const exceptionResponse = exception.getResponse();

        const errorResponse = {
            success: false,
            error: {
                statusCode: status,
                timestamp: new Date().toISOString(),
                path: request.url,
                method: request.method,
                ...(typeof exceptionResponse === 'object' ? exceptionResponse : { message: exceptionResponse }),
            },
            meta: {
                requestId: (request as any)['id'],
            },
        };

        // Log error
        if (status >= 500) {
            this.logger.error(
                `${request.method} ${request.url} ${status}`,
                exception.stack,
            );
        } else {
            this.logger.warn(`${request.method} ${request.url} ${status}`);
        }

        // Fastify / Express / Raw Response logic
        if (typeof response.status === 'function') {
            // Express/NestJS wrapped status()
            response.status(status).send(errorResponse);
        } else if (typeof (response as any).code === 'function') {
            // Native Fastify code()
            (response as any).code(status).send(errorResponse);
        } else {
            // Raw Node.js response (happens in some middleware contexts)
            const rawResponse = response as any;
            rawResponse.statusCode = status;
            rawResponse.setHeader('Content-Type', 'application/json');
            rawResponse.end(JSON.stringify(errorResponse));
        }
    }
}
