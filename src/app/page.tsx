"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Save, Trash2, Settings2, Minus, ChevronRight } from "lucide-react";

/* ================= Types & Constants ================= */
type SkillClass = "Activa" | "Pasiva" | "Crecimiento";
type Tier =
  | "F" | "E" | "D" | "C"
  | "B-" | "B" | "B+"
  | "A-" | "A" | "A+"
  | "S-" | "S" | "S+"
  | "SS-" | "SS" | "SS+"
  | "SSS-" | "SSS" | "SSS+";

const TIERS: Tier[] = ["F","E","D","C","B-","B","B+","A-","A","A+","S-","S","S+","SS-","SS","SS+","SSS-","SSS","SSS+"];
const DEFAULT_STATS = ["Fuerza","Resistencia","Destreza","Mente","Vitalidad","Inteligencia","Sabiduría"] as const;
type StatKey = typeof DEFAULT_STATS[number] | string;

type Equivalencia = { unidad: string; valorPorPunto: number };
type SpeciesBaseMod = { stat: StatKey; modo: "Puntos" | "Porcentaje"; cantidad: number; cadaN?: number; tipo?: "Ventaja" | "Desventaja"; };

type Species = {
  id: string;
  nombre: string;
  descripcion: string;
  equivalencias: Record<string, any>;
  allowMind: boolean;
  baseMods?: SpeciesBaseMod[];
};

type BonusMode = "Porcentaje" | "Puntos";
// filtrar stats dentro de bonus multi
type BonusTarget = {
  stat: StatKey;
  modo: BonusMode;
  cantidadPorNivel: number; 
  basePorcentaje?: number;
};

// Bonificaciones (pueden ser legacy o multi)
type Bonus = {
  id: string;
  nombre: string;
  descripcion?: string;
  
  objetivos?: BonusTarget[];
  objetivo?: StatKey;
  modo?: BonusMode;

  cantidadPorNivel?: number;
  nivelMax: number;
};


type Skill = {
  id: string;
  nombre: string;
  nivel: number;
  nivelMax: number;
  incremento: string;
  clase: SkillClass;
  tier: Tier;
  definicion: string;
  personajes?: string[];
  tags?: SkillTag[];
  damage?: DamageProfile;
};

type EvoLink = { from: string; to: string };

type Character = {
  id: string;
  nombre: string;
  especies: string[]; 
  especie?: string;
  descripcion: string;
  nivel: number;

  stats: Record<StatKey, { valor: number; rango: string }>;
  habilidades: { skillId: string; nivel: number }[];
  bonos: { bonusId: string; nivel: number }[];
  avatarUrl?: string; 
};



type Store = {
  skills: Skill[];
  evoLinks: EvoLink[];
  characters: Character[];
  bonuses: Bonus[];
  extraStats: string[];
  species: Species[];
  globalEquivalencias?: Record<string, any>;
};

// === Equivalencias globales por defecto (se aplican si la especie no define propias) ===
const GLOBAL_EQUIVALENCIAS: Record<string, any> = {
  "Fisicas": {
    "Fuerza": { "daño_fisico": 20, "carga_estable_kg": 8, "carga_maxima_kg": 24 },
    "Resistencia": { "reduccion_dano": 4 },
    "Tenacidad": { "reduccion_dano_continuo": 2 },
    "Vitalidad": { "hp_max": 250, "regeneracion_hp_2min": 20 },
    "Destreza": { "velocidad_ms": 3, "precision": 0.4 }
  },
  "Tecnicas": {
    "Tecnica": { "reduccion_tiempo_s": 0.06 },
    "Potencia": { "dano_energetico": 25 },
    "Eficiencia": { "ahorro_chakra": 2 },
    "Pureza": { "compatibilidad_sellado": 0.1 }
  },
  "MentalesSensoriales": {
    "Inteligencia": { "precision_tactica": 0.4 },
    "Sabiduria": { "deteccion_espiritual": 0.5, "resistencia_mental": 0.2 },
    "Mente": { "resistencia_psiquica": 0.5, "estabilidad_emocional": 1 },
    "Percepcion": { "rango_sensorial_m": 0.5 },
    "Instinto": { "evasion_base": 0.2 }
  },
  "SocialesTacticas": {
    "Determinacion": { "bono_bajo_hp": 1.5 },
    "Influencia": { "rango_ordenes_m": 0.1, "moral_aliada": 0.2 },
    "Estrategia": { "bono_coordinacion": 0.2, "iniciativa": 0.5 }
  },
  "Energeticas": {
    "Chakra": { "chakra_max": 250, "regeneracion_min": 0.3, "reduccion_costo_por_eficiencia": 2 }
  }
};

  export type SkillTag = {
  clave: string;                 // "ocultacion", "camuflaje_audio", etc.
  basePorcentaje: number;        // % en nivel 1 (ej: 20)
  porcentajePorNivel: number;    // +% por nivel adicional (ej: 2)
  maxPorcentaje?: number;        // tope opcional (ej: 60)
  notas?: string;                // flavor/condiciones (opcional)
};

// --- Daño base por tramos ---
export type DamageStepMode = "CadaN" | "Hitos";

export type DamageStepTable = {
  nivel: number;                 // nivel desde el que aplica
  suma?: number;                 // +X acumulativo desde ese nivel
  override?: number;             // fija el daño exacto desde ese nivel
};

export type DamageProfile = {
  base: number;                  // daño base en nivel 1
  modo: DamageStepMode;          // "CadaN" | "Hitos"
  cadaN?: {
    n: number;                   // cada N niveles…
    suma: number;                // …añadir +suma
    maxStacks?: number;          // tope de stacks (opcional)
  };
  hitos?: DamageStepTable[];     // tabla de hitos/overrides
  tope?: number;                 // techo opcional
  notas?: string;                // flavor (opcional)
};

// --- Extiende tu Skill (añade estas dos líneas) ---
const EMPTY_STORE: Store = { skills:[], evoLinks:[], characters:[], bonuses:[], extraStats:[], species:[] };

/* ================= Utils ================= */
function uid(prefix = "id"): string { return `${prefix}_${Math.random().toString(36).slice(2, 9)}`; }
function isUUID(v?: string): boolean { return !!v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v); }
function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

const RANKS = [
  { sub: "Humano Bajo", min: 1, max: 4 },
  { sub: "Humano Medio", min: 5, max: 9 },
  { sub: "Humano Alto", min: 10, max: 14 },
  { sub: "Humano Élite", min: 15, max: 19 },
  { sub: "Genin Bajo", min: 20, max: 24 },
  { sub: "Genin Medio", min: 25, max: 29 },
  { sub: "Genin Alto", min: 30, max: 34 },
  { sub: "Genin Élite", min: 35, max: 39 },
  { sub: "Chunnin Bajo", min: 40, max: 54 },
  { sub: "Chunnin Medio", min: 55, max: 69 },
  { sub: "Chunnin Alto", min: 70, max: 79 },
  { sub: "Chunnin Élite", min: 80, max: 89 },
  { sub: "Jounin Bajo", min: 90, max: 119 },
  { sub: "Jounin Medio", min: 120, max: 149 },
  { sub: "Jounin Alto", min: 150, max: 179 },
  { sub: "Jounin Élite", min: 180, max: 209 },
  { sub: "Kage Bajo", min: 210, max: 279 },
  { sub: "Kage Medio", min: 280, max: 349 },
  { sub: "Kage Alto", min: 350, max: 424 },
  { sub: "Kage Élite", min: 425, max: 499 },
  { sub: "Bijuu Bajo", min: 500, max: 999 },
  { sub: "Bijuu Medio", min: 1000, max: 1499 },
  { sub: "Bijuu Alto", min: 1500, max: 1999 },
  { sub: "Bijuu Élite", min: 2000, max: 2499 },
  { sub: "Catástrofe Bajo", min: 2500, max: 2999 },
  { sub: "Catástrofe Medio", min: 3000, max: 3499 },
  { sub: "Catástrofe Alto", min: 3500, max: 3999 },
  { sub: "Catástrofe Élite", min: 4000, max: 5000 },
  { sub: "Deidad Élite", min: 5001, max: 999999 }
];

function classifyStat(value: number): { sub: string } {
  const v = Math.floor(Number.isFinite(value) ? value : 0);
  const hit = RANKS.find(r => v >= r.min && v <= r.max);
  return { sub: hit ? hit.sub : "Humano Bajo" };
}

function computeMind(intel: number, sab: number): number {
  const i = Math.max(0, intel || 0); const s = Math.max(0, sab || 0);
  return Math.round(Math.sqrt(i * s));
}

/** Suma bonificaciones (multi-objetivo o legacy) sobre un stat */
function sumBonusesForStat(
  stat: StatKey,
  assignmentsByBonusId: Record<string, number>, // { bonusId: nivelAsignado }
  bonuses: Bonus[]
): { flat: number; percent: number } {
  const byId = indexBonuses(bonuses);
  let flat = 0;
  let percent = 0;

  for (const bonusId in assignmentsByBonusId) {
    const asignado = assignmentsByBonusId[bonusId] ?? 0;
    if (asignado <= 0) continue;

    const b = byId[bonusId];
    if (!b) continue;

    const lvl = Math.max(0, Math.min(asignado, b.nivelMax ?? asignado));

    // MULTI: objetivos[]
    if (Array.isArray(b.objetivos) && b.objetivos.length) {
      for (const t of b.objetivos) {
        // dentro del loop MULTI: objetivos[]
if (t.stat !== stat) continue;
const n = (t.cantidadPorNivel ?? 0) * lvl;
if (t.modo === "Puntos") {
  flat += n;
} else if (t.modo === "Porcentaje") {
  // porcentaje por nivel
  percent += n;
  // NUEVO: porcentaje base (si viene)
  if (typeof t.basePorcentaje === "number") {
    percent += t.basePorcentaje;
  }
}

      }
      continue;
    }

    // LEGACY: un solo objetivo
    if (b.objetivo === stat && (b.cantidadPorNivel ?? 0) > 0) {
      const n = (b.cantidadPorNivel ?? 0) * lvl;
      if (b.modo === "Puntos") flat += n;
      else if (b.modo === "Porcentaje") percent += n;
    }
  }

  return { flat, percent: percent / 100 }; // devolver porcentaje como fracción
}

/** Aplica modificadores de especie (puntos*nivel + % fijo) */
/** Aplica modificadores de TODAS las especies seleccionadas (flat acumulado + % acumulado). */
function applySpeciesModsMulti(
  base: number,
  key: StatKey,
  species: Species[],                // catálogo completo
  speciesIds: string[] | undefined,  // ids seleccionadas en el personaje
  nivel: number
) {
  if (!speciesIds?.length) return base;

  const byId = new Map(species.map(s => [s.id, s]));
  let flat = 0;
  let perc = 0; // fracción (0.15 = +15%)

  for (const id of speciesIds) {
    const sp = byId.get(id);
    if (!sp?.baseMods?.length) continue;

    for (const m of sp.baseMods) {
      if (m.stat !== key) continue;

      const lvl = Math.max(1, nivel ?? 1);
      const step = Math.max(1, m.cadaN ?? 1);
      const ticks = Math.floor(lvl / step);
      if (ticks <= 0) continue;

      if (m.modo === "Puntos") {
        flat += (m.cantidad ?? 0) * ticks;
      } else if (m.modo === "Porcentaje") {
        const sign = (m.tipo === "Desventaja") ? -1 : 1;
        const frac = Math.abs(m.cantidad ?? 0) / 100; // aseguramos magnitud
        perc += sign * frac;
      }
    }
  }
  return Math.round((base * (1 + perc) + flat) * 100) / 100;
}

/** Valor efectivo = base → especies (multi) → bonos (multi-objetivo o legacy). */
function calcEffectiveStat(c: Character, key: StatKey, bonuses: Bonus[], species: Species[]) {
  const base = c.stats[key]?.valor ?? 0;

  // usar múltiples especies por ID (fallback a especie principal si no hay arreglo)
  const speciesIds = (c.especies?.length ? c.especies : (c.especie ? [c.especie] : []));
  const withSpecies = applySpeciesModsMulti(base, key, species, speciesIds, c.nivel);

  // Crear mapa bonusId → nivelAsignado
  const assignmentsByBonusId = Object.fromEntries(
    (c.bonos ?? []).map(b => [b.bonusId, b.nivel])
  );

  // Sumar bonificaciones (percent como fracción)
  const { flat, percent } = sumBonusesForStat(
    key,
    assignmentsByBonusId,
    bonuses
  );

  return Math.round((withSpecies * (1 + percent) + flat) * 100) / 100;
}

