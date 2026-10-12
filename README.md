# Sommet Sonafi — Gestion des pauses

Application web de gestion des pauses pour le **Sommet national de la jeune fille (Sonafi)**.
Chaque participante reçoit un badge avec un code QR unique ; les agents scannent
le badge à chaque pause pour valider son passage et empêcher les doublons.

## Fonctionnalités

- **Scanner** (mode par défaut, plein écran) : scan QR par la caméra du téléphone,
  pause automatique selon l'heure (8h–11h café, 11h+ déjeuner), retour visuel
  vert/rouge immédiat.
- **Admin** (protégé par code PIN) :
  - Forcer la pause en cours (en cas de retard) — partagé entre tous les téléphones.
  - Gérer le **nombre de participantes** (crée/retire des badges IDxxxx).
  - Générer et imprimer les badges QR.
  - Importer les vrais noms (CSV / JSON) et éditer la liste.
  - Tableau de bord en temps réel (passages par jour / par pause, activité récente).

## Pile technique

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS 4** + **shadcn/ui**
- **Prisma** ORM + **SQLite**
- `html5-qrcode` (scan caméra), `qrcode.react` (génération de badges)

## Démarrage

```bash
bun install
bun run db:push     # crée les tables
# (optionnel) peupler 500 participantes par défaut :
curl -X POST http://localhost:3000/api/sonafi/participants \
  -H "Content-Type: application/json" -d '{"seed": true}'
bun run dev
```

L'application démarre sur `http://localhost:3000`.

## Configuration

| Variable      | Description                              | Défaut       |
| ------------- | ---------------------------------------- | ------------ |
| `DATABASE_URL`| Chemin de la base SQLite                 | (voir `.env`)|
| `ADMIN_PIN`   | Code PIN pour l'espace administrateur   | `sonafi2025` |

> ⚠️ Changez `ADMIN_PIN` en production (variable d'environnement).

## Mise en ligne (VPS)

La caméra nécessite **HTTPS**. Déployez sur un VPS avec un nom de domaine et un
certificat (Let's Encrypt), puis placez l'application derrière un reverse proxy
HTTPS (Caddy, Nginx). Vérifiez la connexion sur plusieurs téléphones avant
l'événement.

## Sécurité

- Le code PIN est vérifié côté serveur à chaque action sensible (override de
  pause, changement du nombre de participantes).
- Le rôle « admin » dans le navigateur ne suffit pas — le serveur revalide
  toujours le PIN.
- Les participantes déjà scannées ne sont jamais supprimées lorsqu'on réduit le
  nombre (l'historique des scans est préservé).
