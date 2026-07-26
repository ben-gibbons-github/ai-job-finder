import { useMemo } from 'react';
import './DailyScoreHud.css';

type DailyNoteHudTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19;

interface DailyNoteHudParticle {
  id: string;
  left: string;
  top: string;
  size: string;
  duration: string;
  delay: string;
  opacity: number;
  rotation: string;
  hue: number;
}

interface DailyScoreHudProps {
  scorePoints: number;
  jobsViewedToday: number;
  commentsWrittenToday: number;
  userCreatedJobsToday: number;
  className?: string;
}

function getDailyScoreTier(scorePoints: number): DailyNoteHudTier {
  return Math.min(19, Math.floor(Math.max(0, scorePoints) / 100)) as DailyNoteHudTier;
}

function getDailyScoreTierLabel(tier: DailyNoteHudTier): string {
  switch (tier) {
    case 1:
      return 'Spark';
    case 2:
      return 'Neon';
    case 3:
      return 'Flux';
    case 4:
      return 'Overload';
    case 5:
      return 'Quantum';
    case 6:
      return 'Nova';
    case 7:
      return 'Pulsar';
    case 8:
      return 'Singularity';
    case 9:
      return 'Transcendent';
    case 10:
      return 'Ascendant';
    case 11:
      return 'Mythic';
    case 12:
      return 'Aether';
    case 13:
      return 'Prism';
    case 14:
      return 'Aurora';
    case 15:
      return 'Celestial';
    case 16:
      return 'Eclipse';
    case 17:
      return 'Omni';
    case 18:
      return 'Eternal';
    case 19:
      return 'Legend';
    default:
      return 'Idle';
  }
}

function buildDailyScoreParticles(scorePoints: number, tier: DailyNoteHudTier): DailyNoteHudParticle[] {
  const particleCountByTier: Record<DailyNoteHudTier, number> = {
    0: 0,
    1: 6,
    2: 10,
    3: 16,
    4: 24,
    5: 30,
    6: 36,
    7: 42,
    8: 48,
    9: 54,
    10: 60,
    11: 66,
    12: 72,
    13: 78,
    14: 84,
    15: 90,
    16: 96,
    17: 102,
    18: 108,
    19: 114,
  };

  const particleCount = particleCountByTier[tier] + Math.max(0, Math.min(20, Math.floor(scorePoints / 10)));
  const particles: DailyNoteHudParticle[] = [];

  for (let index = 0; index < particleCount; index += 1) {
    const seed = scorePoints * 19 + index * 37;
    const offset = (seed * 13) % 1000;
    const x = 10 + (offset % 78);
    const y = 10 + ((offset * 7) % 78);
    const size = 2 + (offset % 5);
    const duration = 2.2 + ((offset % 11) / 10);
    const delay = -((offset % 9) / 3);
    const opacity = 0.35 + ((offset % 7) / 18);
    const rotation = `${(seed * 29) % 360}deg`;
    const hue = 182 + (offset % 72);

    particles.push({
      id: `hud-particle-${scorePoints}-${index}`,
      left: `${x}%`,
      top: `${y}%`,
      size: `${size}px`,
      duration: `${duration}s`,
      delay: `${delay}s`,
      opacity,
      rotation,
      hue,
    });
  }

  return particles;
}

export default function DailyScoreHud({
  scorePoints,
  jobsViewedToday,
  commentsWrittenToday,
  userCreatedJobsToday,
  className,
}: DailyScoreHudProps) {
  const tier = getDailyScoreTier(scorePoints);
  const label = getDailyScoreTierLabel(tier);
  const particles = useMemo(() => buildDailyScoreParticles(scorePoints, tier), [scorePoints, tier]);

  return (
    <div
      className={`daily-note-hud daily-note-hud--tier-${tier} ${className || ''}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={`Score earned today: ${scorePoints} points, jobs viewed: ${jobsViewedToday}, comments written: ${commentsWrittenToday}, user jobs created: ${userCreatedJobsToday}`}
    >
      <div className="daily-note-hud__particles" aria-hidden="true">
        {particles.map((particle) => {
          const particleStyle = {
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            animationDuration: particle.duration,
            animationDelay: particle.delay,
            opacity: particle.opacity,
            transform: `rotate(${particle.rotation})`,
            ['--particle-hue' as '--particle-hue']: String(particle.hue),
          };

          return <span key={particle.id} className="daily-note-hud__particle" style={particleStyle} />;
        })}
      </div>
      <span className="daily-note-hud__label">Score · {label}</span>
      <span className="daily-note-hud__value">{scorePoints}</span>
      <div className="daily-note-hud__stats" aria-hidden="true">
        <div className="daily-note-hud__stat-row">
          <span className="daily-note-hud__stat-label">Viewed</span>
          <span className="daily-note-hud__stat-value">{jobsViewedToday}</span>
        </div>
        <div className="daily-note-hud__stat-row">
          <span className="daily-note-hud__stat-label">Comments</span>
          <span className="daily-note-hud__stat-value">{commentsWrittenToday}</span>
        </div>
        <div className="daily-note-hud__stat-row">
          <span className="daily-note-hud__stat-label">Created</span>
          <span className="daily-note-hud__stat-value">{userCreatedJobsToday}</span>
        </div>
      </div>
    </div>
  );
}
