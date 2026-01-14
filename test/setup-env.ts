import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

process.env.EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'test@example.com';
process.env.EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Test API';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_dummy_key';
