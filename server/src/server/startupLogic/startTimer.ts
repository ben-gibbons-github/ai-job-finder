import { clearActiveOperation, setActiveOperation } from '../ServerActivityTracker.js';

export function startTimer(label: string): () => void {
  setActiveOperation(label);
  const t0 = performance.now();
  console.log(`[Timer] ▶ ${label}`);
  return () => {
    clearActiveOperation(label);
    const ms = (performance.now() - t0).toFixed(0);
    const icon = Number(ms) > 2000 ? '🔴' : Number(ms) > 500 ? '🟡' : '🟢';
    console.log(`[Timer] ${icon} ${label} → ${ms}ms`);
  };
}
