"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  RiCloseLine as X, RiDeleteBinLine as Trash, RiEditLine as Pencil, RiEyeLine as Eye, RiImageAddLine as ImageAdd,
  RiLoader4Line as Loader, RiPushpinLine as Pin, RiUnpinLine as Unpin, RiAlarmWarningLine as Alert,
  RiEmotionLaughLine as AddReaction, RiSearchLine as Search, RiMegaphoneLine as Megaphone, RiTimeLine as Clock,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import { noticesApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { confirmDelete, showError, showToast } from "@/lib/feedback";
import { SHORTCUTS, useShortcutPanel } from "@/lib/shortcuts";
import { NOTICE_BOARD_OPEN_EVENT, getUnseenNotices, openNoticeBoard, setUnseenNotices, useUnseenNotices } from "@/lib/notice-board";
import { shrinkImage } from "@/lib/image-shrink";
import { Avatar as PersonAvatar } from "@/components/ui/Avatar";
import { ReactionMenu } from "@/components/chat/ReactionMenu";
import { WorkspaceTile } from "./WorkspaceTile";
import {
  NOTICE_MAX_BODY, NOTICE_MAX_IMAGES, NOTICE_MAX_IMAGE_BYTES, NOTICE_MAX_TITLE,
  type Notice, type NoticeExpiry, type NoticeSeenRow,
} from "@/types/notice";

/**
 * Notice Board — a company-wide board (backend/routers/notices.py). Its
 * megaphone button sits next to the notification bell (B opens it too,
 * lib/shortcuts.ts) and the board drops down from there. Anyone posts — paste text or a screenshot — and
 * everyone sees it, live. Authors edit or delete their own; Admin deletes or
 * pins anyone's. Any emoji reaction. New notices show in the bell; an
 * Important one also pops up for everyone online.
 */

const EXPIRY_OPTIONS: { value: NoticeExpiry; label: string }[] = [
  { value: null, label: "Keep" },
  { value: 1, label: "1 day" },
  { value: 7, label: "1 week" },
  { value: 30, label: "1 month" },
];

type Picked = { key: string; file: File; url: string };

function utc(raw: string | null): Date | null {
  if (!raw) return null;
  return new Date(raw.endsWith("Z") || raw.includes("+") ? raw : `${raw}Z`);
}

function ago(raw: string | null): string {
  const d = utc(raw);
  if (!d) return "";
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
}

function removesIn(raw: string | null): string {
  const d = utc(raw);
  if (!d) return "";
  const h = Math.max(0, Math.round((d.getTime() - Date.now()) / 3_600_000));
  return h < 24 ? `Removes in ${Math.max(1, h)}h` : `Removes in ${Math.round(h / 24)}d`;
}

/** Text with http(s) links made clickable; everything else stays plain text. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-accent-text underline underline-offset-2 hover:text-accent-text-strong">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

// Pictures need the sign-in header, so they're fetched as blobs and kept for the session.
const imageUrls = new Map<string, Promise<string>>();
function imageUrl(noticeId: number, imageId: number): Promise<string> {
  const key = `${noticeId}:${imageId}`;
  let p = imageUrls.get(key);
  if (!p) {
    p = noticesApi.imageBlob(noticeId, imageId).then((b) => URL.createObjectURL(b));
    p.catch(() => imageUrls.delete(key));
    imageUrls.set(key, p);
  }
  return p;
}

function NoticePicture({ noticeId, imageId, onOpen, onRemove }: {
  noticeId: number; imageId: number; onOpen: (url: string) => void; onRemove?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    imageUrl(noticeId, imageId).then((u) => live && setUrl(u)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [noticeId, imageId]);
  return (
    <div className="group/img relative aspect-video overflow-hidden rounded-lg border border-separator-border bg-fill-1">
      {url ? (
        <button type="button" onClick={() => onOpen(url)} className="block h-full w-full" aria-label="Open picture">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-full items-center justify-center text-caption-2-medium text-text-tertiary">
          {failed ? "Couldn't load" : <Loader className="h-4 w-4 animate-spin" />}
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove picture"
          className="absolute right-1 top-1 rounded-full bg-scrim/70 p-0.5 text-on-solid transition-opacity hover:bg-scrim"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function NoticeBoard() {
  const { user } = useAuth();
  const myId = user?.id ?? null;
  const isAdmin = user?.softwareDesignation === "Admin";
  const unseen = useUnseenNotices();
  // The built-in admin login has no staff record: it can read, pin and delete,
  // but posting and reacting need a name to show.
  const canWrite = myId != null;

  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [focusId, setFocusId] = useState<number | null>(null);

  // Composer
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(false);
  const [expiry, setExpiry] = useState<NoticeExpiry>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [posting, setPosting] = useState(false);

  // Editing one notice in place
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editImportant, setEditImportant] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [seenFor, setSeenFor] = useState<{ id: number; rows: NoticeSeenRow[] | null } | null>(null);
  const [reactFor, setReactFor] = useState<{ id: number; anchor: HTMLElement } | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  // ── Unseen notices (the bell) + the Important pop-up ──────────────────────
  const knownUnseen = useRef<Set<number> | null>(null);
  // A notice just arrived (not the first load): the button's ring or shake.
  const [arrival, setArrival] = useState<{ key: number; important: boolean } | null>(null);
  const refreshUnseen = useCallback(() => {
    if (myId == null) return;
    noticesApi.unseen().then((list) => {
      const before = knownUnseen.current;
      if (before) {
        const arrived = list.filter((n) => !before.has(n.id));
        if (arrived.length) setArrival({ key: Date.now(), important: arrived.some((n) => n.important) });
        const fresh = list.filter((n) => n.important && !before.has(n.id));
        if (fresh.length && !openRef.current) {
          const n = fresh[0];
          showToast(
            `${n.authorName}: ${n.title || n.preview || "a picture"}`.slice(0, 160),
            "warning",
            `Important notice — press ${SHORTCUTS.board.key} to open`,
            12_000,
          );
        }
      }
      knownUnseen.current = new Set(list.map((n) => n.id));
      setUnseenNotices(list);
    }).catch(() => {});
  }, [myId]);
  useEffect(() => { refreshUnseen(); }, [refreshUnseen]);

  // ── The board ─────────────────────────────────────────────────────────────
  const load = useCallback((q: string) => {
    setLoading(true);
    noticesApi.list(q)
      .then((list) => {
        setNotices(list);
        // On screen = seen (not my own; those never count as unread).
        const ids = list.filter((n) => !n.seenByMe && !n.mine).map((n) => n.id);
        if (ids.length) {
          setUnseenNotices(getUnseenNotices().filter((u) => !ids.includes(u.id)));
          noticesApi.markSeen(ids).then(refreshUnseen).catch(() => {});
        }
      })
      .catch((err: unknown) => showError(err instanceof Error ? err.message : "Couldn't load the Notice Board."))
      .finally(() => setLoading(false));
  }, [refreshUnseen]);

  const searchRef = useRef(search);
  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => load(search), search ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [open, search, load]);

  useWebSocketEvent("notice_board_updated", () => {
    refreshUnseen();
    if (openRef.current) load(searchRef.current);
  });

  const close = useCallback(() => {
    setOpen(false);
    setReactFor(null);
    setSeenFor(null);
    setViewer(null);
    setFocusId(null);
  }, []);

  useShortcutPanel("board", () => (openRef.current ? close() : setOpen(true)));

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ noticeId?: number }>).detail?.noticeId;
      setSearch("");
      setFocusId(id ?? null);
      setOpen(true);
    };
    window.addEventListener(NOTICE_BOARD_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(NOTICE_BOARD_OPEN_EVENT, onOpen);
  }, []);

  // Scroll to the notice opened from the bell.
  useEffect(() => {
    if (!open || focusId == null || loading) return;
    const t = window.setTimeout(() => {
      document.getElementById(`notice-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    const clear = window.setTimeout(() => setFocusId(null), 3500);
    return () => { window.clearTimeout(t); window.clearTimeout(clear); };
  }, [open, focusId, loading, notices]);

  // Close on Esc or a click outside (the emoji menu and picture viewer are portals: not outside).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || rootRef.current?.contains(t) || t.closest("[data-reaction-menu],[data-notice-viewer]")) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (viewer) setViewer(null);
      else if (!reactFor) close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, viewer, reactFor]);

  // ── Composer ──────────────────────────────────────────────────────────────
  function resetComposer() {
    picked.forEach((p) => URL.revokeObjectURL(p.url));
    setPicked([]);
    setTitle("");
    setBody("");
    setImportant(false);
    setExpiry(null);
    setWriting(false);
  }

  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const room = NOTICE_MAX_IMAGES - picked.length;
    if (room <= 0) {
      showError(`A notice can have at most ${NOTICE_MAX_IMAGES} pictures.`);
      return;
    }
    const added: Picked[] = [];
    for (const f of images.slice(0, room)) {
      const small = await shrinkImage(f);
      if (small.size > NOTICE_MAX_IMAGE_BYTES) {
        showError(`"${f.name || "Picture"}" is still over ${NOTICE_MAX_IMAGE_BYTES / (1024 * 1024)} MB after shrinking.`);
        continue;
      }
      added.push({ key: crypto.randomUUID(), file: small, url: URL.createObjectURL(small) });
    }
    if (images.length > room) showError(`Only ${NOTICE_MAX_IMAGES} pictures fit on one notice — the rest were skipped.`);
    if (added.length) {
      setPicked((prev) => [...prev, ...added]);
      setWriting(true);
    }
  }

  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;          // plain text pastes as usual
    e.preventDefault();
    void addFiles(files);
  }

  async function post() {
    if (posting) return;
    if (!title.trim() && !body.trim() && picked.length === 0) return;
    setPosting(true);
    try {
      const n = await noticesApi.create({
        title: title.trim(), body: body.trim(), important, expiresInDays: expiry, hasImages: picked.length > 0,
      });
      const failed: string[] = [];
      for (const p of picked) {
        try {
          await noticesApi.uploadImage(n.id, p.file);
        } catch (err) {
          failed.push(`${p.file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
        }
      }
      if (failed.length === picked.length && picked.length > 0 && !title.trim() && !body.trim()) {
        await noticesApi.remove(n.id).catch(() => {});      // nothing made it up — don't leave an empty notice
        showError(failed.join("\n"), "The picture couldn't be posted");
      } else {
        if (failed.length) showError(failed.join("\n"), "Some pictures weren't added");
        resetComposer();
      }
      load(search);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't post the notice.");
    } finally {
      setPosting(false);
    }
  }

  // ── Notice actions ────────────────────────────────────────────────────────
  const replace = (n: Notice) => setNotices((prev) => prev.map((x) => (x.id === n.id ? n : x)));

  function startEdit(n: Notice) {
    setEditingId(n.id);
    setEditTitle(n.title);
    setEditBody(n.body);
    setEditImportant(n.important);
  }

  async function saveEdit(n: Notice) {
    setSavingEdit(true);
    try {
      replace(await noticesApi.update(n.id, { title: editTitle.trim(), body: editBody.trim(), important: editImportant }));
      setEditingId(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't save the notice.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function remove(n: Notice) {
    const label = n.mine ? "this notice" : `${n.authorName}'s notice`;
    if (!(await confirmDelete(label)).isConfirmed) return;
    try {
      await noticesApi.remove(n.id);
      setNotices((prev) => prev.filter((x) => x.id !== n.id));
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't delete the notice.");
    }
  }

  async function removePicture(n: Notice, imageId: number) {
    try {
      await noticesApi.removeImage(n.id, imageId);
      replace({ ...n, images: n.images.filter((i) => i.id !== imageId) });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't remove the picture.");
    }
  }

  async function togglePin(n: Notice) {
    try {
      await noticesApi.pin(n.id, !n.pinned);
      load(search);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't pin the notice.");
    }
  }

  async function react(id: number, emoji: string) {
    try {
      replace(await noticesApi.react(id, emoji));
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't react.");
    }
  }

  async function showSeen(n: Notice) {
    if (seenFor?.id === n.id) {
      setSeenFor(null);
      return;
    }
    setSeenFor({ id: n.id, rows: null });
    try {
      const rows = await noticesApi.seenBy(n.id);
      setSeenFor((cur) => (cur?.id === n.id ? { id: n.id, rows } : cur));
    } catch (err) {
      setSeenFor(null);
      showError(err instanceof Error ? err.message : "Couldn't load who has seen it.");
    }
  }

  const canPost = (title.trim() || body.trim() || picked.length > 0) && !posting;
  const count = useMemo(() => notices.length, [notices]);

  const unseenImportant = unseen.some((n) => n.important);
  const importantCount = unseen.filter((n) => n.important).length;
  // The button itself says there's something new: filled blue for new notices,
  // filled red while an Important one is unseen (theme colours, light and dark).
  // Back to normal once they're seen (opening the board marks them seen).
  const tone: "open" | "important" | "new" | "idle" = open ? "open" : unseenImportant ? "important" : unseen.length ? "new" : "idle";
  const buttonLabel = unseen.length
    ? `Notice Board — ${unseen.length} new notice${unseen.length === 1 ? "" : "s"}${importantCount ? `, ${importantCount} important` : ""}`
    : "Notice Board";

  return (
    <div ref={rootRef} className="relative" data-notice-board>
      <button
        type="button"
        aria-label={buttonLabel}
        aria-keyshortcuts={SHORTCUTS.board.key}
        title={`${buttonLabel} (${SHORTCUTS.board.key})`}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition duration-300",
          "hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4 focus:ring-accent-solid/10",
          tone === "open" && "border-accent-border-strong bg-accent-surface text-accent-text-strong",
          tone === "important" && "border-danger-solid bg-danger-solid text-on-solid hover:bg-danger-solid-hover focus:ring-danger-solid/20",
          tone === "new" && "border-accent-solid bg-accent-solid text-on-solid hover:bg-accent-solid-hover",
          tone === "idle" && "border-separator-border bg-background-primary-default text-text-secondary hover:border-accent-border hover:bg-accent-surface-strong hover:text-accent-text",
        )}
      >
        {/* When a notice arrives: one soft ring (new) or a little shake (Important). Re-keyed per arrival. */}
        {arrival && (
          <span
            key={arrival.key}
            aria-hidden
            className={cn("pointer-events-none absolute inset-0 rounded-full", arrival.important ? "notice-ring notice-ring-important" : "notice-ring")}
          />
        )}
        <Megaphone
          key={arrival?.important ? arrival.key : "still"}
          className={cn("h-5 w-5 transition-transform duration-300 group-hover:-rotate-12", arrival?.important && "notice-shake")}
        />
        {unseen.length > 0 && (
          <span
            className={cn(
              // On the filled button the count flips to white with coloured digits, so it stays readable.
              "absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-caption-2-semibold ring-2",
              open
                ? cn("text-on-solid ring-background-primary-default", unseenImportant ? "bg-danger-solid" : "bg-accent-solid")
                : cn("bg-background-primary-default", unseenImportant ? "text-danger-text ring-danger-solid" : "text-accent-text ring-accent-solid"),
            )}
          >
            {unseen.length > 99 ? "99+" : unseen.length}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notice Board"
          className="absolute right-0 top-full z-[100] mt-3 flex max-h-[calc(100vh-96px)] w-[calc(100vw-24px)] origin-top-right flex-col overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-[0_10px_40px_rgba(0,0,0,0.12)] sm:w-[460px]"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-separator-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-accent-border bg-accent-surface text-accent-text">
                <Megaphone className="h-4 w-4" />
              </span>
              <div>
                <p className="text-body-2-semibold text-text-primary">Notice Board</p>
                <p className="text-caption-2-medium text-text-tertiary">Everyone can see this · press {SHORTCUTS.board.key} to open or close</p>
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Close Notice Board" className="rounded-lg p-1 text-text-tertiary hover:text-text-secondary">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Composer */}
          {!canWrite ? (
            <p className="shrink-0 border-b border-separator-border bg-fill-1 px-4 py-3 text-xs text-text-secondary">
              Sign in with a staff account to post or react. This login can read, pin and delete notices.
            </p>
          ) : (
          <div className="shrink-0 border-b border-separator-border bg-fill-1 px-4 py-3">
            {writing && (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onPaste={onPaste}
                maxLength={NOTICE_MAX_TITLE}
                placeholder="Title (optional)"
                className="mb-2 w-full rounded-lg border border-separator-border bg-background-primary-default px-3 py-2 text-body-semibold text-text-primary outline-none focus:border-accent-border-strong"
              />
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={() => setWriting(true)}
              onPaste={onPaste}
              maxLength={NOTICE_MAX_BODY}
              rows={writing ? 4 : 1}
              placeholder="Write or paste a notice for everyone… (screenshots too)"
              className="w-full resize-none rounded-lg border border-separator-border bg-background-primary-default px-3 py-2 text-sm text-text-primary outline-none transition-[height] placeholder:text-text-placeholder focus:border-accent-border-strong"
            />
            {picked.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {picked.map((p) => (
                  <div key={p.key} className="relative aspect-square overflow-hidden rounded-lg border border-separator-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remove picture"
                      onClick={() => {
                        URL.revokeObjectURL(p.url);
                        setPicked((prev) => prev.filter((x) => x.key !== p.key));
                      }}
                      className="absolute right-1 top-1 rounded-full bg-scrim/70 p-0.5 text-on-solid hover:bg-scrim"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {writing && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={picked.length >= NOTICE_MAX_IMAGES}
                  title={`Add pictures (up to ${NOTICE_MAX_IMAGES})`}
                  className="flex items-center gap-1 rounded-full border border-separator-border bg-background-primary-default px-2.5 py-1 text-caption-1-medium text-text-secondary hover:bg-fill-2 disabled:opacity-40"
                >
                  <ImageAdd className="h-3.5 w-3.5" /> Picture
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void addFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setImportant((v) => !v)}
                  aria-pressed={important}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-caption-1-medium transition-colors",
                    important ? "border-danger-border bg-danger-surface text-danger-text" : "border-separator-border bg-background-primary-default text-text-secondary hover:bg-fill-2",
                  )}
                >
                  <Alert className="h-3.5 w-3.5" /> Important
                </button>
                <label className="flex items-center gap-1 text-caption-1-medium text-text-secondary">
                  <Clock className="h-3.5 w-3.5" />
                  <select
                    value={expiry ?? ""}
                    onChange={(e) => setExpiry(e.target.value ? (Number(e.target.value) as NoticeExpiry) : null)}
                    aria-label="Remove after"
                    className="rounded-full border border-separator-border bg-background-primary-default px-2 py-1 text-caption-1-medium text-text-secondary outline-none"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.label} value={o.value ?? ""}>{o.value ? `Remove after ${o.label}` : "Keep until deleted"}</option>
                    ))}
                  </select>
                </label>
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={resetComposer} className="rounded-full px-3 py-1 text-caption-1-medium text-text-secondary hover:bg-fill-2">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void post()}
                    disabled={!canPost}
                    className="flex items-center gap-1 rounded-full bg-accent-solid px-4 py-1.5 text-caption-1-semibold text-on-solid hover:bg-accent-solid-hover disabled:opacity-50"
                  >
                    {posting && <Loader className="h-3.5 w-3.5 animate-spin" />} Post
                  </button>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Search */}
          <div className="shrink-0 px-4 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notices…"
                className="w-full rounded-full border border-separator-border bg-background-primary-default py-1.5 pl-9 pr-3 text-sm outline-none focus:border-accent-border-strong"
              />
            </div>
          </div>

          {/* Notices */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {loading && notices.length === 0 ? (
              <div className="flex justify-center py-10"><Loader className="h-5 w-5 animate-spin text-text-tertiary" /></div>
            ) : count === 0 ? (
              <div className="py-10 text-center">
                <p className="text-body-semibold text-text-primary">{search ? "No notices match" : "Nothing on the board yet"}</p>
                <p className="mt-1 text-xs text-text-tertiary">{search ? "Try another word." : "Post the first notice — everyone will see it."}</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {notices.map((n) => {
                  const editing = editingId === n.id;
                  return (
                    <li
                      key={n.id}
                      id={`notice-${n.id}`}
                      className={cn(
                        "group rounded-xl border bg-background-primary-default p-3 transition-shadow",
                        n.important ? "border-danger-border border-l-4" : "border-separator-border",
                        focusId === n.id && "ring-2 ring-accent-border",
                      )}
                    >
                      {/* Author line + actions */}
                      <div className="flex items-start gap-2.5">
                        <PersonAvatar label={n.authorName} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-caption-1-semibold text-text-primary">
                            {n.authorName}
                            {n.authorRole && <span className="ml-1.5 font-normal text-text-tertiary">{n.authorRole}</span>}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-text-tertiary">
                            <span>{ago(n.createdAt)}</span>
                            {n.editedAt && <span>· edited</span>}
                            {n.expiresAt && <span>· {removesIn(n.expiresAt)}</span>}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {n.pinned && (
                            <span className="flex items-center gap-0.5 rounded-full bg-accent-surface px-1.5 py-px text-[10px] font-semibold text-accent-text">
                              <Pin className="h-3 w-3" /> Pinned
                            </span>
                          )}
                          {n.important && (
                            <span className="rounded-full bg-danger-surface px-1.5 py-px text-[10px] font-semibold text-danger-text">Important</span>
                          )}
                        </div>
                      </div>

                      {editing ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            maxLength={NOTICE_MAX_TITLE}
                            placeholder="Title (optional)"
                            className="w-full rounded-lg border border-separator-border bg-background-primary-default px-3 py-1.5 text-body-semibold outline-none focus:border-accent-border-strong"
                          />
                          <textarea
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            maxLength={NOTICE_MAX_BODY}
                            rows={4}
                            className="w-full resize-none rounded-lg border border-separator-border bg-background-primary-default px-3 py-2 text-sm outline-none focus:border-accent-border-strong"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditImportant((v) => !v)}
                              aria-pressed={editImportant}
                              className={cn(
                                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-caption-1-medium",
                                editImportant ? "border-danger-border bg-danger-surface text-danger-text" : "border-separator-border text-text-secondary hover:bg-fill-2",
                              )}
                            >
                              <Alert className="h-3.5 w-3.5" /> Important
                            </button>
                            <div className="ml-auto flex gap-2">
                              <button type="button" onClick={() => setEditingId(null)} className="rounded-full px-3 py-1 text-caption-1-medium text-text-secondary hover:bg-fill-2">Cancel</button>
                              <button
                                type="button"
                                onClick={() => void saveEdit(n)}
                                disabled={savingEdit || (!editTitle.trim() && !editBody.trim() && n.images.length === 0)}
                                className="rounded-full bg-accent-solid px-4 py-1 text-caption-1-semibold text-on-solid hover:bg-accent-solid-hover disabled:opacity-50"
                              >
                                {savingEdit ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          {n.title && <p className="mt-2 text-body-semibold text-text-primary">{n.title}</p>}
                          {n.body && (
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
                              <Linkified text={n.body} />
                            </p>
                          )}
                        </>
                      )}

                      {n.images.length > 0 && (
                        <div className={cn("mt-2 grid gap-2", n.images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                          {n.images.map((img) => (
                            <NoticePicture
                              key={img.id}
                              noticeId={n.id}
                              imageId={img.id}
                              onOpen={setViewer}
                              onRemove={editing ? () => void removePicture(n, img.id) : undefined}
                            />
                          ))}
                        </div>
                      )}

                      {/* Reactions + actions */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {n.reactions.map((r) => (
                          <button
                            key={r.emoji}
                            type="button"
                            onClick={() => canWrite && void react(n.id, r.emoji)}
                            title={r.names.join(", ")}
                            className={cn(
                              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                              r.mine ? "border-accent-border-strong bg-accent-surface text-accent-text" : "border-separator-border bg-fill-1 text-text-secondary hover:bg-fill-2",
                            )}
                          >
                            <span className="text-sm leading-none">{r.emoji}</span>
                            <span className="tabular-nums">{r.count}</span>
                          </button>
                        ))}
                        {canWrite && <button
                          type="button"
                          onClick={(e) => {
                            const anchor = e.currentTarget;
                            setReactFor((cur) => (cur?.id === n.id ? null : { id: n.id, anchor }));
                          }}
                          aria-label="Add a reaction"
                          title="Add a reaction"
                          className="rounded-full border border-dashed border-separator-border p-1 text-text-tertiary hover:bg-fill-2 hover:text-text-secondary"
                        >
                          <AddReaction className="h-3.5 w-3.5" />
                        </button>}

                        <div className="ml-auto flex items-center gap-0.5">
                          {n.canSeeSeenBy && (
                            <button
                              type="button"
                              onClick={() => void showSeen(n)}
                              title="Who has seen it"
                              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] text-text-tertiary hover:bg-fill-2 hover:text-text-secondary"
                            >
                              <Eye className="h-3.5 w-3.5" /> Seen by {n.seenCount}
                            </button>
                          )}
                          {isAdmin && (
                            <button type="button" onClick={() => void togglePin(n)} title={n.pinned ? "Unpin" : "Pin to the top"} aria-label={n.pinned ? "Unpin" : "Pin to the top"} className="rounded-full p-1 text-text-tertiary hover:bg-fill-2 hover:text-text-secondary">
                              {n.pinned ? <Unpin className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {n.canEdit && !editing && (
                            <button type="button" onClick={() => startEdit(n)} title="Edit" aria-label="Edit notice" className="rounded-full p-1 text-text-tertiary hover:bg-fill-2 hover:text-text-secondary">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {n.canDelete && (
                            <button type="button" onClick={() => void remove(n)} title="Delete" aria-label="Delete notice" className="rounded-full p-1 text-text-tertiary hover:bg-danger-surface hover:text-danger-text">
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {seenFor?.id === n.id && (
                        <div className="mt-2 rounded-lg border border-separator-border bg-fill-1 px-3 py-2">
                          {seenFor.rows === null ? (
                            <Loader className="h-4 w-4 animate-spin text-text-tertiary" />
                          ) : seenFor.rows.length === 0 ? (
                            <p className="text-xs text-text-tertiary">Nobody has opened it yet.</p>
                          ) : (
                            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                              {seenFor.rows.map((r, i) => (
                                <li key={i} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="text-text-primary">{r.name}{r.role && <span className="ml-1 text-text-tertiary">{r.role}</span>}</span>
                                  <span className="text-text-tertiary">{ago(r.seenAt)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {reactFor && (
        <ReactionMenu
          anchor={reactFor.anchor}
          align="start"
          current={null}
          zIndexClass="z-[110]"
          onPick={(emoji) => {
            const id = reactFor.id;
            setReactFor(null);
            void react(id, emoji);
          }}
          onClose={() => setReactFor(null)}
        />
      )}

      {viewer && createPortal(
        <div
          data-notice-viewer
          className="fixed inset-0 z-[120] flex items-center justify-center bg-scrim/80 p-4"
          onClick={() => setViewer(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
          <button type="button" aria-label="Close picture" className="absolute right-4 top-4 rounded-full bg-scrim p-1.5 text-on-solid">
            <X className="h-5 w-5" />
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** My profile → Your workspace: the way in for anyone who forgets the B key. */
export function NoticeBoardTile() {
  const unseen = useUnseenNotices();
  return (
    <WorkspaceTile
      icon={Megaphone}
      title="Notice Board"
      shortcut={SHORTCUTS.board.key}
      count={unseen.length}
      countTone={unseen.some((n) => n.important) ? "attention" : "neutral"}
      summary={unseen.length ? `${unseen.length} new notice${unseen.length === 1 ? "" : "s"}` : "Notices everyone in the company can see"}
      onClick={() => openNoticeBoard()}
    />
  );
}
