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
import { Plus, Save, Download, Trash2, ChevronRight, Link2, Wand2, Settings2, Minus } from "lucide-react";
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

// Base ranks (visual). El rango real guardado será el sub-rango (p.ej. "Jounin Bajo").
const BASE_RANKS = [
  "Humano","Genin","Chunnin","Jounin","Kage","Bijuu","Catástrofe","Deidad"
] as const;
type BaseRank = typeof BASE_RANKS[number];
// El rango real admite cualquier etiqueta (subrango completo)
type Rank = string;

// Tabla de clasificación automática por valor → (base, subnivel)
const STAT_CLASS_TABLE: { base: BaseRank; sub: string; min: number; max: number | null }[] = [
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

function classifyStat(value: number): { base: BaseRank; sub: string } {
  const v = Math.floor(Number.isFinite(value) ? value : 0);
  if (v <= 0) return { base: "Humano", sub: "Humano Bajo" };
  const hit = STAT_CLASS_TABLE.find(row => (v >= row.min) && (row.max === null || v <= row.max));
  return hit ? { base: hit.base, sub: hit.sub } : { base: "Deidad", sub: "Deidad Élite" };
}

const DEFAULT_STATS = [
  "Fuerza","Resistencia","Destreza","Mente","Vitalidad","Inteligencia","Sabiduría"
] as const;

type StatKey = typeof DEFAULT_STATS[number] | string;

// Bonificaciones (por nivel) que afectan una estadística objetivo
type BonusMode = "Porcentaje" | "Puntos";

// ⬇️ Pon esto donde tienes los tipos (junto a Bonus/Character/Skill)

type BonusTarget = {
  stat: StatKey;
  modo: BonusMode;            // "Porcentaje" | "Puntos"
  cantidadPorNivel: number;   // por nivel
};

type Bonus = {
  id: string;
  nombre: string;
  descripcion: string;

  // ✅ Nuevo (opcional, multi-objetivo)
  objetivos?: BonusTarget[];

  // ♻️ Legacy (un solo objetivo) — mantenido para compatibilidad
  objetivo?: StatKey;
  modo?: BonusMode;
  cantidadPorNivel?: number;

  nivelMax: number;
};


type Character = {
  id: string;
  nombre: string;
  especie: string;
  descripcion: string;
  nivel: number; // nivel del personaje
  stats: Record<StatKey, { valor: number; rango: Rank }>; // rango real (sub)
  habilidades: { skillId: string; nivel: number }[];
  bonos: { bonusId: string; nivel: number }[]; // bonificaciones aplicadas con su nivel
};

type Skill = {
  id: string;
  nombre: string;
  nivel: number;
  nivelMax: number;
  incremento: string; // "15%", "+20 ch", etc.
  clase: SkillClass;
  tier: Tier;
  definicion: string;
  personajes: string[]; // ids de personajes que la poseen
};

// Grafos de síntesis/evolución manual (aristas dirigidas parent -> child)

type EvoLink = { from: string; to: string };

type Store = {
  skills: Skill[];
  characters: Character[];
  evoLinks: EvoLink[];
  bonuses: Bonus[];
  extraStats: string[]; // nombres de stats adicionales creados por el usuario
};

const EMPTY_STORE: Store = { skills: [], characters: [], evoLinks: [], bonuses: [], extraStats: [] };

const LS_KEY = "miniapp-habilidades-personajes-v1";

/**********************
 * Helpers            *
 **********************/

function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function downloadJSON(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isUUID(v?: string): boolean {
  return !!v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v);
}

// Calcula valor efectivo de una stat aplicando bonificaciones del personaje
function calcEffectiveStat(c: Character, key: StatKey, bonuses: Bonus[]): number {
  const base = c.stats[key]?.valor ?? 0;
  if (!c.bonos?.length) return base;

  let flat = 0;
  let perc = 0;

  for (const assign of c.bonos) {
    const b = bonuses.find(x => x.id === assign.bonusId);
    if (!b) continue;
    const lvl = Math.max(0, Math.min(assign.nivel ?? 0, b.nivelMax));

    if (b.objetivos && b.objetivos.length > 0) {
      // ✅ Nuevo formato: múltiples objetivos
      for (const target of b.objetivos) {
        if (target.stat !== key) continue;
        if (target.modo === "Puntos") flat += (target.cantidadPorNivel ?? 0) * lvl;
        else if (target.modo === "Porcentaje") perc += ((target.cantidadPorNivel ?? 0) / 100) * lvl;
      }
    } else {
      // ♻️ Formato legacy: un solo objetivo
      if (b.objetivo !== key) continue;
      if (b.modo === "Puntos") flat += (b.cantidadPorNivel ?? 0) * lvl;
      else if (b.modo === "Porcentaje") perc += ((b.cantidadPorNivel ?? 0) / 100) * lvl;
    }
  }

  return Math.max(0, Math.round((base * (1 + perc) + flat) * 100) / 100);
}



/**********************
 * UI Primitives      *
 **********************/

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Card className="border border-gray-200">
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        <div className="flex gap-2">{actions}</div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      <Label className="text-sm font-medium opacity-80">{label}</Label>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <Badge className="rounded-2xl px-2 py-1 text-xs">{children}</Badge>;
}

