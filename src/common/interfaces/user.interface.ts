export interface AuthenticatedUser {
    userId: number;
    email: string;
    apiKeyId?: number;
    balance?: number;
    trustScore?: number;
    accountAgeDays?: number;
}

// Map it to 'User' which is what Express/Passport expect
export interface User extends AuthenticatedUser {}

declare global {
    namespace Express {
        interface User extends AuthenticatedUser {}
        interface Request {
            user?: User;
            requestId?: string;
            deviceFingerprint?: string;
        }
    }
}
