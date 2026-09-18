import { readdirSync, renameSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = path.join(repoRoot, 'server', 'cache', 'scraped_jobs.sqlite')
const backupDirectory = path.join(repoRoot, 'server', 'cache', 'backups')

const backups = readdirSync(backupDirectory)
  .map((name) => ({ name, number: Number(name.match(/^db-(\d+)\.sqlite$/)?.[1]) }))
  .filter(({ number }) => Number.isFinite(number))
  .sort((left, right) => right.number - left.number)

if (backups.length === 0) {
  throw new Error(`No database backups found in ${path.relative(repoRoot, backupDirectory)}`)
}

const latestBackupPath = path.join(backupDirectory, backups[0].name)
const temporaryDatabasePath = `${databasePath}.restore-tmp`

rmSync(temporaryDatabasePath, { force: true })
const backupDatabase = new DatabaseSync(latestBackupPath)
try {
  backupDatabase.exec(`VACUUM INTO '${temporaryDatabasePath.replaceAll("'", "''")}'`)
} finally {
  backupDatabase.close()
}

renameSync(temporaryDatabasePath, databasePath)
for (const suffix of ['-wal', '-shm']) {
  rmSync(`${databasePath}${suffix}`, { force: true })
}

console.log(`Restored database from: ${path.relative(repoRoot, latestBackupPath)}`)
console.warn('Restart the server after restoring so existing SQLite connections reopen the restored file.')