/* ================= Small UI Helpers ================= */
function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode; }) {
  return (
    <Card className="border border-gray-200">
      <CardHeader className="py-3 flex items-center justify-between">
        <CardTitle className="text-lg md:text-xl">{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent className="p-3 md:p-4">{children}</CardContent>
    </Card>
  );
}

  // ---- Tags porcentuales ----
export function calcSkillTagValue(tag: SkillTag, nivel: number) {
  const n = Math.max(1, nivel);
  const val = (tag.basePorcentaje || 0) + (tag.porcentajePorNivel || 0) * (n - 1);
  return tag.maxPorcentaje != null ? Math.min(val, tag.maxPorcentaje) : val;
}

// ---- Daño por tramos ----
export function calcDamageCadaN(d: DamageProfile, nivel: number) {
  const base = d.base || 0;
  const each = d.cadaN;
  if (!each) return base;
  const stacks = Math.max(0, Math.floor((Math.max(1, nivel) - 1) / Math.max(1, each.n)));
  const aplicados = each.maxStacks != null ? Math.min(stacks, each.maxStacks) : stacks;
  const val = base + aplicados * (each.suma || 0);
  return d.tope != null ? Math.min(val, d.tope) : val;
}

export function calcDamageHitos(d: DamageProfile, nivel: number) {
  const base = d.base || 0;
  const list = (d.hitos ?? []).slice().sort((a,b) => a.nivel - b.nivel);
  let val = base;
  for (const h of list) {
    if (nivel < h.nivel) break;
    if (typeof h.override === "number") val = h.override;
    if (typeof h.suma === "number") val += h.suma;
  }
  return d.tope != null ? Math.min(val, d.tope) : val;
}

export function calcSkillDamage(d: DamageProfile | undefined, nivel: number) {
  if (!d) return undefined;
  return d.modo === "CadaN" ? calcDamageCadaN(d, nivel) : calcDamageHitos(d, nivel);
}


async function loadConfigExtraStats(): Promise<string[]> {
  const { data, error } = await supabase.from("app_config").select("data").eq("id", "global").single();
  if (error || !data?.data) return [];
  return Array.isArray(data.data.extraStats) ? data.data.extraStats : [];
}

async function saveConfigExtraStats(extra: string[]) {
  const payload = { extraStats: Array.from(new Set(extra.map(s => s.trim()).filter(Boolean))) };
  await supabase.from("app_config").upsert({ id: "global", data: payload });
}
// === Equivalencias globales (persistentes en app_config) ===

// === Helper: nombres cortos de equivalencias ===
const EQUIV_ALIASES: Record<string, string> = {
  "daño_fisico": "daño",
  "carga_estable_kg": "carga (kg)",
  "carga_maxima_kg": "carga máx (kg)",
  "reduccion_dano": "red. daño",
  "reduccion_dano_continuo": "red. cont.",
  "hp_max": "HP máx",
  "regeneracion_hp_2min": "regen HP",
  "velocidad_ms": "vel (m/s)",
  "precision": "precisión",
  "reduccion_tiempo_s": "red. tiempo",
  "dano_energetico": "daño ener.",
  "ahorro_chakra": "ahorro ch.",
  "compatibilidad_sellado": "compat. sell.",
  "precision_tactica": "prec. táct.",
  "deteccion_espiritual": "det. esp.",
  "resistencia_mental": "res. mental",
  "resistencia_psiquica": "res. psíquica",
  "estabilidad_emocional": "estab. emo.",
  "rango_sensorial_m": "rango sens.",
  "evasion_base": "evasión",
  "bono_bajo_hp": "bono HP bajo",
  "rango_ordenes_m": "rango ord.",
  "moral_aliada": "moral",
  "bono_coordinacion": "bono coord.",
  "iniciativa": "inic.",
  "chakra_max": "chakra máx",
  "regeneracion_min": "regen/min",
  "reduccion_costo_por_eficiencia": "↓coste/efic."
};

export function shortEquivName(key: string): string {
  return EQUIV_ALIASES[key] ?? key;
}


/** Mezcla equivalencias: por-especie sobre globales (override por clave). */
function mergeEquivalencias(
  globalEq: Record<string, any> | undefined,
  speciesEqList: Array<Record<string, any>>
) {
  const out: Record<string, any> = JSON.parse(JSON.stringify(globalEq ?? {}));
  for (const eq of speciesEqList) {
    if (!eq) continue;
    for (const categoria of Object.keys(eq)) {
      out[categoria] = out[categoria] ?? {};
      for (const stat of Object.keys(eq[categoria] ?? {})) {
        out[categoria][stat] = {
          ...(out[categoria]?.[stat] ?? {}),
          ...(eq[categoria]?.[stat] ?? {}),
        };
      }
    }
  }
  return out;
}

/** Construye mapa stat->valor efectivo (usa tu calcEffectiveStat). */
function buildEffectiveMap(
  ch: Character,
  bonuses: Bonus[],
  species: Species[],
  statKeys: StatKey[]
) {
  const map: Record<string, number> = {};
  for (const k of statKeys) {
    map[k] = calcEffectiveStat(ch, k as StatKey, bonuses, species); // ya existe en tu archivo
  }
  return map;
}

/** A partir de equivalencias y valores efectivos, genera lista plana derivada. */
function deriveMetricsFromEquivalencias(
  effective: Record<string, number>,
  equivalencias: Record<string, any>
) {
  type Row = { categoria: string; stat: string; nombre: string; valor: number };
  const rows: Row[] = [];

  for (const categoria of Object.keys(equivalencias ?? {})) {
    const porStat = equivalencias[categoria] ?? {};
    for (const stat of Object.keys(porStat)) {
      const base = effective[stat] ?? 0;
      const defs = porStat[stat] ?? {};
      for (const nombre of Object.keys(defs)) {
        const factor = Number(defs[nombre] ?? 0);
        if (!isFinite(factor)) continue;
        rows.push({
          categoria,
          stat,
          nombre,
          valor: Math.round(base * factor * 100) / 100,
        });
      }
    }
  }
  // orden estético: por categoría, luego por stat, luego por nombre
  rows.sort((a, b) =>
    a.categoria.localeCompare(b.categoria) ||
    a.stat.localeCompare(b.stat) ||
    a.nombre.localeCompare(b.nombre)
  );
  return rows;
}


export type GlobalEquivalencias = Record<string, any>;

export async function loadConfigGlobalEquivalencias(): Promise<GlobalEquivalencias> {
  const { data, error } = await supabase
    .from("app_config")
    .select("data")
    .eq("id", "global")
    .single();
  if (error || !data?.data) return {};
  return (data.data.globalEquivalencias ?? {}) as GlobalEquivalencias;
}

export async function saveConfigGlobalEquivalencias(equiv: GlobalEquivalencias) {
  // merge con data existente para no pisar otras claves (p.ej. extraStats)
  const { data: current } = await supabase
    .from("app_config")
    .select("data")
    .eq("id", "global")
    .single();

  const merged = {
    ...(current?.data ?? {}),
    globalEquivalencias: equiv,
  };

  await supabase.from("app_config").upsert({ id: "global", data: merged });
}


// ---- Species utils ----
export function sortEspeciesAuto(especies: string[]) {
  if (!Array.isArray(especies) || especies.length === 0) return [];
  const [principal, ...resto] = especies;
  return [principal, ...resto.slice().sort((a, b) => a.localeCompare(b))];
}

export function uniqEspecies(arr: string[]) {
  return Array.from(new Set(arr));
}

export function formatEspeciesSlash(especies: string[]) {
  return (especies ?? []).join(" / ");
}

type SpeciesOption = { id: string; nombre: string };

function SpeciesMultiSelectAccordion({
  allSpecies,
  value,
  onChange,
  max = 10,
  title = "Especies (máx 10)",
}: {
  allSpecies: SpeciesOption[];
  value: string[];                 // ids seleccionados
  onChange: (ids: string[]) => void;
  max?: number;
  title?: string;
}) {
  const [query, setQuery] = React.useState("");

  const selected = React.useMemo(() => uniqEspecies(value).slice(0, max), [value, max]);
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = allSpecies ?? [];
    return q
      ? base.filter(s =>
          s.nombre.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
        )
      : base;
  }, [allSpecies, query]);

  function toggle(id: string) {
    // si ya está, quita; si no está, agrega (si hay cupo)
    if (selectedSet.has(id)) {
      const out = selected.filter(x => x !== id);
      onChange(sortEspeciesAuto(out));
    } else {
      if (selected.length >= max) return; // tope
      const out = sortEspeciesAuto([...selected, id]);
      onChange(out);
    }
  }

  function clearAll() {
    onChange([]);
  }

  const countLabel = `${selected.length}/${max} seleccionadas`;
  const principal = selected[0]; // especie principal = primera

  return (
    <div className="rounded-2xl border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">{title}</div>
        <div className="text-xs opacity-70">{countLabel}</div>
      </div>

      <div className="flex gap-2 items-center">
        <Input
          placeholder="Buscar especie..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="text-sm underline opacity-80" onClick={clearAll}>
          Limpiar
        </button>
      </div>

      <div className="border rounded-xl">
        {/* Acordeón simple */}
        <details open>
          <summary className="cursor-pointer select-none px-4 py-2">Seleccionar especies</summary>
          <div className="max-h-64 overflow-auto px-4 pb-3 pt-1 space-y-2">
            {filtered.length === 0 ? (
              <div className="text-sm opacity-70">Sin resultados.</div>
            ) : (
              filtered.map(sp => {
                const checked = selectedSet.has(sp.id);
                const disabled = !checked && selected.length >= max;
                return (
                  <label
                    key={sp.id}
                    className={`flex items-center gap-2 text-sm ${
                      disabled ? "opacity-40" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(sp.id)}
                    />
                    <span>
                      {sp.nombre}
                      {principal === sp.id ? (
                        <span className="ml-2 text-[11px] px-2 py-[2px] rounded-full bg-amber-100">
                          Principal
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </details>
      </div>

      {selected.length > 0 && (
        <div className="text-sm">
          <div className="opacity-70">Especies del personaje:</div>
          <div className="font-medium">{formatEspeciesSlash(selected)}</div>
          <div className="text-[11px] opacity-70 mt-1">
            Orden automático: Principal (primera) + alfabético.
          </div>
        </div>
      )}
    </div>
  );
}


function indexBonuses(bonuses: Bonus[]) {
  const byId: Record<string, Bonus> = {};
  for (const b of bonuses) byId[b.id] = b;
  return byId;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
      <Label className="text-sm font-medium opacity-80">{label}</Label>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function MultiTargetsEditor({
  namePrefix,
  initialTargets,
  statsOptions,
}: {
  namePrefix: string;
  initialTargets: { stat: string; modo: BonusMode; cantidadPorNivel: number }[];
  statsOptions: string[];
}) {
  const [rows, setRows] = React.useState(
    Array.isArray(initialTargets) ? initialTargets.slice(0, 5) : []
  );

  function addRow() {
    if (rows.length >= 5) return;
    setRows((prev) => [
      ...prev,
      { stat: statsOptions[0] ?? "Fuerza", modo: "Puntos" as BonusMode, cantidadPorNivel: 1 },
    ]);
  }
  function updateRow(i: number, patch: Partial<{ stat: string; modo: BonusMode; cantidadPorNivel: number }>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  
  // Preview por nivel (suma local): puntos = n * lvl; % = (n/100) * lvl
  const [lvl, setLvl] = React.useState(1);
  React.useEffect(() => {
    const input = document.querySelector('input[name="nivelPreview_multi"]') as HTMLInputElement | null;
    if (!input) return;
    const onChange = () => setLvl(Math.max(1, parseInt(input.value || "1")));
    input.addEventListener("input", onChange);
    return () => input.removeEventListener("input", onChange);
  }, []);
  const formEl = document.getElementById("bonusMultiForm") as HTMLFormElement | null;
  if (!formEl) throw new Error("No se encontró el formulario de Bonificaciones (multi).");

  const fd = new FormData(formEl);                   // ← defines fd aquí
  const total = parseInt(String(fd.get("multi_count_rows") ?? "0"));


  return (
    <div className="space-y-2">
      <input type="hidden" name="multi_count_rows" value={rows.length} />
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-5">
            <Label>Stat</Label>
            <Select
              defaultValue={String(r.stat)}
              onValueChange={(v) => {
                updateRow(i, { stat: v });
                const el = document.querySelector(`select[name='${namePrefix}stat_${i}']`) as HTMLSelectElement | null;
                if (el) el.value = v;
                const total = parseInt(String(fd.get("multi_count_rows") ?? "0"));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-auto">
                {statsOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <select name={`${namePrefix}stat_${i}`} defaultValue={String(r.stat)} className="hidden" />
          </div>

          <div className="col-span-3">
            <Label>Modo</Label>
            <Select
              defaultValue={r.modo}
              onValueChange={(v) => {
                updateRow(i, { modo: v as BonusMode });
                const el = document.querySelector(`select[name='${namePrefix}modo_${i}']`) as HTMLSelectElement | null;
                if (el) el.value = v;
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Puntos">Puntos</SelectItem>
                <SelectItem value="Porcentaje">Porcentaje</SelectItem>
              </SelectContent>
            </Select>
            <select name={`${namePrefix}modo_${i}`} defaultValue={r.modo} className="hidden" />
          </div>

          <div className="col-span-3">
            <Label>+ por nivel</Label>
            <Input
              type="number"
              min={0}
              name={`${namePrefix}cantidad_${i}`}
              defaultValue={r.cantidadPorNivel}
              onChange={(e) => updateRow(i, { cantidadPorNivel: Math.max(0, parseFloat(e.target.value || "0")) })}
            />
            {/* Preview local para esta fila */}
            <div className="text-[11px] opacity-70 mt-1">
              Preview nivel {lvl}:{" "}
              {r.modo === "Puntos"
                ? `+${(r.cantidadPorNivel ?? 0) * lvl} puntos`
                : `+${((r.cantidadPorNivel ?? 0) / 100) * lvl * 100}%`}
            </div>
          </div>

          <div className="col-span-1">
          
{r.modo === "Porcentaje" && (
  <div className="col-span-3">
    <Label>% base</Label>
    <Input
      type="number"
      min={0}
      name={`${namePrefix}base_${i}`}
      defaultValue={(r as any).basePorcentaje ?? 0}
      onChange={(e) => updateRow(i, { ...(r as any), basePorcentaje: Math.max(0, parseFloat(e.target.value || "0")) } as any)}
    />
    <div className="text-[11px] opacity-70 mt-1">
      Se suma siempre (además del % por nivel).
    </div>
  </div>
)}
    
            <Button type="button" variant="destructive" onClick={() => removeRow(i)} className="w-full">
              Quitar
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={addRow} disabled={rows.length >= 5}>
        Añadir objetivo (máx 5)
      </Button>
    </div>
    
  );
}

  function TagEffectsEditor({
  initialTags = [],
  nivelPreview = 1,
  onChange,
  max = 10,
}: {
  initialTags?: SkillTag[];
  nivelPreview?: number;
  onChange?: (tags: SkillTag[]) => void;
  max?: number;
}) {
  const [rows, setRows] = React.useState<SkillTag[]>(
    Array.isArray(initialTags) ? initialTags.slice(0, max) : []
  );

  React.useEffect(() => {
    const next = Array.isArray(initialTags) ? initialTags.slice(0, max) : [];
    // compara superficialmente para evitar setState inútil
    const same =
      next.length === rows.length &&
      next.every((t, i) => JSON.stringify(t) === JSON.stringify(rows[i]));
    if (!same) setRows(next);
  }, [initialTags, max]); 

  function publish(next: SkillTag[]) {
    setRows(next);
    onChange?.(next);
  }

  function addRow() {
    if (rows.length >= max) return;
    publish([
      ...rows,
      { clave: "ocultacion", basePorcentaje: 20, porcentajePorNivel: 2, maxPorcentaje: undefined, notas: "" },
    ]);
  }

  function updateRow(i: number, patch: Partial<SkillTag>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    publish(next);
  }

  function removeRow(i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    publish(next);
  }
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const preview = calcSkillTagValue(r, nivelPreview);
        return (
          <div key={i} className="grid grid-cols-12 gap-2 items-end border-b pb-2">
            <div className="col-span-3">
              <Label>Clave</Label>
              <Input value={r.clave}
                onChange={(e)=>updateRow(i,{ clave: e.target.value.trim() })}
                placeholder="ocultacion / camuflaje / audio_mute"/>
            </div>
            <div className="col-span-2">
              <Label>% base (lvl 1)</Label>
              <Input type="number" inputMode="numeric" value={r.basePorcentaje}
                onChange={(e)=>updateRow(i,{ basePorcentaje: parseFloat(e.target.value||"0") })}/>
            </div>
            <div className="col-span-2">
              <Label>% por nivel</Label>
              <Input type="number" inputMode="numeric" value={r.porcentajePorNivel}
                onChange={(e)=>updateRow(i,{ porcentajePorNivel: parseFloat(e.target.value||"0") })}/>
            </div>
            <div className="col-span-2">
              <Label>Tope (opcional)</Label>
              <Input type="number" inputMode="numeric" value={r.maxPorcentaje ?? ""}
                onChange={(e)=>{
                  const v = e.target.value === "" ? undefined : parseFloat(e.target.value||"0");
                  updateRow(i,{ maxPorcentaje: v });
                }}/>
            </div>
            <div className="col-span-2">
              <Label>Preview</Label>
              <div className="text-sm font-medium">{preview}% @lvl {nivelPreview}</div>
              <div className="text-[11px] opacity-70">({r.basePorcentaje} + {r.porcentajePorNivel}×(lvl-1))</div>
            </div>
            <div className="col-span-1">
              <Button type="button" variant="destructive" onClick={()=>removeRow(i)} className="w-full">Quitar</Button>
            </div>
            <div className="col-span-12 -mt-1">
              <Label>Notas (opcional)</Label>
              <Input value={r.notas ?? ""} onChange={(e)=>updateRow(i,{ notas: e.target.value })}/>
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" onClick={addRow}>Añadir tag (+%)</Button>
    </div>
  );
}


function Pill({ children }: { children: React.ReactNode }) {
  return <Badge className="rounded-2xl px-2 py-1 text-[11px] md:text-xs whitespace-nowrap">{children}</Badge>;
}

/* ================= Species Form ================= */
function SpeciesForm({ initial, onSubmit, statOptions, statOptionsBase, statOptionsExtra, globalEquivalencias }: { initial?: Species; onSubmit: (s: Species) => void; statOptions: string[]; statOptionsBase?: string[]; statOptionsExtra?: string[]; globalEquivalencias?: GlobalEquivalencias;}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [allowMind, setAllowMind] = useState<boolean>(initial?.allowMind ?? true);
  const [mods, setMods] = useState<SpeciesBaseMod[]>(initial?.baseMods ?? []);
  const [equivText, setEquivText] = useState<string>(JSON.stringify(initial?.equivalencias ?? {}, null, 2));

  function addMod() {
  setMods(prev => [...prev, { stat: statOptions[0] ?? "Fuerza", modo: "Puntos", cantidad: 1, cadaN: 1, tipo: "Ventaja" }]);
}
  function updateMod(i: number, patch: Partial<SpeciesBaseMod>) { setMods(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m)); }
  function removeMod(i: number) { setMods(prev => prev.filter((_, idx) => idx !== i)); }

  function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  let equivalencias: Record<string, any> = {};
  try { equivalencias = JSON.parse(equivText || "{}"); } 
  catch { alert("Equivalencias debe ser JSON válido"); return; }

  const out: Species = {
    id: initial?.id ?? uid("spec"),
    nombre: nombre.trim(),
    descripcion,
    allowMind,
    baseMods: mods,
    equivalencias: (equivalencias && Object.keys(equivalencias).length > 0) ? equivalencias : {}
  };
  onSubmit(out);
}


  const RESET_ON_CLEAR = false;
  useEffect(() => {
  // Cuando cambie "initial" (otra especie seleccionada), sincroniza el formulario
  if (initial) {
    setNombre(initial.nombre ?? "");
    setDescripcion(initial.descripcion ?? "");
    setAllowMind(initial.allowMind ?? true);
    setMods((initial.baseMods ?? []).map(m => ({ ...m, tipo: m.tipo ?? "Ventaja" })));

    const eq = (initial.equivalencias && Object.keys(initial.equivalencias).length > 0)
      ? initial.equivalencias
      : GLOBAL_EQUIVALENCIAS;
    
    setEquivText(JSON.stringify(eq, null, 2));
  } else {
    setNombre("");
    setDescripcion("");
    setAllowMind(true);
    setMods([]);
    setEquivText(JSON.stringify(GLOBAL_EQUIVALENCIAS, null, 2));
  }
}, [initial]);
  return (
    <>
    {/* STRAY FORM COMMENTED OUT (moved into bonuses tab) */}
      <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={nombre} onChange={(e)=>setNombre(e.target.value)} placeholder="Ej: Dragón, Uzumaki, Humano"/></Field>
        <Field label="Puede usar Mente">
          <div className="flex items-center gap-2">
            <Switch checked={allowMind} onCheckedChange={setAllowMind}/>
            <span className="text-sm opacity-80">{allowMind ? "Sí" : "No"}</span>
          </div>
        </Field>
      </div>
      <Field label="Descripción"><Textarea value={descripcion} onChange={(e)=>setDescripcion(e.target.value)} className="min-h-[80px]"/></Field>

      <Section title="Modificadores base por especie">
        <div className="space-y-2">
          {mods.map((m, i) => (
  <div key={i} className="grid grid-cols-12 gap-2 items-end">
  {/* Stat */}
  <div className="col-span-3">
    <Label>Stat</Label>
    <Select value={String(m.stat)} onValueChange={(v)=>updateMod(i, { stat: v })}>
      <SelectTrigger><SelectValue/></SelectTrigger>
      <SelectContent className="max-h-60 overflow-auto">
        {Boolean(statOptionsBase?.length) && (
          <SelectGroup>
            <SelectLabel>Estadísticas base</SelectLabel>
            {(statOptionsBase ?? []).map((s) => (
              <SelectItem key={`base-${s}`} value={s}>{s}</SelectItem>
            ))}
          </SelectGroup>
        )}
        {Boolean(statOptionsExtra?.length) && (
          <SelectGroup>
            <SelectLabel>Estadísticas personalizadas</SelectLabel>
            {(statOptionsExtra ?? []).map((s) => (
              <SelectItem key={`extra-${s}`} value={s}>{s}</SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  </div>

  {/* Tipo (Ventaja / Desventaja) */}
  <div className="col-span-3">
    <Label>Tipo</Label>
    <Select
      value={m.tipo ?? "Ventaja"}
      onValueChange={(v)=>{
        // Si es desventaja, forzamos modo Porcentaje
        const isDown = v === "Desventaja";
        updateMod(i, { tipo: v as any, modo: isDown ? "Porcentaje" : (m.modo ?? "Puntos") });
      }}
    >
      <SelectTrigger><SelectValue/></SelectTrigger>
      <SelectContent>
        <SelectItem value="Ventaja">Ventaja</SelectItem>
        <SelectItem value="Desventaja">Desventaja</SelectItem>
      </SelectContent>
    </Select>
    <div className="text-[11px] opacity-70 mt-1">
      {(m.tipo ?? "Ventaja") === "Desventaja"
        ? "Solo porcentaje (se aplica como resta)."
        : "Puedes usar puntos o porcentaje."}
    </div>
  </div>

  {/* Modo (bloquea Puntos cuando sea Desventaja) */}
  <div className="col-span-3">
    <Label>Modo</Label>
    <Select
      value={m.modo}
      onValueChange={(v)=>{
        if ((m.tipo ?? "Ventaja") === "Desventaja") return; // bloqueado
        updateMod(i, { modo: v as any });
      }}
    >
      <SelectTrigger><SelectValue/></SelectTrigger>
      <SelectContent>
        <SelectItem value="Puntos" disabled={(m.tipo ?? "Ventaja") === "Desventaja"}>Puntos</SelectItem>
        <SelectItem value="Porcentaje">Porcentaje</SelectItem>
      </SelectContent>
    </Select>
  </div>

  {/* Cantidad (si es Desventaja, tratar como % positivo) */}
  <div className="col-span-2">
    <Label>{(m.tipo ?? "Ventaja") === "Desventaja" ? "Porcentaje (%)" : "Cantidad"}</Label>
    <Input
      inputMode="numeric"
      type="number"
      min={(m.tipo ?? "Ventaja") === "Desventaja" ? 0 : undefined}
      value={m.cantidad}
      onChange={(e)=>{
        let v = parseFloat(e.target.value || "0");
        if ((m.tipo ?? "Ventaja") === "Desventaja") v = Math.max(0, v); // guardar magnitud
        updateMod(i, { cantidad: v });
      }}
    />
  </div>

  {/* Eliminar */}
  <div className="col-span-1">
    <Button type="button" variant="destructive" onClick={()=>removeMod(i)} className="w-full">
      <Trash2 className="w-4 h-4"/>
    </Button>
  </div>

  {/* Nota guía para "cadaN" (si decides mostrarlo después) */}
  {(m.modo === "Puntos" && (m.tipo ?? "Ventaja") !== "Desventaja") ? (
  <div className="col-span-12 grid grid-cols-12 gap-2 -mt-1">
    <div className="col-span-3">
      <Label>Cada N niveles</Label>
      <Input
        inputMode="numeric"
        type="number"
        min={1}
        value={m.cadaN ?? 1}
        onChange={(e) => {
          const n = Math.max(1, parseInt(e.target.value || "1"));
          updateMod(i, { cadaN: n });
        }}
      />
      <div className="text-[11px] opacity-70 mt-1">
        +{m.cantidad ?? 0} puntos cada {m.cadaN ?? 1} niveles
      </div>
    </div>
  </div>
) : (
    <div className="col-span-12 text-[11px] opacity-70 -mt-1">
      {(m.tipo ?? "Ventaja") === "Desventaja"
        ? "Desventaja porcentual fija de especie (resta)."
        : "Porcentaje fijo de especie (suma)."}
    </div>
  )}
</div>

))}

          <Button type="button" variant="outline" onClick={addMod} disabled={!statOptions.length} className="gap-2"><Plus className="w-4 h-4"/>Añadir modificador</Button>
        </div>
      </Section>

      <Field label="Equivalencias (JSON)">
        <Textarea value={equivText} onChange={(e)=>setEquivText(e.target.value)} className="min-h-[140px]" />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar especie</Button>
      </div>
    </form>
    </>
  );
}

/* ================= Skills & Evolution ================= */
function SkillForm({ onSubmit, initial }: { onSubmit: (s: Skill) => void; initial?: Skill; }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [nivel, setNivel] = useState<number>(initial?.nivel ?? 1);
  const [nivelMax, setNivelMax] = useState<number>(initial?.nivelMax ?? 10);
  const [incremento, setIncremento] = useState(initial?.incremento ?? "");
  const [clase, setClase] = useState<SkillClass>(initial?.clase ?? "Activa");
  const [tier, setTier] = useState<Tier>(initial?.tier ?? "F");
  const [definicion, setDefinicion] = useState(initial?.definicion ?? "");
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  // NUEVO:
  const [tags, setTags] = useState<SkillTag[]>(initial?.tags ?? []);
  const [damage, setDamage] = useState<DamageProfile | undefined>(initial?.damage);
  const [nivelPreview, setNivelPreview] = useState<number>(initial?.nivel ?? 1);


  function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  const base: Skill = {
    id: initial?.id ?? uid("skill"),
    nombre, nivel, nivelMax,
    incremento, clase, tier, definicion,
    // NUEVO:
    tags,
    damage
  };
  onSubmit(base);
  useEffect(() => {
  setNombre(initial?.nombre ?? "");
  setNivel(initial?.nivel ?? 1);
  setNivelMax(initial?.nivelMax ?? 10);
  setIncremento(initial?.incremento ?? "");
  setClase(initial?.clase ?? "Activa");
  setTier(initial?.tier ?? "F");
  setDefinicion(initial?.definicion ?? "");

  // NUEVO:
  setTags(initial?.tags ?? []);
  setDamage(initial?.damage);
  setNivelPreview(initial?.nivel ?? 1);
}, [initial]);

  // Limpieza (mantén tu reset actual y añade estos):
  setNombre(""); setNivel(1); setNivelMax(10);
  setIncremento(""); setClase("Activa"); setTier("F");
  setDefinicion(""); 
  // NUEVO:
  setTags([]); setDamage(undefined); setNivelPreview(1);
}



  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Asedio Carmesí" /></Field>
        <Field label="Clase">
          <Select value={clase} onValueChange={(v) => setClase(v as SkillClass)}>
            <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>{["Activa","Pasiva","Crecimiento"].map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
          </Select>
        </Field>
        <Field label="Nivel"><Input inputMode="numeric" type="number" min={0} value={nivel} onChange={(e) => setNivel(parseInt(e.target.value || "0"))} /></Field>
        <Field label="Nivel Máx"><Input inputMode="numeric" type="number" min={1} value={nivelMax} onChange={(e) => setNivelMax(parseInt(e.target.value || "1"))} /></Field>
        <Field label="Incremento (%, unidad)"><Input value={incremento} onChange={(e) => setIncremento(e.target.value)} placeholder="Ej: +20 ch / 15%" /></Field>
        <Field label="Tier">
          <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
            <SelectTrigger><SelectValue placeholder="Tier" /></SelectTrigger>
            <SelectContent className="max-h-60 overflow-auto">{TIERS.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Definición"><Textarea value={definicion} onChange={(e) => setDefinicion(e.target.value)} placeholder="Breve explicación de la habilidad" className="min-h-[96px]"/></Field>
      <Section title="Tags porcentuales (escala por nivel)">
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
    <Field label="Nivel de preview">
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        value={nivelPreview}
        onChange={(e)=>setNivelPreview(Math.max(1, parseInt(e.target.value||"1")))}
      />
    </Field>
  </div>

  <TagEffectsEditor
  initialTags={tags}        // fuente de verdad en el padre
  onChange={setTags}        // el hijo solo avisa cambios del usuario
  nivelPreview={nivel}
/>
</Section>
<Section title="Daño base (por tramos)">
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <Field label="Modo">
      <Select
        value={damage?.modo ?? "CadaN"}
        onValueChange={(v)=>setDamage(prev=>({ ...(prev ?? { base: 0 }), modo: v as DamageStepMode }))}
      >
        <SelectTrigger><SelectValue/></SelectTrigger>
        <SelectContent>
          <SelectItem value="CadaN">Cada N niveles</SelectItem>
          <SelectItem value="Hitos">Hitos</SelectItem>
        </SelectContent>
      </Select>
    </Field>

    <Field label="Daño base (lvl 1)">
      <Input type="number" inputMode="numeric"
        value={damage?.base ?? 0}
        onChange={(e)=>setDamage(prev=>({ ...(prev ?? { modo: "CadaN" }), base: parseFloat(e.target.value||"0") }))}
      />
    </Field>

    <Field label="Nivel preview">
      <Input type="number" min={1} value={nivelPreview}
        onChange={(e)=>setNivelPreview(Math.max(1, parseInt(e.target.value||"1")))}
      />
    </Field>
  </div>

  { (damage?.modo ?? "CadaN") === "CadaN" ? (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
      <Field label="Cada N niveles">
        <Input type="number" inputMode="numeric"
          value={damage?.cadaN?.n ?? 5}
          onChange={(e)=>setDamage(prev=>({
            ...(prev ?? { base:0, modo:"CadaN" }),
            cadaN: { ...(prev?.cadaN ?? { suma: 0 }), n: Math.max(1, parseInt(e.target.value||"1")) }
          }))}
        />
      </Field>
      <Field label="+ Suma por tramo">
        <Input type="number" inputMode="numeric"
          value={damage?.cadaN?.suma ?? 10}
          onChange={(e)=>setDamage(prev=>({
            ...(prev ?? { base:0, modo:"CadaN" }),
            cadaN: { ...(prev?.cadaN ?? { n: 5 }), suma: parseFloat(e.target.value||"0") }
          }))}
        />
      </Field>
      <Field label="Máx stacks (opcional)">
        <Input type="number" inputMode="numeric"
          value={damage?.cadaN?.maxStacks ?? ""}
          onChange={(e)=>setDamage(prev=>{
            const v = e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value||"0"));
            return { ...(prev ?? { base:0, modo:"CadaN" }), cadaN: { ...(prev?.cadaN ?? { n:5, suma:10 }), maxStacks: v } };
          })}
        />
      </Field>
    </div>
  ) : (
    <div className="space-y-2 mt-2">
      {(damage?.hitos ?? []).map((h,i)=>(
        <div key={i} className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <Label>Nivel</Label>
            <Input type="number" value={h.nivel}
              onChange={(e)=>{
                const nivel = Math.max(1, parseInt(e.target.value||"1"));
                setDamage(prev=>{
                  const hit = (prev?.hitos ?? []).slice(); hit[i] = { ...hit[i], nivel };
                  return { ...(prev ?? { base:0, modo:"Hitos" }), hitos: hit };
                });
              }}/>
          </div>
          <div className="col-span-4">
            <Label>+ Suma</Label>
            <Input type="number" value={h.suma ?? ""}
              onChange={(e)=>{
                const suma = e.target.value === "" ? undefined : parseFloat(e.target.value||"0");
                setDamage(prev=>{
                  const hit = (prev?.hitos ?? []).slice();
                  hit[i] = { ...hit[i], suma, override: h.override && suma!=null ? undefined : h.override };
                  return { ...(prev ?? { base:0, modo:"Hitos" }), hitos: hit };
                });
              }}/>
          </div>
          <div className="col-span-4">
            <Label>Override</Label>
            <Input type="number" value={h.override ?? ""}
              onChange={(e)=>{
                const override = e.target.value === "" ? undefined : parseFloat(e.target.value||"0");
                setDamage(prev=>{
                  const hit = (prev?.hitos ?? []).slice();
                  hit[i] = { ...hit[i], override, suma: h.suma && override!=null ? undefined : h.suma };
                  return { ...(prev ?? { base:0, modo:"Hitos" }), hitos: hit };
                });
              }}/>
          </div>
          <div className="col-span-1">
            <Button type="button" variant="destructive"
              onClick={()=>setDamage(prev=>{
                const hit = (prev?.hitos ?? []).slice(); hit.splice(i,1);
                return { ...(prev ?? { base:0, modo:"Hitos" }), hitos: hit };
              })}>Quitar</Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline"
        onClick={()=>setDamage(prev=>{
          const hitos = (prev?.hitos ?? []).slice();
          hitos.push({ nivel: 5, suma: 10 });
          return { ...(prev ?? { base:0, modo:"Hitos" }), hitos };
        })}>
        Añadir hito
      </Button>
    </div>
  )}

  <div className="mt-3 text-sm">
    <strong>Preview:</strong>{" "}
    {(() => {
      const val = calcSkillDamage(damage, nivelPreview);
      return val != null ? `${val} de daño base @ nivel ${nivelPreview}` : "—";
    })()}
  </div>
</Section>

      <div className="flex justify-end gap-2"><Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar habilidad</Button></div>
    </form>
  );
}

function SkillRow({ s, onEdit, onDelete }: { s: Skill; onEdit: () => void; onDelete: () => void }) {
  const dmgPreview = s.damage ? calcSkillDamage(s.damage, s.nivel) : undefined;
  const tagPreview = (s.tags ?? [])
    .slice(0, 2)
    .map(t => `${t.clave} +${calcSkillTagValue(t, s.nivel)}%`)
    .join(" · ");

  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b">
      <div className="col-span-12 sm:col-span-6">
        <div className="font-medium truncate" title={s.nombre}>{s.nombre}</div>
        <div className="text-xs opacity-70 line-clamp-1">
          {dmgPreview != null ? `Daño base: ${dmgPreview}` : (tagPreview || s.definicion)}
        </div>
      </div>
      <div className="col-span-6 sm:col-span-3 flex gap-2"><Pill>{s.clase}</Pill><Pill>{s.tier}</Pill></div>
      <div className="col-span-3 sm:col-span-2 text-sm">{s.nivel}/{s.nivelMax}</div>
      <div className="col-span-12 sm:col-span-1 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="w-4 h-4"/></Button>
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button>
      </div>
    </div>
  );
}


function EvolutionEditor({ skills, links, onAdd }: { skills: Skill[]; links: EvoLink[]; onAdd: (from: string, to: string) => void }) {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const incomingMap = useMemo(() => {
    const m = new Map<string, number>();
    skills.forEach(s => m.set(s.id, 0));
    links.forEach(l => m.set(l.to, (m.get(l.to) ?? 0) + 1));
    return m;
  }, [skills, links]);

  const roots = useMemo(() => skills.filter(s => (incomingMap.get(s.id) ?? 0) === 0), [skills, incomingMap]);
  const byId = useMemo(() => Object.fromEntries(skills.map(s => [s.id, s])), [skills]);
  const childrenOf = useMemo(() => {
    const m: Record<string, string[]> = {};
    links.forEach(l => { (m[l.from] ||= []).push(l.to); });
    return m;
  }, [links]);

  function Tree({ id, visited = new Set<string>() }: { id: string; visited?: Set<string> }) {
  if (visited.has(id)) {
    // Evita ciclos; muestra un marcador opcional
    return (
      <div className="ml-2 opacity-70 text-xs">↻ Ciclo detectado en {byId[id]?.nombre || id}</div>
    );
  }
  const nextVisited = new Set(visited);
  nextVisited.add(id);
  const kids = childrenOf[id] || [];
  return (
    <div className="ml-2">
      <div className="flex items-center gap-2 text-sm">
        <ChevronRight className="w-4 h-4"/>
        <span className="font-medium truncate">{byId[id]?.nombre}</span>
        <Badge className="rounded-2xl text-[10px]">{byId[id]?.tier}</Badge>
      </div>
      <div className="ml-4 border-l pl-2">
        {kids.map((k) => <Tree key={k} id={k} visited={nextVisited} />)}
      </div>
    </div>
  );
  
}

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="De (skill)">
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger><SelectValue placeholder="Origen" /></SelectTrigger>
            <SelectContent className="max-h-60 overflow-auto">{skills.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="A (evoluciona a)">
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger><SelectValue placeholder="Destino" /></SelectTrigger>
            <SelectContent className="max-h-60 overflow-auto">{skills.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="flex items-end"><Button type="button" onClick={()=> from && to && onAdd(from,to)} className="w-full">Añadir relación</Button></div>
      </div>

      <div className="p-3 rounded-md border">
        {roots.length === 0 && <div className="text-sm opacity-70">No hay árbol aún.</div>}
        {roots.map(r => <Tree key={r.id} id={r.id} />)}
      </div>
    </div>
  );
}

/* ================= Stats Editor & Character Form ================= */
function StatEditor({
  stats, onChange, extraStats, mindPolicy = "auto"
}: {
  stats: Character["stats"];
  onChange: (k: StatKey, patch: Partial<{ valor: number; rango: string }>) => void;
  extraStats: string[];
  mindPolicy?: "auto" | "none" | "manual";
}) {
  const [newStat, setNewStat] = useState("");
  const statKeys = useMemo(() => {
    const base = [...DEFAULT_STATS]; extraStats.forEach(s => base.push(s as any));
    return Array.from(new Set<string>(base as any));
  }, [extraStats]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {statKeys.map((k) => {
          const entry = stats[k] ?? { valor: 0, rango: "Humano Bajo" };
          const isMind = k.toLowerCase() === "mente";
          const intelKey = Object.keys(stats).find((s) => s.toLowerCase() === "inteligencia") ?? "Inteligencia";
          const sabKey = Object.keys(stats).find((s) => ["sabiduría","sabiduria"].includes(s.toLowerCase()) || s.toLowerCase().startsWith("sabid")) ?? "Sabiduría";
          const autoMind = computeMind(stats[intelKey]?.valor ?? 0, stats[sabKey]?.valor ?? 0);
          const valueForInput = isMind ? (mindPolicy === "auto" ? autoMind : (mindPolicy === "none" ? 0 : entry.valor)) : entry.valor;
          const disabledForInput = isMind ? (mindPolicy !== "manual") : false;

          return (
            <Card key={k} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium truncate" title={k}>{k}</div>
                <Badge className="rounded-2xl">{classifyStat(valueForInput).sub}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 items-center">
                <Label>Valor</Label>
                <Input inputMode="numeric" type="number" className="col-span-2" value={valueForInput} disabled={disabledForInput}
                  onChange={(e) => { const v = parseFloat(e.target.value || "0"); onChange(k, { valor: v, rango: classifyStat(v).sub }); }} />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <Label>Nueva estadística</Label>
          <Input value={newStat} onChange={(e) => setNewStat(e.target.value)} placeholder="Ej: Chakra, Haki, Magia" />
        </div>
        <Button type="button" variant="outline" onClick={() => { if (!newStat.trim()) return; onChange(newStat.trim(), { valor: 0, rango: "Humano Bajo" }); setNewStat(""); }} className="gap-2">
          <Plus className="w-4 h-4" />Añadir stat
        </Button>
      </div>
    </div>
  );
}

function CharacterForm({
    initial,
    onSubmit,
    bonuses,
    species,
    extraStats
  }: {
    initial?: Character;
    onSubmit: (c: Character) => void;
    bonuses: Bonus[];
    species: Species[];
    extraStats: string[];         
  }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [especie, setEspecie] = useState(initial?.especie ?? "");
  const [customSpec, setCustomSpec] = useState("");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [nivel, setNivel] = useState<number>(initial?.nivel ?? 1);
  const [stats, setStats] = useState<Character["stats"]>(initial?.stats ?? {});
  const [bonos, setBonos] = useState<Character["bonos"]>(initial?.bonos ?? []);

  useEffect(() => {
  if (!initial) {
    setNombre("");
    setDescripcion("");
    setNivel(1);
    setStats({});
    setBonos([]);
    setEspeciesSel([]);
    return;
  }

  setNombre(initial.nombre ?? "");
  setDescripcion(initial.descripcion ?? "");
  setNivel(initial.nivel ?? 1);
  setStats(initial.stats ?? {});
  setBonos(initial.bonos ?? []);

  // Sincroniza especies: usa array 'especies' (o fallback al campo legacy 'especie')
  const next = (initial.especies && Array.isArray(initial.especies) && initial.especies.length
    ? initial.especies
    : initial.especie
      ? [initial.especie]
      : []
  ).slice(0, 10);

  setEspeciesSel(sortEspeciesAuto(next));
}, [initial]);
	
	const [especiesSel, setEspeciesSel] = useState<string[]>(
		sortEspeciesAuto(
			(initial?.especies && Array.isArray(initial.especies) && initial.especies.length
				? initial.especies
				: initial?.especie
				? [initial.especie]
				: []
			).slice(0, 10)
		)
	);
	const speciesOptions = useMemo(() => (species ?? []).map(sp => ({ id: sp.id, nombre: sp.nombre || sp.id })), [species]);


  function upStat(k: StatKey, patch: Partial<{ valor: number; rango: string }>) {
    setStats((prev) => ({ ...prev, [k]: { valor: patch.valor ?? prev[k]?.valor ?? 0, rango: (patch.rango ?? prev[k]?.rango ?? "Humano Bajo") as string } }));
  }
  function toggleBonus(bonusId: string) {
    setBonos((prev) => {
      const exist = prev.find(b => b.bonusId === bonusId);
      if (exist) return prev.filter(b => b.bonusId !== bonusId);
      const max = bonuses.find(b => b.id === bonusId)?.nivelMax ?? 1;
      return [...prev, { bonusId, nivel: Math.min(1, max) }];
    });
  }
  function setBonusLevel(bonusId: string, lvl: number) {
    setBonos(prev => prev.map(b => b.bonusId === bonusId ? { ...b, nivel: Math.min(Math.max(1, lvl), bonuses.find(x=>x.id===bonusId)?.nivelMax ?? lvl) } : b));
  }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _selectedSpecies = useMemo(() => species.find(s => s.nombre === (customSpec.trim() || especie)), [species, especie, customSpec]);

  function handleSubmit(e: React.FormEvent) {
	e.preventDefault();
    
	
	const uniq = uniqEspecies(especiesSel).slice(0, 10);
	const byId = new Map(species.map(s => [s.id, s]));
	const principal = uniq[0] ?? undefined;
	const restoOrdenado = uniq.slice(1).sort((a, b) => (
		(byId.get(a)?.nombre ?? a).localeCompare(byId.get(b)?.nombre ?? b)
	));
	const ordered = principal ? [principal, ...restoOrdenado] : restoOrdenado;

	const filledStats: Character["stats"] = { ...stats };
  (extraStats ?? []).forEach((k) => {
    if (!filledStats[k]) {
      filledStats[k] = { valor: 0, rango: "Humano Bajo" };
    }
  });

  // 2) Usar filledStats en todo lo que sigue
  const intelKey = "Inteligencia";
  const sabKey = "Sabiduría";
  const intelVal = Number(filledStats[intelKey]?.valor ?? 0);
  const sabVal = Number(filledStats[sabKey]?.valor ?? 0);
	const allAllowMind = ordered.length === 0 ? true : ordered.every(id => !!byId.get(id)?.allowMind);
	const mindVal = allAllowMind ? computeMind(intelVal, sabVal) : 0;
	const finalStats: Character["stats"] = {
		...filledStats,
    
		Mente: { valor: mindVal, rango: classifyStat(mindVal).sub }
	};

	const payload: Character = {
		id: initial?.id ?? uid("char"),
		nombre,
		descripcion,
		nivel,
		stats: finalStats,
		habilidades: initial?.habilidades ?? [],
		bonos,
		especies: ordered,
		especie: principal,
		avatarUrl: initial?.avatarUrl,
	};
  

	onSubmit(payload);
}



  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
<Field label="Especies (máx 10)">
	<SpeciesMultiSelectAccordion
		allSpecies={speciesOptions}
		value={especiesSel}
		onChange={(ids)=>setEspeciesSel(uniqEspecies(ids).slice(0,10))}
		title="Especies (máx 10)"
    
	/>
</Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Nivel del personaje</div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={()=>setNivel(Math.max(1, nivel-1))}><Minus className="w-4 h-4"/></Button>
              <Input inputMode="numeric" type="number" className="w-20" min={1} value={nivel} onChange={(e)=>setNivel(Math.max(1, parseInt(e.target.value || "1")))} />
              <Button type="button" variant="outline" size="icon" onClick={()=>setNivel(nivel+1)}>+</Button>
            </div>
          </div>
        </Card>
      </div>

      <Field label="Descripción"><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="min-h-[96px]"/></Field>

      <Section title="Estadísticas (base)">
        <StatEditor
          stats={stats}
          onChange={upStat}
          extraStats={extraStats}
          mindPolicy={(especiesSel.length === 0 ? 'auto' : (especiesSel.every(id => (species.find(s=>s.id===id)?.allowMind)) ? 'auto' : 'none'))}
        />
      </Section>

      <Section title="Bonificaciones aplicadas">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {bonuses.length === 0 && <div className="text-sm opacity-70">No hay bonificaciones definidas. Ve a la pestaña Bonificaciones.</div>}
          {bonuses.map(b => {
            const has = !!bonos.find(x => x.bonusId === b.id);
            const lvl = bonos.find(x => x.bonusId === b.id)?.nivel ?? 0;
            return (
              <Card key={b.id} className={`p-3 ${has ? "ring-1 ring-gray-300" : ""}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={has} onCheckedChange={() => toggleBonus(b.id)} />
                    <div>
                      <div className="font-medium truncate">{b.nombre}</div>
                      <div className="text-xs opacity-70">
                        {b.objetivos?.length ? "Multi-objetivo" : String(b.objetivo)} · {b.objetivos?.length ? "" : b.modo} (+{(b.objetivos?.[0]?.cantidadPorNivel ?? b.cantidadPorNivel)}/nivel) · Máx {b.nivelMax}
                      </div>
                    </div>
                  </div>
                  {has && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Nivel</Label>
                      <Input inputMode="numeric" type="number" className="w-16 h-8" min={0} max={b.nivelMax} value={lvl} onChange={(e)=>setBonusLevel(b.id, parseInt(e.target.value || "0"))} />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      <div className="flex justify-end gap-2"><Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar personaje</Button></div>
    </form>
  );
}

/* ================= Leaderboard ================= */
function Leaderboard({ characters, bonuses, species }: { characters: Character[]; bonuses: Bonus[]; species: Species[] }) {
  const [stat, setStat] = useState<string>("Fuerza");
  const [topN, setTopN] = useState<number>(10);
  const [useEffective, setUseEffective] = useState(true);

  const rows = useMemo(() => {
    const list = characters.map(c => {
      const base = c.stats?.[stat]?.valor ?? 0;
      const eff = calcEffectiveStat(c, stat as StatKey, bonuses, species);
      const value = useEffective ? eff : base;
      const cls = classifyStat(value);
      const principalId = c.especies?.[0] ?? c.especie;
      const principalName = species.find(s => s.id === principalId)?.nombre ?? "";
      return { id: c.id, nombre: c.nombre, especie: principalName, value, cls: cls.sub };
    }).sort((a,b) => b.value - a.value);
    return list.slice(0, Math.max(1, topN));
  }, [characters, bonuses, species, stat, topN, useEffective]);

  const statOptions = useMemo(() => {
    const set = new Set<string>();
    characters.forEach(c => Object.keys(c.stats || {}).forEach(k => set.add(k)));
    DEFAULT_STATS.forEach(s => set.add(s as any));
    return Array.from(set);
  }, [characters]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Estadística">
          <Select value={stat} onValueChange={setStat}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent className="max-h-60 overflow-auto">
              {statOptions.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Valor mostrado">
          <div className="flex items-center gap-2">
            <Switch checked={useEffective} onCheckedChange={setUseEffective} />
            <span className="text-sm opacity-80">{useEffective ? "Efectivo (con bonos/especie)" : "Base"}</span>
          </div>
        </Field>
        <Field label="Top N">
          <Input inputMode="numeric" type="number" min={1} max={100} value={topN} onChange={(e)=>setTopN(Math.max(1, Math.min(100, parseInt(e.target.value || "10"))))} />
        </Field>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {rows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-12 items-center px-2 py-2 border-b">
              <div className="col-span-1 text-sm">{i+1}</div>
              <div className="col-span-5 truncate" title={r.nombre}>{r.nombre}</div>
              <div className="col-span-3 truncate" title={r.especie}>{r.especie}</div>
              <div className="col-span-3 text-right font-medium flex items-center justify-end gap-2">
                <span>{r.value}</span>
                <Pill>{r.cls}</Pill>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= App ================= */

function CharacterSheetModal({
	open,
	onClose,
	character,
	species,
	bonuses,
  globalEquivalencias = {}
}: {
	open: boolean;
	onClose: () => void;
	character: Character | null;
	species: Species[];
	bonuses: Bonus[];
  globalEquivalencias?: Record<string, any>;
}) {
  if (!open || !character) return null;

  const [showEq, setShowEq] = React.useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("showEqDerived") ?? "true"); } catch { return true; }
  });
  React.useEffect(() => {
    try { localStorage.setItem("showEqDerived", JSON.stringify(showEq)); } catch {}
  }, [showEq]);

	const principalId = character.especies?.[0] ?? character.especie;
	const byId = new Map(species.map(s => [s.id, s]));
	const principalName = principalId ? (byId.get(principalId)?.nombre ?? "") : "";
	const allSpeciesNames = (character.especies?.length ? character.especies : (principalId ? [principalId] : []))
		.map(id => byId.get(id)?.nombre ?? id);

	const statKeys: StatKey[] = Array.from(new Set([
		...Object.keys(character.stats || {}),
		...DEFAULT_STATS as any
	])) as any;

	const effective: Array<{ key: string; value: number }> = statKeys.map(k => ({
		key: k,
		value: calcEffectiveStat(character, k as StatKey, bonuses, species)
	}));
  
  // ===== Mezclar equivalencias (global + especies del personaje) =====

const eqSpeciesList = (character.especies?.length ? character.especies : (principalId ? [principalId] : []))
  .map(id => byId.get(id)?.equivalencias ?? {})
  .filter(Boolean);

const mergedEquivalencias = React.useMemo(
  () => mergeEquivalencias(globalEquivalencias ?? {}, eqSpeciesList ?? []),
  [globalEquivalencias, eqSpeciesList]
);

// Mapa stat -> valor efectivo
const effectiveMap = React.useMemo(
  () => Object.fromEntries(effective.map(e => [e.key, e.value])),
  [effective]
);

// Derivar métricas (categoria, stat, nombre, valor)
const derived = React.useMemo(
  () => deriveMetricsFromEquivalencias(effectiveMap, mergedEquivalencias),
  [effectiveMap, mergedEquivalencias]
);


// ======= Libro: paginación dinámica (1 categoría por página) =======
const eqCats: string[] = React.useMemo(
  () => Array.from(new Set((derived ?? []).map(d => d.categoria))),
  [derived]
);

const TOTAL_PAGES = 1 + eqCats.length + 1;
function pageTitle(idx: number) {
  if (idx === 0) return "Estadísticas";
  if (idx === TOTAL_PAGES - 1) return "Especies y Bonos";
  const cat = eqCats[idx - 1];
  return `Equivalencias · ${cat}`;
}
// recuerda la página actual
const [page, setPage] = React.useState<number>(() => {
  try { return Number(localStorage.getItem("sheetPage") ?? 0) || 0; } catch { return 0; }
});

const goPrev = React.useCallback(() => {
  setPage(p => Math.max(0, p - 1));
}, []);

const goNext = React.useCallback(() => {
  setPage(p => Math.min(TOTAL_PAGES - 1, p + 1));
}, [TOTAL_PAGES]);

React.useEffect(() => {
  setPage(p => Math.min(p, Math.max(0, TOTAL_PAGES - 1)));
}, [TOTAL_PAGES]);

React.useEffect(() => {
  const onKey = (e: any) => {
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "ArrowRight") goNext();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [goPrev, goNext]);

React.useEffect(() => {
  try {
    const saved = Number(localStorage.getItem("sheetPage") ?? 0);
    if (!Number.isNaN(saved)) setPage(saved);
  } catch {}
}, []);

React.useEffect(() => {
  try { localStorage.setItem("sheetPage", String(page)); } catch {}
}, [page]);

React.useEffect(() => {
  try {
    const saved = JSON.parse(localStorage.getItem("showEqDerived") ?? "true");
    setShowEq(!!saved);
  } catch {}
}, []);
React.useEffect(() => {
  try { localStorage.setItem("showEqDerived", JSON.stringify(showEq)); } catch {}
}, [showEq]);

  

  function onExportPDF(ch: Character) {
	try {
		const w = window.open("", "_blank", "width=1024,height=768");
		if (!w) return;

		// Lista de especies
		const allNames = [principalName, ...allSpeciesNames.filter(n => n !== principalName)]
			.filter(Boolean)
			.join(" / ");

		// Construcción de stats como HTML
		let statsHtml = "";
		for (const s of effective) {
			statsHtml += "<div>" + s.key + ": <strong>" + s.value + "</strong></div>";
		}

		// CSS del PDF
		const css = ""
			+ "body { font-family: ui-sans-serif, system-ui, -apple-system; background: #0a1b0a; color: #c4f0c4; }\n"
			+ "h1 { margin: 0; font-size: 22px; }\n"
			+ ".small { opacity: .8; font-size: 12px; }\n"
			+ ".grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }\n"
			+ ".box { border: 1px solid #1f3b1f; border-radius: 10px; padding: 12px; background: #0f2010; }\n"
			+ ".tag { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #173d17; }";

		// HTML del PDF
		const html =
    "<html><head><title>" + ch.nombre + " - Ficha</title>" +
    "<style>" + css + "</style></head><body>" +
    "<h1>" + ch.nombre + " <span class='small'>Nivel " + ch.nivel + "</span></h1>" +
    "<div class='small'>" + allNames + "</div><br/>" +
    "<div class='box'><strong>Estadísticas</strong><div class='grid'>" +
    statsHtml +
    "</div></div>" +
    "</body></html>";

		w.document.open();
		w.document.write(html);
		w.document.close();
		w.focus();
		w.print();
	} catch (e) {
		console.error(e);
	}
}


	return (
		<div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
			<div className="w-full max-w-3xl rounded-2xl border border-emerald-800 bg-[#0b1510] shadow-xl">
				<div className="p-4 border-b border-emerald-900 flex items-center justify-between">
					<div>
						<div className="text-lg font-semibold text-emerald-200">{character.nombre}</div>
						<div className="text-xs text-emerald-400">Nivel {character.nivel} • {principalName}{allSpeciesNames.length>1 ? " +" : ""} {allSpeciesNames.length>1 ? allSpeciesNames.filter(n=>n!==principalName).join(" / ") : ""}</div>
					</div>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => onExportPDF(character)}>Exportar PDF</Button>
						<Button variant="destructive" onClick={onClose}>Cerrar</Button>
					</div>
				</div>
        <div className="p-4">
  {/* Cabecera de la página visible */}
  <div className="flex items-center justify-between mb-2">
    <div className="text-sm text-emerald-400">{pageTitle(page)}</div>
    <div className="text-xs text-emerald-500">{page + 1} / {TOTAL_PAGES}</div>
  </div>

  {/* Lomo / contenido */}
  <div className="rounded-2xl border border-emerald-900 bg-[#0f2016] shadow-inner overflow-hidden">
    <div className="min-h-[60vh] md:min-h-[520px] p-4 md:p-6">

      {/* Página 0: Stats */}
      {page === 0 && (
        <div className="space-y-4">
          <Card className="bg-[#0d1f14] border-emerald-900">
            <CardHeader><CardTitle className="text-emerald-200">Estadísticas</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {effective.map(s => (
                <div key={s.key} className="text-sm flex items-center justify-between border-b border-emerald-900 py-1">
                  <span className="text-emerald-300">{s.key}</span>
                  <span className="font-semibold text-emerald-100">{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Páginas 1..eqCats.length: Equivalencias por categoría */}
      {page > 0 && page < TOTAL_PAGES - 1 && (
        <div className="space-y-4">
          {showEq ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {(derived ?? [])
                .filter(d => d.categoria === eqCats[page - 1])
                .map((d, i) => (
                  <div key={d.categoria + i} className="px-3 py-2 rounded-lg border border-emerald-900 bg-[#0f2016] flex items-center justify-between">
                    <div className="text-sm">
                      <span className="text-emerald-200 font-semibold">{d.stat}</span> → <span className="font-medium">{d.nombre}</span>
                    </div>
                    <div className="text-sm font-medium">
                      {Number.isInteger(d.valor) ? d.valor : Number(d.valor.toFixed(2))}
                    </div>
                  </div>
              ))}
            </div>
          ) : (
            <div className="text-sm opacity-70">Equivalencias ocultas (usa el switch para mostrarlas).</div>
          )}
        </div>
      )}

      {/* Última página: Especies + Bonos */}
      {page === TOTAL_PAGES - 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="bg-[#0d1f14] border-emerald-900">
            <CardHeader><CardTitle className="text-emerald-200">Especies</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-2 text-xs text-emerald-400">Principal</div>
              <div className="tag">{principalName || "—"}</div>
              <div className="mt-3 mb-2 text-xs text-emerald-400">Todas</div>
              <div className="flex flex-wrap gap-2">
                {allSpeciesNames.map((n,i)=>(<span key={i} className="tag">{n}</span>))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0d1f14] border-emerald-900">
            <CardHeader><CardTitle className="text-emerald-200">Bonificaciones Activas</CardTitle></CardHeader>
            <CardContent>
              {(character.bonos ?? []).length === 0 ? (
                <div className="text-sm text-emerald-400">Sin bonificaciones.</div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {character.bonos.map(b => {
                    const bb = bonuses.find(x => x.id === b.bonusId);
                    if (!bb) return null;
                    return (
                      <div key={b.bonusId} className="p-2 rounded-lg border border-emerald-900 bg-[#0f2016]">
                        <div className="text-sm font-medium text-emerald-100">{bb.nombre ?? bb.id}</div>
                        <div className="text-xs text-emerald-400">Nivel {b.nivel}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>

    {/* Pie de libro: navegación */}
    <div className="flex items-center justify-between gap-3 border-t border-emerald-900 bg-[#0c1913] px-4 py-2">
      <Button variant="outline" onClick={goPrev} disabled={page===0}>← Anterior</Button>
      <div className="flex items-center gap-2">
        {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
          <button
            key={i}
            onClick={() => setPage(i)}
            className={"h-2.5 w-2.5 rounded-full " + (i===page ? "bg-emerald-400" : "bg-emerald-900 hover:bg-emerald-700")}
            aria-label={`Ir a página ${i+1}`}
            title={pageTitle(i)}
          />
        ))}
      </div>
      <Button variant="outline" onClick={goNext} disabled={page===TOTAL_PAGES-1}>Siguiente →</Button>
    </div>
  </div>
</div>

				<div className="hidden p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
					<Card className="bg-[#0d1f14] border-emerald-900">
						<CardHeader><CardTitle className="text-emerald-200">Estadísticas</CardTitle></CardHeader>
						<CardContent className="grid grid-cols-2 gap-2">
							{effective.map(s => (
								<div key={s.key} className="text-sm flex items-center justify-between border-b border-emerald-900 py-1">
									<span className="text-emerald-300">{s.key}</span>
									<span className="font-semibold text-emerald-100">{s.value}</span>
								</div>
							))}
						</CardContent>
					</Card>
              {derived.length > 0 && (
  <Section
    title="Equivalencias derivadas"
    actions={
      <div className="flex items-center gap-2 text-sm">
        <Switch checked={showEq} onCheckedChange={setShowEq} />
        <span className="opacity-80">{showEq ? "Visible" : "Oculto"}</span>
      </div>
    }
  >
    {showEq ? (
      <div className="space-y-3">
        {Array.from(new Map(derived.map(d => [d.categoria, true])).keys()).map(cat => {
          const items = derived.filter(d => d.categoria === cat);
          return (
            <div key={cat}>
              <div className="text-sm font-semibold mb-1">{cat}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((d, i) => (
                  <div
                    key={cat + i}
                    className="px-3 py-2 rounded-lg border border-emerald-900 bg-[#0f2016] flex items-center justify-between"
                  >
                    <div className="text-sm">
                      <span className="text-emerald-200 font-semibold">{d.stat}</span> → <span className="font-medium">{d.nombre}</span>
                      <span className="font-medium">{shortEquivName(d.nombre)}</span>
                    </div>
                    <div className="text-sm font-medium">{d.valor}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="text-sm opacity-70">Equivalencias ocultas (usa el switch para mostrarlas).</div>
    )}
  </Section>
)}

					<Card className="bg-[#0d1f14] border-emerald-900">
						<CardHeader><CardTitle className="text-emerald-200">Especies</CardTitle></CardHeader>
						<CardContent>
							<div className="mb-2 text-xs text-emerald-400">Principal</div>
							<div className="tag">{principalName || "—"}</div>
							<div className="mt-3 mb-2 text-xs text-emerald-400">Todas</div>
							<div className="flex flex-wrap gap-2">
								{allSpeciesNames.map((n,i)=>(<span key={i} className="tag">{n}</span>))}
							</div>
						</CardContent>
					</Card>

					<Card className="bg-[#0d1f14] border-emerald-900 md:col-span-2">
						<CardHeader><CardTitle className="text-emerald-200">Bonificaciones Activas</CardTitle></CardHeader>
						<CardContent>
							{(character.bonos ?? []).length === 0 ? (
								<div className="text-sm text-emerald-400">Sin bonificaciones.</div>
							) : (
								<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
									{character.bonos.map(b => {
										const bb = bonuses.find(x => x.id === b.bonusId);
										if (!bb) return null;
										return (
											<div key={b.bonusId} className="p-2 rounded-lg border border-emerald-900 bg-[#0f2016]">
												<div className="text-sm font-medium text-emerald-100">{bb.nombre ?? bb.id}</div>
												<div className="text-xs text-emerald-400">Nivel {b.nivel}</div>
											</div>
										);
									})}
								</div>
							)}
						</CardContent>
					</Card>

				</div>
			</div>
		</div>
	);
}

function GlobalEquivalenciasEditor({
  initial,
  onSaved,
}: {
  initial: GlobalEquivalencias;
  onSaved?: () => Promise<void> | void;
}) {
  const [text, setText] = React.useState<string>(
    JSON.stringify(initial ?? {}, null, 2)
  );

  // Sincroniza cuando cambie lo cargado desde Supabase
  React.useEffect(() => {
    setText(JSON.stringify(initial ?? {}, null, 2));
  }, [initial]);

  async function saveAll() {
    try {
      // Validación de JSON
      let parsed: any = {};
      try {
        parsed = JSON.parse(text || "{}");
        if (typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("El JSON debe ser un objeto (no un array).");
        }
      } catch (e: any) {
        alert("JSON inválido: " + (e?.message || String(e)));
        return;
      }

      // Persistir en app_config(id="global").data.globalEquivalencias (merge-safe)
      await saveConfigGlobalEquivalencias(parsed);

      if (onSaved) await onSaved();
      alert("Equivalencias globales guardadas.");
    } catch (e: any) {
      alert("Error guardando equivalencias globales: " + (e?.message || String(e)));
    }
  }

  return (
    <div className="space-y-3">
      <Section title="Equivalencias globales (JSON)">
        <Textarea
          className="min-h-[260px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end mt-2">
          <Button onClick={saveAll} className="gap-2">
            <Save className="w-4 h-4" /> Guardar
          </Button>
        </div>
        <div className="text-xs opacity-70 mt-1">
          Se guardan en <code>app_config(id="global").data.globalEquivalencias</code>. 
          No sobrescribe otras claves de <code>data</code>.
        </div>
      </Section>
    </div>
  );
}

function GlobalStatsEditor({
  initial,
  onSaved,
}: {
  initial: string[];
  onSaved?: () => Promise<void> | void;
}) {
  const [list, setList] = React.useState<string[]>(() =>
    Array.from(new Set((initial ?? []).map(s => s.trim()).filter(Boolean)))
  );
  const [newStat, setNewStat] = React.useState("");

  React.useEffect(() => {
    // si cambia inicial (loadData), sincroniza
    setList(Array.from(new Set((initial ?? []).map(s => s.trim()).filter(Boolean))));
  }, [initial]);

  function addStat() {
    const v = newStat.trim();
    if (!v) return;
    if (list.some(x => x.toLowerCase() === v.toLowerCase())) {
      setNewStat("");
      return;
    }
    setList(prev => [...prev, v]);
    setNewStat("");
  }

  function removeStat(name: string) {
    setList(prev => prev.filter(x => x !== name));
  }

  async function saveAll() {
    try {
      await saveConfigExtraStats(list); // ya existe en tu archivo
      if (onSaved) await onSaved();
      alert("Estadísticas globales guardadas.");
    } catch (e: any) {
      alert("Error guardando estadísticas globales: " + (e?.message || String(e)));
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Nueva estadística">
          <div className="flex items-center gap-2">
            <Input value={newStat} onChange={(e) => setNewStat(e.target.value)} placeholder="Ej: Chakra, Haki, Magia" />
            <Button type="button" variant="outline" onClick={addStat}>Añadir</Button>
          </div>
        </Field>
      </div>

      <div className="rounded-xl border p-3">
        {list.length === 0 ? (
          <div className="text-sm opacity-70">No hay estadísticas globales aún.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {list.map((s) => (
              <div key={s} className="flex items-center justify-between gap-2 p-2 border rounded-lg">
                <div className="font-medium truncate">{s}</div>
                <Button type="button" variant="destructive" size="sm" onClick={() => removeStat(s)}>Quitar</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={saveAll} className="gap-2"><Save className="w-4 h-4" />Guardar</Button>
      </div>

      <div className="text-xs opacity-70">
        Estas stats se guardan en <code>app_config(id="global").data.extraStats</code> y se
        mostrarán automáticamente en cada personaje (no afectan valores hasta que tú los edites en la ficha).
      </div>
    </div>
  );
}


export default function Page() {
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [tab, setTab] = useState("skills");
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editingBonusId, setEditingBonusId] = useState<string | null>(null);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  

	const [sheetOpen, setSheetOpen] = useState(false);
	const [sheetCharId, setSheetCharId] = useState<string | null>(null);
  const [editingSpeciesId, setEditingSpeciesId] = useState<string | null>(null);
  // === Evolutions: add / remove ===
  // === Load store on mount ===
React.useEffect(() => {
  let cancelled = false;
  (async () => {
    const { data, error } = await supabase
      .from("app_data")
      .select("data")
      .eq("id", "store")
      .single();

    if (cancelled) return;

    if (!error && data?.data) {
      // Merge por si el schema cambió (e.g., nuevos campos)
      setStore(prev => ({ ...EMPTY_STORE, ...data.data }));
    } else {
      // Inicializa una fila para evitar 404 futuros
      await supabase.from("app_data").upsert({ id: "store", data: EMPTY_STORE });
      setStore(EMPTY_STORE);
    }
  })();

  return () => { cancelled = true; };
}, []);

function addEvolution(from: string, to: string) {
  setStore(prev => {
    if (!from || !to || from === to) return prev;

    // Validar existencia de skills
    const skillIds = new Set(prev.skills.map(s => s.id));
    if (!skillIds.has(from) || !skillIds.has(to)) return prev;

    // Evitar duplicados
    if (prev.evoLinks.some(l => l.from === from && l.to === to)) return prev;

    // (Opcional) detectar ciclo rápido: si ya existe camino to -> ... -> from
    // Puedes omitirlo si confías en la advertencia visual del árbol.
    const children: Record<string, string[]> =
      prev.evoLinks.reduce((m, l) => { (m[l.from] ||= []).push(l.to); return m; }, {} as Record<string, string[]>);
    const seen = new Set<string>();
    const stack = [to];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === from) return prev; // abortar: crearía ciclo
      if (seen.has(cur)) continue;
      seen.add(cur);
      (children[cur] || []).forEach(n => stack.push(n));
    }

    return { ...prev, evoLinks: [...prev.evoLinks, { from, to }] };
  });
}

function removeEvolution(from: string, to: string) {
  setStore(prev => ({
    ...prev,
    evoLinks: prev.evoLinks.filter(l => !(l.from === from && l.to === to))
  }));
}

 const loadData = useCallback(async () => {
  try {
    const { data: skills = [] }   = await supabase.from("skills").select("*").throwOnError();
    const { data: characters = [] } = await supabase.from("characters").select("*").throwOnError();
    const { data: bonuses }    = await supabase.from("bonuses").select("*");
    const { data: species }    = await supabase.from("species").select("*").order("nombre", { ascending: true });
    const extraStats           = await loadConfigExtraStats();
    const globalEquivalencias  = await loadConfigGlobalEquivalencias();
    const evoRes = await supabase.from("skill_evo_links").select("*");
    const evoLinks = evoRes.error ? [] : (evoRes.data ?? []);

    setStore({
      skills: (skills ?? []) as any,
      evoLinks: (evoLinks ?? []) as any,
      characters: (characters ?? []).map((c: any) => ({
        ...c,
        especies: Array.isArray(c.especies) ? c.especies.slice(0, 10) : (c.especie ? [c.especie] : []),
      })) as any,
      bonuses: (bonuses ?? []) as any,
      extraStats,
      species: (species ?? []).map((s: any) => ({
        id: s.id,
        nombre: s.nombre,
        descripcion: s.descripcion ?? "",
        equivalencias: (s.equivalencias ?? {}) as Record<string, any>,
        allowMind: !!s.allow_mind,
        baseMods: (s.base_mods ?? []) as any[],
      })),
      globalEquivalencias,
    });
  } catch (err) {
    console.error("loadData() error:", err);
  }
}, []);


  useEffect(() => { loadData(); }, [loadData]);

  // Persistencia mínima (ajústalo a tus tablas reales)
  async function upsertSkill(s: Skill) {
  const rowId = isUUID(s.id) ? s.id : crypto.randomUUID();
  const { error } = await supabase.from("skills").upsert({ ...s, id: rowId });
  if (error) alert("Error guardando habilidad: " + error.message);
  await loadData();
}


async function deleteSkill(skillId: string) {
  setStore(prev => {
    const nextSkills = prev.skills.filter(s => s.id !== skillId);
    const nextLinks  = prev.evoLinks.filter(l => l.from !== skillId && l.to !== skillId);
    return { ...prev, skills: nextSkills, evoLinks: nextLinks };
  });
}
async function saveStore() {
  await supabase.from("app_data").upsert({ id: "store", data: store });
}

async function addEvo(from: string, to: string) {
  await supabase.from("skill_evo_links").insert({ id: crypto.randomUUID(), from, to });
  await loadData();
}

async function upsertBonus(b: Bonus) {
  const rowId = isUUID(b.id) ? b.id : crypto.randomUUID();
  const { error } = await supabase.from("bonuses").upsert({ ...b, id: rowId });
  if (error) alert("Error guardando bonificación: " + error.message);
  await loadData();
}


async function deleteBonus(idToDelete: string) {
  const { error } = await supabase.from("bonuses").delete().eq("id", idToDelete);
  if (error) alert("Error eliminando bonificación: " + error.message);
  setStore(prev => ({ ...prev, bonuses: prev.bonuses.filter(b => b.id !== idToDelete) }));
}

async function upsertCharacter(c: Character) {
  const rowId = isUUID(c.id) ? c.id : crypto.randomUUID();
  const { error } = await supabase.from("characters").upsert({ ...c, id: rowId });
  if (error) alert("Error guardando personaje: " + error.message);
  await loadData();
}

async function deleteCharacter(idToDelete: string) {
  const { error } = await supabase.from("characters").delete().eq("id", idToDelete);
  if (error) alert("Error eliminando personaje: " + error.message);
  setStore(prev => ({ ...prev, characters: prev.characters.filter(c => c.id !== idToDelete) }));
}

async function upsertSpecies(s: Species) {
  const rowId = isUUID(s.id) ? s.id : crypto.randomUUID();
  const { error } = await supabase.from("species").upsert({
    id: rowId,
    nombre: s.nombre,
    descripcion: s.descripcion,
    equivalencias: s.equivalencias,
    allow_mind: s.allowMind,
    base_mods: s.baseMods ?? [],
  });
  if (error) alert("Error guardando especie: " + error.message);
  await loadData();
}


async function deleteSpecies(idToDelete: string) {
  const { error } = await supabase.from("species").delete().eq("id", idToDelete);
  if (error) alert("Error eliminando especie: " + error.message);
  setStore(prev => ({ ...prev, species: prev.species.filter(s => s.id !== idToDelete) }));
}

  const editingChar   = store.characters.find(c => c.id === editingCharId);
  const editingBonus  = store.bonuses.find(b => b.id === editingBonusId);
  const editingSkill  = store.skills.find(s => s.id === editingSkillId);
  const editingSpec   = store.species.find(s => s.id === editingSpeciesId);

  // === AÑADIDO: opciones de estadísticas para SpeciesForm (agrupadas y ordenadas) ===
  const speciesBaseStats = React.useMemo<string[]>(() => {
  // DEFAULT_STATS es readonly; sacamos una copia mutable
  const base = Array.from(DEFAULT_STATS as readonly string[]) as string[];
  // normalizamos a string por si hay literales/tuplas
  for (let i = 0; i < base.length; i++) base[i] = String(base[i]);
  // ahora SÍ podemos ordenar
  base.sort((a, b) => a.localeCompare(b));
  return base;
}, []);

  const speciesExtraStats = React.useMemo<string[]>(() => {
  const extras = (store.extraStats ?? []).map(String)
    .filter(s => !speciesBaseStats.includes(s));
  extras.sort((a, b) => a.localeCompare(b));
  return extras;
}, [store.extraStats, speciesBaseStats]);

const speciesStatOptions = React.useMemo<string[]>(
  () => [...speciesBaseStats, ...speciesExtraStats],
  [speciesBaseStats, speciesExtraStats]
);

  return (
    <div className="max-w-7xl mx-auto p-3 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">Sistema de Personajes</h1>
        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={() => downloadJSON("backup-local.json", store)}>Exportar JSON</Button>
          <label className="inline-flex">
            <input type="file" accept="application/json" className="hidden" onChange={(e)=>{
              const f = e.target.files?.[0]; if (!f) return;
              const reader = new FileReader(); reader.onload = () => {
                try { const data = JSON.parse(String(reader.result || "{}")); setStore({ ...EMPTY_STORE, ...data }); } catch { alert("Archivo inválido"); }
              }; reader.readAsText(f); e.target.value = "";
            }} />
            <Button variant="outline">Importar JSON</Button>
          </label>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap gap-2">
          <TabsTrigger value="skills">Habilidades</TabsTrigger>
          <TabsTrigger value="bonuses">Bonificaciones</TabsTrigger>
          <TabsTrigger value="characters">Personajes</TabsTrigger>
          <TabsTrigger value="species">Especies</TabsTrigger>
          <TabsTrigger value="leaderboard">Rankings</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>
            
        {/* HABILIDADES */}
        <TabsContent value="skills" className="mt-4 space-y-3">
          <Section title={editingSkill ? "Editar habilidad" : "Nueva habilidad"} actions={editingSkill && <Button variant="outline" onClick={()=>setEditingSkillId(null)}>Cancelar</Button>}>
            <SkillForm
  key={editingSkill?.id ?? "new"}
  initial={editingSkill ?? undefined}
  onSubmit={(s)=>{ setEditingSkillId(null); upsertSkill(s); }}
/>
          </Section>
          <Section title="Árbol de evolución">
            <EvolutionEditor
              skills={store.skills}
              links={store.evoLinks}
              onAdd={addEvolution}
            />
          </Section>
          <Section title={`Listado de habilidades (${store.skills.length})`}>
            <div className="divide-y">
              {store.skills.map(s => <SkillRow key={s.id} s={s} onEdit={()=>setEditingSkillId(s.id)} onDelete={()=>deleteSkill(s.id)} />)}
            </div>
          </Section>
        </TabsContent>

        {/* BONIFICACIONES */}
  <TabsContent value="bonuses" className="mt-4 space-y-3">
    <Section
  title={editingBonus ? "Editar bonificación" : "Nueva bonificación"}
  actions={editingBonus && (
    <Button variant="outline" onClick={() => setEditingBonusId(null)}>
      Cancelar
    </Button>
  )}
>
  <></>
</Section>

    {/* NUEVO: Formulario Multi-objetivo (hasta 5 consecuencias) */}
    {/* inserted form duplicate below */}
{/* BEGIN: temporarily commenting duplicated species form pasted under bonuses */}
{/*
<form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={nombre} onChange={(e)=>setNombre(e.target.value)} placeholder="Ej: Dragón, Uzumaki, Humano"/></Field>
        <Field label="Puede usar Mente">
          <div className="flex items-center gap-2">
            <Switch checked={allowMind} onCheckedChange={setAllowMind}/>
            <span className="text-sm opacity-80">{allowMind ? "Sí" : "No"}</span>
          </div>
        </Field>
      </div>
      <Field label="Descripción"><Textarea value={descripcion} onChange={(e)=>setDescripcion(e.target.value)} className="min-h-[80px]"/></Field>

      <Section title="Modificadores base por especie">
        <div className="space-y-2">
          {mods.map((m, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                <Label>Stat</Label>
                <Select value={String(m.stat)} onValueChange={(v)=>updateMod(i, { stat: v })}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-auto">
  {Boolean(statOptionsBase?.length) && (
    <SelectGroup>
      <SelectLabel>Estadísticas base</SelectLabel>
      {(statOptionsBase ?? []).map((s) => (
        <SelectItem key={`base-${s}`} value={s}>
          {s}
        </SelectItem>
      ))}
    </SelectGroup>
  )}
  {Boolean(statOptionsExtra?.length) && (
    <SelectGroup>
      <SelectLabel>Estadísticas personalizadas</SelectLabel>
      {(statOptionsExtra ?? []).map((s) => (
        <SelectItem key={`extra-${s}`} value={s}>
          {s}
        </SelectItem>
      ))}
    </SelectGroup>
  )}
</SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Label>Modo</Label>
                <Select value={m.modo} onValueChange={(v)=>updateMod(i, { modo: v as any })}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Puntos">Puntos</SelectItem>
                    <SelectItem value="Porcentaje">Porcentaje</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Label>Cantidad</Label>
                <Input inputMode="numeric" type="number" value={m.cantidad} onChange={(e)=>updateMod(i, { cantidad: parseFloat(e.target.value || "0") })}/>
              </div>
              <div className="col-span-2">
                <Button type="button" variant="destructive" onClick={()=>removeMod(i)} className="w-full"><Trash2 className="w-4 h-4"/></Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addMod} className="gap-2"><Plus className="w-4 h-4"/>Añadir modificador</Button>
        </div>
      </Section>

      <Field label="Equivalencias (JSON)">
        <Textarea value={equivText} onChange={(e)=>setEquivText(e.target.value)} className="min-h-[140px]" />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar especie</Button>
      </div>
    </form>
*/}
{/* END: temporarily commenting duplicated species form pasted under bonuses */}
{/* ...tu formulario aquí... */}
{/* moved: premature </TabsContent> for bonuses */}

<form
  onSubmit={(e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const nombre = String(fd.get("nombre_multi") ?? "");
    const descripcion = String(fd.get("descripcion_multi") ?? "");
    const nivelMax = Math.max(1, parseInt(String(fd.get("nivelMax_multi") ?? "5")));
    const nivelPreview = Math.max(1, parseInt(String(fd.get("nivelPreview_multi") ?? "1")));

    const total = parseInt(String(fd.get("count_rows") ?? "0"));
    const objetivos = Array.from({ length: total })
  .map((_, i) => ({
    stat: String(fd.get(`multi_stat_${i}`) ?? "Fuerza"),
    modo: String(fd.get(`multi_modo_${i}`) ?? "Puntos") as BonusMode,
    cantidadPorNivel: Math.max(0, parseFloat(String(fd.get(`multi_cantidad_${i}`) ?? "0"))),
  }))

  .filter((t) => t.cantidadPorNivel > 0)
  .slice(0, 5);


    if (!nombre.trim()) return alert("Ponle un nombre a la bonificación.");
    if (objetivos.length === 0) return alert("Añade al menos 1 objetivo.");
    if (new Set(objetivos.map((o) => o.stat)).size !== objetivos.length) {
      return alert("No repitas la misma estadística dentro de la misma bonificación.");
    }

    const out: Bonus = {
      id: editingBonus?.id ?? uid("bonus"),
      nombre,
      descripcion,
      nivelMax,
      objetivos, // multi objetivo
    };

    setEditingBonusId(null);
    upsertBonus(out);
  }}
  className="space-y-3"
>
  {/* CONFIG → Estadísticas globales */}
{/* MOVED: config tab (was nested under bonuses)
<TabsContent value="config" className="mt-4 space-y-3">
  <Section title="Estadísticas globales (para todos los personajes)">
    <GlobalStatsEditor
      initial={store.extraStats}
      onSaved={async () => { await loadData(); }}
    />
  </Section>
</TabsContent>
END MOVED */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <Field label="Nombre"><Input name="nombre_multi" defaultValue={editingBonus?.objetivos?.length ? editingBonus?.nombre ?? "" : ""} /></Field>
    <Field label="Nivel Máx"><Input name="nivelMax_multi" type="number" min={1} defaultValue={editingBonus?.objetivos?.length ? (editingBonus?.nivelMax ?? 5) : 5} /></Field>
    <Field label="Descripción"><Input name="descripcion_multi" defaultValue={editingBonus?.objetivos?.length ? editingBonus?.descripcion ?? "" : ""} /></Field>
  </div>

        {/* Editor dinámico (máx 5 filas) */}
          <MultiTargetsEditor
         namePrefix="multi_"
         initialTargets={(editingBonus?.objetivos ?? []) as any}
         statsOptions={Array.from(new Set([...DEFAULT_STATS as any]))}
/>



                {/* Preview simple por nivel (cliente) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <Field label="Nivel para preview">
             <Input name="nivelPreview_multi" type="number" min={1} defaultValue={1} />
        </Field>
          <div className="md:col-span-3 text-xs opacity-75">
           Consejo: el preview muestra cuánto sumaría cada objetivo a ese nivel (no se guarda).
          </div>
          </div>
          <div className="flex justify-end mt-3">
  <Button type="submit" className="gap-2">
    <Save className="w-4 h-4" /> Guardar bonificación (multi)
  </Button>
</div>
          </form>

          <Section title={`Listado de bonificaciones (${store.bonuses.length})`}>
            <div className="divide-y">
              {store.bonuses.map(b => (
                <div key={b.id} className="grid grid-cols-12 items-center gap-2 py-2">
                  <div className="col-span-12 sm:col-span-7">
                    <div className="font-medium truncate">{b.nombre}</div>
                    <div className="text-xs opacity-70 line-clamp-1">{b.descripcion}</div>
                  </div>
                  <div className="col-span-6 sm:col-span-3 text-xs flex flex-wrap gap-2">
                    {b.objetivos?.length ? <Pill>Multi</Pill> : <Pill>{String(b.objetivo)}</Pill>}
                    <Pill>Máx {b.nivelMax}</Pill>
                  </div>
                  <div className="col-span-6 sm:col-span-2 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={()=>setEditingBonusId(b.id)}><Settings2 className="w-4 h-4"/></Button>
                    <Button variant="destructive" size="sm" onClick={()=>deleteBonus(b.id)}><Trash2 className="w-4 h-4"/></Button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </TabsContent>

        {/* PERSONAJES */}
        <TabsContent value="characters" className="mt-4 space-y-3">
          <Section title={editingChar ? "Editar personaje" : "Nuevo personaje"} actions={editingChar && <Button variant="outline" onClick={()=>setEditingCharId(null)}>Cancelar</Button>}>
           <CharacterForm
              initial={editingChar ?? undefined}
              onSubmit={(updatedCharacter) => {
                  setEditingCharId(null);
                  upsertCharacter(updatedCharacter);     
              }}
              bonuses={store.bonuses}
              species={store.species}
              extraStats={store.extraStats}   
            />
          </Section>
          <Section title={`Listado de personajes (${store.characters.length})`}>
            <div className="divide-y">
              {store.characters.map(c => (
                <div key={c.id} className="grid grid-cols-12 items-center gap-2 py-2">
                  <div className="col-span-12 sm:col-span-6">
                    <div className="font-medium truncate">{c.nombre}</div>
                    <div className="text-xs opacity-70">{c.especie} · Nivel {c.nivel}</div>
                  </div>
                  <div className="col-span-6 sm:col-span-4 text-xs sm:text-sm">
                    <Pill>{c.stats?.Fuerza?.valor ?? 0} FZ</Pill>
                  </div>
                  <div className="col-span-6 sm:col-span-2 flex justify-end gap-2">
                    <Button size="sm" onClick={()=>{ setSheetCharId(c.id); setSheetOpen(true); }}>Ver Ficha</Button>
                    <Button size="sm" variant="outline" onClick={()=>setEditingCharId(c.id)}>Editar</Button>
                    <Button size="sm" variant="destructive" onClick={()=>deleteCharacter(c.id)}><Trash2 className="w-4 h-4"/></Button>
                  </div>
                </div>
              ))};
            </div>
          </Section>
        </TabsContent>

        {/* ESPECIES */}
        <TabsContent value="species" className="mt-4 space-y-3">
          <Section title={editingSpec ? "Editar especie" : "Nueva especie"} actions={editingSpec && <Button variant="outline" onClick={()=>setEditingSpeciesId(null)}>Cancelar</Button>}>
            <SpeciesForm initial={editingSpec ?? undefined} onSubmit={(s)=>{ setEditingSpeciesId(null); upsertSpecies(s); }} statOptions={speciesStatOptions} statOptionsBase={speciesBaseStats} statOptionsExtra={speciesExtraStats} />
          </Section>
          <Section title={`Listado de especies (${store.species.length})`}>
            <div className="divide-y">
              {store.species.map(sp => (
                <div key={sp.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{sp.nombre}</div>
                    <div className="text-xs opacity-70 truncate">{sp.allowMind ? "Mente: Sí" : "Mente: No"} · Mods: {sp.baseMods?.length ?? 0}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={()=>setEditingSpeciesId(sp.id)}>Editar</Button>
                    <Button size="sm" variant="destructive" onClick={()=>deleteSpecies(sp.id)}><Trash2 className="w-4 h-4"/></Button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </TabsContent>

        {/* RANKINGS */}
        <TabsContent value="leaderboard" className="mt-4 space-y-3">
          <Section title="Ranking por estadística">
            <Leaderboard characters={store.characters} bonuses={store.bonuses} species={store.species} />
          </Section>
        </TabsContent>
      
        <TabsContent value="config" className="mt-4 space-y-3">
  {/* CONFIG → Estadísticas globales */}
  <Section title="Estadísticas globales (para todos los personajes)">
    <GlobalStatsEditor
      initial={store.extraStats}
      onSaved={async () => { await loadData(); }}
    />
  </Section>

  {/* CONFIG → Equivalencias globales */}
  <Section title="Equivalencias globales (para todas las especies)">
    <GlobalEquivalenciasEditor
      initial={store.globalEquivalencias ?? {}}
      onSaved={async () => { await loadData(); }}
    />
  </Section>
</TabsContent>


      <CharacterSheetModal
        open={sheetOpen}
        onClose={()=>{ setSheetOpen(false); setSheetCharId(null); }}
        // AQUÍ se pasa el objeto del personaje a editar.
        character={store.characters.find(ch => ch.id === sheetCharId) ?? null}
        species={store.species}
        bonuses={store.bonuses}
        globalEquivalencias={store.globalEquivalencias ?? GLOBAL_EQUIVALENCIAS}
    />
</Tabs>
    </div>
  );
}