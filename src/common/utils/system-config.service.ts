import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);
  private cache: Map<string, { value: boolean; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Checks if a feature is enabled.
   * Priority: 
   * 1. Environment Variable (Forced override)
   * 2. Database Setting (Dynamic toggle)
   * 3. Default (Enabled)
   */
  async isFeatureEnabled(featureKey: string): Promise<boolean> {
    const envKey = featureKey.toUpperCase();
    const envValue = this.config.get<string>(envKey);

    // 1. Check ENV (Forced override if exists)
    if (envValue !== undefined) {
      return envValue === 'true' || envValue === '1';
    }

    // 2. Check Database with simple caching
    const cached = this.cache.get(featureKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }

    try {
      const setting = await this.prisma.systemSetting.findUnique({
        where: { key: featureKey.toLowerCase() },
      });

      const isEnabled = setting ? setting.value === 'true' || setting.value === '1' : true;
      
      this.cache.set(featureKey, { value: isEnabled, timestamp: Date.now() });
      return isEnabled;
    } catch (error) {
      this.logger.error(`Failed to fetch system setting ${featureKey}: ${error.message}`);
      // Fallback to true if DB is down but ENV isn't set
      return true;
    }
  }

  async getSystemStatus() {
    return {
      search: await this.isFeatureEnabled('feature_search_enabled'),
      ai: await this.isFeatureEnabled('feature_ai_enabled'),
      maintenance: await this.isFeatureEnabled('maintenance_mode'),
    };
  }
}
