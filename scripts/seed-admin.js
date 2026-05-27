/**
 * Seed script — creates the initial super_admin user and INTERNAL_SYNC_KEY.
 *
 * Run with:
 *   DATABASE_URL="file:/Users/tahermazaher/Desktop/shopify-portal/prisma/dev.db" \
 *   node scripts/seed-admin.js
 *
 * ⚠️  IMPORTANT: Change the admin password immediately after first login.
 */

const { PrismaClient } = require('@prisma/client')
const bcrypt           = require('bcryptjs')
const crypto           = require('crypto')
const fs               = require('fs')
const path             = require('path')

const db = new PrismaClient()

const SKIP_IF_EXISTS = process.argv.includes('--skip-if-exists')

async function main() {
  console.log('\n🌱  Seeding admin user…')
  console.log('─'.repeat(50))

  // ── Create super_admin user ──────────────────────────────────────────────────
  const existing = await db.user.findUnique({ where: { username: 'admin' } })

  if (existing) {
    if (SKIP_IF_EXISTS) {
      console.log('✓   Admin user already exists — skipping.')
      return
    }
    console.log('⚠️  Admin user already exists — skipping creation.')
    console.log(`   Username : admin`)
    console.log(`   Role     : ${existing.role}`)
    console.log(`   Active   : ${existing.active}`)
  } else {
    const hash = await bcrypt.hash('admin123', 12)
    await db.user.create({
      data: {
        username:     'admin',
        name:         'Super Admin',
        passwordHash: hash,
        role:         'super_admin',
        active:       true,
      },
    })
    console.log('✅  Admin user created.')
    console.log('   Username : admin')
    console.log('   Password : admin123')
  }

  // ── Ensure INTERNAL_SYNC_KEY exists in .env.local ─────────────────────────────
  const envPath    = path.join(__dirname, '..', '.env.local')
  let   envContent = ''

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8')
  }

  if (!envContent.includes('INTERNAL_SYNC_KEY=')) {
    const key     = crypto.randomBytes(32).toString('hex')
    const newLine = `\nINTERNAL_SYNC_KEY=${key}\n`
    fs.appendFileSync(envPath, newLine)
    console.log('\n✅  INTERNAL_SYNC_KEY added to .env.local')
  } else {
    console.log('\n✓   INTERNAL_SYNC_KEY already present in .env.local')
  }

  console.log('\n' + '─'.repeat(50))
  console.log('⚠️  SECURITY: Change the admin password immediately after first login!')
  console.log('   → Login at: http://localhost:3001/login')
  console.log('   → Go to: Settings or Users page to change password')
  console.log('─'.repeat(50) + '\n')
}

main()
  .catch(e => { console.error('❌ Seed failed:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
