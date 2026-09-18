/**
 * ServerActivityTracker.ts
 *
 * Shared singleton for tracking what the server is currently doing.
 * Both index.ts (for socket/startup ops) and SearchMain.ts (for search phases)
 * import from here so the event loop monitor always has the full picture.
 */

let _activeOperation = 'idle'
let _lastCompletedOp = 'server-startup'
let _lastCompletedAt = Date.now()

export function setActiveOperation(op: string): void {
  _activeOperation = op
}

export function clearActiveOperation(completedOp?: string): void {
  if (completedOp !== undefined) {
    _lastCompletedOp = completedOp
    _lastCompletedAt = Date.now()
  }
  _activeOperation = 'idle'
}

export function getActiveOperation(): string {
  return _activeOperation
}

export function getLastCompletedOp(): string {
  return _lastCompletedOp
}

export function getLastCompletedAt(): number {
  return _lastCompletedAt
}
