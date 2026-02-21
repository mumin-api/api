import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test and set process.env BEFORE anything else
const result = dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

if (result.error) {
    console.error('Failed to load .env.test:', result.error);
    process.exit(1);
}

// Set required variables if missing
process.env.EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'test@example.com';
process.env.EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Test API';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_dummy_key';

export default async () => {
    console.log('\n--- Syncing Test Database ---');
    try {
        execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit' });
        console.log('--- Test Database Synced ---\n');
    } catch (error) {
        console.error('--- Failed to sync test database ---');
        process.exit(1);
    }
};
