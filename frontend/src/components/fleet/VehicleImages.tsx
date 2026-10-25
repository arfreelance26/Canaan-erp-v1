"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Eye, ImagePlus, RefreshCw, Trash2, Star } from "lucide-react";
import { fileUrl } from "@/lib/api";
import { showError, validateFileSize, MAX_FILE_SIZE_MB } from "@/lib/swal";
import { FileViewer } from "@/components/ui/FileViewer";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";

/** Upload field (routers/files.py FIELD_MAP["trucks"]) → the Truck's filename key. */
export const VEHICLE_IMAGES = [
  { field: "photo",      nameKey: "truckPhotosFileName", label: "Vehicle Identity Image" },
  { field: "front_view", nameKey: "frontViewFileName",   label: "Vehicle's Front View" },
  { field: "rear_view",  nameKey: "rearViewFileName",    label: "Vehicle's Rear View" },
  { field: "left_view",  nameKey: "leftViewFileName",    label: "Vehicle's Left Side View" },
  { field: "right_view", nameKey: "rightViewFileName",   label: "Vehicle's Right Side View" },
] as const;

export type VehicleImageField = (typeof VEHICLE_IMAGES)[number]["field"];
export type VehicleImageNameKey = (typeof VEHICLE_IMAGES)[number]["nameKey"];

// Bumped per truck once its images finish uploading, so the card / form don't
// keep showing the browser-cached old image under the same URL.
const imageStamp: Record<string, number> = {};
export function bustTruckImages(truckId: string) {
  imageStamp[truckId] = Date.now();
}

/** A stored truck image's URL, cache-busted by the truck's version + last upload. */
export function truckImageUrl(truck: Pick<Truck, "id" | "version">, field: VehicleImageField): string {
  const url = fileUrl("trucks", truck.id, field);
  return `${url}${url.includes("?") ? "&" : "?"}v=${truck.version ?? 0}-${imageStamp[truck.id] ?? 0}`;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

type TileProps = {
  label: string;
  primary?: boolean;
  /** Preview to show: a freshly picked file's object URL, or the stored image. */
  src: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
};

function ImageTile({ label, primary, src, onPick, onRemove }: TileProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState(false);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  function choose(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showError("Please choose an image (JPG, PNG, WEBP or GIF).");
      return;
    }
    if (!validateFileSize(file)) return;
    onPick(file);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", primary && "sm:col-span-2")}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
        {label}
        {primary && (
          <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
            <Star className="h-2.5 w-2.5" /> Shown on the truck card
          </span>
        )}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }}
      />
      {src && !broken ? (
        <div className={cn("group relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100", primary ? "h-44" : "h-32")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={label} onError={() => setBroken(true)} className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <TileButton onClick={() => setViewing(true)} label="View"><Eye className="h-4 w-4" /></TileButton>
            <TileButton onClick={() => inputRef.current?.click()} label="Replace"><RefreshCw className="h-4 w-4" /></TileButton>
            <TileButton onClick={onRemove} label="Remove" danger><Trash2 className="h-4 w-4" /></TileButton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files?.[0]); }}
          className={cn(
            "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 text-gray-400 transition-colors hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600",
            primary ? "h-44" : "h-32",
          )}
        >
          {primary ? <Camera className="h-7 w-7" /> : <ImagePlus className="h-6 w-6" />}
          <span className="text-xs font-medium">{broken ? "Couldn't show the saved file — upload an image" : "Click or drop an image"}</span>
          <span className="text-[10px]">JPG, PNG, WEBP or GIF · max {MAX_FILE_SIZE_MB} MB</span>
        </button>
      )}
      {src && (
        <FileViewer open={viewing} onClose={() => setViewing(false)} url={src} title={label} />
      )}
    </div>
  );
}

function TileButton({ onClick, label, danger, children }: { onClick: () => void; label: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow transition hover:scale-105",
        danger ? "hover:text-red-600" : "hover:text-blue-600",
      )}
    >
      {children}
    </button>
  );
}

type SectionProps = {
  /** The truck being edited (null when adding) — its stored images are shown. */
  truck: Truck | null;
  /** Current filename per image (from the form). null = no image. */
  names: Record<VehicleImageNameKey, string | null>;
  files: Partial<Record<VehicleImageField, File | null>>;
  onPick: (field: VehicleImageField, nameKey: VehicleImageNameKey, file: File) => void;
  onRemove: (field: VehicleImageField, nameKey: VehicleImageNameKey) => void;
};

/** Truck form → "Vehicle Images": the identity image plus the four side views. */
export function VehicleImagesSection({ truck, names, files, onPick, onRemove }: SectionProps) {
  // Object URLs for freshly picked files, revoked when replaced / unmounted.
  const [previews, setPreviews] = useState<Partial<Record<VehicleImageField, string>>>({});
  useEffect(() => {
    const next: Partial<Record<VehicleImageField, string>> = {};
    for (const { field } of VEHICLE_IMAGES) {
      const f = files[field];
      if (f) next[field] = URL.createObjectURL(f);
    }
    setPreviews(next);
    return () => Object.values(next).forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {VEHICLE_IMAGES.map(({ field, nameKey, label }) => {
        const stored = truck && names[nameKey] && truck[nameKey] ? truckImageUrl(truck, field) : null;
        return (
          <ImageTile
            key={field}
            label={label}
            primary={field === "photo"}
            src={previews[field] ?? stored}
            onPick={(file) => onPick(field, nameKey, file)}
            onRemove={() => onRemove(field, nameKey)}
          />
        );
      })}
    </div>
  );
}
