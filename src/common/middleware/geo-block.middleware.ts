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

  use(req: any, res: any, next: NextFunction) {
    // 1. Always allow OPTIONS requests for CORS preflight
    if (req.method === 'OPTIONS') {
      return next();
    }

    // 2. Get IP from request (Middie provides .ip or headers)
    const ip = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress;
    
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
