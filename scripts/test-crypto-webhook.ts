import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TOKEN = process.env.CRYPTO_PAY_TOKEN;
const API_URL = 'http://localhost:3333/v1/billing/crypto/webhook';

async function testWebhook() {
    if (!TOKEN) {
        console.error('CRYPTO_PAY_TOKEN not found in .env');
        return;
    }

    const payload = {
        update_id: Math.floor(Math.random() * 100000),
        update_type: 'invoice_paid',
        request_date: new Date().toISOString(),
        payload: {
            invoice_id: 12345, // Replace with actual invoice_id from DB for real test
            status: 'paid',
            hash: 'test_hash',
            asset: 'USDT',
            amount: '10',
            pay_url: 'https://test.pay',
            created_at: new Date().toISOString(),
            allow_comments: true,
            allow_anonymous: true,
            paid_at: new Date().toISOString(),
        }
    };

    const secret = crypto.createHash('sha256').update(TOKEN).digest();
    const checkString = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(checkString).digest('hex');

    try {
        console.log('Sending test webhook to:', API_URL);
        const response = await axios.post(API_URL, payload, {
            headers: {
                'crypto-pay-api-signature': signature,
                'Content-Type': 'application/json'
            }
        });
        console.log('Response:', response.data);
    } catch (error: any) {
        console.error('Webhook failed:', error.response?.data || error.message);
    }
}

testWebhook();
