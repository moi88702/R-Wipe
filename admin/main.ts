import { SolarModuleRegistry } from "../src/game/data/SolarModuleRegistry";
import { FactionRegistry } from "../src/game/data/FactionRegistry";
import { NPCRegistry } from "../src/game/data/NPCRegistry";
import { MissionRegistry } from "../src/game/data/MissionRegistry";
import { LocationRegistry } from "../src/game/data/LocationRegistry";
import { SystemGateRegistry } from "../src/game/data/SystemGateRegistry";
import { EnemyStationRegistry } from "../src/game/data/EnemyStationRegistry";
import { SolarStationRegistry } from "../src/game/data/SolarStationRegistry";
import { EARTH_BLUEPRINTS } from "../src/game/data/EarthBlueprintRegistry";
import { MARS_BLUEPRINTS } from "../src/game/data/MarsBlueprintRegistry";
import { PIRATE_BLUEPRINTS } from "../src/game/data/PirateBlueprintRegistry";
import { MERCENARY_BLUEPRINTS } from "../src/game/data/MercenaryBlueprintRegistry";

// ── Types ─────────────────────────────────────────────────────────────────────

type CellValue = string | number | null | undefined;

interface Column {
  key: string;
  label: string;
  render?: (val: CellValue, row: Record<string, CellValue>) => string;
  sortNum?: boolean;
}

interface Section {
  id: string;
  label: string;
  emoji: string;
  getRows: () => Record<string, CellValue>[];
  columns: Column[];
  filter1Key?: string;
  filter1Label?: string;
  filter2Key?: string;
  filter2Label?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function badge(text: string, cls: string): string {
  const safe = String(text ?? "").replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);
  return `<span class="badge badge-${cls}">${safe}</span>`;
}

function classPip(c: number | string): string {
  return `<span class="class-pip">C${c}</span>`;
}

function statLine(stats: Record<string, CellValue>): string {
  return Object.entries(stats)
    .filter(([, v]) => v != null && v !== "" && v !== 0)
    .map(([k, v]) => `<span class="stat-val">${v}</span><span class="stat-sep">·</span><span class="stat-row">${k}</span>`)
    .join("  ");
}

function colorSwatch(r: number, g: number, b: number): string {
  return `<span class="color-swatch" style="background:rgb(${r},${g},${b})"></span>`;
}

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);
}

function formatStats(stats: Record<string, unknown>): string {
  const map: Record<string, string> = {
    hp:                     "hp",
    armor:                  "armor",
    shieldCapacity:         "shield",
    thrustMs2:              "thrust",
    powerOutput:            "power",
    damagePerShot:          "dmg",
    fireRateHz:             "rate/s",
    rangeKm:                "range",
    sensorRangeKm:          "sensor",
    lockRangeBoostKm:       "+lock",
    additionalTargetSlots:  "+slots",
    repairRatePerSec:       "rep/s",
    connectedHpBonus:       "+hp-bond",
    shieldRechargeRatePerSec: "regen/s",
    cargoSlots:             "cargo",
    projectedShieldRadius:  "bubble",
    shipFactoryMaxClass:    "fac-max-c",
  };
  const parts: string[] = [];
  for (const [key, label] of Object.entries(map)) {
    const v = stats[key];
    if (v == null) continue;
    let formatted = String(v);
    if (key === "thrustMs2")    formatted = `${(+v / 1000).toFixed(1)}k`;
    if (key === "rangeKm")      formatted = `${v}km`;
    if (key === "sensorRangeKm") formatted = `${v}km`;
    if (key === "lockRangeBoostKm") formatted = `+${v}km`;
    if (key === "fireRateHz")   formatted = `${v}/s`;
    if (key === "shieldCapacity") formatted = `${v}hp`;
    if (key === "projectedShieldRadius") formatted = `${v}km`;
    parts.push(`<span class="stat-val">${formatted}</span><span style="color:var(--muted);font-size:10px"> ${label}</span>`);
  }
  return parts.join("  ") || "<span style='color:var(--muted)'>—</span>";
}

