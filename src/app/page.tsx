"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Save, Download, Trash2, ChevronRight, Link2, Wand2, Settings2, Minus, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import React, { useEffect, useMemo, useState, useCallback } from "react";

/**********************
 * Types & Constants  *
 **********************/

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

const SKILL_CLASSES: SkillClass[] = ["Activa", "Pasiva", "Crecimiento"];

const BASE_RANKS = [
  "Humano","Genin","Chunnin","Jounin","Kage","Bijuu","Catástrofe","Deidad"
] as const;

// Tabla de clasificación automática por valor → (base, subnivel)
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

const DEFAULT_STATS = [
  "Fuerza","Resistencia","Destreza","Mente","Vitalidad","Inteligencia","Sabiduría"
] as const;

// --- Helpers ---
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

/**********************
 * Tipos de dominio   *
 **********************/

type StatKey = typeof DEFAULT_STATS[number] | string;

type BonusMode = "Porcentaje" | "Puntos";

type BonusTarget = { stat: StatKey; modo: BonusMode; cantidadPorNivel: number };

type Bonus = {
  id: string;
  nombre: string;
  descripcion: string;
  objetivos?: BonusTarget[]; // multi-objetivo (futuro)
  objetivo?: StatKey;        // legacy
  modo?: BonusMode;          // legacy
  cantidadPorNivel?: number; // legacy
  nivelMax: number;
};


type Equivalencia = { unidad: string; valorPorPunto: number };

type Species = {
  id: string;
  nombre: string;
  descripcion: string;
  equivalencias: Record<string, Equivalencia>;
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
  inventario?: any[]; // (extensible)
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
};

const EMPTY_STORE: Store = { skills: [], characters: [], evoLinks: [], bonuses: [], extraStats: [] };

/**********************
 * Cálculos           *
 **********************/

