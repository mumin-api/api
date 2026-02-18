import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '@/prisma/prisma.service';
import { GeolocationUtil } from '@/common/utils/geolocation.util';

@Injectable()
export class RequestTrackingInterceptor implements NestInterceptor {
    private readonly logger = new Logger(RequestTrackingInterceptor.name);

    constructor(
        private prisma: PrismaService,
        private geoUtil: GeolocationUtil,
    ) { }

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest();
        const startTime = Date.now();

        // Skip logging for health checks, public endpoints, and management routes
        const skipRoutes = ['/health', '/auth', '/billing', '/keys', '/analytics', '/admin'];
        const isManagementRoute = skipRoutes.some(route => request.url.includes(route));

        if (isManagementRoute || !request.user) {
            return next.handle();
        }

        // Extract request data
        const requestData = {
            apiKeyId: request.user?.apiKeyId,
            userId: request.user?.userId,
            endpoint: request.url,
            method: request.method,
            queryParams: request.query,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            deviceFingerprint: request.deviceFingerprint,
            geoLocation: this.geoUtil.getLocation(request.ip),
            requestId: request['id'],
        };

        return next.handle().pipe(
            tap({
                next: async (responseData) => {
                    const responseTime = Date.now() - startTime;
                    const response = context.switchToHttp().getResponse();

                    // Calculate data transferred
                    const responseSize = JSON.stringify(responseData).length;

                    // Truncate response body for storage (max 5KB)
                    const truncatedResponse =
                        responseSize > 5120
                            ? {
                                _truncated: true,
                                _originalSize: responseSize,
                                _preview: JSON.stringify(responseData).substring(0, 500),
                            }
                            : responseData;

                    // Determine if response was from cache
                    const wasFromCache = response.getHeader('X-Cache-Hit') === 'true';

                    // Log request to database (async, don't block response)
                    this.logRequest({
                        ...requestData,
                        responseStatus: response.statusCode,
                        responseBody: truncatedResponse,
                        responseTimeMs: responseTime,
                        dataTransferred: responseSize,
                        wasFromCache,
                        billingImpact: wasFromCache ? 0 : 1, // Cached requests don't count
                    }).catch((error) => {
                        this.logger.error('Failed to log request:', error);
                    });

                    // Update User data transferred counter
                    if (request.user?.userId) {
                        this.prisma.user
                            .update({
                                where: { id: request.user.userId },
                                data: {
                                    totalDataTransferred: {
                                        increment: responseSize,
                                    },
                                },
                            })
                            .catch((error) => {
                                this.logger.error('Failed to update data transferred:', error);
                            });
                    }
                },
                error: async (error) => {
                    const responseTime = Date.now() - startTime;

                    // Log failed request
                    this.logRequest({
                        ...requestData,
                        responseStatus: error.status || 500,
                        responseBody: {
                            error: error.message,
                            code: error.code,
                        },
                        responseTimeMs: responseTime,
                        dataTransferred: 0,
                        wasFromCache: false,
                        billingImpact: 0, // Don't charge for errors
                    }).catch((logError) => {
                        this.logger.error('Failed to log error request:', logError);
                    });
                },
            }),
        );
    }

    private async logRequest(data: any): Promise<void> {
        try {
            await this.prisma.requestLog.create({
                data: {
                    apiKeyId: data.apiKeyId,
                    userId: data.userId,
                    endpoint: data.endpoint,
                    method: data.method,
                    requestHeaders: {
                        userAgent: data.userAgent,
                    },
                    queryParams: data.queryParams,
                    responseStatus: data.responseStatus,
                    responseBody: data.responseBody,
                    responseTimeMs: data.responseTimeMs,
                    dataTransferred: data.dataTransferred,
                    ipAddress: data.ipAddress,
                    userAgent: data.userAgent,
                    deviceFingerprint: data.deviceFingerprint,
                    geoLocation: data.geoLocation,
                    wasFromCache: data.wasFromCache,
                    billingImpact: data.billingImpact,
                    requestId: data.requestId,
                },
            });
        } catch (error: any) {
            // Handle foreign key violation (P2003) - user or api key record might be missing
            if (error.code === 'P2003') {
                try {
                    // Retry without userId and apiKeyId
                    await this.prisma.requestLog.create({
                        data: {
                            endpoint: data.endpoint,
                            method: data.method,
                            requestHeaders: {
                                userAgent: data.userAgent,
                            },
                            queryParams: data.queryParams,
                            responseStatus: data.responseStatus,
                            responseBody: data.responseBody,
                            responseTimeMs: data.responseTimeMs,
                            dataTransferred: data.dataTransferred,
                            ipAddress: data.ipAddress,
                            userAgent: data.userAgent,
                            deviceFingerprint: data.deviceFingerprint,
                            geoLocation: data.geoLocation,
                            wasFromCache: data.wasFromCache,
                            billingImpact: 0,
                            requestId: data.requestId,
                        },
                    });
                    this.logger.warn(`Logged request with orphan userId/apiKeyId (P2003): ${data.endpoint}`);
                    return;
                } catch (retryError) {
                    this.logger.error('Database logging retry failed:', retryError);
                }
            }
            // If DB write fails for other reasons, log to console as backup
            this.logger.error('Database logging failed:', error);
        }
    }
}