function fuzzyMatch(query: string, haystack: string): boolean {
  if (!query) return true;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = haystack.toLowerCase();
  return words.every(w => hay.includes(w));
}

function buildHaystack(row: Record<string, CellValue>): string {
  return Object.values(row).map(v => String(v ?? "")).join(" ");
}

// ── Sections ──────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [

  // ── Modules ───────────────────────────────────────────────────────────────
  {
    id: "modules",
    label: "Modules",
    emoji: "⬡",
    getRows() {
      return SolarModuleRegistry.getAllModules().map(m => ({
        id:       m.id,
        name:     m.name,
        type:     m.type,
        partKind: m.partKind,
        class:    m.sizeClass,
        stats:    "__stats__",  // special sentinel
        cost:     m.shopCost,
        _statsObj: JSON.stringify(m.stats),
      }));
    },
    columns: [
      { key: "id",       label: "ID",       render: v => `<span class="mono">${esc(String(v))}</span>` },
      { key: "name",     label: "Name" },
      {
        key: "type", label: "Type",
        render: v => badge(String(v), String(v)),
      },
      {
        key: "partKind", label: "Kind",
        render: v => `<span style="color:var(--muted);font-size:11px">${esc(String(v))}</span>`,
      },
      {
        key: "class", label: "C", sortNum: true,
        render: v => classPip(Number(v)),
      },
      {
        key: "stats", label: "Stats",
        render: (_v, row) => formatStats(JSON.parse(String(row["_statsObj"] ?? "{}"))),
      },
      {
        key: "cost", label: "Cost", sortNum: true,
        render: v => `<span style="color:var(--warn)">${Number(v).toLocaleString()} cr</span>`,
      },
    ],
    filter1Key: "type",
    filter1Label: "Type",
    filter2Key: "partKind",
    filter2Label: "Part Kind",
  },

  // ── Blueprints ────────────────────────────────────────────────────────────
  {
    id: "blueprints",
    label: "Blueprints",
    emoji: "🛸",
    getRows() {
      const all = [
        ...EARTH_BLUEPRINTS.map(b => ({ ...b, faction: "earth" })),
        ...MARS_BLUEPRINTS.map(b => ({ ...b, faction: "mars" })),
        ...PIRATE_BLUEPRINTS.map(b => ({ ...b, faction: "pirate" })),
        ...MERCENARY_BLUEPRINTS.map(b => ({ ...b, faction: "mercenary" })),
      ];
      return all.map(b => {
        const defs = SolarModuleRegistry.getModuleMap();
        let weapons = 0, engines = 0, cores = 0;
        for (const m of b.modules) {
          const def = defs.get(m.moduleDefId);
          if (!def) continue;
          if (def.type === "weapon") weapons++;
          if (def.partKind === "thruster" || def.partKind === "ion-engine") engines++;
          if (def.type === "core") cores++;
        }
        return {
          id:        b.id,
          name:      b.name,
          faction:   b.faction,
          class:     b.sizeClass,
          coreSides: b.coreSideCount,
          parts:     b.modules.length,
          weapons,
          engines,
        } as Record<string, CellValue>;
      });
    },
    columns: [
      { key: "id",       label: "ID",       render: v => `<span class="mono">${esc(String(v))}</span>` },
      { key: "name",     label: "Name" },
      { key: "faction",  label: "Faction",  render: v => badge(String(v), String(v)) },
      { key: "class",    label: "C",        sortNum: true, render: v => classPip(Number(v)) },
      { key: "coreSides", label: "Sides",   sortNum: true },
      { key: "parts",    label: "Parts",    sortNum: true },
      { key: "weapons",  label: "Weapons",  sortNum: true, render: v => `<span style="color:var(--bad)">${v}</span>` },
      { key: "engines",  label: "Engines",  sortNum: true, render: v => `<span style="color:var(--good)">${v}</span>` },
    ],
    filter1Key: "faction",
    filter1Label: "Faction",
    filter2Key: "class",
    filter2Label: "Class",
  },

  // ── Factions ──────────────────────────────────────────────────────────────
  {
    id: "factions",
    label: "Factions",
    emoji: "⚑",
    getRows() {
      return FactionRegistry.getAllFactions().map(f => ({
        id:        f.id,
        name:      f.name,
        color:     `${f.color.r},${f.color.g},${f.color.b}`,
        allies:    f.allies?.join(", ") ?? "—",
        enemies:   f.enemies?.join(", ") ?? "—",
        npcs:      f.baselineNpcs?.length ?? 0,
        locations: f.baselineLocations?.length ?? 0,
      } as Record<string, CellValue>));
    },
    columns: [
      { key: "id",       label: "ID",       render: v => `<span class="mono">${esc(String(v))}</span>` },
      {
        key: "name", label: "Name",
        render: (_v, row) => {
          const [r, g, b] = String(row["color"]).split(",").map(Number);
          return `${colorSwatch(r, g, b)}${esc(String(row["name"]))}`;
        },
      },
      { key: "allies",   label: "Allies",   render: v => `<span style="color:var(--good);font-size:11px">${esc(String(v))}</span>` },
      { key: "enemies",  label: "Enemies",  render: v => `<span style="color:var(--bad);font-size:11px">${esc(String(v))}</span>` },
      { key: "npcs",     label: "NPCs",     sortNum: true },
      { key: "locations", label: "Locs",    sortNum: true },
    ],
  },

  // ── NPCs ─────────────────────────────────────────────────────────────────
  {
    id: "npcs",
    label: "NPCs",
    emoji: "👤",
    getRows() {
      return NPCRegistry.getAllNPCs().map(n => ({
        id:        n.id,
        name:      n.name,
        faction:   n.factionId,
        missions:  n.missionIds?.length ?? 0,
        greeting:  n.dialogueGreeting?.slice(0, 80) ?? "",
      } as Record<string, CellValue>));
    },
    columns: [
      { key: "id",       label: "ID",       render: v => `<span class="mono">${esc(String(v))}</span>` },
      { key: "name",     label: "Name" },
      { key: "faction",  label: "Faction",  render: v => badge(String(v), String(v)) },
      { key: "missions", label: "Missions", sortNum: true },
      { key: "greeting", label: "Greeting", render: v => `<span class="wrap" style="color:var(--muted);font-size:11px">${esc(String(v))}…</span>` },
    ],
    filter1Key: "faction",
    filter1Label: "Faction",
  },

  // ── Missions ─────────────────────────────────────────────────────────────
  {
    id: "missions",
    label: "Missions",
    emoji: "📋",
    getRows() {
      return MissionRegistry.getAllMissions().map(m => {
        const npc = NPCRegistry.getNPC(m.npcId);
        return {
          id:         m.id,
          title:      m.title,
          type:       m.type,
          difficulty: m.difficulty,
          npc:        npc?.name ?? m.npcId,
          faction:    npc?.factionId ?? "—",
          rewardCr:   m.rewardCredits,
          rewardRep:  m.rewardReputation,
          reqRep:     m.requiredReputation ?? 0,
        } as Record<string, CellValue>;
      });
    },
    columns: [
      { key: "id",         label: "ID",         render: v => `<span class="mono">${esc(String(v))}</span>` },
      { key: "title",      label: "Title" },
      { key: "type",       label: "Type",        render: v => badge(String(v), String(v)) },
      { key: "difficulty", label: "Diff",        render: v => badge(String(v), String(v)) },
      { key: "npc",        label: "NPC" },
      { key: "faction",    label: "Faction",     render: v => v === "—" ? `<span style="color:var(--muted)">—</span>` : badge(String(v), String(v)) },
      { key: "rewardCr",   label: "Reward Cr",   sortNum: true, render: v => `<span style="color:var(--warn)">${Number(v).toLocaleString()}</span>` },
      { key: "rewardRep",  label: "Reward Rep",  sortNum: true, render: v => `<span style="color:var(--good)">${v}</span>` },
      { key: "reqRep",     label: "Req Rep",     sortNum: true, render: v => Number(v) > 0 ? `<span style="color:var(--bad)">${v}</span>` : `<span style="color:var(--muted)">—</span>` },
    ],
    filter1Key: "type",
    filter1Label: "Type",
    filter2Key: "difficulty",
    filter2Label: "Difficulty",
  },

  // ── Locations ────────────────────────────────────────────────────────────
  {
    id: "locations",
    label: "Locations",
    emoji: "📍",
    getRows() {
      return LocationRegistry.getAllLocations().map(l => ({
        id:           l.id,
        name:         l.name,
        body:         l.bodyId,
        faction:      l.factionId ?? "—",
        dockRadius:   l.dockingRadius,
        posX:         l.position.x,
        posY:         l.position.y,
        npcs:         l.npcIds?.length ?? 0,
      } as Record<string, CellValue>));
    },
    columns: [
      { key: "id",         label: "ID",        render: v => `<span class="mono">${esc(String(v))}</span>` },
      { key: "name",       label: "Name" },
      { key: "body",       label: "Body",       render: v => `<span style="color:var(--muted)">${esc(String(v))}</span>` },
      { key: "faction",    label: "Faction",    render: v => v === "—" ? `<span style="color:var(--muted)">—</span>` : badge(String(v), String(v)) },
      { key: "dockRadius", label: "Dock R",     sortNum: true, render: v => `${v}km` },
      { key: "posX",       label: "X",          sortNum: true },
      { key: "posY",       label: "Y",          sortNum: true },
      { key: "npcs",       label: "NPCs",       sortNum: true },
    ],
    filter1Key: "body",
    filter1Label: "Body",
    filter2Key: "faction",
    filter2Label: "Faction",
  },

  // ── Stations (friendly) ───────────────────────────────────────────────────
  {
    id: "stations",
    label: "Stations",
    emoji: "🏛",
    getRows() {
      return SolarStationRegistry.getAllStations().map(s => ({
        id:           s.id,
        name:         s.name,
        faction:      s.faction,
        system:       s.systemId,
        hull:         s.health,
        shields:      s.shieldCapacity ?? 0,
        turretRange:  s.turret.rangeKm,
        turretDmg:    s.turret.damage,
        maxShips:     s.spawn.maxShips,
        blueprint:    s.blueprintId,
      } as Record<string, CellValue>));
    },
    columns: [
      { key: "id",          label: "ID",         render: v => `<span class="mono">${esc(String(v))}</span>` },
      { key: "name",        label: "Name" },
      { key: "faction",     label: "Faction",    render: v => badge(String(v), String(v)) },
      { key: "system",      label: "System",     render: v => `<span style="color:var(--muted)">${esc(String(v))}</span>` },
      { key: "hull",        label: "Hull",       sortNum: true },
      { key: "shields",     label: "Shields",    sortNum: true },
      { key: "turretRange", label: "Trt Range",  sortNum: true, render: v => `${v}km` },
      { key: "turretDmg",   label: "Trt Dmg",   sortNum: true },
      { key: "maxShips",    label: "Max Ships",  sortNum: true },
      { key: "blueprint",   label: "Blueprint",  render: v => `<span class="mono" style="font-size:10px">${esc(String(v))}</span>` },
    ],
    filter1Key: "faction",
    filter1Label: "Faction",
    filter2Key: "system",
    filter2Label: "System",
  },

  // ── Enemy Stations ───────────────────────────────────────────────────────
  {
    id: "enemy-stations",
    label: "Enemy Bases",
    emoji: "💀",
    getRows() {
      return EnemyStationRegistry.getAllStations().map(s => ({
        id:           s.id,
        name:         s.name,
        faction:      s.factionId,
        body:         s.bodyId,
        alertRadius:  s.alertRadiusKm,
        hull:         s.hullHealth,
        shields:      s.shieldCapacity,
        turretRange:  s.turrets.rangeKm,
        turretDmg:    s.turrets.damagePerShot,
        maxShips:     s.spawnConfig.maxActiveShips,
        spawnTypes:   s.spawnConfig.shipTypes.join(", "),
      } as Record<string, CellValue>));
    },
    columns: [
      { key: "id",          label: "ID",          render: v => `<span class="mono">${esc(String(v))}</span>` },
      { key: "name",        label: "Name" },
      { key: "faction",     label: "Faction",     render: v => badge(String(v), String(v)) },
      { key: "body",        label: "Body",        render: v => `<span style="color:var(--muted)">${esc(String(v))}</span>` },
      { key: "alertRadius", label: "Alert R",     sortNum: true, render: v => `${v}km` },
      { key: "hull",        label: "Hull",        sortNum: true },
      { key: "shields",     label: "Shields",     sortNum: true },
      { key: "turretRange", label: "Trt Range",   sortNum: true, render: v => `${v}km` },
      { key: "turretDmg",   label: "Trt Dmg",    sortNum: true },
      { key: "maxShips",    label: "Max Ships",   sortNum: true },
      { key: "spawnTypes",  label: "Spawn Types", render: v => `<span style="color:var(--muted);font-size:11px">${esc(String(v))}</span>` },
    ],
    filter1Key: "faction",
    filter1Label: "Faction",
    filter2Key: "body",
    filter2Label: "Body",
  },

  // ── System Gates ─────────────────────────────────────────────────────────
  {
    id: "gates",
    label: "Gates",
    emoji: "🔵",
    getRows() {
      return SystemGateRegistry.getAllGates().map(g => ({
        id:          g.id,
        name:        g.name,
        system:      g.systemId,
        destination: g.destinationSystemId,
        sister:      g.sisterGateId,
        triggerR:    g.triggerRadius,
        posX:        Math.round(g.position.x),
        posY:        Math.round(g.position.y),
      } as Record<string, CellValue>));
    },
    columns: [
      { key: "id",          label: "ID",          render: v => `<span class="mono">${esc(String(v))}</span>` },
      { key: "name",        label: "Name" },
      { key: "system",      label: "System",      render: v => `<span style="color:var(--accent)">${esc(String(v))}</span>` },
      { key: "destination", label: "→ System",    render: v => `<span style="color:var(--accent2)">${esc(String(v))}</span>` },
      { key: "sister",      label: "Sister Gate", render: v => `<span class="mono" style="font-size:10px">${esc(String(v))}</span>` },
      { key: "triggerR",    label: "Trigger R",   sortNum: true, render: v => `${v}km` },
      { key: "posX",        label: "X",           sortNum: true },
      { key: "posY",        label: "Y",           sortNum: true },
    ],
    filter1Key: "system",
    filter1Label: "System",
    filter2Key: "destination",
    filter2Label: "Destination",
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

let activeSection = SECTIONS[0]!;
let searchQuery = "";
let filter1Val = "";
let filter2Val = "";
let sortKey: string | null = null;
let sortAsc = true;

// ── Render ────────────────────────────────────────────────────────────────────

function getFilteredRows(): Record<string, CellValue>[] {
  let rows = activeSection.getRows();

  if (filter1Val) rows = rows.filter(r => String(r[activeSection.filter1Key!] ?? "") === filter1Val);
  if (filter2Val) rows = rows.filter(r => String(r[activeSection.filter2Key!] ?? "") === filter2Val);
  if (searchQuery)  rows = rows.filter(r => fuzzyMatch(searchQuery, buildHaystack(r)));

  if (sortKey) {
    const col = activeSection.columns.find(c => c.key === sortKey);
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey!]; const bv = b[sortKey!];
      let cmp = 0;
      if (col?.sortNum) {
        cmp = Number(av ?? 0) - Number(bv ?? 0);
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      }
      return sortAsc ? cmp : -cmp;
    });
  }

  return rows;
}

