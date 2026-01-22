
import { Prisma } from '@prisma/client';

console.log('--- User Model Fields ---');
console.log(Object.keys(Prisma.UserScalarFieldEnum));

console.log('--- ApiKey Model Fields ---');
console.log(Object.keys(Prisma.ApiKeyScalarFieldEnum));
