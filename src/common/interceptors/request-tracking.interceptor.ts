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

        // Only log requests that have an API key ID.
        if (!request.user?.apiKeyId) {
            return next.handle();
        }

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
                next: (responseData) => {
                    // Log in background to avoid blocking
                    setImmediate(async () => {
                        try {
                            const responseTime = Date.now() - startTime;
                            const response = context.switchToHttp().getResponse();

                            const responseString = typeof responseData === 'object' ? JSON.stringify(responseData) : String(responseData);
                            const responseSize = responseString.length;

                            const truncatedResponse = responseSize > 5120
                                ? {
                                    _truncated: true,
                                    _originalSize: responseSize,
                                    _preview: responseString.substring(0, 500),
                                }
                                : responseData;

                            const wasFromCache = response.getHeader('X-Cache-Hit') === 'true';

                            await this.logRequest({
                                ...requestData,
                                responseStatus: response.statusCode,
                                responseBody: truncatedResponse,
                                responseTimeMs: responseTime,
                                dataTransferred: responseSize,
                                wasFromCache,
                                billingImpact: wasFromCache ? 0 : 1,
                            });

                            if (request.user?.userId) {
                                await this.prisma.user.update({
                                    where: { id: request.user.userId },
                                    data: {
                                        totalDataTransferred: {
                                            increment: responseSize,
                                        },
                                    },
                                }).catch(e => this.logger.error('Failed to update data counter:', e));
                            }
                        } catch (error) {
                            this.logger.error('Background logging error:', error);
                        }
                    });
                },
                error: (error) => {
                    setImmediate(async () => {
                        try {
                            const responseTime = Date.now() - startTime;
                            await this.logRequest({
                                ...requestData,
                                responseStatus: error.status || 500,
                                responseBody: { error: error.message, code: error.code },
                                responseTimeMs: responseTime,
                                dataTransferred: 0,
                                wasFromCache: false,
                                billingImpact: 0,
                            });
                        } catch (e) {
                            this.logger.error('Background error logging failed:', e);
                        }
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
                    requestHeaders: { userAgent: data.userAgent },
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
            if (error.code === 'P2003') {
                try {
                    await this.prisma.requestLog.create({
                        data: {
                            endpoint: data.endpoint,
                            method: data.method,
                            requestHeaders: { userAgent: data.userAgent },
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
                } catch (retryError) {
                    this.logger.error('Log retry failed:', retryError);
                }
            } else {
                this.logger.error('Log creation failed:', error);
            }
        }
    }
}