function uniqueVals(key: string): string[] {
  const all = activeSection.getRows().map(r => String(r[key] ?? "")).filter(Boolean);
  return [...new Set(all)].sort();
}

function renderTabs(): void {
  const el = document.getElementById("tabs")!;
  el.innerHTML = SECTIONS.map(s => `
    <button class="tab ${s.id === activeSection.id ? "active" : ""}" data-id="${s.id}">
      ${s.emoji} ${s.label}
    </button>
  `).join("");
  el.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      activeSection = SECTIONS.find(s => s.id === (btn as HTMLElement).dataset["id"])!;
      searchQuery = ""; filter1Val = ""; filter2Val = "";
      sortKey = null; sortAsc = true;
      renderAll();
    });
  });
}

function renderToolbar(): void {
  const el = document.getElementById("toolbar")!;
  const rows = getFilteredRows();
  const total = activeSection.getRows().length;

  const f1Opts = activeSection.filter1Key ? uniqueVals(activeSection.filter1Key) : [];
  const f2Opts = activeSection.filter2Key ? uniqueVals(activeSection.filter2Key) : [];

  el.innerHTML = `
    <input type="text" placeholder="🔍  fuzzy search…" id="search" value="${esc(searchQuery)}" />
    ${activeSection.filter1Key ? `
      <select id="f1">
        <option value="">${activeSection.filter1Label}: all</option>
        ${f1Opts.map(v => `<option value="${esc(v)}" ${v === filter1Val ? "selected" : ""}>${esc(v)}</option>`).join("")}
      </select>
    ` : ""}
    ${activeSection.filter2Key ? `
      <select id="f2">
        <option value="">${activeSection.filter2Label}: all</option>
        ${f2Opts.map(v => `<option value="${esc(v)}" ${v === filter2Val ? "selected" : ""}>${esc(v)}</option>`).join("")}
      </select>
    ` : ""}
    <span class="count-badge">${rows.length} / ${total}</span>
  `;

  const searchEl = el.querySelector<HTMLInputElement>("#search")!;
  searchEl.addEventListener("input", () => { searchQuery = searchEl.value; renderTable(); updateCount(); });
  searchEl.focus();

  el.querySelector("#f1")?.addEventListener("change", e => { filter1Val = (e.target as HTMLSelectElement).value; renderTable(); updateCount(); });
  el.querySelector("#f2")?.addEventListener("change", e => { filter2Val = (e.target as HTMLSelectElement).value; renderTable(); updateCount(); });
}

