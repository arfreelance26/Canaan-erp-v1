import { Illustration } from "./Illustration";
import { cx } from "@/utils/cx";

/** The fleet truck photo (transparent PNG) used across the app. */
export const HERO_TRUCK = { src: "/images/hero-truck.png", alt: "Canaan Global truck" } as const;

type TruckSceneProps = {
  /** Sets the scene's height (and width); the truck fills the height. */
  className?: string;
  image?: { src: string; alt: string };
};

/**
 * The fleet truck between two unDraw plants, with a soft ground shadow.
 * Used by the dashboard heroes and the login panel.
 */
export function TruckScene({ className, image = HERO_TRUCK }: TruckSceneProps) {
  return (
    <div className={cx("truck-scene relative w-full", className)}>
      {/* Tall plant behind, on the left. */}
      <Illustration name="plant-a" className="absolute bottom-1 left-0 h-full" />
      {/* Ground shadow so the truck sits on the surface instead of floating. */}
      <span aria-hidden className="absolute bottom-1 left-1/2 h-4 w-3/4 -translate-x-1/2 rounded-[50%] bg-scrim/15 blur-md" />
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
      <img
        src={image.src}
        alt={image.alt}
        className="relative ml-auto h-full w-[80%] object-contain object-bottom"
        draggable={false}
      />
      {/* Shrub in front, on the right. */}
      <Illustration name="plant-b" className="absolute bottom-1 right-0 h-[27%]" />
    </div>
  );
}
