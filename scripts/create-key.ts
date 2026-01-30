
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const email = 'bot_admin_v1@mumin.ink'
  
  console.log('Searching for user...')
  let user = await prisma.user.findUnique({
      where: { email }
  })
  
  if (!user) {
      console.log('User not found, creating...')
      try {
        user = await prisma.user.create({
            data: {
                email,
                password: 'placeholder_hash',
                firstName: 'Bot',
                lastName: 'Admin',
                emailVerified: true
            }
        })
        console.log('Created user:', user.id)
      } catch (e) {
          console.log('Failed to create user, looking for existing...')
          console.error(e)
          // Fallback to first user
          user = await prisma.user.findFirst()
      }
  }

  if (!user) throw new Error('No user available')

  // Generate Key
  const keyPrefix = 'mumin_live'
  const randomBytes = crypto.randomBytes(24).toString('hex')
  const apiKey = `${keyPrefix}_${randomBytes}`
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')

  console.log('Creating API key...')
  await prisma.apiKey.create({
      data: {
          keyPrefix,
          keyHash,
          userEmail: user.email,
          userId: user.id,
          description: 'Telegram Bot Key V1',
          isActive: true
      }
  })

  console.log('KEY_GENERATED_START')
  console.log(apiKey)
  console.log('KEY_GENERATED_END')
}

main()
  .catch((e) => {
    console.error('FATAL_ERROR:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
