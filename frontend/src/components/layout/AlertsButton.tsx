"use client";

import { useEffect, useState } from "react";
import { BellRing, Loader2, Search, Send, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/Dialog";
import { Avatar } from "@/components/chat/shared";
import { chatApi, roomSummonApi } from "@/lib/api";
import type { ChatMember, ChatConversation } from "@/types/chat";
import { showError, showToast } from "@/lib/swal";

type Tab = "user" | "group";

/**
 * Admin-only "summon" button — picks a person or a Canaan Chat group and
 * pushes "The owner has requested your presence in their room." straight to
 * their screen (see RoomSummonListener, mounted in AppShell, for the receiving
 * end). Styled to match CalculatorButton's trigger, which this sits left of.
 */
export function AlertsButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("user");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<ChatMember[]>([]);
  const [groups, setGroups] = useState<ChatConversation[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);

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

  function closeAndReset() {
    setOpen(false);
    setSearch("");
    setTab("user");
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

  const filteredContacts = contacts.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const filteredGroups = groups.filter((g) => (g.title ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <button
        type="button"
        aria-label="Invite"
        title="Invite a user or group"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300",
          "hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(217,119,6,0.25)] focus:outline-none focus:ring-4 focus:ring-amber-500/20",
          "border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-600 hover:border-amber-300 hover:from-amber-100"
        )}
      >
        <BellRing className="h-5 w-5 transition-transform duration-300 group-hover:scale-110 group-hover:text-amber-700" />
      </button>

      <Dialog open={open} onClose={closeAndReset} title="Invite to your room" className="sm:max-w-md">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-500">
            Pick a person or a Canaan Chat group — they&apos;ll see a dialog telling them you&apos;ve requested their presence.
          </p>

          <div className="flex gap-2 rounded-full bg-gray-100 p-1">
            {([
              { id: "user", label: "User" },
              { id: "group", label: "Group" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 rounded-full py-1.5 text-sm font-semibold transition-colors",
                  tab === t.id ? "bg-white text-brand-navy shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "user" ? "Search people…" : "Search groups…"}
              className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/20"
            />
          </div>

          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : tab === "user" ? (
              filteredContacts.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No one matches &quot;{search}&quot;.</p>
              ) : (
                filteredContacts.map((c) => (
                  <button
                    key={c.staffId}
                    type="button"
                    onClick={() => summonUser(c)}
                    disabled={sendingId !== null}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50 disabled:opacity-60"
                  >
                    <Avatar name={c.name} photoUrl={c.photoUrl} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">{c.name}</p>
                      <p className="truncate text-xs text-gray-400">{c.designation || c.softwareDesignation || ""}</p>
                    </div>
                    {sendingId === c.staffId ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
                    ) : (
                      <Send className="h-4 w-4 shrink-0 text-gray-300" />
                    )}
                  </button>
                ))
              )
            ) : filteredGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No groups match &quot;{search}&quot;.</p>
            ) : (
              filteredGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => summonGroup(g)}
                  disabled={sendingId !== null}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50 disabled:opacity-60"
                >
                  <Avatar name={g.title ?? "Group"} photoUrl={g.hasPhoto ? chatApi.groupPhotoUrl(g.id) : null} size={36} group />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{g.title}</p>
                    <p className="truncate text-xs text-gray-400 flex items-center gap-1">
                      <Users className="h-3 w-3" /> {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {sendingId === String(g.id) ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
                  ) : (
                    <Send className="h-4 w-4 shrink-0 text-gray-300" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