/**********************
 * Skill Components   *
 **********************/

function SkillForm({
  onSubmit,
  initial,
  characters,
}: {
  onSubmit: (s: Skill) => void;
  initial?: Skill;
  characters: Character[];
}) {
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
    const base: Skill = {
      id: initial?.id ?? uid("skill"),
      nombre,
      nivel,
      nivelMax,
      incremento,
      clase,
      tier,
      definicion,
      personajes,
    };
    onSubmit(base);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Asedio Carmesí" />
        </Field>
        <Field label="Clase">
          <Select value={clase} onValueChange={(v) => setClase(v as SkillClass)}>
            <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>
              {SKILL_CLASSES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Nivel">
          <Input type="number" min={0} value={nivel} onChange={(e) => setNivel(parseInt(e.target.value || "0"))} />
        </Field>
        <Field label="Nivel Máx">
          <Input type="number" min={1} value={nivelMax} onChange={(e) => setNivelMax(parseInt(e.target.value || "1"))} />
        </Field>
        <Field label="Incremento (%, unidad)">
          <Input value={incremento} onChange={(e) => setIncremento(e.target.value)} placeholder="Ej: +20 ch / 15%" />
        </Field>
        <Field label="Tier">
          <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
            <SelectTrigger><SelectValue placeholder="Tier" /></SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Definición">
        <Textarea value={definicion} onChange={(e) => setDefinicion(e.target.value)} placeholder="Breve explicación de la habilidad" />
      </Field>
      <Field label="Personajes que la tienen">
        <div className="flex flex-wrap gap-2">
          {characters.map((ch) => {
            const checked = personajes.includes(ch.id);
            return (
              <Button
                key={ch.id}
                type="button"
                variant={checked ? "default" : "outline"}
                className="rounded-2xl px-3 py-1 text-xs"
                onClick={() => setPersonajes((prev) => checked ? prev.filter(id => id !== ch.id) : [...prev, ch.id])}
              >
                {ch.nombre}
              </Button>
            );
          })}
        </div>
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar habilidad</Button>
      </div>
    </form>
  );
}

function SkillRow({ s, onEdit, onDelete }: { s: Skill; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b">
      <div className="col-span-4">
        <div className="font-medium">{s.nombre}</div>
        <div className="text-xs opacity-70 line-clamp-1">{s.definicion}</div>
      </div>
      <div className="col-span-2 flex gap-2"><Pill>{s.clase}</Pill><Pill>{s.tier}</Pill></div>
      <div className="col-span-2 text-sm">{s.nivel}/{s.nivelMax}</div>
      <div className="col-span-2 text-sm">{s.incremento}</div>
      <div className="col-span-2 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="w-4 h-4"/></Button>
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button>
      </div>
    </div>
  );
}

