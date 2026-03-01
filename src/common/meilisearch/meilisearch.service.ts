import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeiliSearch, Index } from 'meilisearch';

@Injectable()
export class MeilisearchService implements OnModuleInit {
    private client: MeiliSearch;
    private hadithIndex!: Index;

    constructor(private configService: ConfigService) {
        const host = this.configService.get<string>('MEILISEARCH_HOST') || 'http://localhost:7700';
        const apiKey = this.configService.get<string>('MEILISEARCH_API_KEY') || 'masterKey';
        
        this.client = new MeiliSearch({
            host,
            apiKey,
        });
    }

    async onModuleInit() {
        this.hadithIndex = this.client.index('hadiths');
        
        // Settings for the index
        await this.hadithIndex.updateSettings({
            searchableAttributes: [
                'arabicText',
                'translations.text',
                'collection',
                'metadata.chapterEnglish',
                'metadata.chapterArabic'
            ],
            filterableAttributes: [
                'collection',
                'grade',
                'languageCode'
            ],
            rankingRules: [
                'words',
                'typo',
                'proximity',
                'attribute',
                'sort',
                'exactness'
            ],
            typoTolerance: {
                enabled: true,
                minWordSizeForTypos: {
                    oneTypo: 5,
                    twoTypos: 9
                }
            }
        });
    }

    getClient(): MeiliSearch {
        return this.client;
    }

    getIndex(indexName: string = 'hadiths'): Index {
        return this.client.index(indexName);
    }

    async search(query: string, options: any = {}) {
        return this.hadithIndex.search(query, options);
    }

    async addDocuments(documents: any[]) {
        return this.hadithIndex.addDocuments(documents);
    }
}
