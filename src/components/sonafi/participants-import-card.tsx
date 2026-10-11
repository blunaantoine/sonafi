"use client";

import * as React from "react";
import {
  Upload,
  FileSpreadsheet,
  FileJson,
  Download,
  Loader2,
  FileUp,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ParsedParticipant {
  id: string;
  name: string;
}

/* -------------------------------------------------------------------------- */
/*  Tiny CSV/JSON parsers (no external lib)                                   */
/* -------------------------------------------------------------------------- */

/** Split a single CSV line, honouring quoted fields and "" escapes. */
function splitCsvLine(line: string, separator: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === separator) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

function parseCsv(text: string): ParsedParticipant[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    throw new Error("CSV invalide : en-tête + au moins une ligne requise.");
  }

  // Detect separator. Default comma; fall back to ";" if the header has no
  // comma (some French exports use semicolons).
  let separator = ",";
  if (!lines[0].includes(",")) {
    separator = ";";
  }
  let header = splitCsvLine(lines[0], separator).map((h) => h.toLowerCase());

  // Tolerant fallback: if comma yields a single column and ";" is present,
  // retry with ";".
  if (header.length < 2 && separator === "," && lines[0].includes(";")) {
    separator = ";";
    header = splitCsvLine(lines[0], separator).map((h) => h.toLowerCase());
  }

  const idIdx = header.indexOf("id");
  const nameIdx = header.indexOf("name");
  if (idIdx === -1 || nameIdx === -1) {
    throw new Error(
      "CSV invalide : l'en-tête doit contenir les colonnes « id » et « name ».",
    );
  }

  const result: ParsedParticipant[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], separator);
    const id = (cols[idIdx] ?? "").trim();
    const name = (cols[nameIdx] ?? "").trim();
    if (!id && !name) continue; // skip blank lines
    if (!id || !name) {
      throw new Error(
        `Ligne ${i + 1} : « id » et « name » sont tous deux requis.`,
      );
    }
    result.push({ id, name });
  }
  if (result.length === 0) {
    throw new Error("Aucune ligne valide trouvée dans le CSV.");
  }
  return result;
}

function parseJson(text: string): ParsedParticipant[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(
      "JSON invalide : " + (err instanceof Error ? err.message : "format incorrect"),
    );
  }
  if (!Array.isArray(data)) {
    throw new Error("Le JSON doit être un tableau d'objets { id, name }.");
  }
  const result: ParsedParticipant[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    if (!row || typeof row !== "object") {
      throw new Error(`Entrée ${i + 1} : objet attendu.`);
    }
    const obj = row as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!id || !name) {
      throw new Error(`Entrée ${i + 1} : « id » et « name » sont requis.`);
    }
    result.push({ id, name });
  }
  if (result.length === 0) {
    throw new Error("Aucune entrée valide dans le JSON.");
  }
  return result;
}

async function parseFile(file: File): Promise<{
  participants: ParsedParticipant[];
  format: "csv" | "json";
}> {
  const text = await file.text();
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json")) {
    return { participants: parseJson(text), format: "json" };
  }
  if (lower.endsWith(".csv")) {
    return { participants: parseCsv(text), format: "csv" };
  }
  // Unknown extension — sniff.
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return { participants: parseJson(text), format: "json" };
    } catch {
      return { participants: parseCsv(text), format: "csv" };
    }
  }
  return { participants: parseCsv(text), format: "csv" };
}

/* -------------------------------------------------------------------------- */
/*  Sample template download                                                   */
/* -------------------------------------------------------------------------- */

function downloadCsvTemplate() {
  const sample =
    "id,name\n" +
    "ID0001,Aïssatou Diallo\n" +
    "ID0002,Fatou Ndiaye\n" +
    "ID0003,Mariama Sow\n";
  const blob = new Blob(["\uFEFF" + sample], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modele-participants-sonafi.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

interface ParticipantsImportCardProps {
  onImported: () => void;
}

export function ParticipantsImportCard({
  onImported,
}: ParticipantsImportCardProps) {
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = React.useState<{
    participants: ParsedParticipant[];
    format: "csv" | "json";
    fileName: string;
  } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const handleFile = React.useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      try {
        const result = await parseFile(file);
        setParsed({ ...result, fileName: file.name });
        toast({
          title: "Fichier analysé",
          description: `${result.participants.length} participantes trouvées dans « ${file.name} ».`,
        });
      } catch (err) {
        setParsed(null);
        toast({
          variant: "destructive",
          title: "Fichier invalide",
          description: err instanceof Error ? err.message : "Erreur d'analyse.",
        });
      }
    },
    [toast],
  );

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const res = await fetch("/api/sonafi/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participants: parsed.participants }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; message?: string; count?: number }
        | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.message ?? "Erreur lors de l'import.");
      }
      toast({
        title: "Import réussi",
        description:
          data.count != null
            ? `${data.count} noms importés.`
            : "Noms importés.",
      });
      setParsed(null);
      onImported();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Échec de l'import",
        description: err instanceof Error ? err.message : "Erreur inconnue.",
      });
    } finally {
      setImporting(false);
    }
  };

  const preview = parsed?.participants.slice(0, 5) ?? [];
  const total = parsed?.participants.length ?? 0;

  return (
    <Card className="border-emerald-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-800">
          <FileUp className="h-5 w-5" />
          Importer les noms des participantes
        </CardTitle>
        <CardDescription>
          Glissez un fichier <span className="font-medium">CSV</span> ou{" "}
          <span className="font-medium">JSON</span> contenant les colonnes{" "}
          <code className="rounded bg-emerald-50 px-1 py-0.5 text-[0.8em] text-emerald-700">
            id
          </code>{" "}
          et{" "}
          <code className="rounded bg-emerald-50 px-1 py-0.5 text-[0.8em] text-emerald-700">
            name
          </code>
          . L'import met à jour les noms existants (ré-import possible).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Dropzone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Choisir un fichier à importer"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            void handleFile(file);
          }}
          className={cn(
            "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
            dragging
              ? "border-emerald-500 bg-emerald-50"
              : "border-emerald-200/70 hover:border-emerald-400 hover:bg-emerald-50/40",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json,application/json,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              void handleFile(file);
              e.target.value = ""; // allow re-uploading same file
            }}
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground">
            Glissez un fichier ici ou cliquez pour parcourir
          </p>
          <p className="text-xs text-muted-foreground">
            Formats acceptés : .csv, .json · jusqu'à 500 lignes
          </p>
        </div>

        {/* Template download */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadCsvTemplate}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Download className="h-4 w-4" />
            Télécharger un modèle CSV
          </Button>
        </div>

        {/* Preview */}
        {parsed && (
          <div className="flex flex-col gap-3 rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                {parsed.format === "json" ? (
                  <FileJson className="h-4 w-4" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                {parsed.fileName}
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {total} participantes seront importées
              </span>
            </div>

            <div className="overflow-x-auto rounded-md border border-emerald-100 bg-background">
              <Table>
                <TableHeader>
                  <TableRow className="bg-emerald-50/60 hover:bg-emerald-50/60">
                    <TableHead className="w-28 text-emerald-800">ID</TableHead>
                    <TableHead className="text-emerald-800">Nom</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs text-emerald-700">
                        {p.id}
                      </TableCell>
                      <TableCell className="text-sm">{p.name}</TableCell>
                    </TableRow>
                  ))}
                  {total > preview.length && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={2}
                        className="text-center text-xs text-muted-foreground"
                      >
                        … et {total - preview.length} autres
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleImport}
                disabled={importing || total === 0}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {importing ? "Import en cours…" : "Importer"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setParsed(null)}
                disabled={importing}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
