"use client";

import { RiShuffleLine as Shuffle } from "@remixicon/react";
import { ProfileAvatar, newAvatarSeed, type AvatarLook } from "@/components/ui/ProfileAvatar";
import { cn } from "@/lib/utils";

type Props = {
  look: AvatarLook | null | undefined;
  seed: string | null | undefined;
  /** The picture shown when no seed was ever picked (e.g. `vendor-12`). */
  fallbackSeed: string;
  onChange: (next: { look: AvatarLook; seed: string }) => void;
};

/** Profile picture with Shuffle and No Characters, for an Add / Edit form.
 *  The choice is saved with the record, so it follows that form's edit rules. */
export function ProfileAvatarPicker({ look, seed, fallbackSeed, onChange }: Props) {
  const shapes = look === "shapes";
  return (
    <div className="flex items-center gap-4 rounded-xl border border-separator-border p-3">
      <ProfileAvatar look={look} seed={seed || fallbackSeed} className="h-16 w-16 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-body-medium text-text-primary">Profile picture</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ look: look ?? "notionists", seed: newAvatarSeed() })}
            className="flex items-center gap-1.5 rounded-full border border-separator-border bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-text-primary shadow-sm hover:bg-fill-2"
          >
            <Shuffle className="h-3.5 w-3.5" /> Shuffle
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={shapes}
            onClick={() => onChange({ look: shapes ? "notionists" : "shapes", seed: seed || fallbackSeed })}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-caption-1-semibold shadow-sm transition-colors",
              shapes ? "border-accent-border-strong bg-accent-surface text-accent-text" : "border-separator-border bg-background-primary-default text-text-primary hover:bg-fill-2",
            )}
          >
            {/* Track 24px, knob 10px, 2px inset: off at 2px, on at 12px. */}
            <span className={cn("relative h-3.5 w-6 shrink-0 rounded-full transition-colors", shapes ? "bg-accent-solid" : "bg-fill-4")}>
              <span className={cn("absolute left-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-fill-2 shadow-sm transition-transform", shapes ? "translate-x-2.5" : "translate-x-0")} />
            </span>
            No Characters
          </button>
        </div>
      </div>
    </div>
  );
}
