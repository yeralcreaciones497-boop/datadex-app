"use client";

/**
 * Página principal de gestión del sistema (habilidades, bonificaciones, personajes y especies).
 * Estilo B: CÓDIGO CON COMENTARIOS EXPLICATIVOS.
 * 
 * Cambios clave en esta actualización:
 * - Se restituye y mejora el apartado "Especies" con CRUD completo.
 * - Cada especie ahora soporta:
 *    • allowMind (si puede usar Mente)
 *    • baseMods (bonos por especie en Puntos o Porcentaje)
 *    • equivalencias (json editable) 
 * - En Personajes:
 *    • Selector de especie + campo "custom" opcional.
 *    • Mente se calcula automáticamente con √(INT×SAB) solo si la especie lo permite; si no, se fija en 0.
 *    • Al guardar el personaje, se aplican los baseMods de la especie (suma de % y/o puntos).
 * - Se mantiene compatibilidad con tus tablas Supabase:
 *    • species(id, nombre, descripcion, equivalencias jsonb, allow_mind boolean, base_mods jsonb)
 *    • extra_stats(name)
 *    • bonuses(...)
 *    • skills(...)
 *    • characters(...)
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// UI (shadcn/ui)
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// Iconos
import { Plus, Save, Trash2, Settings2, ChevronRight, Minus, Link2 } from "lucide-react";

/* ---------------------------------------------
 * Tipos y constantes de dominio
 * -------------------------------------------*/

type SkillClass = "Activa" | "Pasiva" | "Crecimiento";

type Tier =
  | "F" | "E" | "D" | "C"
  | "B-" | "B" | "B+"
  | "A-" | "A" | "A+"
  | "S-" | "S" | "S+"
  | "SS-" | "SS" | "SS+"
  | "SSS-" | "SSS" | "SSS+";

const TIERS: Tier[] = [
  "F","E","D","C",
  "B-","B","B+",
  "A-","A","A+",
  "S-","S","S+",
  "SS-","SS","SS+",
  "SSS-","SSS","SSS+",
];

const BASE_RANKS = [
  "Humano","Genin","Chunnin","Jounin","Kage","Bijuu","Catástrofe","Deidad"
] as const;

// Tabla de clasificación (valor numérico → rango)
const STAT_CLASS_TABLE: { base: typeof BASE_RANKS[number]; sub: string; min: number; max: number | null }[] = [
  // Humano
  { base: "Humano", sub: "Humano Bajo", min: 1, max: 4 },
  { base: "Humano", sub: "Humano Medio", min: 5, max: 9 },
  { base: "Humano", sub: "Humano Alto", min: 10, max: 14 },
  { base: "Humano", sub: "Humano Élite", min: 15, max: 19 },
  // Genin
  { base: "Genin", sub: "Genin Bajo", min: 20, max: 24 },
  { base: "Genin", sub: "Genin Medio", min: 25, max: 29 },
  { base: "Genin", sub: "Genin Alto", min: 30, max: 34 },
  { base: "Genin", sub: "Genin Élite", min: 35, max: 39 },
  // Chunnin
  { base: "Chunnin", sub: "Chunnin Bajo", min: 40, max: 54 },
  { base: "Chunnin", sub: "Chunnin Medio", min: 55, max: 69 },
  { base: "Chunnin", sub: "Chunnin Alto", min: 70, max: 79 },
  { base: "Chunnin", sub: "Chunnin Élite", min: 80, max: 89 },
  // Jounin
  { base: "Jounin", sub: "Jounin Bajo", min: 90, max: 119 },
  { base: "Jounin", sub: "Jounin Medio", min: 120, max: 149 },
  { base: "Jounin", sub: "Jounin Alto", min: 150, max: 179 },
  { base: "Jounin", sub: "Jounin Élite", min: 180, max: 209 },
  // Kage
  { base: "Kage", sub: "Kage Bajo", min: 210, max: 279 },
  { base: "Kage", sub: "Kage Medio", min: 280, max: 349 },
  { base: "Kage", sub: "Kage Alto", min: 350, max: 424 },
  { base: "Kage", sub: "Kage Élite", min: 425, max: 499 },
  // Bijuu
  { base: "Bijuu", sub: "Bijuu Bajo", min: 500, max: 999 },
  { base: "Bijuu", sub: "Bijuu Medio", min: 1000, max: 1499 },
  { base: "Bijuu", sub: "Bijuu Alto", min: 1500, max: 1999 },
  { base: "Bijuu", sub: "Bijuu Élite", min: 2000, max: 2499 },
  // Catástrofe
  { base: "Catástrofe", sub: "Catástrofe Bajo", min: 2500, max: 2999 },
  { base: "Catástrofe", sub: "Catástrofe Medio", min: 3000, max: 3499 },
  { base: "Catástrofe", sub: "Catástrofe Alto", min: 3500, max: 3999 },
  { base: "Catástrofe", sub: "Catástrofe Élite", min: 4000, max: 5000 },
  // Deidad
  { base: "Deidad", sub: "Deidad Baja", min: 5000, max: 7499 },
  { base: "Deidad", sub: "Deidad Media", min: 7500, max: 9999 },
  { base: "Deidad", sub: "Deidad Alta", min: 10000, max: 14999 },
  { base: "Deidad", sub: "Deidad Élite", min: 15000, max: null },
];

function classifyStat(value: number): { base: typeof BASE_RANKS[number]; sub: string } {
  const v = Math.floor(Number.isFinite(value) ? value : 0);
  if (v <= 0) return { base: "Humano", sub: "Humano Bajo" };
  const hit = STAT_CLASS_TABLE.find(row => (v >= row.min) && (row.max === null || v <= row.max));
  return hit ? { base: hit.base, sub: hit.sub } : { base: "Deidad", sub: "Deidad Élite" };
}

