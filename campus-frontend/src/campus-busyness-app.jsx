import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Coffee, BookOpen, Printer, Dumbbell, Building2, Users,
  Search, X, Sliders, ArrowRight, ArrowUpRight,
  ChevronDown, RotateCcw, RefreshCw, Info, Copy, Check,
  Ticket, CalendarPlus, LayoutList, DoorOpen, ArrowLeft
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine
} from "recharts";

/* =========================================================================
   DESIGN TOKENS — "Campus Notice Board"
   ========================================================================= */
const FONT_IMPORT = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');

  :root{
    --ink:#FFFFFF; --ink-2:#F9FAFB; --ink-3:#F3F4F6;
    --line: rgba(0,0,0,0.08); --line-strong: rgba(0,0,0,0.16);
    --paper:#111827; --paper-dim:#4B5563;
    --green:#16A34A; --amber:#D97706; --red:#DC2626; --indigo:#4F46E5;
  }
  .font-display{ font-family:'Playfair Display', serif; }
  .font-body{ font-family:'Inter', sans-serif; }
  .font-data{ font-family:'Cinzel', serif; letter-spacing:0.04em; }

  @keyframes lampPulse{ 0%,100%{ box-shadow:0 0 0 0 rgba(220,38,38,0.55); } 50%{ box-shadow:0 0 0 6px rgba(220,38,38,0); } }
  .lamp-pulse{ animation:lampPulse 1.8s ease-in-out infinite; }
  @keyframes dropIn{ from{ opacity:0; transform:translateY(-6px); } to{ opacity:1; transform:translateY(0); } }
  .drop-in{ animation:dropIn 0.25s ease both; }
  @keyframes spin{ to{ transform:rotate(360deg); } }
  .spin-once{ animation:spin 0.5s ease; }

  ::-webkit-scrollbar{ width:8px; height:8px; }
  ::-webkit-scrollbar-thumb{ background:var(--ink-3); border-radius:8px; }
  ::-webkit-scrollbar-track{ background:transparent; }

  @media (prefers-reduced-motion: reduce){ .lamp-pulse, .drop-in, .spin-once{ animation:none !important; } }
