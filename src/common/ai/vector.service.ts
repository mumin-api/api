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

    this.logger.log(`Initializing VectorService with index: ${this.indexName}`);

    if (!apiKey) {
      this.logger.warn('PINECONE_API_KEY is not defined. Vector search will be disabled.');
      return;
    }

    this.pc = new Pinecone({ apiKey });
    this.logger.log('Pinecone client initialized.');
  }

  async search(vector: number[], limit: number = 10): Promise<VectorSearchResult[]> {
    if (!this.pc) return [];

    try {
      const host = 'https://mumin-gljivs4.svc.aped-4627-b74a.pinecone.io';
      const index = this.pc.index(this.indexName, host);
      
      this.logger.log(`Querying Pinecone index "${this.indexName}" at host "${host}"...`);
      
      const queryResponse = await index.query({
        vector,
        topK: limit,
        includeMetadata: true,
      });

      this.logger.log(`Pinecone matches: ${queryResponse.matches?.length || 0}`);

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