function calcEffectiveStat(c: Character, key: StatKey, bonuses: Bonus[]): number {
  const base = c.stats[key]?.valor ?? 0;
  if (!c.bonos?.length) return base;

  let flat = 0; let perc = 0;
  for (const assign of c.bonos) {
    const b = bonuses.find(x => x.id === assign.bonusId);
    if (!b) continue; const lvl = Math.max(0, Math.min(assign.nivel ?? 0, b.nivelMax));
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

/**********************
 * Primitivos UI      * (responsive tweaks)
 **********************/

function Section({ title, children, actions, collapsible = true }: { title: string; children: React.ReactNode; actions?: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="border border-gray-200 overflow-hidden">
      <CardHeader className="flex items-center justify-between py-3 gap-2 sticky top-0 bg-white/80 backdrop-blur z-10">
        <div className="flex items-center gap-3 w-full">
          {collapsible && (
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => setOpen(v => !v)} aria-label={open ? "Contraer" : "Expandir"}>
              {open ? <Minus className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}
            </Button>
          )}
          <CardTitle className="text-lg md:text-xl font-semibold truncate">{title}</CardTitle>
          <div className="ml-auto flex gap-2">{actions}</div>
        </div>
      </CardHeader>
      {open && <CardContent className="p-3 md:p-4">{children}</CardContent>}
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

/**********************
 * Componentes        * (con mejoras responsive puntuales)
 **********************/

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
            <SelectContent>{SKILL_CLASSES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
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

function StatEditor({ stats, onChange, extraStats, onAddStat }: { stats: Character["stats"]; onChange: (k: StatKey, patch: Partial<{ valor: number; rango: string }>) => void; extraStats: string[]; onAddStat: (name: string) => void; }) {
  const [newStat, setNewStat] = useState("");
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
                <Input inputMode="numeric" type="number" className="col-span-2" value={entry.valor} onChange={(e) => {
                  const v = parseFloat(e.target.value || "0");
                  const derived = classifyStat(v);
                  onChange(k, { valor: v, rango: derived.sub });
                }} />
                <div className="col-span-3 text-[11px] opacity-70">La clasificación se actualiza automáticamente según el valor.</div>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <Label>Nueva estadística</Label>
          <Input value={newStat} onChange={(e) => setNewStat(e.target.value)} placeholder="Ej: Chakra, Haki, Magia"/>
        </div>
        <Button type="button" variant="outline" onClick={() => { if (!newStat.trim()) return; onAddStat(newStat.trim()); setNewStat(""); }} className="gap-2">
          <Plus className="w-4 h-4"/>Añadir stat
        </Button>
      </div>
    </div>
  );
}

function CharacterForm({ initial, onSubmit, skills, bonuses, extraStats }: { initial?: Character; onSubmit: (c: Character) => void; skills: Skill[]; bonuses: Bonus[]; extraStats: string[]; }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [especie, setEspecie] = useState(initial?.especie ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [nivel, setNivel] = useState<number>(initial?.nivel ?? 1);
  const [stats, setStats] = useState<Character["stats"]>(initial?.stats ?? {});
  const [habilidades, setHabilidades] = useState<Character["habilidades"]>(initial?.habilidades ?? []);
  const [bonos, setBonos] = useState<Character["bonos"]>(initial?.bonos ?? []);

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
    const base: Character = {
      id: initial?.id ?? (globalThis.crypto?.randomUUID?.() ?? uid("char")),
      nombre, especie, descripcion, nivel, stats, habilidades, bonos,
    };
    onSubmit(base);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
        <Field label="Especie"><Input value={especie} onChange={(e) => setEspecie(e.target.value)} placeholder="Ej: Humano, Uzumaki, Dragón"/></Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Nivel del personaje</div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={()=>setNivel(Math.max(1, nivel-1))}><Minus className="w-4 h-4"/></Button>
              <Input inputMode="numeric" type="number" className="w-20" min={1} value={nivel} onChange={(e)=>setNivel(Math.max(1, parseInt(e.target.value || "1")))} />
              <Button type="button" variant="outline" size="icon" onClick={()=>setNivel(nivel+1)}><Plus className="w-4 h-4"/></Button>
            </div>
          </div>
        </Card>
      </div>

      <Field label="Descripción"><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="min-h-[96px]"/></Field>

      <Section title="Estadísticas (base)"><StatEditor stats={stats} onChange={upStat} extraStats={extraStats} onAddStat={() => {}}/></Section>

      <Section title="Habilidades del personaje">
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {skills.map(s => {
              const has = !!habilidades.find(h => h.skillId === s.id);
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
                        <Input inputMode="numeric" type="number" className="w-20 h-8" min={0} value={habilidades.find(h => h.skillId === s.id)?.nivel ?? 1} onChange={(e) => setSkillLevel(s.id, parseInt(e.target.value || "0"))} />
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
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
                      <div className="text-xs opacity-70">{String(b.objetivo)} · {b.modo} (+{b.cantidadPorNivel}/nivel) · Máx {b.nivelMax}</div>
                    </div>
                  </div>
                  {has && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Nivel</Label>
                      <Button type="button" size="icon" variant="outline" onClick={()=>setBonusLevel(b.id, Math.max(0, lvl-1))}><Minus className="w-4 h-4"/></Button>
                      <Input inputMode="numeric" type="number" className="w-16 h-8" min={0} max={b.nivelMax} value={lvl} onChange={(e)=>setBonusLevel(b.id, parseInt(e.target.value || "0"))} />
                      <Button type="button" size="icon" variant="outline" onClick={()=>setBonusLevel(b.id, Math.min(b.nivelMax, lvl+1))}><Plus className="w-4 h-4"/></Button>
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

/**********************
 * Root App           * (con layout responsive + barras sticky)
 **********************/

/* ********************
 * Leaderboard (Rankings)
 * ******************** */
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

export default function MiniApp() {
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [tab, setTab] = useState("skills");
  const [search, setSearch] = useState("");
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editingBonusId, setEditingBonusId] = useState<string | null>(null);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const { data: skills } = await supabase.from("skills").select("*");
    const { data: characters } = await supabase.from("characters").select("*");
    const { data: evo_links } = await supabase.from("evo_links").select("*");
    const { data: bonuses } = await supabase.from("bonuses").select("*");
    const { data: extra_stats } = await supabase.from("extra_stats").select("*");
    const { data: species } = await supabase.from("species").select("*").order("nombre", { ascending: true });
    setStore({
      skills: (skills ?? []).map((s: any) => ({ id: s.id, nombre: s.nombre, nivel: s.nivel, nivelMax: s.nivelMax, incremento: s.incremento, clase: s.clase, tier: s.tier, definicion: s.definicion, personajes: Array.isArray(s.personajes) ? s.personajes : [], })),
      characters: (characters ?? []) as Character[],
      evoLinks: (evo_links ?? []).map((e: any) => ({ from: e.from_skill, to: e.to_skill })) ?? [],
      bonuses: (bonuses ?? []).map((b: any) => ({ id: b.id, nombre: b.nombre, descripcion: b.descripcion, objetivo: b.objetivo, modo: b.modo, cantidadPorNivel: b.cantidad_por_nivel, nivelMax: b.nivel_max, })) as Bonus[],
      extraStats: (extra_stats ?? []).map((e: any) => e.name) ?? [],
      species: (species ?? []).map((s: any) => ({ id: s.id, nombre: s.nombre, descripcion: s.descripcion ?? "", equivalencias: (s.equivalencias ?? {}) as Record<string, Equivalencia> })),
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const skillsById = useMemo(() => Object.fromEntries(store.skills.map(s => [s.id, s])), [store.skills]);
  const statOptions = useMemo(() => Array.from(new Set<string>([...DEFAULT_STATS as any, ...store.extraStats])), [store.extraStats]);

  function handleExport() { downloadJSON("registro-habilidades-personajes.json", store); }

  function handleImport(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { const data = JSON.parse(reader.result as string); setStore({ ...EMPTY_STORE, ...data }); } catch { alert("Archivo inválido"); } };
    reader.readAsText(file); ev.target.value = "";
  }

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

  async function upsertBonus(b: Bonus) {
    try {
      const id = isUUID(b.id) ? b.id : globalThis.crypto?.randomUUID?.() ?? uid("bonus");
      const { data, error } = await supabase.from("bonuses").upsert({ id, nombre: b.nombre, descripcion: b.descripcion, objetivo: b.objetivo, modo: b.modo, cantidad_por_nivel: b.cantidadPorNivel, nivel_max: b.nivelMax, }).select().single();
      if (error) return alert("Error guardando bonificación: " + error.message);
      const saved: Bonus = { id: data!.id, nombre: data!.nombre, descripcion: data!.descripcion, objetivo: data!.objetivo, modo: data!.modo, cantidadPorNivel: data!.cantidad_por_nivel, nivelMax: data!.nivel_max };
      setStore(prev => { const exists = prev.bonuses.some(x => x.id === saved.id); const bonuses = exists ? prev.bonuses.map(x => (x.id === saved.id ? saved : x)) : [...prev.bonuses, saved]; return { ...prev, bonuses }; });
    } catch (err: any) { alert("Error guardando bonificación: " + (err?.message ?? String(err))); }
  }

  async function deleteBonus(id: string) {
    const { error } = await supabase.from("bonuses").delete().eq("id", id);
    if (error) return alert("Error eliminando bonificación: " + error.message);
    setStore(prev => ({ ...prev, bonuses: prev.bonuses.filter(b => b.id !== id), characters: prev.characters.map(ch => ({ ...ch, bonos: ch.bonos?.filter(bb => bb.bonusId !== id) ?? [] })), }));
  }

  async function addExtraStat(

  async function upsertSpecies(s: Species) {
    const id = s.id || (globalThis.crypto?.randomUUID?.() ?? uid("spec"));
    const { error } = await supabase.from("species").upsert({
      id, nombre: s.nombre, descripcion: s.descripcion, equivalencias: s.equivalencias,
    });
    if (error) { alert("Error guardando especie: " + error.message); return; }
    await loadData();
  }

  async function deleteSpecies(id: string) {
    const { error } = await supabase.from("species").delete().eq("id", id);
    if (error) { alert("Error eliminando especie: " + error.message); return; }
    setStore(prev => ({ ...prev, species: prev.species.filter(s => s.id !== id) }));
  }

name: string) {
    const { error } = await supabase.from("extra_stats").upsert({ name });
    if (error) { alert("Error añadiendo stat: " + error.message); return; }
    setStore(prev => prev.extraStats.includes(name) ? prev : { ...prev, extraStats: [...prev.extraStats, name] });
  }

  const filteredSkills = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return store.skills;
    return store.skills.filter(s => (s.nombre.toLowerCase().includes(q) || s.definicion.toLowerCase().includes(q) || s.clase.toLowerCase().includes(q) || s.tier.toLowerCase().includes(q)));
  }, [store.skills, search]);

  const filteredChars = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return store.characters;
    return store.characters.filter(c => (c.nombre.toLowerCase().includes(q) || c.especie.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q)));
  }, [store.characters, search]);

  const filteredBonuses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return store.bonuses;
    return store.bonuses.filter(b => (b.nombre.toLowerCase().includes(q) || b.descripcion.toLowerCase().includes(q) || String(b.objetivo).toLowerCase().includes(q)));
  }, [store.bonuses, search]);

  async function addEvoLink(a: string, b: string) {
    const { error } = await supabase.from("evo_links").upsert({ from_skill: a, to_skill: b });
    if (error) { alert("Error creando vínculo de evolución: " + error.message); return; }
    setStore(prev => { const exists = prev.evoLinks.some(l => l.from === a && l.to === b); if (exists) return prev; return { ...prev, evoLinks: [...prev.evoLinks, { from: a, to: b }] }; });
  }

  // --- UI helpers (responsive) ---
  const editingChar = useMemo(() => store.characters.find(c => c.id === editingCharId) || undefined, [store.characters, editingCharId]);
  const editingBonus = useMemo(() => store.bonuses.find(b => b.id === editingBonusId) || undefined, [store.bonuses, editingBonusId]);
  const editingSkill = useMemo(() => store.skills.find(s => s.id === editingSkillId) || undefined, [store.skills, editingSkillId]);

  function clearEdits() { setEditingSkillId(null); setEditingBonusId(null); setEditingCharId(null); }

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6 lg:px-8 py-3 md:py-6">
        {/* Header sticky con buscador + acciones para móvil */}
        <div className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b">
          <div className="flex flex-col gap-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl md:text-3xl font-semibold tracking-tight">Registro de Habilidades & Personajes</h1>
              <div className="hidden sm:flex items-center gap-2">
                <Input type="file" accept="application/json" onChange={handleImport} className="w-44" />
                <Button variant="outline" onClick={handleExport} className="gap-2"><Download className="w-4 h-4"/>Exportar</Button>
                <Button variant="outline" onClick={() => {
                  const sk1: Skill = { id: uid("skill"), nombre: "Asedio Carmesí del Dragón", nivel: 1, nivelMax: 5, incremento: "+120% daño / +30% alcance", clase: "Activa", tier: "S" as Tier, definicion: "Estallido ofensivo a gran escala.", personajes: [] };
                  const sk2: Skill = { id: uid("skill"), nombre: "Marca de Protección", nivel: 1, nivelMax: 3, incremento: "+25% mitigación", clase: "Pasiva", tier: "A+" as Tier, definicion: "Protege aliados cercanos.", personajes: [] };
                  const sk3: Skill = { id: uid("skill"), nombre: "Paso de la Bestia Fantasma", nivel: 1, nivelMax: 5, incremento: "+40% movilidad", clase: "Crecimiento", tier: "S-" as Tier, definicion: "Movilidad y post-ataque.", personajes: [] };
                  const b1: Bonus = { id: uid("bonus"), nombre: "Entrenamiento Fuerza", descripcion: "+5 puntos de Fuerza por nivel", objetivo: "Fuerza", modo: "Puntos", cantidadPorNivel: 5, nivelMax: 10 };
                  const b2: Bonus = { id: uid("bonus"), nombre: "Bendición Vital", descripcion: "+2% Vitalidad por nivel", objetivo: "Vitalidad", modo: "Porcentaje", cantidadPorNivel: 2, nivelMax: 20 };
                  const ch1: Character = { id: uid("char"), nombre: "Naruto", especie: "Dragón-Uzumaki", descripcion: "Líder de Uzushiogakure.", nivel: 1, stats: { Fuerza:{ valor:100, rango: classifyStat(100).sub }, Resistencia:{ valor:100, rango: classifyStat(100).sub }, Destreza:{ valor:100, rango: classifyStat(100).sub }, Mente:{ valor:150, rango: classifyStat(150).sub }, Vitalidad:{ valor:100, rango: classifyStat(100).sub } }, habilidades: [], bonos: [] };
                  setStore({ skills: [sk1, sk2, sk3], characters: [ch1], evoLinks: [{ from: sk1.id, to: sk3.id }], bonuses: [b1,b2], extraStats: [] });
                }} className="gap-2"><Wand2 className="w-4 h-4"/>Demo</Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input placeholder="Buscar (nombre, clase, tier, especie)" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Tabs value={tab} onValueChange={setTab} className="hidden md:block">
                <TabsList>
                  <TabsTrigger value="skills">Habilidades</TabsTrigger>
                  <TabsTrigger value="chars">Personajes</TabsTrigger>
                  <TabsTrigger value="bonos">Bonificaciones</TabsTrigger>
                  <TabsTrigger value="evo">Síntesis/Evolución</TabsTrigger>
                  <TabsTrigger value="rank">Rankings</TabsTrigger>
                  <TabsTrigger value="species">Especies</TabsTrigger>
                </TabsList>
              </Tabs>
              {/* Botón limpiar edición (móvil/desktop) */}
              {(editingCharId || editingBonusId || editingSkillId) && (
                <Button variant="ghost" size="icon" onClick={clearEdits} title="Cancelar edición"><X className="w-4 h-4"/></Button>
              )}
            </div>
          </div>
          {/* Tabs móviles (full width) */}
          <Tabs value={tab} onValueChange={setTab} className="md:hidden">
            <TabsList className="w-full">
              <TabsTrigger value="skills" className="flex-1">Habilidades</TabsTrigger>
              <TabsTrigger value="chars" className="flex-1">Personajes</TabsTrigger>
              <TabsTrigger value="bonos" className="flex-1">Bonos</TabsTrigger>
              <TabsTrigger value="evo" className="flex-1">Evolución</TabsTrigger>
              <TabsTrigger value="rank" className="flex-1">Rank</TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Barra de acciones compacta para móvil */}
          <div className="sm:hidden flex items-center gap-2 px-1 py-2 border-t">
            <Input type="file" accept="application/json" onChange={handleImport} className="w-full" />
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2"><Download className="w-4 h-4"/></Button>
            <Button variant="outline" size="sm" onClick={() => alert('Usa el botón Demo en desktop para cargar datos ejemplo.') } className="gap-2"><Wand2 className="w-4 h-4"/></Button>
          </div>
        </div>

        {/* Contenido principal */}
        <div className="mt-3 md:mt-6 space-y-4">
          {/* SKILLS */}
          {tab === "skills" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Section title={editingSkill ? `Editar Habilidad — ${editingSkill.nombre}` : "Nueva / Editar Habilidad"} actions={editingSkill && (<Button variant="outline" onClick={() => setEditingSkillId(null)}>Cancelar</Button>)}>
                <SkillForm
                key={editingSkill?.id ?? "new-skill"}
                initial={editingSkill}
                characters={store.characters}
                onSubmit={async (s) => { await upsertSkill(s); setEditingSkillId(null); await loadData(); }}
              />
              </Section>

              <Section title={`Listado de Habilidades (${filteredSkills.length})`}>
                <div className="text-xs opacity-70 mb-2">Campos: Nivel, Nivel Máx, Incremento, Clase, Tier, Definición, Personajes.</div>
                <div className="divide-y overflow-x-auto">
                  {filteredSkills.length === 0 && <div className="text-sm opacity-70">No hay habilidades aún.</div>}
                  {filteredSkills.map((s) => (<SkillRow key={s.id} s={s} onEdit={() => setEditingSkillId(s.id)} onDelete={() => deleteSkill(s.id)} />))}
                </div>
              </Section>

              <Section title="Editor de Síntesis/Evolución">
                <EvolutionEditor skills={store.skills} links={store.evoLinks} onAdd={(a, b) => addEvoLink(a, b)} />
              </Section>
            </div>
          )}

          {/* CHARACTERS */}
          {tab === "chars" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Section title={editingChar ? `Editar Personaje — ${editingChar.nombre}` : "Nuevo / Editar Personaje"} actions={editingChar && (<Button variant="outline" onClick={() => setEditingCharId(null)}>Cancelar</Button>)}>
                <CharacterForm
                key={editingChar?.id ?? "new-char"}
                skills={store.skills}
                bonuses={store.bonuses}
                onSubmit={(c) => upsertCharacter(c)}
                initial={editingChar}
                extraStats={store.extraStats}
              />
              </Section>

              <Section title={`Listado de Personajes (${filteredChars.length})`}>
                <div className="divide-y">
                  {filteredChars.length === 0 && <div className="text-sm opacity-70">No hay personajes aún.</div>}
                  {filteredChars.map((c) => (
                    <CharacterRow key={c.id} c={c} skillsById={skillsById} bonuses={store.bonuses} onEdit={() => setEditingCharId(c.id)} onDelete={() => deleteCharacter(c.id)} />
                  ))}
                </div>
              </Section>

              <Section title="Estadísticas Globales (añadir nuevas)">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Añadir estadística global</Label>
                    <div className="flex gap-2">
                      <Input id="new-global-stat" placeholder="Ej: Chakra, Fe, Suerte" />
                      <Button variant="outline" onClick={() => {
                        const el = document.getElementById("new-global-stat") as HTMLInputElement | null;
                        const name = el?.value.trim();
                        if (!name) return; addExtraStat(name); if (el) el.value = "";
                      }} className="gap-2"><Plus className="w-4 h-4"/>Añadir</Button>
                    </div>
                    <div className="text-xs opacity-70">Estas stats aparecerán en el editor de cada personaje.</div>
                  </div>
                  <div>
                    <Label>Actuales</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {[...DEFAULT_STATS, ...store.extraStats].map(s => (<Badge key={s as string} className="rounded-2xl">{s as string}</Badge>))}
                    </div>
                  </div>
                </div>
              </Section>
            </div>
          )}

          {/* BONUSES */}
          {tab === "bonos" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Section title={editingBonus ? `Editar Bonificación — ${editingBonus.nombre}` : "Nueva / Editar Bonificación"} actions={editingBonus && (<Button variant="outline" onClick={() => setEditingBonusId(null)}>Cancelar</Button>)}>
                <BonusForm
                key={editingBonus?.id ?? "new-bonus"}
                initial={editingBonus}
                statOptions={statOptions}
                onSubmit={async (b) => { await upsertBonus(b); setEditingBonusId(null); }}
              />
              </Section>

              <Section title={`Listado de Bonificaciones (${filteredBonuses.length})`}>
                <div className="divide-y">
                  {filteredBonuses.length === 0 && <div className="text-sm opacity-70">No hay bonificaciones aún.</div>}
                  {filteredBonuses.map((b) => (
                    <BonusRow key={b.id} b={b} onEdit={() => setEditingBonusId(b.id)} onDelete={() => deleteBonus(b.id)} />
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* EVOLUTIONS quick view */}
          {tab === "evo" && (
            <Section title="Navegador de Síntesis / Evoluciones">
              <EvolutionEditor skills={store.skills} links={store.evoLinks} onAdd={(a, b) => addEvoLink(a, b)} />
            </Section>
          )}

          
          {tab === "species" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Section title={editingSpeciesId ? "Editar Especie" : "Nueva Especie"} actions={editingSpeciesId && (<Button variant="outline" onClick={() => setEditingSpeciesId(null)}>Cancelar</Button>)}>
                <SpeciesForm
                  initial={store.species.find(s => s.id === editingSpeciesId) ?? undefined}
                  statOptions={[...DEFAULT_STATS as any, ...store.extraStats]}
                  onSubmit={async (s) => { await upsertSpecies(s); setEditingSpeciesId(null); }}
                />
              </Section>
              <Section title={\`Listado de Especies (\${store.species.length})\`}>
                <div className="divide-y">
                  {store.species.length === 0 && <div className="text-sm opacity-70">No hay especies aún.</div>}
                  {store.species.map((s) => (
                    <SpeciesRow key={s.id} s={s} onEdit={() => setEditingSpeciesId(s.id)} onDelete={() => deleteSpecies(s.id)} />
                  ))}
                </div>
              </Section>
            </div>
          )}
{tab === "rank" && (
            <Section title="Rankings por Estadística">
              <Leaderboard characters={store.characters} bonuses={store.bonuses} statOptions={statOptions} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}



function SpeciesForm({ initial, onSubmit, statOptions }: { initial?: Species; onSubmit: (s: Species) => void; statOptions: string[]; }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [eq, setEq] = useState<Record<string, Equivalencia>>(() => {
    const base: Record<string, Equivalencia> = {};
    statOptions.forEach(s => { base[s] = initial?.equivalencias?.[s] ?? { unidad: "", valorPorPunto: 0 }; });
    return base;
  });

  function setEqField(stat: string, patch: Partial<Equivalencia>) {
    setEq(prev => ({ ...prev, [stat]: { ...(prev[stat] || { unidad: "", valorPorPunto: 0 }), ...patch } }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const s of statOptions) {
      const it = eq[s];
      if (!it || !it.unidad.trim() || !(it.valorPorPunto > 0)) {
        alert(`Completa equivalencias para '${s}' (unidad y valorPorPunto > 0).`);
        return;
      }
    }
    const out: Species = { id: initial?.id ?? (globalThis.crypto?.randomUUID?.() ?? uid("spec")), nombre, descripcion, equivalencias: eq };
    onSubmit(out);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre de especie"><Input value={nombre} onChange={(e)=>setNombre(e.target.value)} placeholder="Ej: Humano, Uzumaki, Dragón" /></Field>
        <Field label="Descripción"><Input value={descripcion} onChange={(e)=>setDescripcion(e.target.value)} placeholder="Opcional" /></Field>
      </div>
      <Section title="Equivalencias por punto (obligatorio)">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {statOptions.map(stat => {
            const item = eq[stat];
            return (
              <Card key={stat} className="p-3">
                <div className="font-medium">{stat}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 items-center">
                  <Label>Unidad</Label>
                  <Input className="col-span-2" value={item.unidad} onChange={(e)=>setEqField(stat, { unidad: e.target.value })} placeholder={stat==="Inteligencia" ? "chakra" : stat==="Fuerza" ? "kg" : "unidad"} />
                  <Label>Valor/Punto</Label>
                  <Input inputMode="numeric" type="number" min={0} step="any" className="col-span-2" value={item.valorPorPunto} onChange={(e)=>setEqField(stat, { valorPorPunto: parseFloat(e.target.value || "0") })} />
                </div>
                {stat==="Mente" && (
                  <div className="text-[11px] opacity-70 mt-2">
                    Nota: Mente es derivada (equilibrio INT↔SAB). Puedes registrar unidad/escala si quieres convertirla.
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </Section>
      <div className="flex justify-end gap-2">
        <Button type="submit" className="gap-2"><Save className="w-4 h-4" />Guardar especie</Button>
      </div>
    </form>
  );
}

function SpeciesRow({ s, onEdit, onDelete }: { s: Species; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b">
      <div className="col-span-12 sm:col-span-5">
        <div className="font-medium truncate">{s.nombre}</div>
        <div className="text-xs opacity-70 line-clamp-1">{s.descripcion}</div>
      </div>
      <div className="col-span-12 sm:col-span-5 text-xs">
        <div className="flex flex-wrap gap-1">
          {Object.entries(s.equivalencias).slice(0,4).map(([k,v]) => (
            <Badge key={k} className="rounded-2xl">{k}: 1pt = {v.valorPorPunto} {v.unidad}</Badge>
          ))}
          {Object.keys(s.equivalencias).length > 4 && <Badge className="rounded-2xl">+{Object.keys(s.equivalencias).length - 4}</Badge>}
        </div>
      </div>
      <div className="col-span-12 sm:col-span-2 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="w-4 h-4"/></Button>
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button>
      </div>
    </div>
  );
}
