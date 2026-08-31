"use client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
  id?: string;
}

interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

// ---------------------------------------------------------------------------
// System prompt — kept tight to minimise token spend
// ---------------------------------------------------------------------------

const ROLE_CAPABILITIES: Record<string, string> = {
  Admin: "all screens and operations",
  "Commercial Manager": "trip assignment, edit approvals, active trips",
  "Yard Supervisor": "sheet collection, advance verification, PDF exports",
  "Trip Sheet Register": "trip sheet entry (diesel, KM), flagging, re-submit",
  Accounts: "verification, invoice generation (TM/BS/Tax Invoice)",
  "Assistant Commercial Manager": "P&L, mileage, fleet master, plus Commercial Manager actions",
  Maintenance: "maintenance records, tyre management, compliance expiry",
  Auditor: "audit dashboard (pages being added incrementally)",
};

export function buildSystemPrompt(role: string, name: string): string {
  return `Canaan Global International ERP — fleet logistics, Chennai.
User: ${name} (${role}). Access: ${ROLE_CAPABILITIES[role] ?? "assigned screens"}.

ERP WORKFLOW (5 stages — use these when users ask about trips):
1. Assign Trip → Commercial Manager assigns truck + driver
2. Complete Trip → Trip is closed after delivery (Yard Supervisor collects sheet)
3. Sheet Collection → Yard Supervisor marks trip sheet received
4. Reconciliation → Docs team enters trip sheet data (diesel, KM, etc.)
5. Invoice → Accounts verifies and generates invoice

When user asks about workflow stages, use get_pending_work for counts, or navigate_to to take them to the right page:
- "pending sheet collection" → navigate_to trips/sheet-collection
- "pending reconciliation" → navigate_to trips/reconciliation
- "pending verification / invoice" → navigate_to trips/verification
- "trip history / all trips" → navigate_to trips/history

IMPORTANT: Never mention internal driver statuses (Loaded, Unloaded, On-Transit, Reached, Started) to users — they are irrelevant to ERP operations. Only show trip IDs, truck numbers, drivers, routes, hire amounts, and workflow stage.

FINANCIAL FIELDS (from get_trips):
- hire_amount = customer billing hire amount from trip sheet (what customer pays). This is the value shown in Trip History. Null until Docs team enters the trip sheet.
- transport_hire_to_owner = amount paid to the truck owner/transporter (a cost, NOT shown in trip history table).
When users ask "hire amount", always use hire_amount (from trip sheet).

Container format: 4 alpha + 7 numeric. Amounts ₹. Diesel in litres.
Billing: Self/CGI→Transport Memo; GTA customer→Bill of Supply; other→Tax Invoice.
Answer concisely. Use tools to fetch live data.`;
}

// ---------------------------------------------------------------------------
// Tool definitions (sent to LLM as function schemas)
// ---------------------------------------------------------------------------

