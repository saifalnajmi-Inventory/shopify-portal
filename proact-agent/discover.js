/**
 * PROACT GEN — Database Discovery Script
 * Run this FIRST to find the exact table names in the PROACT database.
 *
 * On Toshiba: node discover.js
 */

const sql = require('mssql')

const config = {
  server:   '192.168.8.50',
  database: 'PROACT',
  user:     'sa',
  password: '12345678',
  options: {
    encrypt:                false,
    trustServerCertificate: true,
    enableArithAbort:       true,
  },
  port: 1433,
}

async function main() {
  console.log('Connecting to PROACT SQL Server at 192.168.8.50...')
  await sql.connect(config)
  console.log('✅ Connected!\n')

  // List all tables
  const tables = await sql.query`
    SELECT TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    ORDER BY TABLE_NAME
  `
  console.log('=== ALL TABLES IN PROACT DATABASE ===')
  tables.recordset.forEach(t => console.log(`  ${t.TABLE_TYPE.padEnd(10)} ${t.TABLE_NAME}`))

  // Try common product/item table names
  const candidates = ['Items', 'Item', 'Products', 'Product', 'Stock', 'Inventory',
                      'ItemMaster', 'ITEMS', 'ITEM', 'tblItems', 'tblItem']

  console.log('\n=== CHECKING PRODUCT TABLE CANDIDATES ===')
  for (const tbl of candidates) {
    try {
      const r = await sql.query(`SELECT TOP 3 * FROM [${tbl}]`)
      console.log(`\n✅ TABLE FOUND: ${tbl} (${r.recordset.length} sample rows)`)
      console.log('   Columns:', Object.keys(r.recordset[0] || {}).join(', '))
      r.recordset.forEach((row, i) => console.log(`   Row ${i+1}:`, JSON.stringify(row).substring(0, 200)))
    } catch {
      // table doesn't exist, skip
    }
  }

  // Try common sales table names
  const salesCandidates = ['Sales', 'Invoice', 'Invoices', 'SalesHeader', 'SalesMaster',
                            'SALES', 'INVOICE', 'Trans', 'Transactions']
  console.log('\n=== CHECKING SALES TABLE CANDIDATES ===')
  for (const tbl of salesCandidates) {
    try {
      const r = await sql.query(`SELECT TOP 2 * FROM [${tbl}]`)
      console.log(`\n✅ TABLE FOUND: ${tbl}`)
      console.log('   Columns:', Object.keys(r.recordset[0] || {}).join(', '))
    } catch {
      // skip
    }
  }

  await sql.close()
  console.log('\n✅ Discovery complete. Share the output above.')
}

main().catch(err => {
  console.error('❌ Connection failed:', err.message)
  process.exit(1)
})
