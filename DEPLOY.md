# Déploiement VPS — Sommet Sonafi (port 3005)

> Sur ce VPS, les ports **3001 à 3004 sont déjà occupés** par d'autres
> applications (3004 = site Lousha). Sonafi tourne donc sur le **port 3005**.
> Tout autre port libre convient aussi — adaptez simplement les commandes.
>
> Remplacez `IP_DU_VPS` par l'adresse IP publique de votre serveur partout
> ci-dessous.

---

## 1. Installation (première fois)

```bash
# ── 1.1 Connexion au VPS ─────────────────────────────────────────────
ssh root@IP_DU_VPS

# ── 1.2 Installer Bun (runtime JavaScript) ───────────────────────────
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
which bun        # → /root/.bun/bin/bun (notez ce chemin pour systemd)

# ── 1.3 Récupérer le code source ─────────────────────────────────────
mkdir -p /opt && cd /opt
git clone https://github.com/blunaantoine/sonafi.git
cd sonafi

# ── 1.4 Fichier d'environnement (CHANGEZ LES CODES !) ────────────────
mkdir -p db
cat > .env <<'EOF'
DATABASE_URL=file:/opt/sonafi/db/custom.db
ADMIN_PIN=sonafi2025
RESTAURATION_CODE=resto2025
VERIFICATION_CODE=verif2025
EOF
# ⚠️ Remplacez les 3 codes par des codes solides avant l'événement.

# ── 1.5 Dépendances + base de données ────────────────────────────────
bun install
bun run db:generate
bun run db:push

# ── 1.6 Build de production ──────────────────────────────────────────
bun run build

# ── 1.7 Test manuel sur le port 3005 (Ctrl+C pour arrêter) ───────────
PORT=3005 bun run start
# Dans un autre terminal :
curl -I http://localhost:3005        # → HTTP/1.1 200 OK
```

---

## 2. Service systemd (démarrage auto + redémarrage en cas de crash)

```bash
# Adaptez /root/.bun/bin/bun si `which bun` a donné un autre chemin.
sudo tee /etc/systemd/system/sonafi.service > /dev/null <<'EOF'
[Unit]
Description=Sommet Sonafi (Next.js) - port 3005
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sonafi
Environment=NODE_ENV=production
Environment=PORT=3005
Environment=HOSTNAME=0.0.0.0
EnvironmentFile=/opt/sonafi/.env
ExecStart=/root/.bun/bin/bun .next/standalone/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now sonafi

# Vérifier que le service tourne :
systemctl status sonafi
curl -I http://localhost:3005
```

---

## 3. Commandes utiles (au quotidien)

```bash
systemctl status sonafi          # état du service
sudo systemctl restart sonafi    # redémarrer l'application
sudo systemctl stop sonafi       # arrêter l'application
journalctl -u sonafi -f          # logs en direct
journalctl -u sonafi -n 100      # 100 dernières lignes de logs
```

---

## 4. Mise à jour de l'application (plus tard)

```bash
cd /opt/sonafi
git pull
bun install
bun run db:push
bun run build
sudo systemctl restart sonafi
```

---

## 5. Ouvrir le port 3005 (accès direct par IP, sans domaine)

```bash
sudo ufw allow 3005/tcp
```

→ L'application est alors accessible sur `http://IP_DU_VPS:3005`.

> ⚠️ **Important — caméra du scanner** : les téléphones n'autorisent l'accès
> caméra (scan des badges QR) qu'en **HTTPS**. L'accès direct par IP convient
> pour l'espace gestionnaire depuis un ordinateur, mais **pas** pour scanner
> depuis un téléphone. Passez par l'étape 6 pour obtenir HTTPS.

---

## 6. HTTPS + domaine `sonafi.oquitogo.com` (recommandé — requis pour le scan)

**Prérequis DNS** : dans votre gestionnaire de domaine, créez un
enregistrement **A** : `sonafi.oquitogo.com` → `IP_DU_VPS`.
Vérifiez la propagation : `dig +short sonafi.oquitogo.com` (ou dnschecker.org).

### Option A — Nginx + Certbot (si Nginx est déjà votre serveur front)

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/sonafi > /dev/null <<'EOF'
server {
    listen 80;
    server_name sonafi.oquitogo.com;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
        client_max_body_size 10m;   # import CSV des participantes
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/sonafi /etc/nginx/sites-enabled/sonafi
sudo nginx -t && sudo systemctl reload nginx

# Certificat HTTPS automatique (Let's Encrypt) + renouvellement auto :
sudo certbot --nginx -d sonafi.oquitogo.com --non-interactive --agree-tos -m vous@exemple.com
```

### Option B — Caddy (HTTPS automatique, plus simple)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo cp /opt/sonafi/deploy/Caddyfile.sonafi /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Dans les deux cas → **https://sonafi.oquitogo.com** ✅

> Note : ne laissez `ufw allow 3005` ouvert que si vous voulez l'accès direct
> par IP. Derrière Nginx/Caddy, le port 3005 peut rester interne (le proxy
> parle à l'application en local).

---

## 7. Accès à l'espace gestionnaire (bouton masqué)

Le bouton « Gestionnaire » a été **retiré de la page d'accueil** (les équipes
restauration/vérification ne le voient plus). Accès discret réservé au
gestionnaire :

```
https://sonafi.oquitogo.com/?gestionnaire
```

ou en direct : `http://IP_DU_VPS:3005/?gestionnaire`

Le **code PIN est toujours demandé** (`ADMIN_PIN` du fichier `.env`).

---

## 8. Peupler la base (si nécessaire) + checklist avant l'événement

```bash
# 500 participantes par défaut (si la base est vierge) :
curl -X POST http://localhost:3005/api/sonafi/participants \
  -H "Content-Type: application/json" -d '{"seed":true}'
```

Checklist :

- [ ] DNS propagé (`dig +short sonafi.oquitogo.com` → IP du VPS)
- [ ] `https://sonafi.oquitogo.com` s'ouvre avec le cadenas HTTPS
- [ ] Test scan QR complet sur 2-3 téléphones différents
- [ ] Codes d'accès notés (PIN gestionnaire / restauration / vérification)
- [ ] Badges QR imprimés : **20 badges par page A4** (5 cm × 6 cm), depuis
      l'espace gestionnaire → Badges QR → Imprimer
- [ ] `systemctl enable sonafi` actif (redémarrage auto après reboot VPS)
