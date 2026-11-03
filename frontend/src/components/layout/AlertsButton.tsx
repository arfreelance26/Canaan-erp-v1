"use client";

import { useEffect, useState } from "react";
import { RiNotification4Line as BellRing, RiLoader4Line as Loader2, RiSearchLine as Search, RiSendPlaneLine as Send, RiGroupLine as Users } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/Dialog";
import { Avatar } from "@/components/chat/shared";
import { activityApi, chatApi, roomSummonApi, type Presence, type PresenceStatus } from "@/lib/api";
import { screenName } from "@/lib/screen-names";
import type { ChatMember, ChatConversation } from "@/types/chat";
import { showError, showToast } from "@/lib/feedback";

type Tab = "user" | "group";

const PRESENCE_REFRESH_MS = 20_000;
const STATUS_RANK: Record<PresenceStatus, number> = { active: 0, idle: 1, offline: 2 };

function lastSeen(raw: string | null): string {
  if (!raw) return "Not seen recently";
  const at = new Date(raw.endsWith("Z") || raw.includes("+") ? raw : `${raw}Z`).getTime();
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 60) return `Last seen ${Math.max(minutes, 1)}m ago`;
  if (minutes < 1440) return `Last seen ${Math.floor(minutes / 60)}h ago`;
  const days = Math.floor(minutes / 1440);
  return days === 1 ? "Last seen yesterday" : `Last seen ${days} days ago`;
}

/**
 * Admin-only "summon" button — picks a person or a Canaan Chat group and
 * pushes "The owner has requested your presence in their room." straight to
 * their screen (see RoomSummonListener, mounted in AppShell, for the receiving
 * end). Styled to match CalculatorButton's trigger, which this sits left of.
 * Who's online is the Activity Log's "Online now" (GET /activity/presence).
 */