// Mente = √(Inteligencia × Sabiduría)
function computeMind(intel: number, sab: number): number {
  const i = Math.max(0, intel || 0);
  const s = Math.max(0, sab || 0);
  return Math.round(Math.sqrt(i * s));
}

const DEFAULT_STATS = [
  "Fuerza","Resistencia","Destreza","Mente","Vitalidad","Inteligencia","Sabiduría"
] as const;

type StatKey = typeof DEFAULT_STATS[number] | string;
type BonusMode = "Porcentaje" | "Puntos";

type Equivalencia = { unidad: string; valorPorPunto: number };

type SpeciesBaseMod = { stat: StatKey; modo: "Puntos" | "Porcentaje"; cantidad: number };

type Species = {
  id: string;
  nombre: string;
  descripcion: string;
  equivalencias: Record<string, Equivalencia>;
  allowMind: boolean;
  baseMods?: SpeciesBaseMod[];
};

type BonusTarget = { stat: StatKey; modo: BonusMode; cantidadPorNivel: number };

type Bonus = {
  id: string;
  nombre: string;
  descripcion: string;
  objetivos?: BonusTarget[]; // Soporte multi-objetivo (opcional)
  objetivo?: StatKey;        // Compat. legacy
  modo?: BonusMode;          // Compat. legacy
  cantidadPorNivel?: number; // Compat. legacy
  nivelMax: number;
};

export type Character = {
  id: string;
  nombre: string;
  especie: string;
  descripcion: string;
  nivel: number;
  stats: Record<StatKey, { valor: number; rango: string }>;
  habilidades: { skillId: string; nivel: number }[];
  bonos: { bonusId: string; nivel: number }[];
};

export type Skill = {
  id: string;
  nombre: string;
  nivel: number;
  nivelMax: number;
  incremento: string;
  clase: SkillClass;
  tier: Tier;
  definicion: string;
  personajes: string[];
};

type EvoLink = { from: string; to: string };

type Store = {
  skills: Skill[];
  characters: Character[];
  evoLinks: EvoLink[];
  bonuses: Bonus[];
  extraStats: string[];
  species: Species[];
};

const EMPTY_STORE: Store = {
  skills: [],
  characters: [],
  evoLinks: [],
  bonuses: [],
  extraStats: [],
  species: [],
};

/* ---------------------------------------------
 * Utilidades comunes
 * -------------------------------------------*/

function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function downloadJSON(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function isUUID(v?: string): boolean {
  return !!v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v);
}

// Suma bonificaciones por personaje → stat
function calcEffectiveStat(c: Character, key: StatKey, bonuses: Bonus[]): number {
  const base = c.stats[key]?.valor ?? 0;
  if (!c.bonos?.length) return base;

  let flat = 0; let perc = 0;
  for (const assign of c.bonos) {
    const b = bonuses.find(x => x.id === assign.bonusId);
    if (!b) continue; 
    const lvl = Math.max(0, Math.min(assign.nivel ?? 0, b.nivelMax));

    if (b.objetivos?.length) {
      for (const target of b.objetivos) {
        if (target.stat !== key) continue;
        if (target.modo === "Puntos") flat += (target.cantidadPorNivel ?? 0) * lvl;
        else if (target.modo === "Porcentaje") perc += ((target.cantidadPorNivel ?? 0) / 100) * lvl;
      }
    } else {
      if (b.objetivo !== key) continue;
      if (b.modo === "Puntos") flat += (b.cantidadPorNivel ?? 0) * lvl;
      else if (b.modo === "Porcentaje") perc += ((b.cantidadPorNivel ?? 0) / 100) * lvl;
    }
  }
  return Math.max(0, Math.round((base * (1 + perc) + flat) * 100) / 100);
}

