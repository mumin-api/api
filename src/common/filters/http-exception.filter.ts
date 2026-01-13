import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest();
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
                requestId: request['id'],
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

        response.status(status).json(errorResponse);
    }
}
