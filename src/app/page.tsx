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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
type SpeciesBaseMod = { stat: StatKey; modo: "Puntos" | "Porcentaje"; cantidad: number };

type Species = {
  id: string;
  nombre: string;
  descripcion: string;
  equivalencias: Record<string, Equivalencia>;
  allowMind: boolean;
  baseMods?: SpeciesBaseMod[];
};

type BonusMode = "Porcentaje" | "Puntos";
// filtrar stats dentro de bonus multi
type BonusTarget = {
  stat: StatKey;
  modo: BonusMode;
  cantidadPorNivel: number; 
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
};

type EvoLink = { from: string; to: string };

type Character = {
  id: string;
  nombre: string;
  especie: string;
  descripcion: string;
  nivel: number;
  stats: Record<StatKey, { valor: number; rango: string }>;
  habilidades: { skillId: string; nivel: number }[];
  bonos: { bonusId: string; nivel: number }[];
};

type Store = {
  skills: Skill[];
  evoLinks: EvoLink[];
  characters: Character[];
  bonuses: Bonus[];
  extraStats: string[];
  species: Species[];
};

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
        if (t.stat !== stat) continue;
        const n = (t.cantidadPorNivel ?? 0) * lvl;
        if (t.modo === "Puntos") flat += n;
        else if (t.modo === "Porcentaje") percent += n; // en puntos de %
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
function applySpeciesMods(base: number, key: StatKey, sp: Species | undefined, nivel: number) {
  if (!sp?.baseMods?.length) return base;
  let flat = 0; let perc = 0;
  for (const m of sp.baseMods) {
    if (m.stat !== key) continue;
    if (m.modo === "Puntos") flat += m.cantidad * Math.max(1, nivel ?? 1);
    else perc += m.cantidad / 100;
  }
  return base * (1 + perc) + flat;
}

