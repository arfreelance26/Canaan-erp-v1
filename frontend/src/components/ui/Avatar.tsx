type AvatarProps = {
  photoUrl: string | null;
  label: string;
  size?: number;
};

export function Avatar({ photoUrl, label, size = 36 }: AvatarProps) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={label}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = label.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </div>
  );
}
