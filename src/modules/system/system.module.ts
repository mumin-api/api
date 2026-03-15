import { Module, Global } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemConfigService } from '../../common/utils/system-config.service';

@Global()
@Module({
  controllers: [SystemController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemModule {}
