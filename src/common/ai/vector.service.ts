import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pinecone, RecordMetadata } from '@pinecone-database/pinecone';

export interface VectorSearchResult {
  id: number;
  score: number;
  metadata?: RecordMetadata;
}

@Injectable()
export class VectorService {
  private readonly logger = new Logger(VectorService.name);
  private pc!: Pinecone;
  private indexName: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('PINECONE_API_KEY');
    this.indexName = this.configService.get<string>('PINECONE_INDEX') || 'mumin';

    console.log(`[VectorService] Initializing with index: "${this.indexName}"`);

    if (!apiKey) {
      console.log('[VectorService] PINECONE_API_KEY is missing!');
      return;
    }

    this.pc = new Pinecone({ apiKey });
    console.log('[VectorService] Pinecone client initialized.');
  }

  async search(vector: number[], limit: number = 10): Promise<VectorSearchResult[]> {
    if (!this.pc) return [];

    try {
      const host = this.configService.get<string>('PINECONE_HOST') || 'https://mumin-gljivs4.svc.aped-4627-b74a.pinecone.io';
      const index = this.pc.index(this.indexName, host);
      
      console.log(`[VectorService] Querying index "${this.indexName}" at host "${host}"...`);
      
      const queryResponse = await index.query({
        vector,
        topK: limit,
        includeMetadata: true,
      });

      console.log(`[VectorService] Query complete. Matches: ${queryResponse.matches?.length || 0}`);

      return queryResponse.matches.map(match => ({
        id: parseInt(match.id),
        score: match.score || 0,
        metadata: match.metadata,
      }));
    } catch (error: any) {
      this.logger.error(`Pinecone search failed: ${error.message}`);
      return [];
    }
  }

  async upsert(id: number, vector: number[], metadata: any = {}): Promise<void> {
    if (!this.pc) return;

    try {
        const index = this.pc.index(this.indexName, 'https://mumin-gljivs4.svc.aped-4627-b74a.pinecone.io');
        await index.upsert([{
            id: id.toString(),
            values: vector,
            metadata: {
                ...metadata,
                updatedAt: new Date().toISOString()
            }
        }]);
    } catch (error: any) {
        this.logger.error(`Pinecone upsert failed for ID ${id}: ${error.message}`);
    }
  }
}
