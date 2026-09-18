import React, { useState, useMemo, useCallback } from "react";
import {
  Coffee, BookOpen, Printer, Dumbbell, Building2,
  Search, X, Sliders, ArrowRight, ArrowUpRight,
  ChevronDown, RotateCcw, RefreshCw, Info
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine
} from "recharts";

/* =========================================================================
   DESIGN TOKENS — "Campus Notice Board"
   Ink-dark board, three real signal colors doing the status work,
   condensed data type. Simplified to a scannable row list.
   ========================================================================= */
const FONT_IMPORT = `
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Fjalla+One&family=Barlow+Condensed:wght@400;500;600;700&display=swap');

  :root{
    --ink:#14171F;
    --ink-2:#1C2030;
    --ink-3:#242A3D;
    --line: rgba(231,228,218,0.10);
    --line-strong: rgba(231,228,218,0.22);
    --paper:#E9E6DC;
    --paper-dim:#9CA0AE;
    --green:#3FA66B;
    --amber:#E0A526;
    --red:#D6534A;
    --indigo:#5B6EF5;
  }
  .font-display{ font-family:'Fjalla One', sans-serif; letter-spacing:0.01em; }
  .font-body{ font-family:'Bricolage Grotesque', sans-serif; }
  .font-data{ font-family:'Barlow Condensed', sans-serif; letter-spacing:0.04em; }

  @keyframes lampPulse{
    0%,100%{ box-shadow:0 0 0 0 rgba(214,83,74,0.55); }
    50%{ box-shadow:0 0 0 6px rgba(214,83,74,0); }
  }
  .lamp-pulse{ animation:lampPulse 1.8s ease-in-out infinite; }

  @keyframes dropIn{
    from{ opacity:0; transform:translateY(-6px); }
    to{ opacity:1; transform:translateY(0); }
  }
  .drop-in{ animation:dropIn 0.25s ease both; }

  @keyframes spin{ to{ transform:rotate(360deg); } }
  .spin-once{ animation:spin 0.5s ease; }

  ::-webkit-scrollbar{ width:8px; height:8px; }
  ::-webkit-scrollbar-thumb{ background:var(--ink-3); border-radius:8px; }
  ::-webkit-scrollbar-track{ background:transparent; }

  @media (prefers-reduced-motion: reduce){
    .lamp-pulse, .drop-in, .spin-once{ animation:none !important; }
  }
`;

/* =========================================================================
   DATA MODEL

   Busyness is NOT one-size-fits-all. A print job takes ~2 minutes, so a
   6-minute wait there is genuinely busy. A gym session or library seat
   search takes much longer, so its "busy" line sits much higher.
   Each service defines its own quiet/moderate/busy thresholds (minutes)
   derived from how long that service typically takes.

   We also can't know the exact headcount in a queue, so wait time is
   shown as an ESTIMATED RANGE, not a precise figure — it's a prediction
   from typical patterns, refreshed only when the user asks for it.
   ========================================================================= */
const CATEGORY_CONFIG = {
  Food:  { label: "Food",  icon: Coffee },
  Study: { label: "Study", icon: BookOpen },
  Admin: { label: "Admin", icon: Building2 },
  Sports:{ label: "Sports",icon: Dumbbell },
};

// 24-value hourly demand pattern (0=12am ... 23=11pm), 0-100 relative demand
const PATTERNS = {
  mainCanteen:  [4,3,3,3,3,4,10,28,45,38,30,55,92,88,50,30,35,58,72,60,35,20,10,6],
  cafeLibSide:  [3,2,2,2,3,5,8,20,35,48,55,60,65,58,62,70,75,68,50,35,22,14,8,5],
  centralLib:   [2,2,2,2,3,5,10,22,35,45,55,62,58,60,68,78,85,80,72,58,40,25,12,5],
  printShop:    [1,1,1,1,1,2,5,15,30,42,38,44,40,46,52,60,55,35,20,10,5,3,2,1],
  gym:          [2,2,2,2,3,15,45,60,35,20,15,18,25,20,18,25,55,78,88,70,42,20,8,4],
  adminOffice:  [0,0,0,0,0,0,2,10,55,72,65,68,40,58,62,55,30,10,2,0,0,0,0,0],
};

