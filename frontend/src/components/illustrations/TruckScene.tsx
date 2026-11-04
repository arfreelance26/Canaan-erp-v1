import { cx } from "@/utils/cx";

/** The fleet truck photo (transparent PNG) used across the app. */
export const HERO_TRUCK = { src: "/images/hero-truck.png", alt: "Canaan Global truck" } as const;

// The photo is 928 × 513; its four round headlights sit low on the grille.
// The glow layer uses the same box and fit as the photo (contain, bottom
// centre), so these points stay on the lamps at any size.
const PHOTO = { w: 928, h: 513 };
const HEADLIGHTS = [
  { x: 33, y: 356, r: 12 },
  { x: 58, y: 356, r: 12 },
  { x: 241, y: 359, r: 13 },
  { x: 272, y: 359, r: 13 },
];

/** Dark mode only (styles/brand.css): the headlights glow and light the road. */
function Headlights() {
  return (
    <svg
      aria-hidden
      className="truck-headlights pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox={`0 0 ${PHOTO.w} ${PHOTO.h}`}
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <radialGradient id="truck-hl-halo">
          <stop offset="0%" stopColor="#fff6d8" stopOpacity="0.85" />
          <stop offset="35%" stopColor="#ffe3a0" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffd27a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="truck-hl-core">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="60%" stopColor="#fff8e6" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff1c9" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="truck-hl-pool">
          <stop offset="0%" stopColor="#ffe9b0" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#ffe9b0" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Light on the road in front of the bumper. */}
      <ellipse cx={160} cy={498} rx={200} ry={20} fill="url(#truck-hl-pool)" className="truck-headlights-pool" />
      {HEADLIGHTS.map((l, i) => (
        <g key={i}>
          <circle cx={l.x} cy={l.y} r={l.r * 4.2} fill="url(#truck-hl-halo)" className="truck-headlights-halo" />
          <circle cx={l.x} cy={l.y} r={l.r * 1.15} fill="url(#truck-hl-core)" />
        </g>
      ))}
    </svg>
  );
}

type TruckSceneProps = {
  /** Sets the scene's height (and width); the truck fills the height. */
  className?: string;
  image?: { src: string; alt: string };
};

/**
 * The fleet truck on its own, with a soft ground shadow (and glowing
 * headlights in dark mode).
 * Used by the dashboard heroes and the login panel.
 */
export function TruckScene({ className, image = HERO_TRUCK }: TruckSceneProps) {
  return (
    <div className={cx("truck-scene relative w-full", className)}>
      {/* Ground shadow so the truck sits on the surface instead of floating. */}
      <span aria-hidden className="absolute bottom-1 left-1/2 h-4 w-3/4 -translate-x-1/2 rounded-[50%] bg-scrim/15 blur-md" />
      <div className="relative ml-auto h-full w-[80%]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
        <img
          src={image.src}
          alt={image.alt}
          className="relative h-full w-full object-contain object-bottom"
          draggable={false}
        />
        {image.src === HERO_TRUCK.src && <Headlights />}
      </div>
    </div>
  );
}
