"use client";

import * as React from "react";
import {
  Search,
  RefreshCw,
  Pencil,
  Users,
  Loader2,
  CircleDashed,
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  TOTAL_PARTICIPANTS,
  type Participant,
} from "@/lib/sonafi";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** A participant is considered "named" when their name isn't the placeholder. */
function isPlaceholderName(p: Participant): boolean {
  return p.name === `Participant ${p.id}`;
}

interface ParticipantsListProps {
  participants: Participant[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onEdited: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Edit dialog                                                                */
/* -------------------------------------------------------------------------- */

interface EditDialogProps {
  participant: Participant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function EditNameDialog({
  participant,
  open,
  onOpenChange,
  onSaved,
}: EditDialogProps) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Sync input value when the target changes.
  React.useEffect(() => {
    setName(participant?.name ?? "");
  }, [participant]);

  if (!participant) return null;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({
        variant: "destructive",
        title: "Nom requis",
        description: "Veuillez saisir un nom.",
      });
      return;
    }
    if (trimmed === participant.name) {
      // No change — just close.
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sonafi/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participants: [{ id: participant.id, name: trimmed }],
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; message?: string; count?: number }
        | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.message ?? "Échec de l'enregistrement.");
      }
      toast({
        title: "Nom mis à jour",
        description: `${participant.id} → ${trimmed}`,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur inconnue.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-800">
            <Pencil className="h-4 w-4" />
            Modifier le nom
          </DialogTitle>
          <DialogDescription>
            Badge{" "}
            <span className="font-mono font-medium text-emerald-700">
              {participant.id}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="edit-name"
            className="text-sm font-medium text-foreground"
          >
            Nom de la participante
          </label>
          <Input
            id="edit-name"
            value={name}
            autoFocus
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saving) {
                e.preventDefault();
                void handleSave();
              }
            }}
            placeholder="Ex. Aïssatou Diallo"
            className="h-11"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main list                                                                  */
/* -------------------------------------------------------------------------- */

export function ParticipantsList({
  participants,
  loading,
  error,
  onRefresh,
  onEdited,
}: ParticipantsListProps) {
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [editTarget, setEditTarget] = React.useState<Participant | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);

  // Debounce the search filter ~250ms.
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const namedCount = React.useMemo(
    () => participants.reduce((n, p) => (isPlaceholderName(p) ? n : n + 1), 0),
    [participants],
  );
  // Use the actual participant count as the denominator so the progress bar is
  // correct after the admin changes the configured total.
  const totalCount = participants.length || TOTAL_PARTICIPANTS;
  const namedPercent = Math.round(
    (namedCount / Math.max(totalCount, 1)) * 100,
  );

  const filtered = React.useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q),
    );
  }, [participants, debounced]);

  const openEdit = (p: Participant) => {
    setEditTarget(p);
    setEditOpen(true);
  };

  const showSkeleton = loading && participants.length === 0;
  const showEmpty = !loading && !error && filtered.length === 0;

  return (
    <Card className="border-emerald-100">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-emerald-800">
              <Users className="h-5 w-5" />
              Liste des participantes
            </CardTitle>
            <CardDescription>
              {participants.length} participantes · recherche par identifiant
              ou nom
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualiser
          </Button>
        </div>

        {/* Progress summary */}
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-emerald-900">
              {namedCount} / {totalCount} avec nom réel
            </p>
            <Badge
              variant="secondary"
              className="rounded-full border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs text-emerald-800"
            >
              {namedPercent}%
            </Badge>
          </div>
          <Progress
            value={namedPercent}
            className="h-2 bg-emerald-100 [&>div]:bg-emerald-600"
          />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par ID ou nom…"
            className="h-11 pl-9"
            aria-label="Rechercher une participante"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Scrollable list */}
        <div
          className={cn(
            "max-h-[28rem] overflow-y-auto overflow-x-hidden rounded-md border border-emerald-100",
            // Custom scrollbar styling (webkit)
            "[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-emerald-300/70 [&::-webkit-scrollbar-thumb:hover]:bg-emerald-400 [&::-webkit-scrollbar-track]:bg-emerald-50/50 [scrollbar-width]:thin",
          )}
        >
          {showSkeleton ? (
            <div className="flex flex-col divide-y divide-emerald-50">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3"
                >
                  <Skeleton className="h-9 w-20 rounded-md" />
                  <Skeleton className="h-4 flex-1 rounded-md" />
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
              ))}
            </div>
          ) : showEmpty ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
              <CircleDashed className="h-8 w-8 text-emerald-300" />
              <p className="text-sm font-medium text-foreground">
                Aucune participante trouvée
              </p>
              <p className="text-xs">
                {search
                  ? `Aucun résultat pour « ${search} ».`
                  : "La liste est vide. Importez un fichier ou réessayez."}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <ul className="flex flex-col divide-y divide-emerald-50 md:hidden">
                {filtered.map((p) => {
                  const placeholder = isPlaceholderName(p);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 p-3"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-mono text-xs font-medium text-emerald-700">
                          {p.id}
                        </span>
                        <span
                          className={cn(
                            "truncate text-sm",
                            placeholder && "italic text-muted-foreground",
                          )}
                        >
                          {p.name}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(p)}
                        aria-label={`Modifier le nom de ${p.id}`}
                        className="h-11 w-11 shrink-0 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop: table */}
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-emerald-50/80 backdrop-blur hover:bg-emerald-50/80">
                    <TableHead className="w-28 text-emerald-800">ID</TableHead>
                    <TableHead className="text-emerald-800">Nom</TableHead>
                    <TableHead className="w-24 text-right text-emerald-800">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const placeholder = isPlaceholderName(p);
                    return (
                      <TableRow key={p.id} className="hover:bg-emerald-50/40">
                        <TableCell className="font-mono text-xs font-medium text-emerald-700">
                          {p.id}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-sm",
                            placeholder && "italic text-muted-foreground",
                          )}
                        >
                          {p.name}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(p)}
                            aria-label={`Modifier le nom de ${p.id}`}
                            className="h-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                          >
                            <Pencil className="h-4 w-4" />
                            Modifier
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </div>

        {/* Footer count */}
        {!showSkeleton && !showEmpty && (
          <p className="text-xs text-muted-foreground">
            {filtered.length} affichée{filtered.length === 1 ? "" : "s"}
            {search ? ` (filtré sur « ${search} »)` : ""}
          </p>
        )}
      </CardContent>

      <EditNameDialog
        participant={editTarget}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onEdited}
      />
    </Card>
  );
}