// icon, pattern, open hours, typical time the service takes, and this
// service's own quiet/moderate cutoffs (minutes) + wait at peak demand
const LOCATIONS_CONFIG = [
  { id: "mainCanteen", name: "Main Canteen",      category: "Food",   hours: "7:00a – 9:00p",  avgVisit: 6,  quietMax: 5,  moderateMax: 10, peakWait: 16, pattern: PATTERNS.mainCanteen },
  { id: "cafeLibSide", name: "Library Side Cafe", category: "Food",   hours: "8:00a – 8:00p",  avgVisit: 4,  quietMax: 3,  moderateMax: 6,  peakWait: 9,  pattern: PATTERNS.cafeLibSide },
  { id: "centralLib",  name: "Central Library",   category: "Study",  hours: "8:00a – 10:00p", avgVisit: 10, quietMax: 8,  moderateMax: 18, peakWait: 30, pattern: PATTERNS.centralLib },
  { id: "printShop",   name: "Print & Copy Shop", category: "Admin",  hours: "9:00a – 6:00p",  avgVisit: 2,  quietMax: 3,  moderateMax: 6,  peakWait: 10, pattern: PATTERNS.printShop },
  { id: "gym",         name: "Campus Gym",        category: "Sports", hours: "6:00a – 10:00p", avgVisit: 12, quietMax: 8,  moderateMax: 16, peakWait: 24, pattern: PATTERNS.gym },
  { id: "adminOffice", name: "Admin Office",      category: "Admin",  hours: "9:00a – 5:00p",  avgVisit: 10, quietMax: 8,  moderateMax: 16, peakWait: 26, pattern: PATTERNS.adminOffice },
];

/* =========================================================================
   HELPERS
   ========================================================================= */
function clamp(v, min = 2, max = 98) {
  return Math.min(max, Math.max(min, v));
}

// Build one "snapshot": current demand + an estimated wait RANGE, using
// each service's own thresholds. Jitter represents that this is a
// prediction, not a live headcount — it only changes when refreshed.
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

// Backend base URL — set this to wherever server.js is running.
const API_BASE = "http://localhost:4000";

// Tries the real WiFi-backed API first; falls back to local mock data
// (buildLocations) if the backend isn't reachable, so this file keeps
// working standalone in this preview.
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
  for (let h = openStart; h <= openEnd; h++) {
    if (pattern[h] < bestVal) { bestVal = pattern[h]; best = h; }
  }
  return best;
}

/* =========================================================================
   SMALL COMPONENTS
   ========================================================================= */
function StatusLamp({ statusKey }) {
  const meta = STATUS_META[statusKey];
  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      <span
        className={`w-2.5 h-2.5 rounded-full ${statusKey === "busy" ? "lamp-pulse" : ""}`}
        style={{ backgroundColor: meta.color }}
      />
      <span className={`font-data uppercase text-xs tracking-widest ${meta.text}`}>{meta.label}</span>
    </span>
  );
}