function EvolutionEditor({ skills, links, onAdd }: { skills: Skill[]; links: EvoLink[]; onAdd: (from: string, to: string) => void }) {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // construir arbol simple: raíces = skills sin ningún incoming
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

  function Tree({ id, depth = 0 }: { id: string; depth?: number }) {
    const kids = childrenOf[id] || [];
    return (
      <div className="ml-2">
        <div className="flex items-center gap-2 text-sm">
          <ChevronRight className="w-4 h-4"/>
          <span className="font-medium">{byId[id]?.nombre}</span>
          <Badge className="rounded-2xl text-[10px]">{byId[id]?.tier}</Badge>
        </div>
        <div className="ml-4 border-l pl-2">
          {kids.map((k) => <Tree key={k} id={k} depth={depth+1} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label>De</Label>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger><SelectValue placeholder="Habilidad base"/></SelectTrigger>
            <SelectContent>
              {skills.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label>A</Label>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger><SelectValue placeholder="Síntesis/Evolución"/></SelectTrigger>
            <SelectContent>
              {skills.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={!from || !to || from === to} onClick={() => { onAdd(from, to); setFrom(""); setTo(""); }} className="gap-2">
          <Link2 className="w-4 h-4"/> Vincular
        </Button>
      </div>

      <div className="space-y-2">
        {roots.length === 0 && <div className="text-sm opacity-70">No hay raíces definidas. Crea vínculos para ver el árbol.</div>}
        {roots.map(r => <Tree key={r.id} id={r.id} />)}
      </div>
    </div>
  );
}

/**********************
 * Bonus Components   *
 **********************/

function BonusForm({ initial, onSubmit, statOptions }: { initial?: Bonus; onSubmit: (b: Bonus) => void; statOptions: string[] }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [objetivo, setObjetivo] = useState<StatKey>(initial?.objetivo ?? (statOptions[0] as StatKey));
  const [modo, setModo] = useState<BonusMode>(initial?.modo ?? "Puntos");
  const [cantidadPorNivel, setCantidadPorNivel] = useState<number>(initial?.cantidadPorNivel ?? 1);
  const [nivelMax, setNivelMax] = useState<number>(initial?.nivelMax ?? 5);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const out: Bonus = {
      id: initial?.id ?? uid("bonus"),
      nombre, descripcion, objetivo, modo, cantidadPorNivel, nivelMax,
    };
    onSubmit(out);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={nombre} onChange={(e)=>setNombre(e.target.value)} placeholder="Ej: Entrenamiento de Fuerza"/></Field>
        <Field label="Objetivo">
          <Select value={String(objetivo)} onValueChange={(v)=>setObjetivo(v)}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              {statOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
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
        <Field label="Cant. por nivel">
          <Input type="number" value={cantidadPorNivel} onChange={(e)=>setCantidadPorNivel(parseFloat(e.target.value || "0"))} />
        </Field>
        <Field label="Nivel Máx">
          <Input type="number" min={1} value={nivelMax} onChange={(e)=>setNivelMax(parseInt(e.target.value || "1"))} />
        </Field>
      </div>
      <Field label="Descripción"><Textarea value={descripcion} onChange={(e)=>setDescripcion(e.target.value)} placeholder="Describe el efecto por nivel"/></Field>
      <div className="flex justify-end">
        <Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar bonificación</Button>
      </div>
    </form>
  );
}

function BonusRow({ b, onEdit, onDelete }: { b: Bonus; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b">
      <div className="col-span-4">
        <div className="font-medium">{b.nombre}</div>
        <div className="text-xs opacity-70 line-clamp-1">{b.descripcion}</div>
      </div>
      <div className="col-span-3 text-xs flex flex-wrap gap-2">
        <Pill>{String(b.objetivo)}</Pill>
        <Pill>{b.modo} / nivel: {b.cantidadPorNivel}</Pill>
      </div>
      <div className="col-span-3 text-sm">Nivel Máx: {b.nivelMax}</div>
      <div className="col-span-2 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="w-4 h-4"/></Button>
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button>
      </div>
    </div>
  );
}

/**********************
 * Character Components*
 **********************/

function StatEditor({ stats, onChange, extraStats, onAddStat }: {
  stats: Character["stats"]; 
  onChange: (k: StatKey, patch: Partial<{ valor: number; rango: Rank }>) => void;
  extraStats: string[];
  onAddStat: (name: string) => void;
}) {
  const [newStat, setNewStat] = useState("");
  const statKeys = useMemo(() => {
    const base = [...DEFAULT_STATS];
    extraStats.forEach(s => base.push(s as any));
    const set = new Set<string>(base as any);
    return Array.from(set);
  }, [extraStats]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {statKeys.map((k) => {
          const entry = stats[k] ?? { valor: 0, rango: "Humano Bajo" as Rank };
          const cls = classifyStat(entry.valor);
          return (
            <Card key={k} className="p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{k}</div>
                <div className="flex gap-2">
                  <Badge className="rounded-2xl" title="Base">{cls.base}</Badge>
                  <Badge className="rounded-2xl" title="Rango real">{cls.sub}</Badge>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 items-center">
                <Label>Valor</Label>
                <Input
                  type="number"
                  className="col-span-2"
                  value={entry.valor}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value || "0");
                    const derived = classifyStat(v);
                    onChange(k, { valor: v, rango: derived.sub });
                  }}
                />
                <div className="col-span-3 text-[11px] opacity-70">
                  La clasificación se actualiza automáticamente según el valor (se guarda el sub-rango real).
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
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

function CharacterForm({
  initial,
  onSubmit,
  skills,
  bonuses,
  extraStats,
}: {
  initial?: Character;
  onSubmit: (c: Character) => void;
  skills: Skill[];
  bonuses: Bonus[];
  extraStats: string[];
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [especie, setEspecie] = useState(initial?.especie ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [nivel, setNivel] = useState<number>(initial?.nivel ?? 1);
  const [stats, setStats] = useState<Character["stats"]>(initial?.stats ?? {});
  const [habilidades, setHabilidades] = useState<Character["habilidades"]>(initial?.habilidades ?? []);
  const [bonos, setBonos] = useState<Character["bonos"]>(initial?.bonos ?? []);

  function upStat(k: StatKey, patch: Partial<{ valor: number; rango: Rank }>) {
    setStats((prev) => ({ ...prev, [k]: { valor: patch.valor ?? prev[k]?.valor ?? 0, rango: (patch.rango ?? prev[k]?.rango ?? "Humano Bajo") as Rank } }));
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
      id: initial?.id ?? crypto.randomUUID(),
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
              <Input type="number" className="w-20" min={1} value={nivel} onChange={(e)=>setNivel(Math.max(1, parseInt(e.target.value || "1")))} />
              <Button type="button" variant="outline" size="icon" onClick={()=>setNivel(nivel+1)}><Plus className="w-4 h-4"/></Button>
            </div>
          </div>
        </Card>
      </div>

      <Field label="Descripción"><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Field>

      <Section title="Estadísticas (base)" actions={<></>}>
        <StatEditor stats={stats} onChange={upStat} extraStats={extraStats} onAddStat={() => {}}/>
      </Section>

      <Section title="Habilidades del personaje" actions={<></>}>
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {skills.map(s => {
              const has = !!habilidades.find(h => h.skillId === s.id);
              return (
                <Card key={s.id} className={`p-3 ${has ? "ring-1 ring-gray-300" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={has} onCheckedChange={() => toggleSkill(s.id)} />
                      <div>
                        <div className="font-medium">{s.nombre}</div>
                        <div className="text-xs opacity-70">{s.clase} · {s.tier}</div>
                      </div>
                    </div>
                    {has && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Nivel</Label>
                        <Input type="number" className="w-20 h-8" min={0} value={habilidades.find(h => h.skillId === s.id)?.nivel ?? 1} onChange={(e) => setSkillLevel(s.id, parseInt(e.target.value || "0"))} />
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </Section>

      <Section title="Bonificaciones aplicadas" actions={<></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {bonuses.length === 0 && <div className="text-sm opacity-70">No hay bonificaciones definidas. Ve a la pestaña Bonificaciones.</div>}
          {bonuses.map(b => {
            const has = !!bonos.find(x => x.bonusId === b.id);
            const lvl = bonos.find(x => x.bonusId === b.id)?.nivel ?? 0;
            return (
              <Card key={b.id} className={`p-3 ${has ? "ring-1 ring-gray-300" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={has} onCheckedChange={() => toggleBonus(b.id)} />
                    <div>
                      <div className="font-medium">{b.nombre}</div>
                      <div className="text-xs opacity-70">{String(b.objetivo)} · {b.modo} (+{b.cantidadPorNivel}/nivel) · Máx {b.nivelMax}</div>
                    </div>
                  </div>
                  {has && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Nivel</Label>
                      <Button type="button" size="icon" variant="outline" onClick={()=>setBonusLevel(b.id, Math.max(0, lvl-1))}><Minus className="w-4 h-4"/></Button>
                      <Input type="number" className="w-16 h-8" min={0} max={b.nivelMax} value={lvl} onChange={(e)=>setBonusLevel(b.id, parseInt(e.target.value || "0"))} />
                      <Button type="button" size="icon" variant="outline" onClick={()=>setBonusLevel(b.id, Math.min(b.nivelMax, lvl+1))}><Plus className="w-4 h-4"/></Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      <div className="flex justify-end gap-2">
        <Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar personaje</Button>
      </div>
    </form>
  );
}

function CharacterRow({ c, onEdit, onDelete, skillsById, bonuses }: { c: Character; onEdit: () => void; onDelete: () => void; skillsById: Record<string, Skill>; bonuses: Bonus[] }) {
  // calcular stats efectivas para las 3 primeras
  const entries = Object.entries(c.stats).slice(0,3);
  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b">
      <div className="col-span-3">
        <div className="font-medium">{c.nombre}</div>
        <div className="text-xs opacity-70 line-clamp-1">Lvl {c.nivel} · {c.especie} · {c.descripcion}</div>
      </div>
      <div className="col-span-3 text-xs">
        <div className="flex flex-wrap gap-1">
          {c.habilidades.slice(0, 4).map(h => (
            <Badge key={h.skillId} className="rounded-2xl">{skillsById[h.skillId]?.nombre ?? "?"} ({h.nivel})</Badge>
          ))}
          {c.habilidades.length > 4 && <Badge className="rounded-2xl">+{c.habilidades.length - 4}</Badge>}
        </div>
      </div>
      <div className="col-span-4 text-xs">
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
      <div className="col-span-2 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="w-4 h-4"/></Button>
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button>
      </div>
    </div>
  );
}

/**********************
 * Root App           *
 **********************/

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
    evoLinks:
      (evo_links ?? []).map((e: any) => ({ from: e.from_skill, to: e.to_skill })) ?? [],
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
  });
}, [setStore]);


  useEffect(() => {
    loadData();
  },  [loadData]);


  const skillsById = useMemo(() => Object.fromEntries(store.skills.map(s => [s.id, s])), [store.skills]);
  const statOptions = useMemo(() => Array.from(new Set<string>([...DEFAULT_STATS as any, ...store.extraStats])), [store.extraStats]);

  // Import/Export
  function handleExport() {
    downloadJSON("registro-habilidades-personajes.json", store);
  }

  function handleImport(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        setStore({ ...EMPTY_STORE, ...data });
      } catch {
        alert("Archivo inválido");
      }
    };
    reader.readAsText(file);
    ev.target.value = "";
  }

  // CRUD helpers: Skills
  async function upsertSkill(s: Skill) {
    try {
    // Si el id no es UUID (ej: "skill_abcd123"), generamos uno real para Postgres
    const id = isUUID(s.id) ? s.id : crypto.randomUUID();

    const { error } = await supabase
      .from("skills")
      .upsert({
        id,
        nombre: s.nombre,
        nivel: s.nivel,
        nivelMax: s.nivelMax,
        incremento: s.incremento,
        clase: s.clase,
        tier: s.tier,
        definicion: s.definicion,
        personajes: s.personajes ?? [],
      });

    if (error) {
      alert("Error guardando habilidad: " + error.message);
      return;
    }

    // refrescamos desde la BD para que quede sincronizado
    await loadData();
  } catch (err: any) {
    alert("Error guardando habilidad: " + (err?.message ?? String(err)));
}
}

  async function deleteSkill(id: string) {
  const { error } = await supabase.from("skills").delete().eq("id", id);
  if (error) { alert("Error eliminando habilidad: " + error.message); return; }

  setStore(prev => ({
    ...prev,
    skills: prev.skills.filter(s => s.id !== id),
    characters: prev.characters.map(ch => ({ ...ch, habilidades: ch.habilidades.filter(h => h.skillId !== id) })),
    evoLinks: prev.evoLinks.filter(l => l.from !== id && l.to !==id),
}));
}

  // CRUD helpers: Characters
  async function upsertCharacter(c: Character) {
  try {
    // Asegurar ID válido (evita "char_abc123" que da error en UUID)
    const id = isUUID(c.id) ? c.id : crypto.randomUUID();

    const { error } = await supabase.from("characters").upsert({
      id,
      nombre: c.nombre,
      especie: c.especie,
      descripcion: c.descripcion,
      nivel: c.nivel,
      stats: c.stats ?? {},
      habilidades: c.habilidades ?? [],
      bonos: c.bonos ?? []
    });

    if (error) {
      alert("Error guardando personaje: " + error.message);
      return;
    }

    await loadData(); // recarga la lista después de guardar
  } catch (err: any) {
    alert("Error guardando personaje: " + (err?.message ?? String(err)));
  }
}

async function deleteCharacter(id: string) {
  const { error } = await supabase.from("characters").delete().eq("id", id);
  if (error) return alert("Error eliminando personaje: " + error.message);
  setStore(prev => ({
    ...prev,
    characters: prev.characters.filter(c => c.id !== id),
    skills: prev.skills.map(s => ({ ...s, personajes: s.personajes.filter(pid => pid !== id) })),
  }));
}
async function upsertBonus(b: Bonus) {
  try {
    // ✅ Igual que en skills/characters: garantizar UUID válido
    const id = isUUID(b.id) ? b.id : crypto.randomUUID();

    const { data, error } = await supabase
      .from("bonuses")
      .upsert({
        id,
        nombre: b.nombre,
        descripcion: b.descripcion,
        objetivo: b.objetivo,
        modo: b.modo,
        cantidad_por_nivel: b.cantidadPorNivel,
        nivel_max: b.nivelMax,
        // Si más adelante usas multi-objetivo, aquí agregarías `objetivos`
      })
      .select()
      .single();

    if (error) return alert("Error guardando bonificación: " + error.message);

    const saved: Bonus = {
      id: data!.id,
      nombre: data!.nombre,
      descripcion: data!.descripcion,
      objetivo: data!.objetivo,
      modo: data!.modo,
      cantidadPorNivel: data!.cantidad_por_nivel,
      nivelMax: data!.nivel_max,
      // objetivos: data!.objetivos ?? undefined  // (cuando lo implementes)
    };

    setStore(prev => {
      const exists = prev.bonuses.some(x => x.id === saved.id);
      const bonuses = exists
        ? prev.bonuses.map(x => (x.id === saved.id ? saved : x))
        : [...prev.bonuses, saved];
      return { ...prev, bonuses };
    });
  } catch (err: any) {
    alert("Error guardando bonificación: " + (err?.message ?? String(err)));
  }
}

async function deleteBonus(id: string) {
  const { error } = await supabase.from("bonuses").delete().eq("id", id);
  if (error) return alert("Error eliminando bonificación: " + error.message);
  setStore(prev => ({
    ...prev,
    bonuses: prev.bonuses.filter(b => b.id !== id),
    characters: prev.characters.map(ch => ({ ...ch, bonos: ch.bonos?.filter(bb => bb.bonusId !== id) ?? [] })),
  }));
}

  // extras: stats globales
  async function addExtraStat(name: string) {
  const { error } = await supabase.from("extra_stats").upsert({ name });
  if (error) { alert("Error añadiendo stat: " + error.message); return; }
  setStore(prev => prev.extraStats.includes(name) ? prev : { ...prev, extraStats: [...prev.extraStats, name] });
}

  // Filtering
  const filteredSkills = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return store.skills;
    return store.skills.filter(s => (
      s.nombre.toLowerCase().includes(q) ||
      s.definicion.toLowerCase().includes(q) ||
      s.clase.toLowerCase().includes(q) ||
      s.tier.toLowerCase().includes(q)
    ));
  }, [store.skills, search]);

  const filteredChars = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return store.characters;
    return store.characters.filter(c => (
      c.nombre.toLowerCase().includes(q) ||
      c.especie.toLowerCase().includes(q) ||
      c.descripcion.toLowerCase().includes(q)
    ));
  }, [store.characters, search]);

  const filteredBonuses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return store.bonuses;
    return store.bonuses.filter(b => (
      b.nombre.toLowerCase().includes(q) ||
      b.descripcion.toLowerCase().includes(q) ||
      String(b.objetivo).toLowerCase().includes(q)
    ));
  }, [store.bonuses, search]);

  // seed rápido para probar
  function seedDemo() {
    const sk1: Skill = { id: uid("skill"), nombre: "Asedio Carmesí del Dragón", nivel: 1, nivelMax: 5, incremento: "+120% daño / +30% alcance", clase: "Activa", tier: "S", definicion: "Estallido ofensivo a gran escala.", personajes: [] };
    const sk2: Skill = { id: uid("skill"), nombre: "Marca de Protección", nivel: 1, nivelMax: 3, incremento: "+25% mitigación", clase: "Pasiva", tier: "A+", definicion: "Protege aliados cercanos.", personajes: [] };
    const sk3: Skill = { id: uid("skill"), nombre: "Paso de la Bestia Fantasma", nivel: 1, nivelMax: 5, incremento: "+40% movilidad", clase: "Crecimiento", tier: "S-", definicion: "Movilidad y post-ataque.", personajes: [] };
    const b1: Bonus = { id: crypto.randomUUID(), nombre: "Entrenamiento Fuerza", descripcion: "+5 puntos de Fuerza por nivel", objetivo: "Fuerza", modo: "Puntos", cantidadPorNivel: 5, nivelMax: 10 };
    const b2: Bonus = { id: crypto.randomUUID(), nombre: "Bendición Vital", descripcion: "+2% Vitalidad por nivel", objetivo: "Vitalidad", modo: "Porcentaje", cantidadPorNivel: 2, nivelMax: 20 };
    const ch1: Character = { id: uid("char"), nombre: "Naruto", especie: "Dragón-Uzumaki", descripcion: "Líder de Uzushiogakure.", nivel: 1, stats: { Fuerza:{ valor:100, rango: classifyStat(100).sub }, Resistencia:{ valor:100, rango: classifyStat(100).sub }, Destreza:{ valor:100, rango: classifyStat(100).sub }, Mente:{ valor:150, rango: classifyStat(150).sub }, Vitalidad:{ valor:100, rango: classifyStat(100).sub } }, habilidades: [], bonos: [] };
    setStore({ skills: [sk1, sk2, sk3], characters: [ch1], evoLinks: [{ from: sk1.id, to: sk3.id }], bonuses: [b1,b2], extraStats: [] });
  }

  // Character being edited
  const editingChar = useMemo(() => store.characters.find(c => c.id === editingCharId) || undefined, [store.characters, editingCharId]);
  const editingBonus = useMemo(
  () => store.bonuses.find(b => b.id === editingBonusId) || undefined,
  [store.bonuses, editingBonusId]
);
  const editingSkill = useMemo(
  () => store.skills.find(s => s.id === editingSkillId) || undefined,
  [store.skills, editingSkillId]
);

  async function addEvoLink(a: string, b: string) {
  const { error } = await supabase.from("evo_links").upsert({ from_skill: a, to_skill: b });
  if (error) {
    alert("Error creando vínculo de evolución: " + error.message);
    return;
  }

  setStore(prev => {
    // Evita duplicados
    const exists = prev.evoLinks.some(l => l.from === a && l.to === b);
    if (exists) return prev;
    return { ...prev, evoLinks: [...prev.evoLinks, { from: a, to: b }] };
  });
}

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Registro de Habilidades & Personajes</h1>
          <div className="flex items-center gap-2">
            <Input type="file" accept="application/json" onChange={handleImport} className="w-44" />
            <Button variant="outline" onClick={handleExport} className="gap-2"><Download className="w-4 h-4"/>Exportar JSON</Button>
            <Button variant="outline" onClick={seedDemo} className="gap-2"><Wand2 className="w-4 h-4"/>Demo</Button>
          </div>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <Input placeholder="Buscar (nombre, clase, tier, especie)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Tabs value={tab} onValueChange={setTab} className="hidden md:block">
            <TabsList>
              <TabsTrigger value="skills">Habilidades</TabsTrigger>
              <TabsTrigger value="chars">Personajes</TabsTrigger>
              <TabsTrigger value="bonos">Bonificaciones</TabsTrigger>
              <TabsTrigger value="evo">Síntesis/Evolución</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="md:hidden mb-3">
          <TabsList className="w-full">
            <TabsTrigger value="skills" className="flex-1">Habilidades</TabsTrigger>
            <TabsTrigger value="chars" className="flex-1">Personajes</TabsTrigger>
            <TabsTrigger value="bonos" className="flex-1">Bonificaciones</TabsTrigger>
            <TabsTrigger value="evo" className="flex-1">Evolución</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* SKILLS */}
        {tab === "skills" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section
                  title={editingSkill ? `Editar Habilidad — ${editingSkill.nombre}` : "Nueva / Editar Habilidad"}
                    actions={
                      editingSkill && (
                        <Button variant="outline" onClick={() => setEditingSkillId(null)}>
                        Cancelar
                        </Button>
                      )
                    }
            >
                <SkillForm
                  initial={editingSkill}                
                  characters={store.characters}
                  onSubmit={async (s) => {
                  await upsertSkill(s);                
                  setEditingSkillId(null);             
                  await loadData();                    
                  }}
                />
            </Section>

            <Section title={`Listado de Habilidades (${filteredSkills.length})`} actions={<></>}>
              <div className="text-xs opacity-70 mb-2">Campos: Nivel, Nivel Máx, Incremento (porcentaje o unidad), Clase (Activa/Pasiva/Crecimiento), Tier (F → SSS±), Definición, Personajes.</div>
              <div className="divide-y">
                {filteredSkills.length === 0 && <div className="text-sm opacity-70">No hay habilidades aún.</div>}
                {filteredSkills.map((s) => (
                  <SkillRow
                    key={s.id}
                    s={s}
                    onEdit={() => setEditingSkillId(s.id)}
                    onDelete={() => deleteSkill(s.id)}
                  />
              ))}
          </div>
            </Section>
            <Section title="Editor de Síntesis/Evolución" actions={<></>}>
              <EvolutionEditor
                skills={store.skills}
                links={store.evoLinks}
                onAdd={(a, b) => addEvoLink(a, b)}
              />
            </Section>
          </div>
        )}

        {/* CHARACTERS */}
        {tab === "chars" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title={editingChar ? `Editar Personaje — ${editingChar.nombre}` : "Nuevo / Editar Personaje"} actions={<></>}>
              <CharacterForm
                skills={store.skills}
                bonuses={store.bonuses}
                onSubmit={(c) => upsertCharacter(c)}
                initial={editingChar}
                extraStats={store.extraStats}
              />
            </Section>
            <Section title={`Listado de Personajes (${filteredChars.length})`} actions={<></>}>
              <div className="divide-y">
                {filteredChars.length === 0 && <div className="text-sm opacity-70">No hay personajes aún.</div>}
                {filteredChars.map((c) => (
                  <CharacterRow key={c.id} c={c} skillsById={skillsById} bonuses={store.bonuses}
                    onEdit={() => setEditingCharId(c.id)}
                    onDelete={() => deleteCharacter(c.id)}
                  />
                ))}
              </div>
            </Section>
            <Section title="Estadísticas Globales (añadir nuevas)" actions={<></>}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Añadir estadística global</Label>
                  <div className="flex gap-2">
                    <Input id="new-global-stat" placeholder="Ej: Chakra, Fe, Suerte" />
                    <Button variant="outline" onClick={() => {
                      const el = document.getElementById("new-global-stat") as HTMLInputElement | null;
                      const name = el?.value.trim();
                      if (!name) return;
                      addExtraStat(name);
                      if (el) el.value = "";
                    }} className="gap-2"><Plus className="w-4 h-4"/>Añadir</Button>
                  </div>
                  <div className="text-xs opacity-70">Estas stats aparecerán en el editor de cada personaje.</div>
                </div>
                <div>
                  <Label>Actuales</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[...DEFAULT_STATS, ...store.extraStats].map(s => (
                      <Badge key={s as string} className="rounded-2xl">{s as string}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          </div>
        )}

        {/* BONUSES */}
        {tab === "bonos" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section
              title={editingBonus ? `Editar Bonificacion - ${editingBonus.nombre}` : "Nueva / Editar Bonificacion"}
                actions={
                  editingBonus && (
                <Button variant="outline" onClick={() => setEditingBonusId(null)}>
                Cancelar
              </Button>
            )
          }
          >
            <BonusForm
             initial={editingBonus}
              statOptions={statOptions}
       onSubmit={async (b) => {
          await upsertBonus(b);
          setEditingBonusId(null);
        }}
       />
          </Section>

            <Section title={`Listado de Bonificaciones (${filteredBonuses.length})`} actions={<></>}>
              <div className="divide-y">
                {filteredBonuses.length === 0 && <div className="text-sm opacity-70">No hay bonificaciones aún.</div>}
                {filteredBonuses.map((b) => (
                  <BonusRow
                      key={b.id}
                      b={b}
                      onEdit={() => setEditingBonusId(b.id)}   // Abre edición en el formulario
                      onDelete={() => deleteBonus(b.id)}
                  />
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* EVOLUTIONS quick view */}
        {tab === "evo" && (
          <Section title="Navegador de Síntesis / Evoluciones" actions={<></>}>
            <EvolutionEditor
              skills={store.skills}
              links={store.evoLinks}
              onAdd={(a, b) => addEvoLink(a, b)}
            />
          </Section>
        )}
      </div>
    </div>
  );
}