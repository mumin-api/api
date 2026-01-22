import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

async function main() {
    console.log('--- DB Verification Start ---');
    try {
        const users = await prisma.user.findMany();
        console.log(`User count: ${users.length}`);
        users.forEach(u => console.log(`- Found user: ${u.email} (ID: ${u.id})`));

        // Print part of the DB URL (masked) to verify which DB is used
        const dbUrl = process.env.DATABASE_URL || 'UNDEFINED';
        console.log(`DATABASE_URL: ${dbUrl.replace(/:[^:@]*@/, ':****@')}`);
    } catch (e) {
        console.error('Error querying database:', e);
    }
    console.log('--- DB Verification End ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
