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
import { Plus, Save, Trash2, Settings2, Minus } from "lucide-react";

// ---------------- Tipos ----------------
type SkillClass = "Activa" | "Pasiva" | "Crecimiento";
type Tier =
  | "F" | "E" | "D" | "C"
  | "B-" | "B" | "B+"
  | "A-" | "A" | "A+"
  | "S-" | "S" | "S+"
  | "SS-" | "SS" | "SS+"
  | "SSS-" | "SSS" | "SSS+";

const DEFAULT_STATS = [
  "Fuerza","Resistencia","Destreza","Mente","Vitalidad","Inteligencia","Sabiduría"
] as const;
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
type Bonus = {
  id: string;
  nombre: string;
  descripcion: string;
  objetivo: StatKey;
  modo: BonusMode;
  cantidadPorNivel: number;
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
};

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
  characters: Character[];
  bonuses: Bonus[];
  extraStats: string[];
  species: Species[];
};

const EMPTY_STORE: Store = { skills:[], characters:[], bonuses:[], extraStats:[], species:[] };

// ---------------- Utils ----------------
function uid(prefix = "id"): string { return `${prefix}_${Math.random().toString(36).slice(2, 9)}`; }
function isUUID(v?: string): boolean { return !!v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v); }
function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
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

// ---------------- UI helpers ----------------
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

// ---------------- Formularios: Especie ----------------
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