`;

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

/* =========================================================================
   SERVICES DATA MODEL (unchanged logic — per-service thresholds)
   ========================================================================= */
const CATEGORY_CONFIG = {
  Food:  { label: "Food",  icon: Coffee },
  Study: { label: "Study", icon: BookOpen },
  Admin: { label: "Admin", icon: Building2 },
  Sports:{ label: "Sports",icon: Dumbbell },
};

const PATTERNS = {
  mainCanteen:  [4,3,3,3,3,4,10,28,45,38,30,55,92,88,50,30,35,58,72,60,35,20,10,6],
  cafeLibSide:  [3,2,2,2,3,5,8,20,35,48,55,60,65,58,62,70,75,68,50,35,22,14,8,5],
  centralLib:   [2,2,2,2,3,5,10,22,35,45,55,62,58,60,68,78,85,80,72,58,40,25,12,5],
  printShop:    [1,1,1,1,1,2,5,15,30,42,38,44,40,46,52,60,55,35,20,10,5,3,2,1],
  gym:          [2,2,2,2,3,15,45,60,35,20,15,18,25,20,18,25,55,78,88,70,42,20,8,4],
  adminOffice:  [0,0,0,0,0,0,2,10,55,72,65,68,40,58,62,55,30,10,2,0,0,0,0,0],
};

const LOCATIONS_CONFIG = [
  { id: "mainCanteen", name: "Main Canteen",      category: "Food",   hours: "7:00a – 9:00p",  avgVisit: 6,  quietMax: 5,  moderateMax: 10, peakWait: 16, pattern: PATTERNS.mainCanteen },
  { id: "cafeLibSide", name: "Library Side Cafe", category: "Food",   hours: "8:00a – 8:00p",  avgVisit: 4,  quietMax: 3,  moderateMax: 6,  peakWait: 9,  pattern: PATTERNS.cafeLibSide },
  { id: "centralLib",  name: "Central Library",   category: "Study",  hours: "8:00a – 10:00p", avgVisit: 10, quietMax: 8,  moderateMax: 18, peakWait: 30, pattern: PATTERNS.centralLib },
  { id: "printShop",   name: "Print & Copy Shop", category: "Admin",  hours: "9:00a – 6:00p",  avgVisit: 2,  quietMax: 3,  moderateMax: 6,  peakWait: 10, pattern: PATTERNS.printShop },
  { id: "gym",         name: "Campus Gym",        category: "Sports", hours: "6:00a – 10:00p", avgVisit: 12, quietMax: 8,  moderateMax: 16, peakWait: 24, pattern: PATTERNS.gym },
  { id: "adminOffice", name: "Admin Office",      category: "Admin",  hours: "9:00a – 5:00p",  avgVisit: 10, quietMax: 8,  moderateMax: 16, peakWait: 26, pattern: PATTERNS.adminOffice },
];

function clamp(v, min = 2, max = 98) { return Math.min(max, Math.max(min, v)); }

function snapshot(config) {
  const hour = new Date().getHours();
  const baseDemand = config.pattern[hour];
  const demand = clamp(Math.round(baseDemand + (Math.random() - 0.5) * 16));
  const midWait = (demand / 100) * config.peakWait;
  const low = Math.max(0, Math.round(midWait * 0.8));
  const high = Math.max(low + 1, Math.round(midWait * 1.25));
  let statusKey = "quiet";
  if (midWait > config.moderateMax) statusKey = "busy";
  else if (midWait > config.quietMax) statusKey = "moderate";
  return { demand, waitLow: low, waitHigh: high, statusKey };
}

function buildLocations() {
  return LOCATIONS_CONFIG.map(cfg => ({ ...cfg, ...snapshot(cfg) }));
}

async function fetchLocations() {
  try {
    const res = await fetch(`${API_BASE}/api/locations`);
    if (!res.ok) throw new Error("bad response");
    return await res.json();
  } catch {
    return buildLocations();
  }
}

const STATUS_META = {
  quiet:    { label: "Quiet",      color: "var(--green)", text: "text-[var(--green)]" },
  moderate: { label: "Moderate",   color: "var(--amber)", text: "text-[var(--amber)]" },
  busy:     { label: "Very Busy",  color: "var(--red)",   text: "text-[var(--red)]" },
};

function formatHour(h) {
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? "AM" : "PM";
  return `${hour12}:00 ${suffix}`;
}

function bestHour(pattern, openStart = 7, openEnd = 21) {
  let best = openStart, bestVal = 101;
  for (let h = openStart; h <= openEnd; h++) { if (pattern[h] < bestVal) { bestVal = pattern[h]; best = h; } }
  return best;
}

/* =========================================================================
   ROOMS / TOKEN SYSTEM — API + helpers
   ========================================================================= */
async function apiFetchRooms() {
  const res = await fetch(`${API_BASE}/api/rooms`);
  if (!res.ok) throw new Error("failed to load rooms");
  return res.json();
}
async function apiFetchRoomBookings(roomId) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/bookings`);
  if (!res.ok) throw new Error("failed to load bookings");
  return res.json();
}
async function apiCreateBooking(roomId, payload) {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/bookings`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "booking failed");
  return data;
}
async function apiCheckin(token) {
  const res = await fetch(`${API_BASE}/api/bookings/${token}/checkin`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "check-in failed");
  return data;
}
async function apiCancelBooking(id) {
  await fetch(`${API_BASE}/api/bookings/${id}`, { method: "DELETE" });
}

async function apiFetchAdminBookings() {
  const res = await fetch(`${API_BASE}/api/admin/bookings`);
  if (!res.ok) throw new Error("failed to load booking log");
  return res.json();
}
async function apiFetchWifiCurrent() {
  const res = await fetch(`${API_BASE}/api/admin/wifi-current`);
  if (!res.ok) throw new Error("failed to load current traffic");
  return res.json();
}
async function apiFetchWifiByHour(hour) {
  const res = await fetch(`${API_BASE}/api/admin/wifi-by-hour?hour=${hour}`);
  if (!res.ok) throw new Error("failed to load hourly traffic");
  return res.json();
}

const ROOM_TYPE_LABEL = { meeting_room: "Meeting Room", conference_hall: "Conference Hall" };
const BOOKING_STATUS_META = {
  booked:     { label: "Booked",     color: "var(--amber)" },
  checked_in: { label: "Checked In", color: "var(--green)" },
  completed:  { label: "Completed",  color: "var(--paper-dim)" },
  cancelled:  { label: "Cancelled",  color: "var(--paper-dim)" },
  no_show:    { label: "No-show",    color: "var(--red)" },
};

function toSqliteDatetime(localValue) { return localValue ? localValue.replace("T", " ") + ":00" : ""; }
function formatSqliteDatetime(str) {
  if (!str) return "";
  const d = new Date(str.replace(" ", "T"));
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function nowLocalInputValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/* =========================================================================
   SHARED SMALL COMPONENTS
   ========================================================================= */
function StatusLamp({ statusKey }) {
  const meta = STATUS_META[statusKey];
  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      <span className={`w-2.5 h-2.5 rounded-full ${statusKey === "busy" ? "lamp-pulse" : ""}`} style={{ backgroundColor: meta.color }} />
      <span className={`font-data uppercase text-xs tracking-widest ${meta.text}`}>{meta.label}</span>
    </span>
  );
}
function DemandBar({ demand, statusKey, height = "h-2" }) {
  const meta = STATUS_META[statusKey];
  return (
    <div className={`w-full ${height} rounded-full bg-[var(--ink-3)] overflow-hidden`}>
      <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${demand}%`, backgroundColor: meta.color }} />
    </div>
  );
}
function CategoryChip({ id, active, onClick }) {
  const cfg = id === "All" ? { label: "All", icon: Sliders } : CATEGORY_CONFIG[id];
  const Icon = cfg.icon;
  return (
    <button onClick={() => onClick(id)}
      className={`font-data uppercase tracking-widest text-xs flex items-center gap-1.5 px-3.5 py-2 rounded-full border transition-colors duration-200 whitespace-nowrap
        ${active ? "bg-[var(--paper)] text-[var(--ink)] border-[var(--paper)]" : "bg-transparent text-[var(--paper-dim)] border-[var(--line-strong)] hover:border-[var(--paper-dim)] hover:text-[var(--paper)]"}`}>
      <Icon size={13} strokeWidth={2.5} />{cfg.label}
    </button>
  );
}