/* ---------------------------------------------
 * Componentes UI básicos
 * -------------------------------------------*/

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode; }) {
  return (
    <Card className="border border-gray-200">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg md:text-xl">{title}</CardTitle>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
      <Label className="text-sm font-medium opacity-80">{label}</Label>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <Badge className="rounded-2xl px-2 py-1 text-[11px] md:text-xs whitespace-nowrap">{children}</Badge>;
}

/* ---------------------------------------------
 * Habilidades
 * -------------------------------------------*/

function SkillForm({ onSubmit, initial, characters }: { onSubmit: (s: Skill) => void; initial?: Skill; characters: Character[]; }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [nivel, setNivel] = useState<number>(initial?.nivel ?? 1);
  const [nivelMax, setNivelMax] = useState<number>(initial?.nivelMax ?? 10);
  const [incremento, setIncremento] = useState(initial?.incremento ?? "");
  const [clase, setClase] = useState<SkillClass>(initial?.clase ?? "Activa");
  const [tier, setTier] = useState<Tier>(initial?.tier ?? "F");
  const [definicion, setDefinicion] = useState(initial?.definicion ?? "");
  const [personajes, setPersonajes] = useState<string[]>(initial?.personajes ?? []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base: Skill = { id: initial?.id ?? uid("skill"), nombre, nivel, nivelMax, incremento, clase, tier, definicion, personajes };
    onSubmit(base);
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
      <Field label="Personajes que la tienen">
        <div className="flex flex-wrap gap-2">
          {characters.map((ch) => {
            const checked = personajes.includes(ch.id);
            return (
              <Button key={ch.id} type="button" variant={checked ? "default" : "outline"} className="rounded-2xl px-3 py-1 text-xs" onClick={() => setPersonajes((prev) => checked ? prev.filter(id => id !== ch.id) : [...prev, ch.id])}>
                {ch.nombre}
              </Button>
            );
          })}
        </div>
      </Field>
      <div className="flex justify-end gap-2"><Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar habilidad</Button></div>
    </form>
  );
}

function SkillRow({ s, onEdit, onDelete }: { s: Skill; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b">
      <div className="col-span-12 sm:col-span-5">
        <div className="font-medium truncate" title={s.nombre}>{s.nombre}</div>
        <div className="text-xs opacity-70 line-clamp-1">{s.definicion}</div>
      </div>
      <div className="col-span-6 sm:col-span-2 flex gap-2 mt-1 sm:mt-0"><Pill>{s.clase}</Pill><Pill>{s.tier}</Pill></div>
      <div className="col-span-3 sm:col-span-2 text-sm">{s.nivel}/{s.nivelMax}</div>
      <div className="col-span-3 sm:col-span-1 text-xs sm:text-sm truncate" title={s.incremento}>{s.incremento}</div>
      <div className="col-span-12 sm:col-span-2 flex justify-end gap-2 mt-2 sm:mt-0">
        <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="w-4 h-4"/></Button>
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------
 * Bonificaciones
 * -------------------------------------------*/

function BonusForm({ initial, onSubmit, statOptions }: { initial?: Bonus; onSubmit: (b: Bonus) => void; statOptions: string[] }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [objetivo, setObjetivo] = useState<StatKey>(initial?.objetivo ?? (statOptions[0] as StatKey));
  const [modo, setModo] = useState<BonusMode>(initial?.modo ?? "Puntos");
  const [cantidadPorNivel, setCantidadPorNivel] = useState<number>(initial?.cantidadPorNivel ?? 1);
  const [nivelMax, setNivelMax] = useState<number>(initial?.nivelMax ?? 5);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const out: Bonus = { id: initial?.id ?? uid("bonus"), nombre, descripcion, objetivo, modo, cantidadPorNivel, nivelMax };
    onSubmit(out);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={nombre} onChange={(e)=>setNombre(e.target.value)} placeholder="Ej: Entrenamiento de Fuerza"/></Field>
        <Field label="Objetivo">
          <Select value={String(objetivo)} onValueChange={(v)=>setObjetivo(v)}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent className="max-h-60 overflow-auto">{statOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Modo">
          <Select value={modo} onValueChange={(v)=>setModo(v as BonusMode)}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="Puntos">Puntos</SelectItem>
              <SelectItem value="Porcentaje">Porcentaje</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cant. por nivel"><Input inputMode="numeric" type="number" value={cantidadPorNivel} onChange={(e)=>setCantidadPorNivel(parseFloat(e.target.value || "0"))} /></Field>
        <Field label="Nivel Máx"><Input inputMode="numeric" type="number" min={1} value={nivelMax} onChange={(e)=>setNivelMax(parseInt(e.target.value || "1"))} /></Field>
      </div>
      <Field label="Descripción"><Textarea value={descripcion} onChange={(e)=>setDescripcion(e.target.value)} placeholder="Describe el efecto por nivel" className="min-h-[96px]"/></Field>
      <div className="flex justify-end"><Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar bonificación</Button></div>
    </form>
  );
}

function BonusRow({ b, onEdit, onDelete }: { b: Bonus; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b">
      <div className="col-span-12 sm:col-span-5">
        <div className="font-medium truncate">{b.nombre}</div>
        <div className="text-xs opacity-70 line-clamp-1">{b.descripcion}</div>
      </div>
      <div className="col-span-6 sm:col-span-3 text-xs flex flex-wrap gap-2">
        <Pill>{String(b.objetivo)}</Pill>
        <Pill>{b.modo} / nivel: {b.cantidadPorNivel}</Pill>
      </div>
      <div className="col-span-3 sm:col-span-2 text-sm">Máx: {b.nivelMax}</div>
      <div className="col-span-12 sm:col-span-2 flex justify-end gap-2 mt-2 sm:mt-0">
        <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="w-4 h-4"/></Button>
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------
 * Editor de estadísticas (con política de Mente)
 * -------------------------------------------*/

function StatEditor({
  stats, onChange, extraStats, onAddStat, mindPolicy = "auto"
}: {
  stats: Character["stats"];
  onChange: (k: StatKey, patch: Partial<{ valor: number; rango: string }>) => void;
  extraStats: string[];
  onAddStat?: (name: string) => void;
  mindPolicy?: "auto" | "none" | "manual";
}) {
  const [newStat, setNewStat] = useState("");

  // Lista completa de stats (base + extra) sin duplicados
  const statKeys = useMemo(() => {
    const base = [...DEFAULT_STATS];
    extraStats.forEach(s => base.push(s as any));
    return Array.from(new Set<string>(base as any));
  }, [extraStats]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {statKeys.map((k) => {
          const entry = stats[k] ?? { valor: 0, rango: "Humano Bajo" };
          const cls = classifyStat(entry.valor);

          // Cálculo automático de Mente (si aplica)
          const isMind = k.toLowerCase() === "mente";
          const intelKey = Object.keys(stats).find((s) => s.toLowerCase() === "inteligencia") ?? "Inteligencia";
          const sabKey = Object.keys(stats).find((s) => ["sabiduría","sabiduria"].includes(s.toLowerCase()) || s.toLowerCase().startsWith("sabid")) ?? "Sabiduría";
          const intelVal = stats[intelKey]?.valor ?? 0;
          const sabVal   = stats[sabKey]?.valor ?? 0;
          const autoMind = computeMind(intelVal, sabVal);

          const valueForInput = isMind
            ? (mindPolicy === "auto" ? autoMind : (mindPolicy === "none" ? 0 : entry.valor))
            : entry.valor;
          const disabledForInput = isMind ? (mindPolicy !== "manual") : false;

          return (
            <Card key={k} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium truncate" title={k}>{k}</div>
                <div className="flex gap-2">
                  <Badge className="rounded-2xl" title="Base">{cls.base}</Badge>
                  <Badge className="rounded-2xl" title="Rango real">{cls.sub}</Badge>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 items-center">
                <Label>Valor</Label>
                <Input
                  inputMode="numeric"
                  type="number"
                  className="col-span-2"
                  value={valueForInput}
                  disabled={disabledForInput}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value || "0");
                    const derived = classifyStat(v);
                    onChange(k, { valor: v, rango: derived.sub });
                  }}
                />
                {isMind && mindPolicy === "auto" && (
                  <div className="col-span-3 text-[11px] opacity-70">
                    Mente se calcula automáticamente con Inteligencia y Sabiduría.
                  </div>
                )}
                {isMind && mindPolicy === "none" && (
                  <div className="col-span-3 text-[11px] opacity-70">
                    Esta especie no puede usar Mente.
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <Label>Nueva estadística</Label>
          <Input
            value={newStat}
            onChange={(e) => setNewStat(e.target.value)}
            placeholder="Ej: Chakra, Haki, Magia"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!newStat.trim()) return;
            onAddStat?.(newStat.trim());
            setNewStat("");
          }}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />Añadir stat
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------
 * Formulario de Personajes
 * -------------------------------------------*/

function CharacterForm({
  initial, onSubmit, skills, bonuses, extraStats, species
}: {
  initial?: Character;
  onSubmit: (c: Character) => void;
  skills: Skill[];
  bonuses: Bonus[];
  extraStats: string[];
  species: Species[];
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [especie, setEspecie] = useState(initial?.especie ?? "");
  const [customSpec, setCustomSpec] = useState("");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [nivel, setNivel] = useState<number>(initial?.nivel ?? 1);
  const [stats, setStats] = useState<Character["stats"]>(initial?.stats ?? {});
  const [habilidades, setHabilidades] = useState<Character["habilidades"]>(initial?.habilidades ?? []);
  const [bonos, setBonos] = useState<Character["bonos"]>(initial?.bonos ?? []);

  const selectedSpecies = useMemo(() => species.find(s => s.nombre === (customSpec.trim() || especie)), [species, especie, customSpec]);

  function upStat(k: StatKey, patch: Partial<{ valor: number; rango: string }>) {
    setStats((prev) => ({ ...prev, [k]: { valor: patch.valor ?? prev[k]?.valor ?? 0, rango: (patch.rango ?? prev[k]?.rango ?? "Humano Bajo") as string } }));
  }

  function toggleSkill(skillId: string) {
    setHabilidades((prev) => {
      const exist = prev.find((h) => h.skillId === skillId);
      if (exist) return prev.filter((h) => h.skillId !== skillId);
      return [...prev, { skillId, nivel: skills.find(s => s.id === skillId)?.nivel ?? 1 }];
    });
  }
  function setSkillLevel(skillId: string, nivel: number) {
    setHabilidades((prev) => prev.map(h => h.skillId === skillId ? { ...h, nivel } : h));
  }

  function toggleBonus(bonusId: string) {
    setBonos((prev) => {
      const exist = prev.find(b => b.bonusId === bonusId);
      if (exist) return prev.filter(b => b.bonusId !== bonusId);
      const max = bonuses.find(b => b.id === bonusId)?.nivelMax ?? 1;
      return [...prev, { bonusId, nivel: 1 > max ? max : 1 }];
    });
  }
  function setBonusLevel(bonusId: string, lvl: number) {
    setBonos(prev => prev.map(b => b.bonusId === bonusId ? { ...b, nivel: Math.max(0, Math.min(lvl, bonuses.find(x=>x.id===bonusId)?.nivelMax ?? lvl)) } : b));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const finalSpeciesName = (customSpec.trim() || especie);
    const sp = species.find(s => s.nombre === finalSpeciesName);

    // Claves de INT y SAB (robustas ante acentos)
    const intelKey = Object.keys(stats).find((s) => s.toLowerCase() === "inteligencia") ?? "Inteligencia";
    const sabKey   = Object.keys(stats).find((s) => {
      const ls = s.toLowerCase();
      return ls === "sabiduría" || ls === "sabiduria" || ls.startsWith("sabid");
    }) ?? "Sabiduría";

    const intelVal = stats[intelKey]?.valor ?? 0;
    const sabVal   = stats[sabKey]?.valor ?? 0;

    // Mente según especie
    const mindVal  = sp?.allowMind ? computeMind(intelVal, sabVal) : 0;
    let finalStats: Character["stats"] = {
      ...stats,
      Mente: { valor: mindVal, rango: classifyStat(mindVal).sub },
    };

    // Aplicar baseMods de especie (Puntos / %)
    if (sp?.baseMods?.length) {
      let flat: Record<string, number> = {};
      let perc: Record<string, number> = {};
      for (const m of sp.baseMods) {
        if (m.modo === "Puntos") flat[m.stat] = (flat[m.stat] ?? 0) + m.cantidad;
        else perc[m.stat] = (perc[m.stat] ?? 0) + (m.cantidad / 100);
      }
      for (const k of Object.keys(finalStats)) {
        const base = finalStats[k].valor ?? 0;
        const withPerc = base * (1 + (perc[k] ?? 0));
        const withFlat = withPerc + (flat[k] ?? 0);
        finalStats[k] = { valor: Math.round(withFlat * 100) / 100, rango: classifyStat(withFlat).sub };
      }
    }

    const base: Character = {
      id: initial?.id ?? (globalThis.crypto?.randomUUID?.() ?? uid("char")),
      nombre, especie: finalSpeciesName, descripcion, nivel,
      stats: finalStats, habilidades, bonos,
    };
    onSubmit(base);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Identidad */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
        <Field label="Especie">
          <div className="flex gap-2 items-center">
            {/* Selector por especie guardada */}
            <Select
              value={selectedSpecies?.id ?? ""}
              onValueChange={(id) => {
                if (id === "__custom__") return;
                const sp = species.find(s => s.id === id);
                setEspecie(sp?.nombre ?? "");
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona especie"/></SelectTrigger>
              <SelectContent className="max-h-64 overflow-auto">
                {species.map(sp => (<SelectItem key={sp.id} value={sp.id}>{sp.nombre}</SelectItem>))}
                <SelectItem value="__custom__">Otra (escribir)</SelectItem>
              </SelectContent>
            </Select>
            {/* Campo para especie personalizada */}
            <Input placeholder="Otra especie (texto)" value={customSpec} onChange={(e)=>setCustomSpec(e.target.value)} />
          </div>
        </Field>
      </div>

      {/* Nivel */}
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

      {/* Descripción */}
      <Field label="Descripción"><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="min-h-[96px]"/></Field>

      {/* Stats base: Mente condicionada por especie */}
      <Section title="Estadísticas (base)">
        <StatEditor
          stats={stats}
          onChange={upStat}
          extraStats={extraStats}
          onAddStat={() => {}}
          mindPolicy={!selectedSpecies ? "auto" : (selectedSpecies.allowMind ? "auto" : "none")}
        />
      </Section>

      {/* Habilidades */}
      <Section title="Habilidades del personaje">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {skills.map(s => {
            const has = !!habilidades.find(h => h.skillId === s.id);
            const cur = habilidades.find(h => h.skillId === s.id)?.nivel ?? 1;
            return (
              <Card key={s.id} className={`p-3 ${has ? "ring-1 ring-gray-300" : ""}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={has} onCheckedChange={() => toggleSkill(s.id)} />
                    <div>
                      <div className="font-medium truncate" title={s.nombre}>{s.nombre}</div>
                      <div className="text-xs opacity-70">{s.clase} · {s.tier}</div>
                    </div>
                  </div>
                  {has && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Nivel</Label>
                      <Input inputMode="numeric" type="number" className="w-20 h-8" min={0} value={cur} onChange={(e) => setSkillLevel(s.id, parseInt(e.target.value || "0"))} />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* Bonificaciones */}
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
                      <div className="text-xs opacity-70">{String(b.objetivo)} · {b.modo} (+{b.cantidadPorNivel}/nivel) · Máx {b.nivelMax}</div>
                    </div>
                  </div>
                  {has && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Nivel</Label>
                      <Button type="button" size="icon" variant="outline" onClick={()=>setBonusLevel(b.id, Math.max(0, lvl-1))}><Minus className="w-4 h-4"/></Button>
                      <Input inputMode="numeric" type="number" className="w-16 h-8" min={0} max={b.nivelMax} value={lvl} onChange={(e)=>setBonusLevel(b.id, parseInt(e.target.value || "0"))} />
                      <Button type="button" size="icon" variant="outline" onClick={()=>setBonusLevel(b.id, Math.min(b.nivelMax, lvl+1))}>+</Button>
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

/* ---------------------------------------------
 * Tabla de Personajes (vista compacta)
 * -------------------------------------------*/

function CharacterRow({ c, onEdit, onDelete, skillsById, bonuses }: { c: Character; onEdit: () => void; onDelete: () => void; skillsById: Record<string, Skill>; bonuses: Bonus[] }) {
  const entries = Object.entries(c.stats).slice(0,3);
  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b">
      <div className="col-span-12 sm:col-span-4">
        <div className="font-medium truncate">{c.nombre}</div>
        <div className="text-xs opacity-70 line-clamp-2">Lvl {c.nivel} · {c.especie} · {c.descripcion}</div>
      </div>
      <div className="col-span-12 sm:col-span-4 text-xs">
        <div className="flex flex-wrap gap-1">
          {c.habilidades.slice(0, 4).map(h => (<Badge key={h.skillId} className="rounded-2xl truncate max-w-[160px]" title={skillsById[h.skillId]?.nombre ?? "?"}>{skillsById[h.skillId]?.nombre ?? "?"} ({h.nivel})</Badge>))}
          {c.habilidades.length > 4 && <Badge className="rounded-2xl">+{c.habilidades.length - 4}</Badge>}
        </div>
      </div>
      <div className="col-span-12 sm:col-span-3 text-xs">
        <div className="flex flex-wrap gap-1">
          {entries.map(([k,v]) => {
            const eff = calcEffectiveStat(c, k, bonuses);
            const effCls = classifyStat(eff);
            return (
              <Badge key={k} className="rounded-2xl" title={`Base: ${v.valor} (${v.rango})`}>{k}: {eff} ({effCls.sub})</Badge>
            );
          })}
        </div>
      </div>
      <div className="col-span-12 sm:col-span-1 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="w-4 h-4"/></Button>
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------
 * Evoluciones (vínculos entre habilidades)
 * -------------------------------------------*/

function EvolutionEditor({ skills, links, onAdd }: { skills: Skill[]; links: EvoLink[]; onAdd: (from: string, to: string) => void }) {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // Mapa para contar entradas a cada nodo (para encontrar raíces)
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

  function Tree({ id }: { id: string }) {
    const kids = childrenOf[id] || [];
    return (
      <div className="ml-2">
        <div className="flex items-center gap-2 text-sm">
          <ChevronRight className="w-4 h-4"/>
          <span className="font-medium truncate">{byId[id]?.nombre}</span>
          <Badge className="rounded-2xl text-[10px]">{byId[id]?.tier}</Badge>
        </div>
        <div className="ml-4 border-l pl-2">
          {kids.map((k) => <Tree key={k} id={k} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-end">
        <div className="flex-1">
          <Label>De</Label>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger><SelectValue placeholder="Habilidad base"/></SelectTrigger>
            <SelectContent className="max-h-64 overflow-auto">{skills.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label>A</Label>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger><SelectValue placeholder="Síntesis/Evolución"/></SelectTrigger>
            <SelectContent className="max-h-64 overflow-auto">{skills.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button disabled={!from || !to || from === to} onClick={() => { onAdd(from, to); setFrom(""); setTo(""); }} className="gap-2">
          <Link2 className="w-4 h-4"/> Vincular
        </Button>
      </div>

      <div className="space-y-2 overflow-x-auto">
        {roots.length === 0 && <div className="text-sm opacity-70">No hay raíces definidas. Crea vínculos para ver el árbol.</div>}
        <div className="min-w-[320px]">
          {roots.map(r => <Tree key={r.id} id={r.id} />)}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------
 * CRUD de Especies
 * -------------------------------------------*/

function SpeciesForm({ initial, onSubmit, statOptions }: { initial?: Species; onSubmit: (s: Species) => void; statOptions: string[] }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [allowMind, setAllowMind] = useState<boolean>(initial?.allowMind ?? true);
  const [mods, setMods] = useState<SpeciesBaseMod[]>(initial?.baseMods ?? []);
  const [equivText, setEquivText] = useState<string>(JSON.stringify(initial?.equivalencias ?? {}, null, 2));

  function addMod() { setMods(prev => [...prev, { stat: statOptions[0] ?? "Fuerza", modo: "Puntos", cantidad: 1 }]); }
  function updateMod(i: number, patch: Partial<SpeciesBaseMod>) {
    setMods(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  }
  function removeMod(i: number) { setMods(prev => prev.filter((_, idx) => idx !== i)); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let equivalencias: Record<string, Equivalencia> = {};
    try { equivalencias = JSON.parse(equivText || "{}"); }
    catch { alert("Equivalencias debe ser JSON válido"); return; }

    const out: Species = {
      id: initial?.id ?? (globalThis.crypto?.randomUUID?.() ?? uid("spec")),
      nombre: nombre.trim(),
      descripcion,
      allowMind,
      baseMods: mods,
      equivalencias,
    };
    onSubmit(out);
  }

  return (
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
                    {statOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
  );
}

/* ---------------------------------------------
 * Leaderboard sencillo
 * -------------------------------------------*/

function Leaderboard({ characters, bonuses, statOptions }: { characters: Character[]; bonuses: Bonus[]; statOptions: string[] }) {
  const [stat, setStat] = useState<string>(statOptions[0] ?? "Fuerza");
  const [useEffective, setUseEffective] = useState(true);
  const [topN, setTopN] = useState<number>(10);

  const rows = useMemo(() => {
    const list = characters.map(c => {
      const base = c.stats?.[stat]?.valor ?? 0;
      const eff = calcEffectiveStat(c, stat as StatKey, bonuses);
      const value = useEffective ? eff : base;
      const cls = classifyStat(value);
      return { id: c.id, nombre: c.nombre, especie: c.especie, value, cls: cls.sub };
    }).sort((a,b) => b.value - a.value);
    return list.slice(0, Math.max(1, topN));
  }, [characters, bonuses, stat, topN, useEffective]);

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
            <span className="text-sm opacity-80">{useEffective ? "Efectivo (con bonificaciones)" : "Base (sin bonificaciones)"}</span>
          </div>
        </Field>
        <Field label="Top N">
          <Input inputMode="numeric" type="number" min={1} max={100} value={topN} onChange={(e)=>setTopN(Math.max(1, Math.min(100, parseInt(e.target.value || "10"))))} />
        </Field>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-12 px-2 py-2 text-xs font-medium border-b bg-gray-50">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Personaje</div>
            <div className="col-span-3">Especie</div>
            <div className="col-span-3 text-right">Valor</div>
          </div>
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

/* ---------------------------------------------
 * APP principal
 * -------------------------------------------*/

export default function MiniApp() {
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [tab, setTab] = useState("skills");
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editingBonusId, setEditingBonusId] = useState<string | null>(null);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [editingSpeciesId, setEditingSpeciesId] = useState<string | null>(null);

  // Cargar datos desde Supabase
  const loadData = useCallback(async () => {
    try {
      const { data: skills }       = await supabase.from("skills").select("*");
      const { data: characters }   = await supabase.from("characters").select("*");
      const { data: evo_links }    = await supabase.from("evo_links").select("*");
      const { data: bonuses }      = await supabase.from("bonuses").select("*");
      const { data: extra_stats }  = await supabase.from("extra_stats").select("*");
      const { data: species, error: spErr } = await supabase
        .from("species").select("*").order("nombre", { ascending: true });

      if (spErr) console.error("[species] load error:", spErr);

      setStore({
        skills: (skills ?? []).map((s: any) => ({
          id: s.id,
          nombre: s.nombre,
          nivel: s.nivel,
          nivelMax: s.nivelMax,
          incremento: s.incremento,
          clase: s.clase,
          tier: s.tier,
          definicion: s.definicion,
          personajes: Array.isArray(s.personajes) ? s.personajes : [],
        })),

        characters: (characters ?? []) as Character[],

        evoLinks: (evo_links ?? []).map((e: any) => ({
          from: e.from_skill,
          to: e.to_skill,
        })),

        bonuses: (bonuses ?? []).map((b: any) => ({
          id: b.id,
          nombre: b.nombre,
          descripcion: b.descripcion,
          objetivo: b.objetivo,
          modo: b.modo,
          cantidadPorNivel: b.cantidad_por_nivel,
          nivelMax: b.nivel_max,
        })) as Bonus[],

        extraStats: (extra_stats ?? []).map((e: any) => e.name) ?? [],

        species: (species ?? []).map((s: any) => ({
          id: s.id,
          nombre: s.nombre,
          descripcion: s.descripcion ?? "",
          equivalencias: (s.equivalencias ?? {}) as Record<string, Equivalencia>,
          allowMind: !!s.allow_mind,
          baseMods: (s.base_mods ?? []) as SpeciesBaseMod[],
        })),
      });
    } catch (err) {
      console.error("loadData() error:", err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const skillsById = useMemo(() => Object.fromEntries(store.skills.map(s => [s.id, s])), [store.skills]);
  const statOptions = useMemo(() => Array.from(new Set<string>([...DEFAULT_STATS as any, ...store.extraStats])), [store.extraStats]);

  // Export/Import local (JSON)
  function handleExport() { downloadJSON("registro-habilidades-personajes.json", store); }
  function handleImport(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { const data = JSON.parse(reader.result as string); setStore({ ...EMPTY_STORE, ...data }); } catch { alert("Archivo inválido"); } };
    reader.readAsText(file); ev.target.value = "";
  }

  // Persistencia (Supabase)
  async function upsertSkill(s: Skill) {
    try {
      const id = isUUID(s.id) ? s.id : globalThis.crypto?.randomUUID?.() ?? uid("skill");
      const { error } = await supabase.from("skills").upsert({ id, nombre: s.nombre, nivel: s.nivel, nivelMax: s.nivelMax, incremento: s.incremento, clase: s.clase, tier: s.tier, definicion: s.definicion, personajes: s.personajes ?? [], });
      if (error) { alert("Error guardando habilidad: " + error.message); return; }
      await loadData();
    } catch (err: any) { alert("Error guardando habilidad: " + (err?.message ?? String(err))); }
  }
  async function deleteSkill(id: string) {
    const { error } = await supabase.from("skills").delete().eq("id", id);
    if (error) { alert("Error eliminando habilidad: " + error.message); return; }
    setStore(prev => ({ ...prev, skills: prev.skills.filter(s => s.id !== id), characters: prev.characters.map(ch => ({ ...ch, habilidades: ch.habilidades.filter(h => h.skillId !== id) })), evoLinks: prev.evoLinks.filter(l => l.from !== id && l.to !==id), }));
  }

  async function upsertBonus(b: Bonus) {
    try {
      const id = isUUID(b.id) ? b.id : globalThis.crypto?.randomUUID?.() ?? uid("bonus");
      const { error } = await supabase.from("bonuses").upsert({
        id, nombre: b.nombre, descripcion: b.descripcion,
        objetivo: b.objetivo, modo: b.modo, cantidad_por_nivel: b.cantidadPorNivel, nivel_max: b.nivelMax,
      });
      if (error) { alert("Error guardando bonificación: " + error.message); return; }
      await loadData();
    } catch (err: any) { alert("Error guardando bonificación: " + (err?.message ?? String(err))); }
  }
  async function deleteBonus(id: string) {
    const { error } = await supabase.from("bonuses").delete().eq("id", id);
    if (error) return alert("Error eliminando bonificación: " + error.message);
    setStore(prev => ({ ...prev, bonuses: prev.bonuses.filter(b => b.id !== id) }));
  }

  async function upsertCharacter(c: Character) {
    try {
      const id = isUUID(c.id) ? c.id : globalThis.crypto?.randomUUID?.() ?? uid("char");
      const { error } = await supabase.from("characters").upsert({ id, nombre: c.nombre, especie: c.especie, descripcion: c.descripcion, nivel: c.nivel, stats: c.stats ?? {}, habilidades: c.habilidades ?? [], bonos: c.bonos ?? [] });
      if (error) { alert("Error guardando personaje: " + error.message); return; }
      await loadData();
    } catch (err: any) { alert("Error guardando personaje: " + (err?.message ?? String(err))); }
  }
  async function deleteCharacter(id: string) {
    const { error } = await supabase.from("characters").delete().eq("id", id);
    if (error) return alert("Error eliminando personaje: " + error.message);
    setStore(prev => ({ ...prev, characters: prev.characters.filter(c => c.id !== id), skills: prev.skills.map(s => ({ ...s, personajes: s.personajes.filter(pid => pid !== id) })), }));
  }

  async function upsertSpecies(s: Species) {
    try {
      const id = isUUID(s.id) ? s.id : globalThis.crypto?.randomUUID?.() ?? uid("spec");
      const { error } = await supabase.from("species").upsert({
        id, nombre: s.nombre, descripcion: s.descripcion, equivalencias: s.equivalencias, allow_mind: s.allowMind, base_mods: s.baseMods ?? []
      });
      if (error) { alert("Error guardando especie: " + error.message); return; }
      await loadData();
    } catch (err: any) { alert("Error guardando especie: " + (err?.message ?? String(err))); }
  }
  async function deleteSpecies(id: string) {
    const { error } = await supabase.from("species").delete().eq("id", id);
    if (error) return alert("Error eliminando especie: " + error.message);
    await loadData();
  }

  const editingChar   = store.characters.find(c => c.id === editingCharId);
  const editingBonus  = store.bonuses.find(b => b.id === editingBonusId);
  const editingSkill  = store.skills.find(s => s.id === editingSkillId);
  const editingSpec   = store.species.find(s => s.id === editingSpeciesId);

  return (
    <div className="max-w-7xl mx-auto p-3 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold">Sistema de Personajes • Habilidades • Especies</h1>
        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={() => downloadJSON("backup-local.json", store)}>Exportar JSON</Button>
          <label className="inline-flex">
            <input type="file" accept="application/json" className="hidden" onChange={handleImport} />
            <Button variant="outline">Importar JSON</Button>
          </label>
        </div>
      </div>

      {/* Pestañas principales */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap gap-2">
          <TabsTrigger value="skills">Habilidades</TabsTrigger>
          <TabsTrigger value="bonuses">Bonificaciones</TabsTrigger>
          <TabsTrigger value="characters">Personajes</TabsTrigger>
          <TabsTrigger value="species">Especies</TabsTrigger>
          <TabsTrigger value="leaderboard">Rankings</TabsTrigger>
        </TabsList>

        {/* HABILIDADES */}
        <TabsContent value="skills" className="mt-4 space-y-3">
          <Section
            title={editingSkill ? "Editar habilidad" : "Nueva habilidad"}
            actions={editingSkill && <Button variant="outline" onClick={()=>setEditingSkillId(null)}>Cancelar</Button>}
          >
            <SkillForm
              initial={editingSkill ?? undefined}
              onSubmit={(s)=>{ setEditingSkillId(null); upsertSkill(s); }}
              characters={store.characters}
            />
          </Section>

          <Section title={`Listado de habilidades (${store.skills.length})`}>
            <div className="divide-y">
              {store.skills.map(s => (
                <SkillRow
                  key={s.id}
                  s={s}
                  onEdit={()=>setEditingSkillId(s.id)}
                  onDelete={()=>deleteSkill(s.id)}
                />
              ))}
            </div>
          </Section>

          <Section title="Evoluciones / Síntesis">
            <EvolutionEditor
              skills={store.skills}
              links={store.evoLinks}
              onAdd={async (from, to) => {
                // Guardar en tabla 'evo_links' si existe
                try {
                  const { error } = await supabase.from("evo_links").upsert({ from_skill: from, to_skill: to });
                  if (error) { alert("Error guardando vínculo: " + error.message); return; }
                  await loadData();
                } catch (err: any) { alert("Error guardando vínculo: " + (err?.message ?? String(err))); }
              }}
            />
          </Section>
        </TabsContent>

        {/* BONIFICACIONES */}
        <TabsContent value="bonuses" className="mt-4 space-y-3">
          <Section
            title={editingBonus ? "Editar bonificación" : "Nueva bonificación"}
            actions={editingBonus && <Button variant="outline" onClick={()=>setEditingBonusId(null)}>Cancelar</Button>}
          >
            <BonusForm
              initial={editingBonus ?? undefined}
              onSubmit={(b)=>{ setEditingBonusId(null); upsertBonus(b); }}
              statOptions={statOptions}
            />
          </Section>

          <Section title={`Listado de bonificaciones (${store.bonuses.length})`}>
            <div className="divide-y">
              {store.bonuses.map(b => (
                <BonusRow
                  key={b.id}
                  b={b}
                  onEdit={()=>setEditingBonusId(b.id)}
                  onDelete={()=>deleteBonus(b.id)}
                />
              ))}
            </div>
          </Section>
        </TabsContent>

        {/* PERSONAJES */}
        <TabsContent value="characters" className="mt-4 space-y-3">
          <Section
            title={editingChar ? "Editar personaje" : "Nuevo personaje"}
            actions={editingChar && <Button variant="outline" onClick={()=>setEditingCharId(null)}>Cancelar</Button>}
          >
            <CharacterForm
              key={editingChar?.id ?? "new-char"}
              skills={store.skills}
              bonuses={store.bonuses}
              onSubmit={(c) => { setEditingCharId(null); upsertCharacter(c); }}
              initial={editingChar ?? undefined}
              extraStats={store.extraStats}
              species={store.species}
            />
          </Section>

          <Section title={`Listado de personajes (${store.characters.length})`}>
            <div className="divide-y">
              {store.characters.map(c => (
                <CharacterRow
                  key={c.id}
                  c={c}
                  bonuses={store.bonuses}
                  skillsById={skillsById}
                  onEdit={()=>setEditingCharId(c.id)}
                  onDelete={()=>deleteCharacter(c.id)}
                />
              ))}
            </div>
          </Section>
        </TabsContent>

        {/* ESPECIES */}
        <TabsContent value="species" className="mt-4 space-y-3">
          <Section
            title={editingSpec ? "Editar especie" : "Nueva especie"}
            actions={editingSpec && <Button variant="outline" onClick={()=>setEditingSpeciesId(null)}>Cancelar</Button>}
          >
            <SpeciesForm
              initial={editingSpec ?? undefined}
              onSubmit={(s)=>{ setEditingSpeciesId(null); upsertSpecies(s); }}
              statOptions={statOptions}
            />
          </Section>

          <Section title={`Listado de especies (${store.species.length})`}>
            <div className="divide-y">
              {store.species.map(sp => (
                <div key={sp.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{sp.nombre}</div>
                    <div className="text-xs opacity-70 truncate">
                      {sp.allowMind ? "Mente: Sí" : "Mente: No"} · Mods: {sp.baseMods?.length ?? 0}
                    </div>
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
            <Leaderboard characters={store.characters} bonuses={store.bonuses} statOptions={statOptions} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
