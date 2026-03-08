import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ZstdCodec } from 'zstd-codec';

@Injectable()
export class ZstdCompressionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ZstdCompressionInterceptor.name);
  private zstd: any = null;

  constructor() {
    this.initZstd();
  }

  private async initZstd() {
    return new Promise<void>((resolve) => {
      ZstdCodec.run((zstd: any) => {
        this.zstd = zstd;
        this.logger.log('Zstd Codec (WASM) initialized');
        resolve();
      });
    });
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const acceptEncoding = request.headers['accept-encoding'] || '';

    // Only compress if client accepts zstd
    if (!acceptEncoding.includes('zstd')) {
      return next.handle();
    }

    // Wait for Zstd to be ready if not already
    if (!this.zstd) {
      await this.initZstd();
    }

    return next.handle().pipe(
      map((data) => {
        if (!data) return data;

        // Don't compress streams (SSE handles its own chunking)
        if (request.url.includes('explain-stream')) {
            return data;
        }

        try {
          const jsonString = JSON.stringify(data);
          const buffer = Buffer.from(jsonString);
          
          const simple = new this.zstd.Simple();
          const compressed = simple.compress(buffer);

          response.header('Content-Encoding', 'zstd');
          response.header('Content-Type', 'application/json');
          
          // Return the raw compressed buffer
          // Note: NestJS might try to JSON.stringify this again if we're not careful.
          // To send raw binary, we might need to use response.send() directly.
          response.send(Buffer.from(compressed));
          return undefined; // Handled manually
        } catch (error) {
          this.logger.error('Zstd compression failed', error);
          return data;
        }
      }),
    );
  }
}
