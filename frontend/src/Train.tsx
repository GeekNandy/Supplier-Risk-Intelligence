import { useEffect, useRef, useState } from 'react';

const HEIGHT = 64;
const RAIL_Y = 56;
const CAR = 168; // coach length incl. gangway
const END = 176; // power car / cab car length

/** Measures an element's width so the train always fills the full viewport. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(1280);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function Bogie({ x }: { x: number }) {
  return (
    <g>
      <path d={`M${x - 15} ${RAIL_Y - 5} h30`} strokeOpacity="0.55" />
      <circle cx={x - 8} cy={RAIL_Y - 3} r="3" />
      <circle cx={x + 8} cy={RAIL_Y - 3} r="3" />
    </g>
  );
}

/** One passenger coach starting at x: body, window band, doors, bogies, gangway. */
function Coach({ x }: { x: number }) {
  const w = CAR - 8;
  return (
    <g>
      <rect x={x} y="22" width={w} height="30" rx="4" fill="currentColor" fillOpacity="0.07" />
      <path d={`M${x} 30 H${x + w}`} strokeOpacity="0.35" />
      {[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={x + 30 + i * 17} y="27" width="12" height="9" rx="1.5" strokeOpacity="0.8" />)}
      {[10, w - 22].map(dx => <rect key={dx} x={x + dx} y="27" width="12" height="22" rx="1" strokeOpacity="0.6" />)}
      <path d={`M${x + 4} 45 H${x + w - 4}`} strokeOpacity="0.25" />
      <Bogie x={x + 30} />
      <Bogie x={x + w - 30} />
      <rect x={x + w} y="28" width="8" height="18" strokeOpacity="0.4" />
    </g>
  );
}

/** Streamlined power car; `flip` mirrors it so the train has a cab at both ends. */
function PowerCar({ x, flip = false }: { x: number; flip?: boolean }) {
  const w = END - 8;
  const transform = flip ? `translate(${2 * x + w} 0) scale(-1 1)` : undefined;
  return (
    <g transform={transform}>
      <path d={`M${x} 52 V24 Q${x} 22 ${x + 2} 22 H${x + w - 58} C${x + w - 26} 22 ${x + w - 8} 34 ${x + w} 52 Z`} fill="currentColor" fillOpacity="0.1" />
      <path d={`M${x + w - 52} 27 H${x + w - 36} C${x + w - 26} 28 ${x + w - 18} 33 ${x + w - 14} 38 H${x + w - 52} Z`} strokeOpacity="0.9" />
      {[0, 1, 2, 3].map(i => <rect key={i} x={x + 16 + i * 17} y="27" width="12" height="9" rx="1.5" strokeOpacity="0.8" />)}
      <rect x={x + 90} y="27" width="12" height="22" rx="1" strokeOpacity="0.6" />
      <path d={`M${x} 30 H${x + w - 44}`} strokeOpacity="0.35" />
      <path d={`M${x + 2} 45 H${x + w - 6}`} strokeOpacity="0.25" />
      <circle cx={x + w - 7} cy="47" r="1.6" fill="currentColor" />
      {/* Pantograph */}
      <path d={`M${x + 44} 22 L${x + 56} 12 L${x + 68} 22 M${x + 50} 12 H${x + 62}`} />
      <Bogie x={x + 30} />
      <Bogie x={x + w - 44} />
    </g>
  );
}

/**
 * Hand-drawn line illustration of a push-pull train spanning the whole page width,
 * with overhead line, masts, rails and sleepers. Purely decorative.
 */
export default function Train() {
  const [ref, width] = useWidth<HTMLDivElement>();
  const coaches = Math.max(1, Math.floor((width - 2 * END) / CAR));
  const trainLength = 2 * END + coaches * CAR;
  const start = Math.max(0, Math.round((width - trainLength) / 2));
  const masts = Array.from({ length: Math.ceil(width / 260) + 1 }, (_, i) => i * 260 + 40);

  return (
    <div ref={ref} className="w-full text-accent" aria-hidden>
      <svg width={width} height={HEIGHT + 8} viewBox={`0 0 ${width} ${HEIGHT + 8}`} className="block" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <defs>
          <pattern id="sri-sleepers" width="14" height="8" patternUnits="userSpaceOnUse">
            <line x1="4" y1="0" x2="4" y2="7" strokeOpacity="0.3" />
          </pattern>
        </defs>
        {/* Overhead line with masts */}
        <path d={`M0 7 H${width}`} strokeOpacity="0.4" />
        <path d={`M0 11 H${width}`} strokeOpacity="0.15" strokeDasharray="2 6" />
        {masts.map(x => <path key={x} d={`M${x} 2 V${RAIL_Y + 6} M${x} 7 H${x + 16}`} strokeOpacity="0.18" />)}
        {/* Track */}
        <rect x="0" y={RAIL_Y + 2} width={width} height="8" fill="url(#sri-sleepers)" stroke="none" />
        <path d={`M0 ${RAIL_Y + 1} H${width}`} strokeOpacity="0.75" />
        <path d={`M0 ${RAIL_Y + 7} H${width}`} strokeOpacity="0.3" />
        {/* Train: cab car, coaches, power car */}
        <PowerCar x={start} flip />
        {Array.from({ length: coaches }, (_, i) => <Coach key={i} x={start + END + i * CAR} />)}
        <PowerCar x={start + END + coaches * CAR} />
      </svg>
    </div>
  );
}
