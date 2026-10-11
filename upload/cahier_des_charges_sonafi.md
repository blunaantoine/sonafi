# Cahier des charges : Gestion des pauses du Sommet Sonafi

**Événement :** Sonafi, Sommet national de la jeune fille
**Durée :** 3 jours, à partir du 22
**Participants :** environ 500

---

## 1. Contexte et objectif

Pour faciliter la restauration, chaque participant reçoit au premier jour un badge avec un code QR unique. Ce code permet de valider son passage à chaque pause et d'éviter qu'une même personne prenne deux fois la même pause le même jour.

Le système doit rester **simple, rapide et fiable**, sans complication technique, avec des scans rapides qui ne bloquent pas.

## 2. Les pauses à gérer

Chaque jour (jour 1, 2 et 3), trois pauses sont suivies :

- Pause café
- Pause déjeuner
- Pause des jeux

Chaque participant a droit à **une seule fois chaque pause par jour**.

## 3. Fonctionnement général (en langage simple)

1. **Avant l'événement :** on génère 500 codes QR uniques, chacun lié à un numéro de participant, et on les imprime sur les badges.
2. **Au premier jour :** chaque participant reçoit son badge.
3. **Pendant les pauses :** un agent ouvre le site web sur son téléphone (iPhone ou Android), active la caméra et scanne le badge du participant.
4. **Le système répond immédiatement :**
   - Vert : pause validée, le participant peut passer.
   - Rouge : pause déjà prise aujourd'hui, ou badge non reconnu.
5. **Tous les téléphones partagent les mêmes données.** Si un participant est scanné à un point, un autre point le saura aussitôt.

## 4. Fonctionnalités

### 4.1 Scan des pauses
- Scan du code QR avec la caméra du téléphone, directement depuis le navigateur (aucune application à installer)
- Choix du jour en cours (1, 2 ou 3)
- Affichage de l'identité du participant après le scan
- Choix de la pause (café, déjeuner, jeux)
- Blocage automatique des doublons (même participant, même jour, même pause)
- Message de confirmation ou d'erreur clair et immédiat
- Compteur du nombre total de passages enregistrés

### 4.2 Génération des badges
- Création de 500 identifiants uniques (ID0001 à ID0500)
- Génération d'un code QR par identifiant
- Affichage à l'écran, téléchargement et impression en masse, avec une mise en page prête pour les badges

## 5. Données gérées

- **Participants :** identifiant unique, nom
- **Passages :** identifiant du participant, jour, type de pause, date et heure du scan

## 6. Architecture technique

- **Site web (interface)** : HTML, CSS et JavaScript simples, avec lecture du code QR par la caméra (bibliothèque jsQR)
- **Serveur (backend)** : Python avec Flask
- **Base de données** : SQLite, centralisée sur le serveur
- **Hébergement** : serveur VPS

## 7. Contraintes et exigences

- Gérer 500 participants avec des scans rapides, sans lenteur ni blocage
- Fonctionner sur iPhone et Android, avec des téléphones variés
- Interface minimaliste, facile à utiliser par des non-techniciens
- **HTTPS obligatoire** sur le VPS : les navigateurs refusent d'ouvrir la caméra sur un site non sécurisé (il faut donc un nom de domaine avec certificat, par exemple Let's Encrypt)
- Plusieurs points de scan simultanés doivent pouvoir fonctionner en même temps
- Une bonne connexion internet est nécessaire sur les lieux de scan (Wi-Fi ou données mobiles)

## 8. État d'avancement

| Élément | État |
|---|---|
| Serveur Flask + base SQLite | Fait |
| Script de création des 500 participants | Fait |
| Site web de scan avec caméra | Fait |
| Générateur et impression des codes QR | **À faire** |
| Import des vrais noms des participants | **À faire** |
| Mise en ligne sur le VPS avec HTTPS | **À faire** |
| Test avec plusieurs téléphones avant l'événement | **À faire** |

## 9. Explication pour le chargé de la restauration

Chaque participant a un badge avec un code QR, comme un ticket personnel. À chaque pause, vous scannez le badge avec la caméra d'un téléphone. Si l'écran affiche en vert, la personne n'a pas encore pris cette pause et peut passer. S'il affiche en rouge, elle l'a déjà prise aujourd'hui. Tous les téléphones sont connectés au même système, donc il est impossible de se faire servir deux fois, même à des endroits différents.
