import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DIRECT_URL || process.env.DATABASE_URL
        }
    }
});

async function main() {
    try {
        const sqlPath = path.join(__dirname, 'migration-v2-optimization.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('🚀 Applying Database Optimizations...');
        
        const statements: string[] = [];
        let currentStatement = '';
        let inDollarQuote = false;

        const lines = sql.split('\n');
        for (const line of lines) {
            currentStatement += line + '\n';
            
            // Toggle dollar quoting state
            if (line.includes('$$')) {
                inDollarQuote = !inDollarQuote;
            }

            // A statement ends with a semicolon NOT inside a dollar-quoted block
            if (!inDollarQuote && line.trim().endsWith(';')) {
                if (currentStatement.trim().length > 0) {
                    statements.push(currentStatement.trim());
                }
                currentStatement = '';
            }
        }
        if (currentStatement.trim().length > 0) {
            statements.push(currentStatement.trim());
        }

        for (const statement of statements) {
            try {
                // Remove comments for cleaner logging
                const cleanLog = statement.split('\n')
                    .filter(l => !l.trim().startsWith('--'))
                    .join(' ')
                    .substring(0, 60);

                console.log(`Executing: ${cleanLog}...`);
                await prisma.$executeRawUnsafe(statement);
            } catch (error: any) {
                if (error.message.includes('already exists') || error.message.includes('already a column')) {
                    console.log('⚠️ Already exists, skipping...');
                    continue;
                }
                console.error(`❌ Failed statement: ${statement.substring(0, 200)}`);
                console.error(`Error: ${error.message}`);
                throw error;
            }
        }
        console.log('✅ All database optimizations applied successfully!');
    } catch (globalError: any) {
        console.error('❌ Global failure in optimization script:', globalError.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
