"use client";

import { useEffect, useRef, useState } from "react";

type Category = {
  label: string;
  icon: string;
  emojis: string[];
};

const CATEGORIES: Category[] = [
  {
    label: "Smileys",
    icon: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
      "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
      "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥",
      "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮",
      "🥵", "🥶", "😵", "🤯", "🥳", "😎", "🤓", "🧐", "😕", "😟",
      "🙁", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰",
      "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫",
      "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "🤡", "👻",
    ],
  },
  {
    label: "Gestures",
    icon: "👋",
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤏", "✌️", "🤞", "🤟",
      "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎",
      "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏",
      "💪", "🦾", "🖊️", "✍️", "💅", "🤳", "🦵", "🦶", "👂", "👃",
    ],
  },
  {
    label: "People",
    icon: "🧑",
    emojis: [
      "👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "🧔", "👩", "🧓",
      "👴", "👵", "🙍", "🙎", "🙅", "🙆", "💁", "🙋", "🧏", "🙇",
      "🤦", "🤷", "👮", "🕵️", "💂", "👷", "🤴", "👸", "🥷", "🦸",
      "🧑‍💻", "🧑‍🔧", "🧑‍🏫", "🧑‍⚕️", "🧑‍✈️", "🧑‍🚀", "🧑‍🎓", "🧑‍🍳", "😴", "🤝",
    ],
  },
  {
    label: "Animals",
    icon: "🐶",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨",
      "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤",
      "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛",
      "🦋", "🐌", "🐞", "🐜", "🐢", "🐍", "🦎", "🦖", "🐙", "🦈",
      "🐬", "🐳", "🐊", "🐆", "🦓", "🦍", "🐘", "🦛", "🐄", "🐑",
    ],
  },
  {
    label: "Food",
    icon: "🍕",
    emojis: [
      "🍏", "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈",
      "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦",
      "🌽", "🥕", "🫑", "🥔", "🍞", "🥐", "🥖", "🧀", "🥚", "🍳",
      "🥞", "🧇", "🥓", "🍔", "🍟", "🍕", "🌭", "🥪", "🌮", "🌯",
      "🥗", "🍝", "🍜", "🍣", "🍱", "🍤", "🍚", "🍛", "🍦", "🍩",
      "🍪", "🎂", "🍰", "🍫", "🍬", "🍭", "☕", "🍵", "🧋", "🥤",
      "🍺", "🍷", "🥂", "🍾",
    ],
  },
  {
    label: "Activities",
    icon: "⚽",
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸",
      "🥊", "🥋", "🎯", "🎳", "🏹", "🎣", "🤿", "🥌", "🎿", "🏂",
      "🏋️", "🤸", "🤼", "🚴", "🏆", "🥇", "🎮", "🎲", "🧩", "🎨",
      "🎬", "🎤", "🎧", "🎸", "🎹", "🥁", "🎺", "🎻", "🎭", "🎪",
    ],
  },
  {
    label: "Travel",
    icon: "🚗",
    emojis: [
      "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐",
      "🛻", "🚚", "🚛", "🚜", "🏍️", "🛵", "🚲", "✈️", "🚀", "🚁",
      "⛵", "🚤", "🛳️", "⚓", "🚢", "🚂", "🚆", "🚇", "🗼", "🗽",
      "🏰", "🏯", "🎡", "🎢", "🏖️", "🏝️", "🏔️", "🗻", "🌋", "🏕️",
      "🌍", "🌎", "🌏", "🌙", "⭐", "☀️", "⛅", "🌧️", "⛈️", "🌈",
    ],
  },
  {
    label: "Objects",
    icon: "💡",
    emojis: [
      "⌚", "📱", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "💽", "💾", "💿",
      "📷", "📹", "🎥", "📞", "☎️", "📺", "📻", "🎙️", "⏰", "⏱️",
      "🔋", "🔌", "💡", "🔦", "🕯️", "🧯", "🛢️", "💵", "💴", "💰",
      "💳", "💎", "🔧", "🔨", "🛠️", "⚙️", "🔩", "⛓️", "🔫", "💣",
      "🔪", "🗡️", "🛡️", "🚬", "⚰️", "🧴", "🧹", "🧺", "🧻", "📦",
      "📫", "📁", "📋", "📌", "📎", "✂️", "📝", "🔒", "🔑", "🗝️",
    ],
  },
  {
    label: "Symbols",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️",
      "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐",
      "⭐", "🌟", "✨", "💫", "💥", "💢", "💦", "💨", "🕳️", "💬",
      "👁️‍🗨️", "🗨️", "🗯️", "💭", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣",
      "✅", "❌", "❗", "❓", "‼️", "⁉️", "💯", "🔥", "🎉", "🎊",
    ],
  },
];

const RECENT_KEY = "canaan_chat_recent_emoji";
const MAX_RECENT = 24;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* localStorage unavailable (private mode, quota) — recents just won't persist */
  }
}

export function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [recent, setRecent] = useState<string[]>([]);
  // Tracked by label, not index — the "Recent" tab only exists once something
  // has been picked, so the tab list's length (and therefore any index) shifts
  // the first time that happens. A label survives that shift undisturbed.
  const [activeLabel, setActiveLabel] = useState<string>(CATEGORIES[0].label);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  // Close on outside click or Escape — standard popover behavior.
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Ignore the toggle button itself — mousedown fires (and would close the
      // panel) before that button's own onClick runs to reopen it, which
      // without this guard makes the button appear to do nothing on a second click.
      if (target.closest("[data-emoji-toggle]")) return;
      if (panelRef.current && !panelRef.current.contains(target)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function pick(emoji: string) {
    onSelect(emoji);
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    setRecent(next);
    saveRecent(next);
  }

  const tabs = recent.length > 0 ? [{ label: "Recent", icon: "🕘", emojis: recent }, ...CATEGORIES] : CATEGORIES;
  const active = tabs.find((t) => t.label === activeLabel) ?? tabs[0];

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 z-20 mb-2 flex h-80 w-72 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {active.label}
        </p>
        <div className="grid grid-cols-7 gap-0.5">
          {active.emojis.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              type="button"
              onClick={() => pick(emoji)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-gray-100 active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-t border-gray-100 bg-gray-50 px-1.5 py-1.5">
        {tabs.map((cat) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => setActiveLabel(cat.label)}
            title={cat.label}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base transition-colors ${
              cat.label === active.label ? "bg-brand-navy/10" : "hover:bg-gray-100"
            }`}
          >
            {cat.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