export function AlertsButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("user");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<ChatMember[]>([]);
  const [groups, setGroups] = useState<ChatConversation[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [onlineOnly, setOnlineOnly] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([chatApi.listContacts(), chatApi.listConversations()])
      .then(([c, convs]) => {
        setContacts(c);
        setGroups(convs.filter((v) => v.kind === "group"));
      })
      .catch(() => showError("Could not load Canaan Chat contacts/groups."))
      .finally(() => setLoading(false));
  }, [open]);

  // A status that can't load just leaves the list without dots.
  useEffect(() => {
    if (!open) return;
    const load = () => activityApi.presence().then(setPresence).catch(() => {});
    load();
    const timer = setInterval(load, PRESENCE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [open]);

  function closeAndReset() {
    setOpen(false);
    setSearch("");
    setTab("user");
    setOnlineOnly(false);
    setPresence(null);
  }

  async function summonUser(member: ChatMember) {
    if (sendingId) return;
    setSendingId(member.staffId);
    try {
      await roomSummonApi.send("user", Number(member.staffId));
      showToast(`Invite sent to ${member.name}.`, "success", undefined, 2000);
      closeAndReset();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not send the invite.");
    } finally {
      setSendingId(null);
    }
  }

  async function summonGroup(group: ChatConversation) {
    if (sendingId) return;
    setSendingId(String(group.id));
    try {
      const result = await roomSummonApi.send("group", group.id);
      showToast(
        `Invite sent to ${result.recipientIds.length} member${result.recipientIds.length === 1 ? "" : "s"} of "${group.title}".`,
        "success",
        undefined,
        2000
      );
      closeAndReset();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not send the invite.");
    } finally {
      setSendingId(null);
    }
  }

  const statusOf = (c: ChatMember): PresenceStatus => presence?.people[c.staffId]?.status ?? "offline";
  const onlineCount = contacts.filter((c) => statusOf(c) !== "offline").length;
  const filteredContacts = contacts
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .filter((c) => !onlineOnly || statusOf(c) !== "offline")
    .sort((a, b) => STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)] || a.name.localeCompare(b.name));
  const filteredGroups = groups.filter((g) => (g.title ?? "").toLowerCase().includes(search.toLowerCase()));

  function statusLine(c: ChatMember) {
    const p = presence?.people[c.staffId];
    if (!p) return null;
    const where = p.screen ? ` · on ${screenName(p.screen)}` : "";
    if (p.status === "active") return <span className="text-success-text">Active now{where}</span>;
    if (p.status === "idle") return <span className="text-warning-text">Idle{where}</span>;
    return <span className="text-text-tertiary">{lastSeen(p.lastAt)}</span>;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Invite"
        title="Invite a user or group"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition duration-300",
          "shadow-md focus:outline-none focus:ring-4 focus:ring-warning-solid/20",
          "border-warning-border bg-warning-surface text-warning-text hover:border-warning-border-strong"
        )}
      >
        <BellRing className="h-5 w-5 transition-transform duration-300 group-hover:text-warning-text" />
      </button>

      <Dialog open={open} onClose={closeAndReset} title="Invite to your room" className="sm:max-w-md">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-text-secondary">
            Pick a person or a Canaan Chat group — they&apos;ll see a dialog telling them you&apos;ve requested their presence.
          </p>

          <div className="flex gap-2 rounded-full bg-fill-2 p-1">
            {([
              { id: "user", label: "User" },
              { id: "group", label: "Group" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 rounded-full py-1.5 text-body-semibold transition-colors",
                  tab === t.id ? "bg-background-primary-default text-accent-text-strong shadow-sm" : "text-text-secondary hover:text-text-primary"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "user" ? "Search people…" : "Search groups…"}
              className="w-full rounded-full border border-separator-border bg-fill-1 py-2 pl-9 pr-3 text-sm outline-none focus:border-gold-solid focus:bg-background-primary-default focus:ring-2 focus:ring-gold-solid/20"
            />
          </div>

          {tab === "user" && presence && !loading && (
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="flex items-center gap-2 text-caption-1-medium text-text-secondary">
                <span className="relative flex h-2 w-2">
                  {onlineCount > 0 && <span className="absolute inline-flex h-full w-full rounded-full bg-success-solid opacity-60" />}
                  <span className={cn("relative inline-flex h-2 w-2 rounded-full", onlineCount > 0 ? "bg-success-solid" : "bg-fill-4")} />
                </span>
                {onlineCount === 0 ? "No one online right now" : `${onlineCount} ${onlineCount === 1 ? "person" : "people"} online now`}
              </p>
              <button
                type="button"
                role="switch"
                aria-checked={onlineOnly}
                onClick={() => setOnlineOnly((v) => !v)}
                className="flex items-center gap-2 text-caption-1-medium text-text-secondary"
              >
                Online only
                <span className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors", onlineOnly ? "bg-success-solid" : "bg-fill-4")}>
                  <span className={cn("absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-fill-2 shadow transition-transform", onlineOnly ? "translate-x-3" : "translate-x-0")} />
                </span>
              </button>
            </div>
          )}

          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
              </div>
            ) : tab === "user" ? (
              filteredContacts.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-tertiary">
                  {onlineOnly && !search ? "No one is online right now." : <>No one matches &quot;{search}&quot;.</>}
                </p>
              ) : (
                filteredContacts.map((c) => {
                  const status = statusOf(c);
                  return (
                    <button
                      key={c.staffId}
                      type="button"
                      onClick={() => summonUser(c)}
                      disabled={sendingId !== null}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-fill-2 disabled:opacity-60"
                    >
                      <span className="relative shrink-0">
                        <Avatar name={c.name} photoUrl={c.photoUrl} size={36} />
                        {status !== "offline" && (
                          <span
                            title={status === "active" ? "Active now" : "Idle"}
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background-primary-default",
                              status === "active" ? "bg-success-solid" : "bg-warning-solid"
                            )}
                          />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-medium text-text-primary">{c.name}</p>
                        <p className="truncate text-xs text-text-tertiary">{c.designation || c.softwareDesignation || ""}</p>
                        <p className="truncate text-caption-2-medium">{statusLine(c)}</p>
                      </div>
                      {sendingId === c.staffId ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-tertiary" />
                      ) : (
                        <Send className="h-4 w-4 shrink-0 text-text-tertiary" />
                      )}
                    </button>
                  );
                })
              )
            ) : filteredGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-tertiary">No groups match &quot;{search}&quot;.</p>
            ) : (
              filteredGroups.map((g) => {
                const online = presence?.groups[String(g.id)];
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => summonGroup(g)}
                    disabled={sendingId !== null}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-fill-2 disabled:opacity-60"
                  >
                    <Avatar name={g.title ?? "Group"} photoUrl={g.hasPhoto ? chatApi.groupPhotoUrl(g.id) : null} size={36} group seed={`group-${g.id}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-medium text-text-primary">{g.title}</p>
                      <p className="truncate text-xs text-text-tertiary flex items-center gap-1">
                        <Users className="h-3 w-3" /> {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                        {online !== undefined && (
                          <span className={cn("ml-1 font-medium", online > 0 ? "text-success-text" : "text-text-tertiary")}>
                            · {online} of {g.memberCount} online
                          </span>
                        )}
                      </p>
                    </div>
                    {sendingId === String(g.id) ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-tertiary" />
                    ) : (
                      <Send className="h-4 w-4 shrink-0 text-text-tertiary" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