function DemandBar({ demand, statusKey, height = "h-2" }) {
  const meta = STATUS_META[statusKey];
  return (
    <div className={`w-full ${height} rounded-full bg-[var(--ink-3)] overflow-hidden`}>
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${demand}%`, backgroundColor: meta.color }}
      />
    </div>
  );
}

function CategoryChip({ id, active, onClick }) {
  const cfg = id === "All" ? { label: "All", icon: Sliders } : CATEGORY_CONFIG[id];
  const Icon = cfg.icon;
  return (
    <button
      onClick={() => onClick(id)}
      className={`font-data uppercase tracking-widest text-xs flex items-center gap-1.5 px-3.5 py-2 rounded-full border transition-colors duration-200 whitespace-nowrap
        ${active
          ? "bg-[var(--paper)] text-[var(--ink)] border-[var(--paper)]"
          : "bg-transparent text-[var(--paper-dim)] border-[var(--line-strong)] hover:border-[var(--paper-dim)] hover:text-[var(--paper)]"}`}
    >
      <Icon size={13} strokeWidth={2.5} />
      {cfg.label}
    </button>
  );
}

function SmartAlternativeBanner({ location, allLocations, onSwitch }) {
  if (location.statusKey !== "busy") return null;

  const alt = allLocations
    .filter(l => l.category === location.category && l.id !== location.id)
    .sort((a, b) => a.waitLow - b.waitLow)[0];

  if (!alt || alt.statusKey === "busy") return null;

  return (
    <button
      onClick={() => onSwitch(alt.id)}
      className="w-full text-left drop-in flex items-center gap-3 bg-[var(--indigo)]/10 border border-[var(--indigo)]/40 rounded-xl px-4 py-3.5
                 hover:bg-[var(--indigo)]/15 transition-colors group"
    >
      <span className="w-8 h-8 rounded-full bg-[var(--indigo)]/20 flex items-center justify-center shrink-0">
        <ArrowUpRight size={15} className="text-[var(--indigo)]" />
      </span>
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

  const data = location.pattern.map((val, h) => ({
    hour: h,
    label: h % 3 === 0 ? formatHour(h).replace(":00", "") : "",
    demand: val,
  }));

  return (
    <div className="rounded-xl bg-[var(--ink-3)]/60 border border-[var(--line)] p-3">
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--paper-dim)", fontSize: 11, fontFamily: "Barlow Condensed" }}
            interval={0}
          />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{
              background: "var(--ink-2)", border: "1px solid var(--line-strong)",
              borderRadius: 8, fontFamily: "Barlow Condensed", fontSize: 12, color: "var(--paper)"
            }}
            labelFormatter={(_, payload) => payload?.[0] ? formatHour(payload[0].payload.hour) : ""}
            formatter={(v) => [`${v}%`, "Predicted demand"]}
          />
          <ReferenceLine x={data[currentHour]?.label || undefined} stroke="var(--indigo)" strokeDasharray="3 3" />
          <Bar dataKey="demand" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => {
              const isBest = i === best;
              return (
                <Cell
                  key={i}
                  fill="var(--indigo)"
                  fillOpacity={isBest ? 1 : i === currentHour ? 0.85 : 0.35}
                  stroke={isBest ? "var(--paper)" : "none"}
                  strokeWidth={isBest ? 1.5 : 0}
                />
              );
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
      <button
        onClick={() => onToggle(location.id)}
        className="w-full flex items-center gap-3 sm:gap-4 py-4 px-2 sm:px-3 text-left hover:bg-[var(--ink-2)]/60 transition-colors
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo)] rounded-lg"
      >
        <span
          className="w-9 h-9 rounded-lg bg-[var(--ink-3)] border flex items-center justify-center text-[var(--paper)] shrink-0"
          style={{ borderColor: expanded ? meta.color : "var(--line)" }}
        >
          <Icon size={16} strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-display text-base sm:text-lg text-[var(--paper)] uppercase leading-tight truncate">
            {location.name}
          </p>
          <p className="font-data text-[var(--paper-dim)] text-xs tracking-wide truncate">
            {location.category} · Typical visit ~{location.avgVisit} min
          </p>
        </div>

        <div className="hidden sm:block w-28 shrink-0">
          <DemandBar demand={location.demand} statusKey={location.statusKey} />
        </div>

        <div className="text-right shrink-0 w-24">
          <p className="font-display text-lg text-[var(--paper)] tabular-nums leading-none">
            {location.waitLow === 0 && location.waitHigh <= 1 ? "~0" : `${location.waitLow}–${location.waitHigh}`}
            <span className="font-data text-xs text-[var(--paper-dim)] normal-case ml-1">min</span>
          </p>
          <div className="mt-1"><StatusLamp statusKey={location.statusKey} /></div>
        </div>

        <ChevronDown
          size={16}
          className={`text-[var(--paper-dim)] shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="drop-in px-2 sm:px-3 pb-5 pt-1">
          <div className="sm:hidden mb-3">
            <DemandBar demand={location.demand} statusKey={location.statusKey} />
          </div>

          <div className="flex items-center gap-6 mb-4">
            <div>
              <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mb-0.5">Estimated wait</p>
              <p className="font-display text-2xl text-[var(--paper)] tabular-nums">
                {location.waitLow}–{location.waitHigh} min
              </p>
            </div>
            <div className="w-px h-8 bg-[var(--line)]" />
            <div>
              <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mb-0.5">Best time today</p>
              <p className="font-display text-2xl text-[var(--green)] tabular-nums">{formatHour(best)}</p>
            </div>
          </div>

          <SmartAlternativeBanner location={location} allLocations={allLocations} onSwitch={onSwitch} />

          <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mt-4 mb-2">
            Predicted demand today
          </p>
          <HourlyChart location={location} />

          <p className="font-body text-xs text-[var(--paper-dim)] mt-3 flex items-start gap-1.5">
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>
              An estimate, not a headcount — based on typical patterns for this service (open {location.hours},
              ~{location.avgVisit} min per visit). Quiet/moderate/busy lines are set for this service's own pace.
            </span>
          </p>
        </div>
      )}
    </li>
  );
}

