export type Asset = 'USDT' | 'TON' | 'BTC' | 'ETH' | 'BNB' | 'BUSD' | 'USDC';
export type InvoiceStatus = 'active' | 'paid' | 'expired';

export interface CryptoPayInvoice {
    invoice_id: number;
    status: InvoiceStatus;
    hash: string;
    asset: Asset;
    amount: string;
    pay_url: string;
    created_at: string;
    allow_comments: boolean;
    allow_anonymous: boolean;
    expiration_date?: string;
    paid_at?: string;
    comment?: string;
}

export interface CryptoPayWebhook {
    update_id: number;
    update_type: 'invoice_paid';
    request_date: string;
    payload: CryptoPayInvoice;
}

export interface BillingStats {
    dailyRequests: number;
    monthlyRequests: number;
    totalRequests: number;
    totalDataTransferred: number;
    balance: number;
}
