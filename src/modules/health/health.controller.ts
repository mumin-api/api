import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthCheckService, HealthCheck, PrismaHealthIndicator } from '@nestjs/terminus';
import { Public } from '@/common/decorators/public.decorator';
import { PrismaService } from '@/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private prismaHealth: PrismaHealthIndicator,
        private prisma: PrismaService,
    ) { }

    @Get()
    @Public()
    @HealthCheck()
    @ApiOperation({ summary: 'Health check' })
    check() {
        return this.health.check([
            () => this.prismaHealth.pingCheck('database', this.prisma),
        ]);
    }

    @Get('ready')
    @Public()
    @ApiOperation({ summary: 'Readiness probe' })
    ready() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };
    }

    @Get('live')
    @Public()
    @ApiOperation({ summary: 'Liveness probe' })
    live() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };
    }
}
