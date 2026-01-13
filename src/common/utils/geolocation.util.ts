import { Injectable } from '@nestjs/common';
import * as geoip from 'geoip-lite';

@Injectable()
export class GeolocationUtil {
    /**
     * Get location string from IP address
     * @returns Format: "US-CA" or "RU-MOW"
     */
    getLocation(ip: string): string | null {
        try {
            // Skip localhost and private IPs
            if (this.isPrivateIP(ip)) {
                return null;
            }

            const geo = geoip.lookup(ip);
            if (!geo) return null;

            return `${geo.country}-${geo.region}`;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get country code from IP address
     */
    getCountry(ip: string): string | null {
        try {
            if (this.isPrivateIP(ip)) {
                return null;
            }

            const geo = geoip.lookup(ip);
            return geo?.country || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Check if IP is private/localhost
     */
    private isPrivateIP(ip: string): boolean {
        if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
            return true;
        }

        // Check for private IP ranges
        const parts = ip.split('.');
        if (parts.length === 4) {
            const first = parseInt(parts[0], 10);
            const second = parseInt(parts[1], 10);

            // 10.0.0.0 - 10.255.255.255
            if (first === 10) return true;

            // 172.16.0.0 - 172.31.255.255
            if (first === 172 && second >= 16 && second <= 31) return true;

            // 192.168.0.0 - 192.168.255.255
            if (first === 192 && second === 168) return true;
        }

        return false;
    }
}
