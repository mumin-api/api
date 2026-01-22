
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Restoring Data from dump ---');
    const dump = fs.readFileSync('data_dump.json', 'utf8');
    const sections = dump.split('--- Current Users ---');
    const keysJson = sections[0].replace('--- Current API Keys and Balances ---', '').trim();
    const usersJson = sections[1].trim();

    const keysData = JSON.parse(keysJson);
    const usersData = JSON.parse(usersJson);

    // 0. Clear existing
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();

    // 1. Restore Users
    for (const u of usersData) {
        console.log(`Restoring user: ${u.email}`);
        await prisma.user.create({
            data: {
                email: u.email,
                password: u.password,
                firstName: u.firstName,
                lastName: u.lastName,
                hashedRt: u.hashedRt,
                createdAt: new Date(u.createdAt),
                updatedAt: new Date(u.updatedAt),
                balance: 0,
            },
        });
    }

    // Ensure dev user exists if key references it
    const devUser = await prisma.user.findUnique({ where: { email: 'dev@mumin.ink' } });
    if (!devUser) {
        console.log('Creating dev user...');
        await prisma.user.create({
            data: {
                email: 'dev@mumin.ink',
                password: 'password_not_set',
                firstName: 'Dev',
                lastName: 'User',
            }
        });
    }

    // 2. Restore Keys
    for (const k of keysData) {
        console.log(`Restoring key: ${k.keyPrefix} for ${k.userEmail}`);
        let user = await prisma.user.findUnique({ where: { email: k.userEmail } });

        if (!user && k.userEmail === 'dev@mumin.ink') {
            user = await prisma.user.findUnique({ where: { email: 'dev@mumin.ink' } });
        }

        if (!user) {
            console.warn(`User ${k.userEmail} not found, creating placeholder...`);
            user = await prisma.user.create({
                data: {
                    email: k.userEmail || `placeholder_${k.id}@example.com`,
                    password: 'password_not_set',
                    firstName: 'Placeholder',
                }
            });
        }

        await prisma.apiKey.create({
            data: {
                id: k.id,
                keyHash: k.keyHash,
                keyPrefix: k.keyPrefix,
                userId: user.id,
                userEmail: k.userEmail,
                isActive: k.isActive,
                createdAt: new Date(k.createdAt),
                lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt) : null,
                lastActivityDate: new Date(k.lastActivityDate),
                maxDailyRequests: k.maxDailyRequests,
                trustScore: k.trustScore,
                fraudFlags: k.fraudFlags,
                description: k.description,
                allowedOrigins: k.allowedOrigins,
                ipAtRegistration: k.ipAtRegistration,
                userAgentAtRegistration: k.userAgentAtRegistration,
                deviceFingerprintAtReg: k.deviceFingerprintAtReg,
                geoLocationAtReg: k.geoLocationAtReg,
            }
        });

        // Add balance to user
        await prisma.user.update({
            where: { id: user.id },
            data: { balance: { increment: k.balance } }
        });
    }

    console.log('--- Restoration Complete ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
