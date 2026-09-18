import type { ServerDebugCoverageStats } from './types.js'

function normalizeCompanyName(name: string): string {
  return String(name ?? '').trim().toLowerCase()
}

export function computeEmployerConcentrationStats(jobs: Array<{ company_name?: string | null }>): ServerDebugCoverageStats['employerConcentration'] {
  const countsByEmployer = new Map<string, { companyName: string; count: number }>()

  for (const job of jobs) {
    const rawCompanyName = String(job.company_name ?? '').trim() || 'Unknown employer'
    const key = normalizeCompanyName(rawCompanyName)
    const current = countsByEmployer.get(key)
    if (current) {
      current.count += 1
    } else {
      countsByEmployer.set(key, { companyName: rawCompanyName, count: 1 })
    }
  }

  const sortedEmployers = Array.from(countsByEmployer.values())
    .sort((left, right) => right.count - left.count || left.companyName.localeCompare(right.companyName))

  const totalEmployers = sortedEmployers.length
  const totalJobs = jobs.length
  const safeTotalJobs = Math.max(1, totalJobs)

  let runningJobs = 0
  const topEmployers = sortedEmployers
    .slice(0, 500)
    .map((entry, index) => {
      runningJobs += entry.count
      return {
        rank: index + 1,
        companyName: entry.companyName,
        jobCount: entry.count,
        jobPct: Number(((entry.count / safeTotalJobs) * 100).toFixed(2)),
        cumulativeJobsPct: Number(((runningJobs / safeTotalJobs) * 100).toFixed(2)),
      }
    })

  const checkpoints = [0, 1, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const curvePoints: ServerDebugCoverageStats['employerConcentration']['curvePoints'] = []
  let checkpointIndex = 0
  let cumulativeJobs = 0

  for (let i = 0; i < sortedEmployers.length; i += 1) {
    cumulativeJobs += sortedEmployers[i].count
    const employerCount = i + 1
    const employerPct = Number(((employerCount / Math.max(1, totalEmployers)) * 100).toFixed(2))

    while (checkpointIndex < checkpoints.length && employerPct >= checkpoints[checkpointIndex]) {
      const checkpoint = checkpoints[checkpointIndex]
      curvePoints.push({
        employerPct: checkpoint,
        employerCount,
        jobsPct: Number(((cumulativeJobs / safeTotalJobs) * 100).toFixed(2)),
        jobCount: cumulativeJobs,
      })
      checkpointIndex += 1
    }
  }

  while (checkpointIndex < checkpoints.length) {
    const checkpoint = checkpoints[checkpointIndex]
    curvePoints.push({
      employerPct: checkpoint,
      employerCount: totalEmployers,
      jobsPct: totalJobs > 0 ? 100 : 0,
      jobCount: totalJobs,
    })
    checkpointIndex += 1
  }

  return {
    totalEmployers,
    totalJobs,
    curvePoints,
    topEmployers,
  }
}
