import { Controller, Get } from '@nestjs/common';
import { SystemConfigService } from '../../common/utils/system-config.service';

@Controller('v1/system')
export class SystemController {
  constructor(private readonly systemConfig: SystemConfigService) {}

  @Get('status')
  async getStatus() {
    return this.systemConfig.getSystemStatus();
  }
}
