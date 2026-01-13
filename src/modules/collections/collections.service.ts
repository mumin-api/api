import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class CollectionsService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        const collections = await this.prisma.collection.findMany({
            orderBy: { nameEnglish: 'asc' },
        });

        // If no collections are explicitly defined in the Collection table,
        // we could potentially aggregate them from the Hadith table, 
        // but for now we follow the new model structure.
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
