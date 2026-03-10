import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { LRUCache } from 'lru-cache';

@Injectable()
export class CollectionsService {
    private readonly cache: LRUCache<string, any>;

    constructor(private prisma: PrismaService) {
        this.cache = new LRUCache({
            max: 100,
            ttl: 1000 * 60 * 5, // 5 minutes
        });
    }

    async findAll() {
        const cacheKey = 'all_collections';
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        const collections = await this.prisma.collection.findMany({
            orderBy: { nameEnglish: 'asc' },
        });

        this.cache.set(cacheKey, collections);
        return collections;
    }

    async findOne(slug: string) {
        const collection = await this.prisma.collection.findUnique({
            where: { slug },
            include: {
                _count: {
                    select: { hadiths: true }
                }
            }
        });

        if (!collection) {
            throw new NotFoundException(`Collection with slug ${slug} not found`);
        }

        return collection;
    }
}
