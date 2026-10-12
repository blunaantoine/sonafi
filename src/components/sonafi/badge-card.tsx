"use client";

import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import type { Participant } from "@/lib/sonafi";

export interface BadgeCardProps {
  participant: Participant;
  /** Number of event days printed in the badge footer (defaults to 3). */
  days?: number;
  className?: string;
}

/**
 * A single printable badge for the Sommet Sonafi.
 *
 * Print geometry (see BadgesTab PRINT_CSS): each badge is cut at 50mm wide ×
 * 59.4mm tall — a 4 × 5 grid = exactly 20 badges per A4 portrait page.
 * (5 rows of the requested 6cm would need 300mm, but A4 is 297mm tall, so the
 * cut height is 297/5 = 59.4mm — visually identical to 6cm.)
 *
 * The QR code payload is the participant's random, non-sequential token (NOT
 * the human-readable id) so badges can't be guessed or duplicated. The id
 * (e.g. 24UVD) is shown on the badge for management only. The Scan tab scans
 * the token; the scan/entry APIs look up the participant by token.
 */
export function BadgeCard({ participant, days = 3, className }: BadgeCardProps) {
  const displayName =
    participant.name?.trim() || `Participant ${participant.id}`;
  // The QR encodes the secret token (falls back to the id if no token yet).
  const qrValue = participant.token || participant.id;

  return (
    <div
      className={cn(
        "sonafi-badge relative flex flex-col overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm",
        className,
      )}
    >
      {/* Header strip — emerald/teal branding */}
      <div className="sonafi-badge-head bg-gradient-to-r from-emerald-600 to-teal-600 px-2 py-1 text-center text-white">
        <div className="sonafi-badge-title text-[10px] font-bold uppercase tracking-[0.18em] leading-tight sm:text-[11px]">
          Sommet Sonafi
        </div>
        <div className="sonafi-badge-subtitle text-[7px] leading-tight opacity-90 sm:text-[8px]">
          Sommet national de la jeune fille
        </div>
      </div>

      {/* Body — QR + id + name */}
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-2 py-2">
        <div className="rounded-md bg-white p-1 ring-1 ring-emerald-100">
          <QRCodeSVG
            // The secret token — non-sequential, can't be guessed.
            value={qrValue}
            size={120}
            level="M"
            marginSize={1}
            bgColor="#ffffff"
            fgColor="#0f172a"
            className="sonafi-qr-svg h-[104px] w-[104px] sm:h-[120px] sm:w-[120px]"
            title={`Badge ${participant.id} — Sommet Sonafi`}
          />
        </div>
        <div className="sonafi-badge-id font-mono text-base font-bold tracking-tight text-emerald-900 sm:text-lg">
          {participant.id}
        </div>
        <div className="sonafi-badge-name line-clamp-2 max-w-full text-center text-[10px] leading-tight text-muted-foreground sm:text-[11px]">
          {displayName}
        </div>
      </div>

      {/* Footer — event summary (days is admin-configurable 1–10) */}
      <div className="sonafi-badge-foot border-t border-emerald-100 bg-emerald-50/60 px-2 py-1 text-center text-[9px] font-medium tracking-wide text-emerald-700 sm:text-[10px]">
        {days} jour{days > 1 ? "s" : ""} · 2 pauses
      </div>
    </div>
  );
}

export default BadgeCard;
