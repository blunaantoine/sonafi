"use client";

import { useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Loader2,
  ShieldCheck,
  X,
  Utensils,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AccessCodeRole } from "@/lib/access-codes";

interface RoleGateProps {
  /** Which role this gate grants. Determines the title/icon/colour. */
  role: AccessCodeRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the code is verified server-side. */
  onSuccess: (code: string) => void;
}

const ROLE_META: Record<
  AccessCodeRole,
  { title: string; desc: string; icon: typeof ShieldCheck; accent: string; placeholder: string }
> = {
  admin: {
    title: "Espace gestionnaire",
    desc: "Saisissez le code administrateur pour accéder à la gestion des pauses, badges et statistiques.",
    icon: ShieldCheck,
    accent: "#1E3A6E",
    placeholder: "Code administrateur",
  },
  restauration: {
    title: "Équipe restauration",
    desc: "Saisissez le code restauration pour scanner les pauses (café, déjeuner).",
    icon: Utensils,
    accent: "#E8590C",
    placeholder: "Code restauration",
  },
  verification: {
    title: "Équipe vérification",
    desc: "Saisissez le code vérification pour enregistrer les entrées de chaque jour.",
    icon: ClipboardCheck,
    accent: "#0F766E",
    placeholder: "Code vérification",
  },
};

/**
 * Access-code dialog that grants a role. Calls /api/sonafi/auth/verify with the
 * role + code; only on a 200 response does the client switch to that role. For
 * admin, the verified code is stashed in sessionStorage so privileged actions
 * (pause override, day change, settings) can re-send it server-side. The role
 * in localStorage alone is never enough — the server always re-validates.
 */
export function RoleGate({ role, open, onOpenChange, onSuccess }: RoleGateProps) {
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Latest onOpenChange, for the popstate listener below (stale-closure safe).
  const onOpenChangeRef = useRef(onOpenChange);
  const meta = ROLE_META[role];
  const Icon = meta.icon;

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  // Reset state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setCode("");
      setShowCode(false);
      setError(null);
      setLoading(false);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Phone back button closes the gate instead of leaving the page: a history
  // entry is pushed while the dialog is open; popstate (Android back /
  // iOS swipe) then closes the gate. Closing via the X / Retour button pops
  // the pushed entry so history never accumulates stale states.
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ sonafiGate: true }, "");
    const onPopState = () => onOpenChangeRef.current(false);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (window.history.state?.sonafiGate) window.history.back();
    };
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sonafi/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, code: code.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { valid?: boolean };
      if (res.ok && data.valid) {
        // For admin, stash the code so privileged actions can re-send it.
        if (role === "admin") {
          try {
            sessionStorage.setItem("sonafi.adminPin", code.trim());
          } catch {
            /* ignore */
          }
        }
        onSuccess(code.trim());
        onOpenChange(false);
      } else {
        setError("Code incorrect.");
      }
    } catch {
      setError("Vérification impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div
            className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: `${meta.accent}1A`, color: meta.accent }}
          >
            <Icon className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">{meta.title}</DialogTitle>
          <DialogDescription className="text-center">{meta.desc}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            {/* Codes are ALPHANUMERIC (e.g. "sonafi2025") — inputMode must NOT
                be numeric: a numeric keypad cannot type letters at all on
                mobile, which made the code impossible to enter. Plain text
                keyboard, autocomplete/capitalisation disabled so mobile
                keyboards never mangle the value. */}
            <Input
              ref={inputRef}
              type={showCode ? "text" : "password"}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder={meta.placeholder}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="pl-9 pr-10 text-center tracking-widest"
              disabled={loading}
            />
            {/* Show/hide toggle — codes mix letters and digits, being able to
                read what was typed is essential on a phone. */}
            <button
              type="button"
              onClick={() => setShowCode((v) => !v)}
              aria-label={showCode ? "Masquer le code" : "Afficher le code"}
              title={showCode ? "Masquer le code" : "Afficher le code"}
              disabled={loading}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showCode ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-sm text-rose-600">
              <X className="h-4 w-4" />
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            style={{ backgroundColor: meta.accent }}
            disabled={loading || code.trim().length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Vérification…
              </>
            ) : (
              "Accéder"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Retour
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Backward-compatible alias for the old admin-only usage. */
export function AdminGate(props: Omit<RoleGateProps, "role">) {
  return <RoleGate role="admin" {...props} />;
}
