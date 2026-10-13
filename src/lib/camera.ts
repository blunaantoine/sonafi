/**
 * Shared camera helpers for the two Sonafi scanners (restauration +
 * verification).
 *
 * getUserMedia / html5-qrcode produce heterogeneous errors across browsers
 * (DOMException with a `name`, html5-qrcode's own Error subclasses, plain
 * strings…). These helpers normalise them into:
 *  - `rawErrorLabel`  — the technical "Name: message" string, shown on screen
 *                       in small print so event-day support can diagnose.
 *  - `friendlyCameraError` — actionable French copy for the main message.
 */

/** Technical label (err.name: err.message) for on-screen diagnostics. */
export function rawErrorLabel(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/** Actionable French message for a camera failure. */
export function friendlyCameraError(err: unknown): string {
  // Combine name + message: some browsers only set one of the two.
  const s = rawErrorLabel(err);

  if (/NotAllowedError|PermissionDenied/i.test(s)) {
    return "Accès à la caméra refusé. Ouvrez les réglages du navigateur (icône 🔒 dans la barre d'adresse), autorisez la caméra, puis réessayez.";
  }
  if (/NotFoundError|DevicesNotFoundError|CameraNotFound/i.test(s)) {
    return "Aucune caméra détectée sur cet appareil. Sur iPhone, utilisez Safari.";
  }
  if (/OverconstrainedError|ConstraintNotSatisfied/i.test(s)) {
    return "Caméra incompatible avec les réglages du scanner. Utilisez le bouton « Scanner via photo » ci-dessous.";
  }
  if (/NotReadableError|TrackStartError|NotReadable/i.test(s)) {
    return "La caméra est déjà utilisée par une autre application. Fermez-la, puis réessayez.";
  }
  if (/AbortError/i.test(s)) {
    return "La caméra a été interrompue par le système. Fermez les autres applications, puis réessayez.";
  }
  if (/InsecureContext|HTTPS|getUserMedia|mediaDevices/i.test(s)) {
    return "La caméra nécessite une connexion HTTPS sécurisée. Le site doit être servi en HTTPS, pas en HTTP.";
  }
  return "Impossible d'activer la caméra. Utilisez « Scanner via photo » ci-dessous, ou envoyez la ligne technique affichée plus bas à l'organisateur.";
}
