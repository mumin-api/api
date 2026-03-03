import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { GeolocationUtil } from '../utils/geolocation.util';

@Injectable()
export class GeoBlockMiddleware implements NestMiddleware {
  private blockedCountries: string[];

  constructor(
    private configService: ConfigService,
    private geoUtil: GeolocationUtil,
  ) {
    const blocked = this.configService.get<string>('BLOCKED_COUNTRIES') || 'UZ';
    this.blockedCountries = blocked.split(',').map(c => c.trim().toUpperCase());
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Get IP from request (handled by proxy usually)
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    
    if (!ip) {
      return next();
    }

    const country = this.geoUtil.getCountry(ip);

    if (country && this.blockedCountries.includes(country.toUpperCase())) {
      throw new ForbiddenException(
        `Access from your country (${country}) is restricted due to local regulations.`
      );
    }

    next();
  }
}