/* =========================================================================
   SIMULATION PANEL (optional demo controls — manual only)
   ========================================================================= */
function SimulationPanel({ open, onToggle, locations, onSlide, onReset }) {
  return (
    <>
      <button
        onClick={onToggle}
        className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-[var(--indigo)] text-white flex items-center justify-center
                   shadow-lg shadow-black/40 hover:scale-105 active:scale-95 transition-transform"
        aria-label="Toggle demo controls"
      >
        <Sliders size={18} />
      </button>

      {open && (
        <div className="drop-in fixed bottom-20 right-5 z-40 w-[85vw] max-w-xs bg-[var(--ink-2)] border border-[var(--line-strong)] rounded-2xl p-4 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between mb-1">
            <p className="font-data text-[var(--paper)] text-xs uppercase tracking-widest">Demo Controls</p>
            <button onClick={onReset} className="text-[var(--paper-dim)] hover:text-[var(--paper)]" aria-label="Reset to real prediction">
              <RotateCcw size={14} />
            </button>
          </div>
          <p className="font-body text-xs text-[var(--paper-dim)] mb-3">Manually set demand to demo a scenario — nothing here updates on its own.</p>

          <div className="space-y-3.5 max-h-64 overflow-y-auto pr-1">
            {locations.map(loc => (
              <div key={loc.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-data text-xs text-[var(--paper-dim)] uppercase tracking-wide">{loc.name}</span>
                  <span className="font-data text-xs tabular-nums" style={{ color: STATUS_META[loc.statusKey].color }}>
                    {loc.demand}%
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={98}
                  value={loc.demand}
                  onChange={(e) => onSlide(loc.id, Number(e.target.value))}
                  className="w-full accent-[var(--indigo)]"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* =========================================================================
   HEADER
   ========================================================================= */
function Header({ search, setSearch, categoryFilter, setCategoryFilter, lastUpdated, onRefresh, spinning }) {
  return (
    <div className="sticky top-0 z-30 bg-[var(--ink)]/95 backdrop-blur border-b border-[var(--line)] pb-4">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
        <div className="flex items-start justify-between mb-5 gap-4">
          <div>
            <p className="font-data text-[var(--indigo)] text-xs uppercase tracking-[0.2em] mb-1">Campus Notice Board</p>
            <h1 className="font-display text-2xl sm:text-3xl text-[var(--paper)] uppercase leading-none">
              Busyness &amp; Wait Times
            </h1>
          </div>
          <button
            onClick={onRefresh}
            className="shrink-0 flex items-center gap-2 bg-[var(--ink-2)] border border-[var(--line-strong)] rounded-full px-3.5 py-2
                       hover:border-[var(--paper-dim)] transition-colors font-data text-xs uppercase tracking-widest text-[var(--paper)]"
          >
            <RefreshCw size={13} className={spinning ? "spin-once" : ""} />
            Refresh
          </button>
        </div>

        <p className="font-data text-[var(--paper-dim)] text-xs uppercase tracking-widest mb-4">
          Updated {lastUpdated} · tap refresh for the latest prediction
        </p>

        <div className="flex items-center gap-2 bg-[var(--ink-2)] border border-[var(--line)] rounded-full px-4 py-2.5 mb-4 focus-within:border-[var(--line-strong)] transition-colors">
          <Search size={15} className="text-[var(--paper-dim)] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a service — canteen, library, gym…"
            className="font-body bg-transparent outline-none text-sm text-[var(--paper)] placeholder:text-[var(--paper-dim)] w-full"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-[var(--paper-dim)] hover:text-[var(--paper)]">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {["All", ...Object.keys(CATEGORY_CONFIG)].map(id => (
            <CategoryChip key={id} id={id} active={categoryFilter === id} onClick={setCategoryFilter} />
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

  // Pull real data as soon as the app loads, same as tapping Refresh.
  React.useEffect(() => { refresh(); }, [refresh]);

  const handleSlide = useCallback((id, demand) => {
    setLocations(prev => prev.map(l => {
      if (l.id !== id) return l;
      const midWait = (demand / 100) * l.peakWait;
      const waitLow = Math.max(0, Math.round(midWait * 0.8));
      const waitHigh = Math.max(waitLow + 1, Math.round(midWait * 1.25));
      let statusKey = "quiet";
      if (midWait > l.moderateMax) statusKey = "busy";
      else if (midWait > l.quietMax) statusKey = "moderate";
      return { ...l, demand, waitLow, waitHigh, statusKey };
    }));
  }, []);

  const handleReset = useCallback(() => refresh(), [refresh]);

  const filtered = useMemo(() => {
    return locations.filter(l => {
      const matchesCategory = categoryFilter === "All" || l.category === categoryFilter;
      const matchesSearch = l.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [locations, search, categoryFilter]);

  return (
    <div className="min-h-screen w-full bg-[var(--ink)] font-body" style={{ colorScheme: "dark" }}>
      <style>{FONT_IMPORT}</style>

      <Header
        search={search}
        setSearch={setSearch}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
        spinning={spinning}
      />

      <main className="max-w-3xl mx-auto px-3 sm:px-6 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-display text-2xl text-[var(--paper)] uppercase mb-1">Nothing here</p>
            <p className="font-body text-sm text-[var(--paper-dim)]">Try a different search or category.</p>
          </div>
        ) : (
          <ul className="bg-[var(--ink-2)]/40 border border-[var(--line)] rounded-2xl px-1 sm:px-2">
            {filtered.map(loc => (
              <ServiceRow
                key={loc.id}
                location={loc}
                allLocations={locations}
                expanded={expandedId === loc.id}
                onToggle={(id) => setExpandedId(prev => (prev === id ? null : id))}
                onSwitch={(id) => setExpandedId(id)}
              />
            ))}
          </ul>
        )}
      </main>

      <SimulationPanel
        open={simOpen}
        onToggle={() => setSimOpen(v => !v)}
        locations={locations}
        onSlide={handleSlide}
        onReset={handleReset}
      />
    </div>
  );
}