function updateCount(): void {
  const badge = document.querySelector<HTMLElement>(".count-badge");
  if (badge) {
    const total = activeSection.getRows().length;
    badge.textContent = `${getFilteredRows().length} / ${total}`;
  }
}

function renderTable(): void {
  const wrap = document.getElementById("table-wrap")!;
  const rows = getFilteredRows();
  const cols = activeSection.columns.filter(c => !c.key.startsWith("_"));

  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No results match your filters.</div>`;
    return;
  }

  const headerCells = cols.map(c => {
    const isSorted = sortKey === c.key;
    const arrow = isSorted ? (sortAsc ? " ▲" : " ▼") : "";
    return `<th data-key="${c.key}" class="${isSorted ? "sorted" : ""}">${esc(c.label)}<span class="sort-arrow">${arrow}</span></th>`;
  }).join("");

  const bodyRows = rows.map(row => {
    const cells = cols.map(col => {
      const val = row[col.key];
      const content = col.render ? col.render(val, row) : esc(String(val ?? "—"));
      return `<td>${content}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  wrap.innerHTML = `
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;

  wrap.querySelectorAll("thead th[data-key]").forEach(th => {
    th.addEventListener("click", () => {
      const key = (th as HTMLElement).dataset["key"]!;
      if (sortKey === key) { sortAsc = !sortAsc; } else { sortKey = key; sortAsc = true; }
      renderTable();
    });
  });
}

function renderAll(): void {
  renderTabs();
  renderToolbar();
  renderTable();
}

// ── Boot ──────────────────────────────────────────────────────────────────────

renderAll();
