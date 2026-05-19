# DailyReport — Agent Sportif

Application web de suivi d'activité professionnelle quotidienne avec génération automatique de comptes rendus clients.

## Stack

- **Frontend** : HTML + Tailwind CSS + Vanilla JS (fichier unique `index.html`)
- **Backend** : Vercel Serverless Function (`api/notion.js`)
- **Database** : Notion API

## Fonctionnalités

- Formulaire rapide (< 30 secondes par tâche)
- Multi-tâches par journée
- Calcul automatique du temps total
- Preuves de travail : liens web + fichiers joints
- Envoi automatique vers Notion
- Génération du mail client via `mailto:`
- Historique et statistiques par client
- Mode sombre

## Setup

### 1. Notion Integration

1. https://www.notion.so/my-integrations → **+ New integration** → copier le token
2. Créer une Database avec les colonnes : `Name` (Title), `Date`, `Client` (Text), `Temps total` (Text), `Tâches` (Number)
3. Connecter l'integration à la database

### 2. Deploy sur Vercel

```bash
# Via CLI
npm install -g vercel
vercel

# Ajouter les variables d'environnement
vercel env add NOTION_TOKEN
vercel env add NOTION_DATABASE_ID
vercel --prod
```

Ou importer directement depuis GitHub sur [vercel.com](https://vercel.com).

### 3. Configurer l'app

Ouvrir l'app → ⚙️ Paramètres → coller l'URL Vercel dans **Webhook URL**.

## Structure

```
dailyreport-app/
├── index.html        ← app complète (frontend)
├── api/
│   └── notion.js     ← serverless function Vercel
├── vercel.json       ← config Vercel
└── .gitignore
```