/** Valor efectivo = base + especie + bonos */
function calcEffectiveStat(c: Character, key: StatKey, bonuses: Bonus[], species: Species[]) {
  const base = c.stats[key]?.valor ?? 0;
  const sp = species.find(s => s.nombre === c.especie);
  const withSpecies = applySpeciesMods(base, key, sp, c.nivel);
  // Crear mapa bonusId → nivelAsignado
const assignmentsByBonusId = Object.fromEntries(
  (c.bonos ?? []).map(b => [b.bonusId, b.nivel])
);

// Sumar bonificaciones
const { flat, percent } = sumBonusesForStat(
  key,                  // <- Stat que estamos calculando
  assignmentsByBonusId, // <- Niveles de bonuses asignados
  bonuses               // <- Todas las bonificaciones guardadas
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

  return (
    <div className="space-y-2">
      <input type="hidden" name="count_rows" value={rows.length} />
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


function Pill({ children }: { children: React.ReactNode }) {
  return <Badge className="rounded-2xl px-2 py-1 text-[11px] md:text-xs whitespace-nowrap">{children}</Badge>;
}

/* ================= Species Form ================= */
function SpeciesForm({ initial, onSubmit, statOptions }: { initial?: Species; onSubmit: (s: Species) => void; statOptions: string[] }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [allowMind, setAllowMind] = useState<boolean>(initial?.allowMind ?? true);
  const [mods, setMods] = useState<SpeciesBaseMod[]>(initial?.baseMods ?? []);
  const [equivText, setEquivText] = useState<string>(JSON.stringify(initial?.equivalencias ?? {}, null, 2));

  function addMod() { setMods(prev => [...prev, { stat: statOptions[0] ?? "Fuerza", modo: "Puntos", cantidad: 1 }]); }
  function updateMod(i: number, patch: Partial<SpeciesBaseMod>) { setMods(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m)); }
  function removeMod(i: number) { setMods(prev => prev.filter((_, idx) => idx !== i)); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let equivalencias: Record<string, Equivalencia> = {};
    try { equivalencias = JSON.parse(equivText || "{}"); } catch { alert("Equivalencias debe ser JSON válido"); return; }
    const out: Species = { id: initial?.id ?? uid("spec"), nombre: nombre.trim(), descripcion, allowMind, baseMods: mods, equivalencias };
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

/* ================= Skills & Evolution ================= */
function SkillForm({ onSubmit, initial }: { onSubmit: (s: Skill) => void; initial?: Skill; }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [nivel, setNivel] = useState<number>(initial?.nivel ?? 1);
  const [nivelMax, setNivelMax] = useState<number>(initial?.nivelMax ?? 10);
  const [incremento, setIncremento] = useState(initial?.incremento ?? "");
  const [clase, setClase] = useState<SkillClass>(initial?.clase ?? "Activa");
  const [tier, setTier] = useState<Tier>(initial?.tier ?? "F");
  const [definicion, setDefinicion] = useState(initial?.definicion ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base: Skill = { id: initial?.id ?? uid("skill"), nombre, nivel, nivelMax, incremento, clase, tier, definicion };
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
      <div className="flex justify-end gap-2"><Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar habilidad</Button></div>
    </form>
  );
}

function SkillRow({ s, onEdit, onDelete }: { s: Skill; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b">
      <div className="col-span-12 sm:col-span-6">
        <div className="font-medium truncate" title={s.nombre}>{s.nombre}</div>
        <div className="text-xs opacity-70 line-clamp-1">{s.definicion}</div>
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
  initial, onSubmit, bonuses, species
}: {
  initial?: Character;
  onSubmit: (c: Character) => void;
  bonuses: Bonus[];
  species: Species[];
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [especie, setEspecie] = useState(initial?.especie ?? "");
  const [customSpec, setCustomSpec] = useState("");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [nivel, setNivel] = useState<number>(initial?.nivel ?? 1);
  const [stats, setStats] = useState<Character["stats"]>(initial?.stats ?? {});
  const [bonos, setBonos] = useState<Character["bonos"]>(initial?.bonos ?? []);

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
    setBonos(prev => prev.map(b => b.bonusId === bonusId ? { ...b, nivel: Math.max(0, Math.min(lvl, bonuses.find(x=>x.id===bonusId)?.nivelMax ?? lvl)) } : b));
  }

  const selectedSpecies = useMemo(() => species.find(s => s.nombre === (customSpec.trim() || especie)), [species, especie, customSpec]);

  function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  const finalSpeciesName = (customSpec.trim() || especie);
  const sp = species.find(s => s.nombre === finalSpeciesName);

  const intelKey = Object.keys(stats).find(s => s.toLowerCase() === "inteligencia") ?? "Inteligencia";
  const sabKey   = Object.keys(stats).find(s => ["sabiduría","sabiduria"].includes(s.toLowerCase()) || s.toLowerCase().startsWith("sabid")) ?? "Sabiduría";

  const intelVal = stats[intelKey]?.valor ?? 0;
  const sabVal   = stats[sabKey]?.valor ?? 0;
  const mindVal  = sp?.allowMind ? computeMind(intelVal, sabVal) : 0;

  // ✅ Guardamos estadísticas base + Mente auto (sin sumar especie aquí)
  const finalStats: Character["stats"] = {
    ...stats,
    Mente: { valor: mindVal, rango: classifyStat(mindVal).sub }
  };

  const out: Character = {
    id: initial?.id ?? crypto.randomUUID(),
    nombre,
    especie: finalSpeciesName,
    descripcion,
    nivel,
    stats: finalStats,
    habilidades: [],
    bonos
  };
  onSubmit(out);
}


  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
        <Field label="Especie">
          <div className="flex gap-2 items-center">
            <Select value={selectedSpecies?.id ?? ""} onValueChange={(val) => {
              if (val === "__custom__") return; const sp = species.find(s => s.id === val); setEspecie(sp?.nombre ?? "");
            }}>
              <SelectTrigger><SelectValue placeholder="Selecciona especie"/></SelectTrigger>
              <SelectContent className="max-h-64 overflow-auto">
                {species.map(sp => (<SelectItem key={sp.id} value={sp.id}>{sp.nombre}</SelectItem>))}
                <SelectItem value="__custom__">Otra (escribir)</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Otra especie (texto)" value={customSpec} onChange={(e)=>setCustomSpec(e.target.value)} />
          </div>
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
          extraStats={[]}
          mindPolicy={!selectedSpecies ? "auto" : (selectedSpecies.allowMind ? "auto" : "none")}
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
      return { id: c.id, nombre: c.nombre, especie: c.especie, value, cls: cls.sub };
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
export default function Page() {
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [tab, setTab] = useState("skills");
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editingBonusId, setEditingBonusId] = useState<string | null>(null);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [editingSpeciesId, setEditingSpeciesId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const { data: skills }     = await supabase.from("skills").select("*");
      const { data: evoLinks }   = await supabase.from("skill_evo_links").select("*");
      const { data: characters } = await supabase.from("characters").select("*");
      const { data: bonuses }    = await supabase.from("bonuses").select("*");
      const { data: species }    = await supabase.from("species").select("*").order("nombre", { ascending: true });
      setStore({
        skills: (skills ?? []) as any,
        evoLinks: (evoLinks ?? []) as any,
        characters: (characters ?? []) as any,
        bonuses: (bonuses ?? []) as any,
        extraStats: [],
        species: (species ?? []).map((s: any) => ({ id: s.id, nombre: s.nombre, descripcion: s.descripcion ?? "", equivalencias: (s.equivalencias ?? {}) as Record<string, Equivalencia>, allowMind: !!s.allow_mind, baseMods: (s.base_mods ?? []) as SpeciesBaseMod[] })),
      });
    } catch (err) { console.error("loadData() error:", err); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Persistencia mínima (ajústalo a tus tablas reales)
  async function upsertSkill(s: Skill) {
  const rowId = isUUID(s.id) ? s.id : crypto.randomUUID();
  const { error } = await supabase.from("skills").upsert({ ...s, id: rowId });
  if (error) alert("Error guardando habilidad: " + error.message);
  await loadData();
}


async function deleteSkill(idToDelete: string) {
  const { error } = await supabase.from("skills").delete().eq("id", idToDelete);
  if (error) alert("Error eliminando habilidad: " + error.message);
  setStore(prev => ({ ...prev, skills: prev.skills.filter(s => s.id !== idToDelete) }));
}

async function addEvo(from: string, to: string) {
  const { error } = await supabase.from("skill_evo_links").insert({ id: uid("evo"), from, to });
  if (error) alert("Error añadiendo relación: " + error.message);
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
                try { const data = JSON.parse(String(reader.result)); setStore({ ...EMPTY_STORE, ...data }); } catch { alert("Archivo inválido"); }
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
        </TabsList>

        {/* HABILIDADES */}
        <TabsContent value="skills" className="mt-4 space-y-3">
          <Section title={editingSkill ? "Editar habilidad" : "Nueva habilidad"} actions={editingSkill && <Button variant="outline" onClick={()=>setEditingSkillId(null)}>Cancelar</Button>}>
            <SkillForm initial={editingSkill ?? undefined} onSubmit={(s)=>{ setEditingSkillId(null); upsertSkill(s); }} />
          </Section>
          <Section title="Árbol de evolución">
            <EvolutionEditor skills={store.skills} links={store.evoLinks} onAdd={addEvo} />
          </Section>
          <Section title={`Listado de habilidades (${store.skills.length})`}>
            <div className="divide-y">
              {store.skills.map(s => <SkillRow key={s.id} s={s} onEdit={()=>setEditingSkillId(s.id)} onDelete={()=>deleteSkill(s.id)} />)}
            </div>
          </Section>
        </TabsContent>

        {/* BONIFICACIONES */}
        <TabsContent value="bonuses" className="mt-4 space-y-3">
          <Section title={editingBonus ? "Editar bonificación" : "Nueva bonificación"} actions={editingBonus && <Button variant="outline" onClick={()=>setEditingBonusId(null)}>Cancelar</Button>}>
            {/* NUEVO: Formulario Multi-objetivo (hasta 5 consecuencias) */}
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
        stat: String(fd.get(`stat_${i}`) ?? "Fuerza"),
        modo: String(fd.get(`modo_${i}`) ?? "Puntos") as BonusMode,
        cantidadPorNivel: Math.max(0, parseFloat(String(fd.get(`cantidad_${i}`) ?? "0"))),
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
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <Field label="Nombre"><Input name="nombre_multi" defaultValue={editingBonus?.objetivos?.length ? editingBonus?.nombre ?? "" : ""} /></Field>
    <Field label="Nivel Máx"><Input name="nivelMax_multi" type="number" min={1} defaultValue={editingBonus?.objetivos?.length ? (editingBonus?.nivelMax ?? 5) : 5} /></Field>
    <Field label="Descripción"><Input name="descripcion_multi" defaultValue={editingBonus?.objetivos?.length ? editingBonus?.descripcion ?? "" : ""} /></Field>
  </div>

        {/* Editor dinámico (máx 5 filas) */}
          <MultiTargetsEditor
                 namePrefix=""
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
          </form>

            {/* Formulario sencillo (legacy, un objetivo) */}
            <form onSubmit={(e)=>{
              e.preventDefault();
              const fd = new FormData(e.currentTarget as HTMLFormElement);
              const out: Bonus = {
                id: editingBonus?.id ?? uid("bonus"),
                nombre: String(fd.get("nombre") ?? ""),
                descripcion: String(fd.get("descripcion") ?? ""),
                objetivo: String(fd.get("objetivo") ?? "Fuerza"),
                modo: String(fd.get("modo") ?? "Puntos") as BonusMode,
                cantidadPorNivel: parseFloat(String(fd.get("cantidad") ?? "1")),
                nivelMax: parseInt(String(fd.get("nivelMax") ?? "5")),
              };
              setEditingBonusId(null);
              upsertBonus(out);
            }} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Nombre"><Input name="nombre" defaultValue={editingBonus?.nombre ?? ""}/></Field>
                <Field label="Objetivo">
                  <Select defaultValue={String(editingBonus?.objetivo ?? "Fuerza")} name="objetivo" onValueChange={(v)=>{ const el = (document.querySelector('select[name=\"objetivo\"]') as any); if (el) el.value = v; }}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent className="max-h-60 overflow-auto">
                      {Array.from(new Set([...DEFAULT_STATS as any])).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Modo">
                  <Select defaultValue={String(editingBonus?.modo ?? "Puntos")} name="modo" onValueChange={(v)=>{ const el = (document.querySelector('select[name=\"modo\"]') as any); if (el) el.value = v; }}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="Puntos">Puntos</SelectItem><SelectItem value="Porcentaje">Porcentaje</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Cant. por nivel"><Input name="cantidad" type="number" defaultValue={(editingBonus as any)?.cantidadPorNivel ?? 1}/></Field>
                <Field label="Nivel Máx"><Input name="nivelMax" type="number" defaultValue={editingBonus?.nivelMax ?? 5}/></Field>
              </div>
              <Field label="Descripción"><Textarea name="descripcion" defaultValue={editingBonus?.descripcion ?? ""}/></Field>
              <div className="flex justify-end"><Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar bonificación</Button></div>
            </form>
          </Section>
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
            <CharacterForm key={editingChar?.id ?? "new-char"} bonuses={store.bonuses} onSubmit={(c) => { setEditingCharId(null); upsertCharacter(c); }} initial={editingChar ?? undefined} species={store.species} />
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
                    <Button size="sm" variant="outline" onClick={()=>setEditingCharId(c.id)}>Editar</Button>
                    <Button size="sm" variant="destructive" onClick={()=>deleteCharacter(c.id)}><Trash2 className="w-4 h-4"/></Button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </TabsContent>

        {/* ESPECIES */}
        <TabsContent value="species" className="mt-4 space-y-3">
          <Section title={editingSpec ? "Editar especie" : "Nueva especie"} actions={editingSpec && <Button variant="outline" onClick={()=>setEditingSpeciesId(null)}>Cancelar</Button>}>
            <SpeciesForm initial={editingSpec ?? undefined} onSubmit={(s)=>{ setEditingSpeciesId(null); upsertSpecies(s); }} statOptions={Array.from(new Set([...DEFAULT_STATS as any]))} />
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
      </Tabs>
    </div>
  );
}
