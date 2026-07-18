import { useId } from 'react';
import type { Direction } from '../types';

interface LandoltCProps {
  sizePx: number;
  direction: Direction;
}

const rotation: Record<Direction, number> = {
  right: 0,
  down: 90,
  left: 180,
  up: 270,
};

export function LandoltC({ sizePx, direction }: LandoltCProps) {
  const gapMaskId = `landolt-gap-${useId().replace(/:/g, '')}`;

  return (
    <svg
      className="landolt-c"
      width={sizePx}
      height={sizePx}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      style={{ transform: `rotate(${rotation[direction]}deg)` }}
    >
      <mask id={gapMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
        <rect width="100" height="100" fill="white" />
        <rect x="70" y="40" width="30" height="20" fill="black" />
      </mask>
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="currentColor"
        strokeWidth="20"
        strokeLinecap="butt"
        mask={`url(#${gapMaskId})`}
      />
    </svg>
  );
}