/* =========================================================================
   SERVICES TAB (dashboard) — unchanged behavior from before
   ========================================================================= */
function SmartAlternativeBanner({ location, allLocations, onSwitch }) {
  if (location.statusKey !== "busy") return null;
  const alt = allLocations.filter(l => l.category === location.category && l.id !== location.id).sort((a, b) => a.waitLow - b.waitLow)[0];
  if (!alt || alt.statusKey === "busy") return null;
  return (
    <button onClick={() => onSwitch(alt.id)}
      className="w-full text-left drop-in flex items-center gap-3 bg-[var(--indigo)]/10 border border-[var(--indigo)]/40 rounded-xl px-4 py-3.5 hover:bg-[var(--indigo)]/15 transition-colors group">
      <span className="w-8 h-8 rounded-full bg-[var(--indigo)]/20 flex items-center justify-center shrink-0"><ArrowUpRight size={15} className="text-[var(--indigo)]" /></span>
      <p className="font-body text-sm text-[var(--paper)] leading-snug">
        <span className="text-[var(--paper-dim)]">{location.name} is packed. </span>
        <span className="font-semibold">{alt.name}</span> looks {STATUS_META[alt.statusKey].label.toLowerCase()} right now.
      </p>
      <ArrowRight size={15} className="ml-auto shrink-0 text-[var(--indigo)] group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
}

function HourlyChart({ location }) {
  const currentHour = new Date().getHours();
  const best = bestHour(location.pattern);
  const data = location.pattern.map((val, h) => ({ hour: h, label: h % 3 === 0 ? formatHour(h).replace(":00", "") : "", demand: val }));
  return (
    <div className="rounded-xl bg-[var(--ink-3)]/60 border border-[var(--line)] p-3">
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--paper-dim)", fontSize: 11, fontFamily: "Inter, sans-serif" }} interval={0} />
          <YAxis hide domain={[0, 100]} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }}
            contentStyle={{ background: "var(--ink-2)", border: "1px solid var(--line-strong)", borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 12, color: "var(--paper)" }}
            labelFormatter={(_, payload) => payload?.[0] ? formatHour(payload[0].payload.hour) : ""}
            formatter={(v) => [`${v}%`, "Predicted demand"]} />
          <ReferenceLine x={data[currentHour]?.label || undefined} stroke="var(--indigo)" strokeDasharray="3 3" />
          <Bar dataKey="demand" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => {
              const isBest = i === best;
              return <Cell key={i} fill="var(--indigo)" fillOpacity={isBest ? 1 : i === currentHour ? 0.85 : 0.35} stroke={isBest ? "var(--paper)" : "none"} strokeWidth={isBest ? 1.5 : 0} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ServiceRow({ location, allLocations, expanded, onToggle, onSwitch }) {
  const Icon = CATEGORY_CONFIG[location.category].icon;
  const best = bestHour(location.pattern);
  const meta = STATUS_META[location.statusKey];
  return (
    <li className="border-b border-[var(--line)] last:border-b-0">
      <button onClick={() => onToggle(location.id)}
        className="w-full flex items-center gap-3 sm:gap-4 py-4 px-2 sm:px-3 text-left hover:bg-[var(--ink-2)]/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo)] rounded-lg">
        <span className="w-9 h-9 rounded-lg bg-[var(--ink-3)] border flex items-center justify-center text-[var(--paper)] shrink-0" style={{ borderColor: expanded ? meta.color : "var(--line)" }}>
          <Icon size={16} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base sm:text-lg text-[var(--paper)] uppercase leading-tight truncate">{location.name}</p>
          <p className="font-data text-[var(--paper-dim)] text-xs tracking-wide truncate">{location.category} · Typical visit ~{location.avgVisit} min</p>
        </div>
        <div className="hidden sm:block w-28 shrink-0"><DemandBar demand={location.demand} statusKey={location.statusKey} /></div>
        <div className="text-right shrink-0 w-24">
          <p className="font-display text-lg text-[var(--paper)] tabular-nums leading-none">
            {location.waitLow === 0 && location.waitHigh <= 1 ? "~0" : `${location.waitLow}–${location.waitHigh}`}
            <span className="font-data text-xs text-[var(--paper-dim)] normal-case ml-1">min</span>
          </p>
          <div className="mt-1"><StatusLamp statusKey={location.statusKey} /></div>
        </div>
        <ChevronDown size={16} className={`text-[var(--paper-dim)] shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="drop-in px-2 sm:px-3 pb-5 pt-1">
          <div className="sm:hidden mb-3"><DemandBar demand={location.demand} statusKey={location.statusKey} /></div>
          <div className="flex items-center gap-6 mb-4">
            <div>
              <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mb-0.5">Estimated wait</p>
              <p className="font-display text-2xl text-[var(--paper)] tabular-nums">{location.waitLow}–{location.waitHigh} min</p>
            </div>
            <div className="w-px h-8 bg-[var(--line)]" />
            <div>
              <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mb-0.5">Best time today</p>
              <p className="font-display text-2xl text-[var(--green)] tabular-nums">{formatHour(best)}</p>
            </div>
          </div>
          <SmartAlternativeBanner location={location} allLocations={allLocations} onSwitch={onSwitch} />
          <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mt-4 mb-2">Predicted demand today</p>
          <HourlyChart location={location} />
          <p className="font-body text-xs text-[var(--paper-dim)] mt-3 flex items-start gap-1.5">
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>An estimate, not a headcount — based on typical patterns for this service (open {location.hours}, ~{location.avgVisit} min per visit). Quiet/moderate/busy lines are set for this service's own pace.</span>
          </p>
        </div>
      )}
    </li>
  );
}

function SimulationPanel({ open, onToggle, locations, onSlide, onReset }) {
  return (
    <>
      <button onClick={onToggle}
        className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-[var(--indigo)] text-white flex items-center justify-center shadow-md shadow-black/15 hover:scale-105 active:scale-95 transition-transform"
        aria-label="Toggle demo controls"><Sliders size={18} /></button>
      {open && (
        <div className="drop-in fixed bottom-20 right-5 z-40 w-[85vw] max-w-xs bg-[var(--ink-2)] border border-[var(--line-strong)] rounded-2xl p-4 shadow-lg shadow-black/10">
          <div className="flex items-center justify-between mb-1">
            <p className="font-data text-[var(--paper)] text-xs uppercase tracking-widest">Demo Controls</p>
            <button onClick={onReset} className="text-[var(--paper-dim)] hover:text-[var(--paper)]" aria-label="Reset to real prediction"><RotateCcw size={14} /></button>
          </div>
          <p className="font-body text-xs text-[var(--paper-dim)] mb-3">Manually set demand to demo a scenario — nothing here updates on its own.</p>
          <div className="space-y-3.5 max-h-64 overflow-y-auto pr-1">
            {locations.map(loc => (
              <div key={loc.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-data text-xs text-[var(--paper-dim)] uppercase tracking-wide">{loc.name}</span>
                  <span className="font-data text-xs tabular-nums" style={{ color: STATUS_META[loc.statusKey].color }}>{loc.demand}%</span>
                </div>
                <input type="range" min={2} max={98} value={loc.demand} onChange={(e) => onSlide(loc.id, Number(e.target.value))} className="w-full accent-[var(--indigo)]" />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ServicesTab({ locations, setLocations, search, setSearch, categoryFilter, setCategoryFilter, expandedId, setExpandedId, simOpen, setSimOpen, refresh }) {
  const handleSlide = useCallback((id, demand) => {
    setLocations(prev => prev.map(l => {
      if (l.id !== id) return l;
      const midWait = (demand / 100) * l.peakWait;
      const waitLow = Math.max(0, Math.round(midWait * 0.8));
      const waitHigh = Math.max(waitLow + 1, Math.round(midWait * 1.25));
      let statusKey = "quiet";
      if (midWait > l.moderateMax) statusKey = "busy"; else if (midWait > l.quietMax) statusKey = "moderate";
      return { ...l, demand, waitLow, waitHigh, statusKey };
    }));
  }, [setLocations]);

  const filtered = useMemo(() => locations.filter(l => {
    const matchesCategory = categoryFilter === "All" || l.category === categoryFilter;
    const matchesSearch = l.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [locations, search, categoryFilter]);

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4">
        <div className="flex items-center gap-2 bg-[var(--ink-2)] border border-[var(--line)] rounded-full px-4 py-2.5 mb-4 focus-within:border-[var(--line-strong)] transition-colors">
          <Search size={15} className="text-[var(--paper-dim)] shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a service — canteen, library, gym…"
            className="font-body bg-transparent outline-none text-sm text-[var(--paper)] placeholder:text-[var(--paper-dim)] w-full" />
          {search && <button onClick={() => setSearch("")} className="text-[var(--paper-dim)] hover:text-[var(--paper)]"><X size={14} /></button>}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 mb-2">
          {["All", ...Object.keys(CATEGORY_CONFIG)].map(id => <CategoryChip key={id} id={id} active={categoryFilter === id} onClick={setCategoryFilter} />)}
        </div>
      </div>
      <main className="max-w-3xl mx-auto px-3 sm:px-6 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-display text-2xl text-[var(--paper)] uppercase mb-1">Nothing here</p>
            <p className="font-body text-sm text-[var(--paper-dim)]">Try a different search or category.</p>
          </div>
        ) : (
          <ul className="bg-[var(--ink-2)]/40 border border-[var(--line)] rounded-2xl px-1 sm:px-2">
            {filtered.map(loc => (
              <ServiceRow key={loc.id} location={loc} allLocations={locations} expanded={expandedId === loc.id}
                onToggle={(id) => setExpandedId(prev => (prev === id ? null : id))} onSwitch={(id) => setExpandedId(id)} />
            ))}
          </ul>
        )}
      </main>
      <SimulationPanel open={simOpen} onToggle={() => setSimOpen(v => !v)} locations={locations} onSlide={handleSlide} onReset={refresh} />
    </>
  );
}

/* =========================================================================
   MEETING ROOMS TAB
   ========================================================================= */
function CheckinWidget() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState(null); // { ok, message }
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true); setResult(null);
    try {
      const data = await apiCheckin(token.trim().toUpperCase());
      setResult({ ok: true, message: `Checked in — ${data.booking.requester_name}'s booking is confirmed.` });
      setToken("");
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="bg-[var(--ink-2)] border border-[var(--line)] rounded-2xl p-4 mb-5">
      <p className="font-data text-[var(--paper)] text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <Ticket size={13} className="text-[var(--indigo)]" /> Have a token? Check in at the door
      </p>
      <div className="flex gap-2">
        <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="e.g. A1B2C3D4"
          className="flex-1 font-data tracking-widest uppercase bg-[var(--ink-3)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm text-[var(--paper)] outline-none focus:border-[var(--indigo)]" />
        <button disabled={busy} type="submit" className="font-data uppercase text-xs tracking-widest px-4 py-2 rounded-lg bg-[var(--indigo)] text-white disabled:opacity-50">
          Check In
        </button>
      </div>
      {result && (
        <p className={`font-body text-xs mt-2 ${result.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{result.message}</p>
      )}
    </form>
  );
}

function BookingForm({ room, onBooked }) {
  const [requesterName, setRequesterName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [start, setStart] = useState(nowLocalInputValue());
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  const [tokenResult, setTokenResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setTokenResult(null);
    if (!requesterName.trim() || !start || !end) { setError("Fill in your name, start and end time."); return; }
    if (new Date(end) <= new Date(start)) { setError("End time must be after start time."); return; }
    setBusy(true);
    try {
      const data = await apiCreateBooking(room.id, {
        requesterName: requesterName.trim(), purpose: purpose.trim(),
        startTime: toSqliteDatetime(start), endTime: toSqliteDatetime(end),
      });
      setTokenResult(data.token);
      setRequesterName(""); setPurpose(""); setEnd("");
      onBooked();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const copyToken = () => {
    navigator.clipboard?.writeText(tokenResult);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  if (tokenResult) {
    return (
      <div className="drop-in bg-[var(--indigo)]/10 border border-[var(--indigo)]/40 rounded-xl p-4 text-center">
        <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mb-1">Booking confirmed — your token</p>
        <p className="font-display text-3xl tracking-[0.15em] text-[var(--paper)] mb-3">{tokenResult}</p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={copyToken} className="font-data uppercase text-xs tracking-widest px-3 py-1.5 rounded-full border border-[var(--line-strong)] text-[var(--paper)] flex items-center gap-1.5 hover:border-[var(--paper-dim)]">
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy token"}
          </button>
          <button onClick={() => setTokenResult(null)} className="font-data uppercase text-xs tracking-widest px-3 py-1.5 rounded-full text-[var(--paper-dim)] hover:text-[var(--paper)]">
            Book another
          </button>
        </div>
        <p className="font-body text-xs text-[var(--paper-dim)] mt-3">Show or scan this at the room to check in. Unclaimed bookings auto-release after 10 minutes.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Your name"
        className="w-full font-body bg-[var(--ink-3)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm text-[var(--paper)] outline-none focus:border-[var(--indigo)]" />
      <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose (optional) — e.g. Project review"
        className="w-full font-body bg-[var(--ink-3)] border border-[var(--line)] rounded-lg px-3 py-2 text-sm text-[var(--paper)] outline-none focus:border-[var(--indigo)]" />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="font-data text-[var(--paper-dim)] text-[10px] uppercase tracking-widest">Start</label>
          <input type="datetime-local" value={start} min={nowLocalInputValue()} onChange={(e) => setStart(e.target.value)}
            className="w-full font-data bg-[var(--ink-3)] border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm text-[var(--paper)] outline-none focus:border-[var(--indigo)]" />
        </div>
        <div className="flex-1">
          <label className="font-data text-[var(--paper-dim)] text-[10px] uppercase tracking-widest">End</label>
          <input type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)}
            className="w-full font-data bg-[var(--ink-3)] border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm text-[var(--paper)] outline-none focus:border-[var(--indigo)]" />
        </div>
      </div>
      {error && <p className="font-body text-xs text-[var(--red)]">{error}</p>}
      <button disabled={busy} type="submit"
        className="w-full font-data uppercase text-xs tracking-widest py-2.5 rounded-lg bg-[var(--indigo)] text-white flex items-center justify-center gap-1.5 disabled:opacity-50">
        <CalendarPlus size={13} /> {busy ? "Booking…" : "Book & Get Token"}
      </button>
    </form>
  );
}

function UpcomingBookings({ bookings, onCancel }) {
  if (bookings.length === 0) return <p className="font-body text-xs text-[var(--paper-dim)]">No bookings yet for this room.</p>;
  return (
    <ul className="space-y-2">
      {bookings.map(b => {
        const meta = BOOKING_STATUS_META[b.status];
        return (
          <li key={b.id} className="flex items-center gap-2 text-sm bg-[var(--ink-3)]/60 rounded-lg px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
            <div className="min-w-0 flex-1">
              <p className="font-body text-[var(--paper)] truncate">{b.requester_name}{b.purpose ? ` · ${b.purpose}` : ""}</p>
              <p className="font-data text-[var(--paper-dim)] text-xs">{formatSqliteDatetime(b.start_time)} – {formatSqliteDatetime(b.end_time)}</p>
            </div>
            <span className="font-data text-[10px] uppercase tracking-widest shrink-0" style={{ color: meta.color }}>{meta.label}</span>
            {b.status === "booked" && (
              <button onClick={() => onCancel(b.id)} className="text-[var(--paper-dim)] hover:text-[var(--red)] shrink-0" aria-label="Cancel booking"><X size={13} /></button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RoomRow({ room, expanded, onToggle, onChanged, onBook }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const Icon = room.type === "conference_hall" ? Building2 : Users;

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try { setBookings(await apiFetchRoomBookings(room.id)); } catch { /* ignore */ } finally { setLoading(false); }
  }, [room.id]);

  useEffect(() => { if (expanded) loadBookings(); }, [expanded, loadBookings]);

  const cancel = async (id) => { await apiCancelBooking(id); loadBookings(); onChanged(); };

  return (
    <li className="border-b border-[var(--line)] last:border-b-0">
      <div className="w-full flex items-center gap-2 sm:gap-4 py-4 px-2 sm:px-3">
        <button onClick={() => onToggle(room.id)}
          className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo)] rounded-lg">
          <span className="w-9 h-9 rounded-lg bg-[var(--ink-3)] border border-[var(--line)] flex items-center justify-center text-[var(--paper)] shrink-0"><Icon size={16} strokeWidth={2} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base sm:text-lg text-[var(--paper)] uppercase leading-tight truncate">{room.name}</p>
            <p className="font-data text-[var(--paper-dim)] text-xs tracking-wide truncate">{ROOM_TYPE_LABEL[room.type]} · Fits {room.capacity}</p>
          </div>
        </button>

        <span className="inline-flex items-center gap-2 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: room.occupied ? "var(--red)" : "var(--green)" }} />
          <span className="font-data uppercase text-xs tracking-widest hidden sm:inline" style={{ color: room.occupied ? "var(--red)" : "var(--green)" }}>
            {room.occupied ? "Occupied" : "Free"}
          </span>
        </span>

        <button
          onClick={() => onBook(room.id)}
          className="shrink-0 font-data uppercase text-xs tracking-widest px-3 py-1.5 rounded-full bg-[var(--indigo)] text-white flex items-center gap-1.5 hover:opacity-90 transition-opacity"
        >
          <CalendarPlus size={12} /> Book
        </button>

        <button onClick={() => onToggle(room.id)} aria-label="Toggle schedule" className="text-[var(--paper-dim)] shrink-0">
          <ChevronDown size={16} className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="drop-in px-2 sm:px-3 pb-5 pt-1">
          <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <LayoutList size={13} /> Schedule
          </p>
          {loading ? <p className="font-body text-xs text-[var(--paper-dim)]">Loading…</p> : <UpcomingBookings bookings={bookings} onCancel={cancel} />}
        </div>
      )}
    </li>
  );
}

// A dedicated "page" for one room — what you land on after tapping Book.
// Shows what's already booked (so you can see open slots) next to the form.
function BookRoomPage({ room, onBack, onBooked }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const Icon = room.type === "conference_hall" ? Building2 : Users;

  const load = useCallback(async () => {
    setLoading(true);
    try { setBookings(await apiFetchRoomBookings(room.id)); } catch { /* ignore */ } finally { setLoading(false); }
  }, [room.id]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (id) => { await apiCancelBooking(id); load(); onBooked(); };
  const booked = async () => { load(); onBooked(); };

  return (
    <main className="max-w-3xl mx-auto px-3 sm:px-6 py-4 drop-in">
      <button onClick={onBack} className="flex items-center gap-1.5 font-data uppercase text-xs tracking-widest text-[var(--paper-dim)] hover:text-[var(--paper)] mb-5">
        <ArrowLeft size={14} /> Back to rooms
      </button>

      <div className="flex items-center gap-3 mb-6">
        <span className="w-11 h-11 rounded-xl bg-[var(--ink-3)] border border-[var(--line)] flex items-center justify-center text-[var(--paper)] shrink-0">
          <Icon size={20} strokeWidth={2} />
        </span>
        <div>
          <h2 className="font-display text-2xl text-[var(--paper)] uppercase leading-tight">{room.name}</h2>
          <p className="font-data text-[var(--paper-dim)] text-xs tracking-wide">
            {ROOM_TYPE_LABEL[room.type]} · Fits {room.capacity} ·{" "}
            <span style={{ color: room.occupied ? "var(--red)" : "var(--green)" }}>{room.occupied ? "Occupied now" : "Free now"}</span>
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mb-2">Book a slot</p>
          <BookingForm room={room} onBooked={booked} />
        </div>
        <div>
          <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <LayoutList size={13} /> Open &amp; booked slots
          </p>
          {loading ? (
            <p className="font-body text-xs text-[var(--paper-dim)]">Loading…</p>
          ) : bookings.length === 0 ? (
            <p className="font-body text-xs text-[var(--paper-dim)]">Nothing booked yet — this room is wide open.</p>
          ) : (
            <UpcomingBookings bookings={bookings} onCancel={cancel} />
          )}
        </div>
      </div>
    </main>
  );
}

function RoomsTab() {
  const [rooms, setRooms] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookingRoomId, setBookingRoomId] = useState(null);

  const load = useCallback(async () => {
    try { setRooms(await apiFetchRooms()); } catch { /* backend offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const bookingRoom = rooms.find(r => r.id === bookingRoomId);
  if (bookingRoom) {
    return <BookRoomPage room={bookingRoom} onBack={() => setBookingRoomId(null)} onBooked={load} />;
  }

  return (
    <main className="max-w-3xl mx-auto px-3 sm:px-6 py-4">
      <CheckinWidget />
      {loading ? (
        <p className="font-body text-sm text-[var(--paper-dim)] text-center py-10">Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <div className="text-center py-16">
          <DoorOpen size={22} className="mx-auto text-[var(--paper-dim)] mb-2" />
          <p className="font-body text-sm text-[var(--paper-dim)]">Couldn't reach the backend — start it and refresh.</p>
        </div>
      ) : (
        <ul className="bg-[var(--ink-2)]/40 border border-[var(--line)] rounded-2xl px-1 sm:px-2">
          {rooms.map(room => (
            <RoomRow key={room.id} room={room} expanded={expandedId === room.id}
              onToggle={(id) => setExpandedId(prev => (prev === id ? null : id))} onChanged={load} onBook={setBookingRoomId} />
          ))}
        </ul>
      )}
    </main>
  );
}

/* =========================================================================
   DATA LOG TAB — read-only proof that inputs are actually persisted
   ========================================================================= */
function DataLogTab() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("bookings");

  const [wifiMode, setWifiMode] = useState("current"); // "current" | "hour"
  const [selectedHour, setSelectedHour] = useState(new Date().getHours());
  const [wifiRows, setWifiRows] = useState([]);
  const [wifiLoading, setWifiLoading] = useState(false);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try { setBookings(await apiFetchAdminBookings()); } catch { /* backend offline */ } finally { setLoading(false); }
  }, []);

  const loadWifi = useCallback(async () => {
    setWifiLoading(true);
    try {
      const rows = wifiMode === "current" ? await apiFetchWifiCurrent() : await apiFetchWifiByHour(selectedHour);
      setWifiRows(rows);
    } catch { setWifiRows([]); } finally { setWifiLoading(false); }
  }, [wifiMode, selectedHour]);

  useEffect(() => { loadBookings(); }, [loadBookings]);
  useEffect(() => { if (section === "wifi") loadWifi(); }, [section, loadWifi]);

  return (
    <main className="max-w-3xl mx-auto px-3 sm:px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {[["bookings", "Bookings"], ["wifi", "WiFi Traffic"]].map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)}
              className={`font-data uppercase tracking-widest text-xs px-3.5 py-2 rounded-full border transition-colors
                ${section === id ? "bg-[var(--paper)] text-[var(--ink)] border-[var(--paper)]" : "bg-transparent text-[var(--paper-dim)] border-[var(--line-strong)] hover:border-[var(--paper-dim)] hover:text-[var(--paper)]"}`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={section === "bookings" ? loadBookings : loadWifi} className="font-data uppercase text-xs tracking-widest text-[var(--paper-dim)] hover:text-[var(--paper)] flex items-center gap-1.5">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {section === "bookings" ? (
        loading ? (
          <p className="font-body text-sm text-[var(--paper-dim)] text-center py-10">Loading from the database…</p>
        ) : bookings.length === 0 ? (
          <p className="font-body text-sm text-[var(--paper-dim)] text-center py-10">No bookings stored yet.</p>
        ) : (
          <ul className="bg-[var(--ink-2)]/40 border border-[var(--line)] rounded-2xl divide-y divide-[var(--line)]">
            {bookings.map(b => {
              const meta = BOOKING_STATUS_META[b.status];
              return (
                <li key={b.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-sm text-[var(--paper)] truncate">
                      {b.requester_name}{b.purpose ? ` · ${b.purpose}` : ""} <span className="text-[var(--paper-dim)]">— {b.room_name}</span>
                    </p>
                    <p className="font-data text-[var(--paper-dim)] text-xs">
                      {formatSqliteDatetime(b.start_time)} – {formatSqliteDatetime(b.end_time)} · token {b.token}
                    </p>
                  </div>
                  <span className="font-data text-[10px] uppercase tracking-widest shrink-0" style={{ color: meta.color }}>{meta.label}</span>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            {[["current", "Current Traffic"], ["hour", "Filter by Hour"]].map(([id, label]) => (
              <button key={id} onClick={() => setWifiMode(id)}
                className={`font-data uppercase tracking-widest text-[11px] px-3 py-1.5 rounded-full border transition-colors
                  ${wifiMode === id ? "bg-[var(--indigo)] text-white border-[var(--indigo)]" : "bg-transparent text-[var(--paper-dim)] border-[var(--line-strong)] hover:text-[var(--paper)]"}`}>
                {label}
              </button>
            ))}
            {wifiMode === "hour" && (
              <select value={selectedHour} onChange={(e) => setSelectedHour(Number(e.target.value))}
                className="font-data uppercase text-xs tracking-widest bg-[var(--ink-3)] border border-[var(--line)] rounded-full px-3 py-1.5 text-[var(--paper)] outline-none focus:border-[var(--indigo)]">
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{formatHour(h)}</option>)}
              </select>
            )}
          </div>

          {wifiLoading ? (
            <p className="font-body text-sm text-[var(--paper-dim)] text-center py-10">Loading from the database…</p>
          ) : wifiRows.length === 0 ? (
            <p className="font-body text-sm text-[var(--paper-dim)] text-center py-10">
              {wifiMode === "current" ? "No readings yet — start the poller." : `No readings logged for ${formatHour(selectedHour)} yet.`}
            </p>
          ) : (
            <ul className="bg-[var(--ink-2)]/40 border border-[var(--line)] rounded-2xl divide-y divide-[var(--line)]">
              {wifiRows.map(w => (
                <li key={w.location_id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <p className="font-body text-sm text-[var(--paper)]">{w.location_name}</p>
                  {wifiMode === "current" ? (
                    <>
                      <p className="font-data text-[var(--paper-dim)] text-xs">{formatSqliteDatetime(w.recorded_at)}</p>
                      <p className="font-display text-[var(--paper)] tabular-nums w-24 text-right">{w.device_count} <span className="font-data text-xs text-[var(--paper-dim)] normal-case">devices</span></p>
                    </>
                  ) : (
                    <>
                      <p className="font-data text-[var(--paper-dim)] text-xs">{w.reading_count} reading{w.reading_count === 1 ? "" : "s"}</p>
                      <p className="font-display text-[var(--paper)] tabular-nums w-28 text-right">~{w.avg_devices} <span className="font-data text-xs text-[var(--paper-dim)] normal-case">avg devices</span></p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="font-body text-xs text-[var(--paper-dim)] mt-4 flex items-start gap-1.5">
        <Info size={12} className="mt-0.5 shrink-0" />
        <span>Read directly from campus.db. Bookings show full history; WiFi traffic is summarized rather than dumping every raw reading.</span>
      </p>
    </main>
  );
}

/* =========================================================================
   HEADER + TABS
   ========================================================================= */
function Header({ tab, setTab, lastUpdated, onRefresh, spinning }) {
  return (
    <div className="sticky top-0 z-30 bg-[var(--ink)]/95 backdrop-blur border-b border-[var(--line)] pb-4">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <p className="font-data text-[var(--indigo)] text-xs uppercase tracking-[0.2em] mb-1">Campus Notice Board</p>
            <h1 className="font-display text-2xl sm:text-3xl text-[var(--paper)] uppercase leading-none">
              {tab === "services" ? "Busyness & Wait Times" : tab === "rooms" ? "Meeting Room Booking" : "Data Log"}
            </h1>
          </div>
          {tab === "services" && (
            <button onClick={onRefresh}
              className="shrink-0 flex items-center gap-2 bg-[var(--ink-2)] border border-[var(--line-strong)] rounded-full px-3.5 py-2 hover:border-[var(--paper-dim)] transition-colors font-data text-xs uppercase tracking-widest text-[var(--paper)]">
              <RefreshCw size={13} className={spinning ? "spin-once" : ""} /> Refresh
            </button>
          )}
        </div>

        {tab === "services" && (
          <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mb-4">
            Updated {lastUpdated} · tap refresh for the latest prediction
          </p>
        )}

        <div className="flex items-center gap-2">
          {[["services", "Services"], ["rooms", "Meeting Rooms"], ["data", "Data Log"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`font-data uppercase tracking-widest text-xs px-4 py-2 rounded-full border transition-colors
                ${tab === id ? "bg-[var(--paper)] text-[var(--ink)] border-[var(--paper)]" : "bg-transparent text-[var(--paper-dim)] border-[var(--line-strong)] hover:border-[var(--paper-dim)] hover:text-[var(--paper)]"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   ROOT APP
   ========================================================================= */
export default function CampusBusynessApp() {
  const [tab, setTab] = useState("services");
  const [locations, setLocations] = useState(() => buildLocations());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [expandedId, setExpandedId] = useState(null);
  const [simOpen, setSimOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  const [spinning, setSpinning] = useState(false);

  const refresh = useCallback(async () => {
    setSpinning(true);
    const data = await fetchLocations();
    setLocations(data);
    setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => setSpinning(false), 500);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="min-h-screen w-full bg-[var(--ink)] font-body" style={{ colorScheme: "light" }}>
      <style>{FONT_IMPORT}</style>
      <Header tab={tab} setTab={setTab} lastUpdated={lastUpdated} onRefresh={refresh} spinning={spinning} />

      {tab === "services" ? (
        <ServicesTab
          locations={locations} setLocations={setLocations}
          search={search} setSearch={setSearch}
          categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
          expandedId={expandedId} setExpandedId={setExpandedId}
          simOpen={simOpen} setSimOpen={setSimOpen}
          refresh={refresh}
        />
      ) : tab === "rooms" ? (
        <RoomsTab />
      ) : (
        <DataLogTab />
      )}
    </div>
  );
}
