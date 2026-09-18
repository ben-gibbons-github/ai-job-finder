import { mkdirSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = path.join(repoRoot, 'server', 'cache', 'scraped_jobs.sqlite')
const backupDirectory = path.join(repoRoot, 'server', 'cache', 'backups')

mkdirSync(backupDirectory, { recursive: true })

const backupNumbers = readdirSync(backupDirectory)
  .map((name) => name.match(/^db-(\d+)\.sqlite$/)?.[1])
  .filter(Boolean)
  .map(Number)
  .filter(Number.isFinite)

const nextNumber = backupNumbers.length > 0 ? Math.max(...backupNumbers) + 1 : 1
const backupPath = path.join(backupDirectory, `db-${nextNumber}.sqlite`)

const database = new DatabaseSync(databasePath)
try {
  database.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`)
} finally {
  database.close()
}

console.log(`Created database backup: ${path.relative(repoRoot, backupPath)}`)