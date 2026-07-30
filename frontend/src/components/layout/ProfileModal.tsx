"use client";

import { useEffect, useState } from "react";
import {
  X,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  Building2,
  Hash,
  ShieldCheck,
  GitBranch,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatDateLong } from "@/lib/format-date";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

type StaffDetail = {
  name: string;
  staff_id: string;
  email: string | null;
  contact_number: string | null;
  department: string | null;
  designation: string | null;
  software_designation: string;
  branch: string | null;
  date_of_birth: string | null;
  date_of_joining: string | null;
  address: string | null;
  photo_url: string | null;
};

type ProfileModalProps = {
  open: boolean;
  onClose: () => void;
};


function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl bg-gray-50/80 px-3.5 py-2.5 transition-colors hover:bg-gray-100/80 dark:bg-white/5 dark:hover:bg-white/10">
      <span className="mt-0.5 h-4 w-4 shrink-0 text-blue-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {label}
        </p>
        <p className="mt-0.5 break-words text-sm font-medium text-gray-900 dark:text-white">
          {value}
        </p>
      </div>
    </div>
  );
}

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setProfile(null);

    // Admin has no DB record — build from auth context
    if (user.id === null || user.staffId === "ADMIN" || user.softwareDesignation === "Admin") {
      setProfile({
        name: user.name,
        staff_id: "ADMIN",
        email: user.email,
        contact_number: null,
        department: "Administration",
        designation: "System Administrator",
        software_designation: "Admin",
        branch: "All Branches",
        date_of_birth: null,
        date_of_joining: null,
        address: null,
        photo_url: user.photoUrl,
      });
      return;
    }

    setLoading(true);
    fetch(`${API_URL}/staff/${user.id}`)
      .then((r) => r.json())
      .then((data) => setProfile(data as StaffDetail))
      .catch(() =>
        setProfile({
          name: user.name,
          staff_id: user.staffId ?? "",
          email: user.email,
          contact_number: null,
          department: null,
          designation: null,
          software_designation: user.softwareDesignation,
          branch: null,
          date_of_birth: null,
          date_of_joining: null,
          address: null,
          photo_url: user.photoUrl,
        })
      )
      .finally(() => setLoading(false));
  }, [open, user]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const displayName = profile?.name ?? user?.name ?? "User";
  const photoSrc = profile?.photo_url ?? user?.photoUrl;
  const initials = getInitials(displayName);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/60 bg-white dark:bg-[#1a2035] dark:border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.15)] animate-[slideUpFade_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_both]">
        {/* Gradient header — avatar on left, info on right */}
        <div className="relative bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white/80 transition-all hover:bg-white/30 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-5">
            {/* Avatar */}
            {photoSrc ? (
              <img
                src={photoSrc}
                alt={displayName}
                className="h-20 w-20 shrink-0 rounded-full border-4 border-white/30 object-cover shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-white/30 bg-white/20 text-2xl font-bold text-white shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
                {initials}
              </div>
            )}

            {/* Info */}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">
                My Profile
              </p>
              <h2 className="mt-0.5 truncate text-xl font-bold text-white">
                {displayName}
              </h2>
              <span className="mt-1.5 inline-block rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold text-white">
                {profile?.software_designation ?? user?.softwareDesignation}
              </span>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="max-h-[50vh] overflow-y-auto px-5 pt-4 pb-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Row
                icon={<Hash className="h-4 w-4" />}
                label="Staff ID"
                value={profile?.staff_id}
              />
              <Row
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={profile?.email}
              />
              <Row
                icon={<Phone className="h-4 w-4" />}
                label="Contact Number"
                value={profile?.contact_number}
              />
              <Row
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Software Role"
                value={profile?.software_designation}
              />
              <Row
                icon={<Building2 className="h-4 w-4" />}
                label="Department"
                value={profile?.department}
              />
              <Row
                icon={<Briefcase className="h-4 w-4" />}
                label="Designation"
                value={profile?.designation}
              />

              <Row
                icon={<Calendar className="h-4 w-4" />}
                label="Date of Joining"
                value={profile?.date_of_joining ? formatDateLong(profile.date_of_joining) : null}
              />
              <Row
                icon={<Calendar className="h-4 w-4" />}
                label="Date of Birth"
                value={profile?.date_of_birth ? formatDateLong(profile.date_of_birth) : null}
              />
              <Row
                icon={<MapPin className="h-4 w-4" />}
                label="Address"
                value={profile?.address}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
