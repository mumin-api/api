import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(PrismaExceptionFilter.name);

    catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Database error occurred';
        let code = 'DATABASE_ERROR';

        switch (exception.code) {
            case 'P2002':
                status = HttpStatus.CONFLICT;
                message = 'A record with this value already exists';
                code = 'DUPLICATE_ENTRY';
                break;
            case 'P2025':
                status = HttpStatus.NOT_FOUND;
                message = 'Record not found';
                code = 'NOT_FOUND';
                break;
            case 'P2003':
                status = HttpStatus.BAD_REQUEST;
                message = 'Foreign key constraint failed';
                code = 'FOREIGN_KEY_ERROR';
                break;
            default:
                this.logger.error(`Unhandled Prisma error: ${exception.code}`, exception.message);
        }

        const errorResponse = {
            success: false,
            error: {
                statusCode: status,
                code,
                message,
                timestamp: new Date().toISOString(),
                path: request.url,
            },
            meta: {
                requestId: request['id'],
            },
        };

        response.status(status).json(errorResponse);
    }
}