// ---------------- Formularios: Habilidad ----------------
function SkillForm({ initial, onSubmit }: { initial?: Skill; onSubmit: (s: Skill) => void; }) {
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
        <Field label="Nombre"><Input value={nombre} onChange={(e)=>setNombre(e.target.value)} /></Field>
        <Field label="Clase">
          <Select value={clase} onValueChange={(v)=>setClase(v as SkillClass)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Activa","Pasiva","Crecimiento"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Nivel"><Input type="number" value={nivel} onChange={(e)=>setNivel(parseInt(e.target.value || "0"))}/></Field>
        <Field label="Nivel Máx"><Input type="number" value={nivelMax} onChange={(e)=>setNivelMax(parseInt(e.target.value || "1"))}/></Field>
        <Field label="Incremento"><Input value={incremento} onChange={(e)=>setIncremento(e.target.value)} placeholder="Ej: +20 ch / 15%"/></Field>
        <Field label="Tier">
          <Select value={tier} onValueChange={(v)=>setTier(v as Tier)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-60 overflow-auto">
              {["F","E","D","C","B-","B","B+","A-","A","A+","S-","S","S+","SS-","SS","SS+","SSS-","SSS","SSS+"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Definición"><Textarea value={definicion} onChange={(e)=>setDefinicion(e.target.value)} /></Field>
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

// ---------------- Formularios: Bonificación ----------------
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
        <Field label="Nombre"><Input value={nombre} onChange={(e)=>setNombre(e.target.value)} /></Field>
        <Field label="Objetivo">
          <Select value={String(objetivo)} onValueChange={(v)=>setObjetivo(v)}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent className="max-h-60 overflow-auto">
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
        <Field label="Cant. por nivel"><Input type="number" value={cantidadPorNivel} onChange={(e)=>setCantidadPorNivel(parseFloat(e.target.value || "0"))} /></Field>
        <Field label="Nivel Máx"><Input type="number" min={1} value={nivelMax} onChange={(e)=>setNivelMax(parseInt(e.target.value || "1"))} /></Field>
      </div>
      <Field label="Descripción"><Textarea value={descripcion} onChange={(e)=>setDescripcion(e.target.value)} /></Field>
      <div className="flex justify-end"><Button type="submit" className="gap-2"><Save className="w-4 h-4"/>Guardar bonificación</Button></div>
    </form>
  );
}

function BonusRow({ b, onEdit, onDelete }: { b: Bonus; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2 py-2 border-b">
      <div className="col-span-12 sm:col-span-6">
        <div className="font-medium truncate">{b.nombre}</div>
        <div className="text-xs opacity-70 line-clamp-1">{b.descripcion}</div>
      </div>
      <div className="col-span-6 sm:col-span-4 text-xs flex flex-wrap gap-2">
        <Pill>{String(b.objetivo)}</Pill>
        <Pill>{b.modo} +{b.cantidadPorNivel}/nivel</Pill>
        <Pill>Máx {b.nivelMax}</Pill>
      </div>
      <div className="col-span-12 sm:col-span-2 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="w-4 h-4"/></Button>
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4"/></Button>
      </div>
    </div>
  );
}

// ---------------- Stats Editor ----------------
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl-grid-cols-3 gap-3">
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

// ---------------- Personaje ----------------
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
    const intelKey = Object.keys(stats).find((s) => s.toLowerCase() === "inteligencia") ?? "Inteligencia";
    const sabKey   = Object.keys(stats).find((s) => ["sabiduría","sabiduria"].includes(s.toLowerCase()) || s.toLowerCase().startsWith("sabid")) ?? "Sabiduría";
    const intelVal = stats[intelKey]?.valor ?? 0; const sabVal = stats[sabKey]?.valor ?? 0;
    const mindVal  = sp?.allowMind ? computeMind(intelVal, sabVal) : 0;

    let finalStats: Character["stats"] = { ...stats, Mente: { valor: mindVal, rango: classifyStat(mindVal).sub } };

    if (sp?.baseMods?.length) {
      let flat: Record<string, number> = {}; let perc: Record<string, number> = {};
      for (const m of sp.baseMods) {
        if (m.modo === "Puntos") flat[m.stat] = (flat[m.stat] ?? 0) + (m.cantidad * nivel);
        else perc[m.stat] = (perc[m.stat] ?? 0) + (m.cantidad / 100);
      }
      for (const k of Object.keys(finalStats)) {
        const base = finalStats[k].valor ?? 0;
        const withPerc = base * (1 + (perc[k] ?? 0));
        const withFlat = withPerc + (flat[k] ?? 0);
        finalStats[k] = { valor: Math.round(withFlat * 100) / 100, rango: classifyStat(withFlat).sub };
      }
    }

    const out: Character = { id: initial?.id ?? uid("char"), nombre, especie: finalSpeciesName, descripcion, nivel, stats: finalStats, habilidades: [], bonos };
    onSubmit(out);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
        <Field label="Especie">
          <div className="flex gap-2 items-center">
            <Select value={selectedSpecies?.id ?? ""} onValueChange={(id) => {
              if (id === "__custom__") return; const sp = species.find(s => s.id === id); setEspecie(sp?.nombre ?? "");
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

      <Section title="Bonificaciones">
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

// ---------------- App Principal ----------------
export default function MiniApp() {
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [tab, setTab] = useState("skills");
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editingBonusId, setEditingBonusId] = useState<string | null>(null);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [editingSpeciesId, setEditingSpeciesId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const { data: skills }       = await supabase.from("skills").select("*");
      const { data: characters }   = await supabase.from("characters").select("*");
      const { data: bonuses }      = await supabase.from("bonuses").select("*");
      const { data: extra_stats }  = await supabase.from("extra_stats").select("*");
      const { data: species, error: spErr } = await supabase.from("species").select("*").order("nombre", { ascending: true });
      if (spErr) console.error("[species] load error:", spErr);

      setStore({
        skills: (skills ?? []).map((s: any) => ({ id: s.id, nombre: s.nombre, nivel: s.nivel, nivelMax: s.nivelMax, incremento: s.incremento, clase: s.clase, tier: s.tier, definicion: s.definicion })),
        characters: (characters ?? []) as Character[],
        bonuses: (bonuses ?? []).map((b: any) => ({ id: b.id, nombre: b.nombre, descripcion: b.descripcion, objetivo: b.objetivo, modo: b.modo, cantidadPorNivel: b.cantidad_por_nivel, nivelMax: b.nivel_max })) as Bonus[],
        extraStats: (extra_stats ?? []).map((e: any) => e.name) ?? [],
        species: (species ?? []).map((s: any) => ({ id: s.id, nombre: s.nombre, descripcion: s.descripcion ?? "", equivalencias: (s.equivalencias ?? {}) as Record<string, Equivalencia>, allowMind: !!s.allow_mind, baseMods: (s.base_mods ?? []) as SpeciesBaseMod[] })),
      });
    } catch (err) { console.error("loadData() error:", err); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const statOptions = useMemo(() => Array.from(new Set<string>([...DEFAULT_STATS as any, ...store.extraStats])), [store.extraStats]);

  // Persistencia
  async function upsertSkill(s: Skill) {
    const id = isUUID(s.id) ? s.id : uid("skill");
    const { error } = await supabase.from("skills").upsert({ id, nombre: s.nombre, nivel: s.nivel, nivelMax: s.nivelMax, incremento: s.incremento, clase: s.clase, tier: s.tier, definicion: s.definicion });
    if (error) alert("Error guardando habilidad: " + error.message); await loadData();
  }
  async function deleteSkill(id: string) {
    const { error } = await supabase.from("skills").delete().eq("id", id);
    if (error) alert("Error eliminando habilidad: " + error.message);
    setStore(prev => ({ ...prev, skills: prev.skills.filter(s => s.id !== id) }));
  }

  async function upsertBonus(b: Bonus) {
    const id = isUUID(b.id) ? b.id : uid("bonus");
    const { error } = await supabase.from("bonuses").upsert({ id, nombre: b.nombre, descripcion: b.descripcion, objetivo: b.objetivo, modo: b.modo, cantidad_por_nivel: b.cantidadPorNivel, nivel_max: b.nivelMax });
    if (error) alert("Error guardando bonificación: " + error.message); await loadData();
  }
  async function deleteBonus(id: string) {
    const { error } = await supabase.from("bonuses").delete().eq("id", id);
    if (error) alert("Error eliminando bonificación: " + error.message);
    setStore(prev => ({ ...prev, bonuses: prev.bonuses.filter(b => b.id !== id) }));
  }

  async function upsertCharacter(c: Character) {
    const id = isUUID(c.id) ? c.id : uid("char");
    const { error } = await supabase.from("characters").upsert({ id, nombre: c.nombre, especie: c.especie, descripcion: c.descripcion, nivel: c.nivel, stats: c.stats ?? {}, habilidades: c.habilidades ?? [], bonos: c.bonos ?? [] });
    if (error) alert("Error guardando personaje: " + error.message); await loadData();
  }
  async function deleteCharacter(id: string) {
    const { error } = await supabase.from("characters").delete().eq("id", id);
    if (error) alert("Error eliminando personaje: " + error.message);
    setStore(prev => ({ ...prev, characters: prev.characters.filter(c => c.id !== id) }));
  }

  async function upsertSpecies(s: Species) {
    const id = isUUID(s.id) ? s.id : uid("spec");
    const { error } = await supabase.from("species").upsert({ id, nombre: s.nombre, descripcion: s.descripcion, equivalencias: s.equivalencias, allow_mind: s.allowMind, base_mods: s.baseMods ?? [] });
    if (error) alert("Error guardando especie: " + error.message); await loadData();
  }
  async function deleteSpecies(id: string) {
    const { error } = await supabase.from("species").delete().eq("id", id);
    if (error) alert("Error eliminando especie: " + error.message); await loadData();
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
        </TabsList>

        {/* HABILIDADES */}
        <TabsContent value="skills" className="mt-4 space-y-3">
          <Section title={editingSkill ? "Editar habilidad" : "Nueva habilidad"} actions={editingSkill && <Button variant="outline" onClick={()=>setEditingSkillId(null)}>Cancelar</Button>}>
            <SkillForm initial={editingSkill ?? undefined} onSubmit={(s)=>{ setEditingSkillId(null); upsertSkill(s); }} />
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
            <BonusForm initial={editingBonus ?? undefined} onSubmit={(b)=>{ setEditingBonusId(null); upsertBonus(b); }} statOptions={statOptions} />
          </Section>
          <Section title={`Listado de bonificaciones (${store.bonuses.length})`}>
            <div className="divide-y">
              {store.bonuses.map(b => <BonusRow key={b.id} b={b} onEdit={()=>setEditingBonusId(b.id)} onDelete={()=>deleteBonus(b.id)} />)}
            </div>
          </Section>
        </TabsContent>

        {/* PERSONAJES */}
        <TabsContent value="characters" className="mt-4 space-y-3">
          <Section title={editingChar ? "Editar personaje" : "Nuevo personaje"} actions={editingChar && <Button variant="outline" onClick={()=>setEditingCharId(null)}>Cancelar</Button>}>
            <CharacterForm key={editingChar?.id ?? "new-char"} bonuses={store.bonuses} onSubmit={(c) => { setEditingCharId(null); upsertCharacter(c); }} initial={editingChar ?? undefined} species={store.species} />
          </Section>
          <Section title={`Listado de personajes (${store.characters.length})`}>
            <div className="text-sm opacity-70">Para abreviar, no renderizamos la lista completa aquí.</div>
          </Section>
        </TabsContent>

        {/* ESPECIES */}
        <TabsContent value="species" className="mt-4 space-y-3">
          <Section title={editingSpec ? "Editar especie" : "Nueva especie"} actions={editingSpec && <Button variant="outline" onClick={()=>setEditingSpeciesId(null)}>Cancelar</Button>}>
            <SpeciesForm initial={editingSpec ?? undefined} onSubmit={(s)=>{ setEditingSpeciesId(null); upsertSpecies(s); }} statOptions={statOptions} />
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
      </Tabs>
    </div>
  );
}
