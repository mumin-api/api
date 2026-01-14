import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the current directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function checkConnection() {
    const prisma = new PrismaClient({
        datasources: {
            db: {
                url: process.env.DATABASE_URL,
            },
        },
    });

    console.log('🔍 Checking database connection...');
    console.log(`URL: ${process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':****@')}`); // Hide password

    try {
        await prisma.$connect();
        console.log('✅ Success! Database connected.');

        // Try a simple query
        const result = await prisma.$queryRaw`SELECT 1 as connected`;
        console.log('📊 Query test:', result);

    } catch (error: any) {
        console.error('❌ Failed to connect to database!');

        if (error.code === 'P1000') {
            console.error('\n💡 Suggestion: Authentication failed. Please check your username and password in .env');
        } else if (error.code === 'P1001') {
            console.error('\n💡 Suggestion: Cannot reach database server. Make sure PostgreSQL is running on the specified host and port.');
        } else if (error.code === 'P1003') {
            console.error('\n💡 Suggestion: The database does not exist. Please create it first.');
        }

        console.error('\nDetailed Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkConnection();