export const ERP_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_overview",
      description:
        "Get a summary of the ERP: active trip count, trip status breakdown, compliance alerts, maintenance alerts, pending leave requests.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_trips",
      description:
        "Get a paginated list of trips. Use this to look up specific trips by ID, truck, container, or driver. For workflow-stage questions (pending reconciliation, pending invoice, etc.) use get_pending_work instead and navigate_to the relevant page.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              "Internal driver status filter — only use when explicitly asked: Assigned, Started, Loaded, On-Transit, Reached, Unloaded, Completed. Omit for all trips.",
          },
          search: {
            type: "string",
            description:
              "Search across trip ID, container numbers, truck registration, origin, destination.",
          },
          limit: {
            type: "number",
            description: "Max trips to return. Default 10, max 50.",
          },
          offset: {
            type: "number",
            description: "Skip this many records (for pagination). Default 0.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_compliance_alerts",
      description:
        "Get trucks whose compliance documents (FC, permits, PUC, insurance, road tax) are expired or expiring soon.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "navigate_to",
      description: "Navigate the user to a page in the ERP. Use the exact page slug from this list: dashboard, trips/assign, trips/current, trips/completed, trips/sheet-collection, trips/reconciliation, trips/verification, trips/finalization, trips/pnl-mileage, trips/history, resources/fleet, resources/customers, resources/drivers, resources/staff, maintenance/compliance, maintenance/fuel-history, maintenance/tyre-management, attendance/edit-approvals, insights/pl-summary, finance/emi-tracking.",
      parameters: {
        type: "object",
        properties: {
          page: {
            type: "string",
            description: "The page slug to navigate to (e.g. 'trips/history', 'insights/pl-summary').",
          },
        },
        required: ["page"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_pending_work",
      description:
        "Get counts of trips pending at each ERP workflow stage: sheet collection (Yard), reconciliation (Docs), verification, and invoice (Accounts). Always call this first when users ask about pending work, backlogs, or workflow stages. Then use navigate_to to send them to the right page.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_fuel_log",
      description: "Get recent diesel/fuel log entries, optionally filtered by truck ID.",
      parameters: {
        type: "object",
        properties: {
          truck_id: { type: "number", description: "Internal truck ID to filter by a specific truck." },
          limit: { type: "number", description: "Max entries to return (default 10, max 50)." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_customers",
      description: "Search the customer master by name, GSTIN, phone, or email. Paginated — always pass a limit.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search term — name, GSTIN, phone, or email." },
          limit: { type: "number", description: "Max results (default 10, max 50)." },
          offset: { type: "number", description: "Skip N records for pagination." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_drivers",
      description: "Search drivers by name, driver ID, phone, or license number. Paginated.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search term." },
          limit: { type: "number", description: "Max results (default 10, max 50)." },
          offset: { type: "number", description: "Skip N records for pagination." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_maintenance_records",
      description: "Get maintenance records with optional truck filter and keyword search. Paginated.",
      parameters: {
        type: "object",
        properties: {
          truck_id: { type: "number", description: "Internal truck ID to filter by a specific truck." },
          search: { type: "string", description: "Search by maintenance type or description (e.g. 'oil change', 'brake')." },
          limit: { type: "number", description: "Max records (default 10, max 50)." },
          offset: { type: "number", description: "Skip N records for pagination." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_maintenance_summary",
      description: "Get aggregate maintenance stats: total records count, total cost, total fuel spend, total litres — pure SQL counts, safe at any scale.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_attendance_summary",
      description: "Get attendance summary for drivers or staff for a date range (defaults to today).",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Either 'driver' or 'staff'." },
          from_date: { type: "string", description: "Start date YYYY-MM-DD. Defaults to today." },
          to_date: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
        },
        required: ["category"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor — calls the FastAPI backend directly
// ---------------------------------------------------------------------------

const WARNING_DAYS: Record<string, number> = {
  fc_expiry_date: 30,
  national_permit_date: 10,
  local_permit_date: 10,
  pollution_certificate_date: 7,
  road_tax_date: 10,
  insurance_expiry_date: 7,
};

const DOC_LABELS: Record<string, string> = {
  fc_expiry_date: "FC (Fitness Certificate)",
  national_permit_date: "National Permit",
  local_permit_date: "Local Permit",
  pollution_certificate_date: "PUC",
  road_tax_date: "Road Tax",
  insurance_expiry_date: "Insurance",
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.floor(diff / 86_400_000);
}

async function apiFetch(path: string, token: string) {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  token: string,
  onNavigate: (path: string) => void
): Promise<string> {
  try {
    switch (name) {
      case "get_overview": {
        const d = await apiFetch("/dashboard/overview", token);
        return JSON.stringify({
          active_trips: d.active_trips,
          total_trips: d.total_trips,
          trip_status_counts: d.trip_status_counts,
          completed_pending_closure: d.completed_pending_closure,
          compliance_expired: d.compliance_expired,
          compliance_expiring_soon: d.compliance_expiring_soon,
          pending_leave_requests: d.pending_leave_requests,
          total_trucks: d.total_trucks,
          total_drivers: d.total_drivers,
        });
      }

      case "get_trips": {
        const status = args.status as string | undefined;
        const search = args.search as string | undefined;
        const limit = Math.min((args.limit as number | undefined) ?? 10, 50);
        const offset = (args.offset as number | undefined) ?? 0;

        const params = new URLSearchParams();
        if (status?.trim()) params.set("status", status.trim());
        if (search?.trim()) params.set("search", search.trim());
        params.set("limit", String(limit));
        params.set("offset", String(offset));

        const trips: Record<string, unknown>[] = await apiFetch(`/trips?${params}`, token);
        const rows = trips.map((t) => ({
          trip_id: t.trip_id,
          status: t.status,
          truck: t.truck_registration,
          driver: t.driver_name,
          from: t.origin,
          to: t.destination,
          scheduled_date: t.scheduled_date,
          trip_type: t.trip_category,
          container: [t.container_number, t.container_number_1, t.container_number_2]
            .filter(Boolean)
            .join(", "),
          hire_amount: t.sheet_hire_amount ?? null,
          transport_hire_to_owner: t.transport_hire_amount ?? null,
          driver_advance: t.driver_advance_amount ?? null,
          customer_cash_advance: t.customer_cash_advance ?? null,
          lift_on_amount: t.lift_on_amount ?? null,
          approx_km: t.approx_km ?? null,
          sheet_collected: t.trip_sheet_collected,
          sheet_received: t.trip_sheet_received,
          verification: t.verification_status,
          invoiced: t.is_invoiced,
        }));
        return JSON.stringify({
          returned: rows.length,
          offset,
          note: rows.length === limit ? `More records may exist — use offset=${offset + limit} to fetch next page.` : "All matching records returned.",
          trips: rows,
        });
      }

      case "get_compliance_alerts": {
        const trucks: Record<string, unknown>[] = await apiFetch("/trucks", token);
        const today = new Date();
        const alerts: unknown[] = [];

        for (const truck of trucks) {
          for (const [field, warnDays] of Object.entries(WARNING_DAYS)) {
            const dateStr = truck[field] as string | null;
            const days = daysUntil(dateStr);
            if (days === null || days > warnDays) continue;
            alerts.push({
              truck: truck.registration_number,
              document: DOC_LABELS[field],
              expiry_date: dateStr,
              days_remaining: days,
              status: days < 0 ? "EXPIRED" : "EXPIRING SOON",
            });
          }
        }

        return JSON.stringify({
          total_alerts: alerts.length,
          alerts: alerts.sort((a: any, b: any) => a.days_remaining - b.days_remaining),
        });
      }

      case "navigate_to": {
        const page = args.page as string;
        onNavigate(`/${page}`);
        return `Navigated to /${page}.`;
      }

      case "get_fuel_log": {
        const params = new URLSearchParams();
        if (args.truck_id) params.set("truck_id", String(args.truck_id));
        params.set("limit", String(Math.min((args.limit as number | undefined) ?? 10, 50)));
        const logs: Record<string, unknown>[] = await apiFetch(`/maintenance/fuel-logs?${params}`, token);
        return JSON.stringify(logs.map((l) => ({
          date: l.date, truck_id: l.truck_id, litres: l.litres,
          price_per_litre: l.price_per_litre, total_cost: l.total_cost,
          odometer: l.odometer, fuel_station: l.fuel_station, mileage: l.mileage,
        })));
      }

      case "search_customers": {
        const params = new URLSearchParams();
        if ((args.search as string)?.trim()) params.set("search", (args.search as string).trim());
        params.set("limit", String(Math.min((args.limit as number | undefined) ?? 10, 50)));
        if (args.offset) params.set("offset", String(args.offset));
        const customers: Record<string, unknown>[] = await apiFetch(`/customers?${params}`, token);
        return JSON.stringify(customers.map((c) => ({
          id: c.id, name: c.name, gstin: c.gstin, phone: c.phone,
          email: c.email, is_gta: c.is_gta, customer_type: c.customer_type,
        })));
      }

      case "search_drivers": {
        const params = new URLSearchParams();
        if ((args.search as string)?.trim()) params.set("search", (args.search as string).trim());
        params.set("limit", String(Math.min((args.limit as number | undefined) ?? 10, 50)));
        if (args.offset) params.set("offset", String(args.offset));
        const drivers: Record<string, unknown>[] = await apiFetch(`/drivers?${params}`, token);
        return JSON.stringify(drivers.map((d) => ({
          id: d.id, driver_id: d.driver_id, name: d.name,
          phone: d.phone, license_number: d.license_number,
          license_expiry_date: d.license_expiry_date,
        })));
      }

      case "get_maintenance_records": {
        const params = new URLSearchParams();
        if (args.truck_id) params.set("truck_id", String(args.truck_id));
        if ((args.search as string)?.trim()) params.set("search", (args.search as string).trim());
        params.set("limit", String(Math.min((args.limit as number | undefined) ?? 10, 50)));
        if (args.offset) params.set("offset", String(args.offset));
        const records: Record<string, unknown>[] = await apiFetch(`/maintenance/records?${params}`, token);
        return JSON.stringify(records.map((r) => ({
          date: r.date, truck_id: r.truck_id, maintenance_type: r.maintenance_type,
          description: r.description, cost: r.cost, odometer: r.odometer,
        })));
      }

      case "get_maintenance_summary": {
        return JSON.stringify(await apiFetch("/maintenance/ai-counts", token));
      }

      case "get_attendance_summary": {
        const category = (args.category as string) === "staff" ? "staff" : "driver";
        const today = new Date().toISOString().split("T")[0];
        const from = (args.from_date as string) || today;
        const to = (args.to_date as string) || today;
        const params = new URLSearchParams({ category, from, to });
        const summary = await apiFetch(`/attendance/summary?${params}`, token);
        return JSON.stringify(summary);
      }

      case "get_pending_work": {
        // Uses dedicated count endpoint — pure SQL aggregates, O(1) regardless of data size
        const counts = await apiFetch("/trips/ai-counts", token);
        return JSON.stringify(counts);
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return `Error running ${name}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ---------------------------------------------------------------------------
// Text-based tool call parser
// Small open-source models frequently emit tool calls as plain text in one of
// several formats instead of using the proper OpenAI function-calling API.
// This parser catches ALL known formats so the agent never shows raw tags.
// ---------------------------------------------------------------------------

const VALID_TOOL_NAMES = new Set(ERP_TOOLS.map((t) => t.function.name));

/**
 * Parse a raw string value into proper args for tools that accept a single
 * positional argument (navigate_to page, attendance category, etc.).
 */
function argsFromRaw(name: string, raw: string): Record<string, unknown> {
  if (name === "navigate_to") return { page: raw };
  if (name === "get_attendance_summary") {
    const category = raw.toLowerCase().includes("staff") ? "staff" : "driver";
    return { category };
  }
  if (name === "get_trips") {
    const statuses = ["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded", "Completed"];
    const status = statuses.find((s) => raw.toLowerCase().includes(s.toLowerCase()));
    return status ? { status, limit: 10 } : { limit: 10 };
  }
  return {};
}

function tryParseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * Extract all text-embedded tool calls from a model response.
 * Handles every format seen in practice:
 *   1. <tool_name={"key":"val"}>          — XML tag with inline JSON args
 *   2. <tool_name> value </tool_name>     — paired XML, value is path/keyword
 *   3. <tool_name />  or  <tool_name>     — self-closing / empty
 *   4. tool_name({"key":"val"})           — Python/JS function-call style
 *   5. tool_name={"key":"val"}            — assignment style
 *   6. tool_name={}                       — empty assignment
 * Unknown tool names are silently ignored (e.g. brave_search, web_search).
 */
function extractTextToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  // Deduplicate by name+args fingerprint (same tool, same args → skip; same tool, different args → allow)
  const seen = new Set<string>();
  const MAX_PER_TOOL = 5; // safety cap on repeated calls to the same tool
  const toolCount: Record<string, number> = {};
  let m: RegExpExecArray | null;

  function add(name: string, args: Record<string, unknown>) {
    if (!VALID_TOOL_NAMES.has(name)) return;
    const fp = `${name}|${JSON.stringify(args)}`;
    if (seen.has(fp)) return;
    if ((toolCount[name] ?? 0) >= MAX_PER_TOOL) return;
    seen.add(fp);
    toolCount[name] = (toolCount[name] ?? 0) + 1;
    calls.push({ name, args });
  }

  // 1. <tool_name={"key":"val"}>  — XML tag with inline JSON
  const re1 = /<(\w+)=(\{[^>]+\})>/g;
  while ((m = re1.exec(text))) add(m[1], tryParseJson(m[2]) ?? {});

  // 2. tool_name>{"key":"val"}  — "greater-than" separator (seen in llama outputs)
  const re2 = /\b(\w+)>(\{[^}\n]+\})/g;
  while ((m = re2.exec(text))) add(m[1], tryParseJson(m[2]) ?? {});

  // 3. Paired XML: <tool_name> content </tool_name>
  const re3 = /<(\w+)>([\s\S]*?)<\/\1>/g;
  while ((m = re3.exec(text))) {
    const raw = m[2].trim();
    add(m[1], raw.startsWith("{") ? (tryParseJson(raw) ?? {}) : argsFromRaw(m[1], raw));
  }

  // 4. Python/JS call: tool_name({"key":"val"})  or  tool_name()
  const re4 = /\b(\w+)\(\s*(\{[\s\S]*?\})?\s*\)/g;
  while ((m = re4.exec(text))) add(m[1], m[2] ? (tryParseJson(m[2]) ?? {}) : {});

  // 5. Assignment: tool_name={"key":"val"}  or  tool_name={}
  const re5 = /\b(\w+)=(\{[^}\n]*\})/g;
  while ((m = re5.exec(text))) add(m[1], tryParseJson(m[2]) ?? {});

  // 6. Self-closing / bare open tag: <tool_name />  <tool_name>
  const re6 = /<(\w+)\s*\/?>/g;
  while ((m = re6.exec(text))) add(m[1], {});

  return calls;
}

/** Remove all tool-call markup from text before showing it to the user. */
function stripToolCallMarkup(text: string): string {
  return text
    .replace(/<\w+=\{[^>]*\}>/g, "")           // <tool={"k":"v"}>
    .replace(/\b\w+>\{[^}\n]+\}/g, "")         // tool>{"k":"v"}
    .replace(/<(\w+)>[\s\S]*?<\/\1>/g, "")     // <tool>...</tool>
    .replace(/<\w+\s*\/?>/g, "")               // <tool />  <tool>
    .replace(/\b\w+\(\s*\{[\s\S]*?\}\s*\)/g, "") // tool({...})
    .replace(/\b\w+=\{[^}\n]*\}/g, "")         // tool={...}
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Agent loop — LLM call → tool execution → repeat
// ---------------------------------------------------------------------------

const AI_BASE = "https://api.groq.com/openai/v1";
const AI_MODEL = process.env.NEXT_PUBLIC_OR_MODEL ?? "llama-3.1-8b-instant";

export async function runAgent({
  userMessage,
  history,
  systemPrompt,
  token,
  onNavigate,
  signal,
}: {
  userMessage: string;
  history: ChatMessage[];
  systemPrompt: string;
  token: string;
  onNavigate: (path: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_OR_API_KEY;
  if (!apiKey) throw new Error("NEXT_PUBLIC_OR_API_KEY is not set.");

  // Keep last 6 user/assistant messages in context to limit token growth
  const recentHistory = history.slice(-6);

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...recentHistory
      .filter((m) => m.role !== "error")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    { role: "user", content: userMessage },
  ];

  for (let step = 0; step < 8; step++) {
    const res = await fetch(`${AI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        tools: ERP_TOOLS,
        tool_choice: "auto",
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errMsg: string = (err as any).error?.message ?? `HTTP ${res.status}`;

      // Groq rejects the request when the model generates a malformed tool call.
      // Retry once without tools so the user always gets an answer.
      if (errMsg.includes("Failed to call a function")) {
        const fallback = await fetch(`${AI_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages,
            tool_choice: "none",
          }),
          signal,
        });
        if (fallback.ok) {
          const fd = await fallback.json();
          return fd.choices?.[0]?.message?.content ?? "Sorry, I couldn't process that request.";
        }
      }

      throw new Error(errMsg);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;
    if (!msg) throw new Error("Empty response from LLM.");

    messages.push(msg);

    // No proper tool_calls → check whether the model embedded calls as plain text
    if (!msg.tool_calls?.length) {
      const content = msg.content ?? "";
      const textCalls = extractTextToolCalls(content);

      if (textCalls.length > 0) {
        let navigated = false;

        for (const { name, args } of textCalls) {
          const result = await executeTool(name, args, token, onNavigate);

          if (name === "navigate_to") {
            // Navigation side-effect already fired; don't push a tool message
            navigated = true;
          } else {
            messages.push({
              role: "tool",
              content: result,
              tool_call_id: `txt-${step}-${name}`,
              name,
            });
          }
        }

        // If only navigation was requested, return a clean reply right away
        if (navigated && textCalls.every((c) => c.name === "navigate_to")) {
          return stripToolCallMarkup(content) || "Done.";
        }

        // For data tools: replace the raw assistant message with a cleaned version
        // so the model doesn't see its own markup on the next iteration
        if (messages[messages.length - 1]?.role !== "tool") {
          // nothing was pushed — nothing to continue with
          return stripToolCallMarkup(content) || "Done.";
        }

        // Replace the last assistant message with a stripped version
        const assistantIdx = messages.findLastIndex((m) => m.role === "assistant");
        if (assistantIdx !== -1) {
          messages[assistantIdx] = { ...messages[assistantIdx], content: stripToolCallMarkup(content) || "…" };
        }

        // Continue the loop so the model sees the tool results and answers properly
        continue;
      }

      return content || "Done.";
    }

    // Execute all tool calls and append results
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        /* bad JSON — use empty args */
      }
      const result = await executeTool(tc.function.name, args, token, onNavigate);
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
        name: tc.function.name,
      });
    }
  }

  return "I hit the step limit. Please try a more specific question.";
}
