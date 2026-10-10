# XAM-XAM — Assistant statistique de l'ANSD

Assistant conversationnel qui répond aux questions sur les statistiques officielles du Sénégal (publications de l'ANSD), en **français, wolof, pulaar et anglais**, à l'écrit et à la voix, avec les sources citées.

- `backend/` : API FastAPI (recherche dans les publications, agent, voix, traduction), Redis, modèles locaux (voix Piper, traduction pulaar). Détails : [backend/README.md](backend/README.md)
- `frontend/` : interface web Next.js. Détails : [frontend/README.md](frontend/README.md)
- `deploy.sh` : déploiement complet en une commande (Docker Compose)

## Procédure de déploiement

### 1. Prérequis

- Docker Engine et Docker Compose v2.24 ou plus récent
- `git`, `curl`, un shell bash (Linux, macOS, ou Git Bash / WSL sous Windows)
- Ports libres : `8000` (API) et `3000` (interface)
- Environ 10 Go d'espace disque (images, modèles locaux, base de recherche)

### 2. Récupérer le code

```bash
git clone <adresse-du-depot> xamxam
cd xamxam
```

### 3. Configurer le backend

Le fichier `backend/.env` contient les clés. S'il est absent, `deploy.sh` le crée à partir de `backend/.env.example` et s'arrête pour qu'on le remplisse.

| Variable | Rôle | Obligatoire |
|---|---|---|
| `OPENROUTER_API_KEY` | Modèle de langage (réponses, traductions) | oui |
| `ADMIN_TOKEN` | Mot de passe du tableau de bord `/admin` | oui (changer `changez-moi`) |
| `CORS_ORIGINS` | URL(s) de l'interface autorisées à appeler l'API | oui en production |
| `MISTRAL_API_KEY` | Fournisseur principal de l'agent (sinon OpenRouter) | non |
| `SOYNADE_API_KEY` | Voix wolof (reconnaissance et synthèse) | non (sans elle : pas de voix wolof) |
| `HF_TOKEN` | Voix pulaar (Space Hugging Face, quota GPU de ce compte) | non (sans elle : pas de voix pulaar) |
| `TANLE_SPACE_URL` | Space Hugging Face de la voix pulaar | non (défaut fourni) |

### 4. Base de recherche (publications indexées)

La base vectorielle (`backend/storage/`) n'est pas dans Git (taille). Deux possibilités :

- **Copier une base existante** dans `backend/storage/` (voir [backend/readmeforchroma.md](backend/readmeforchroma.md)) ;
- **ou la reconstruire** une fois le backend démarré :

  ```bash
  cd backend && docker compose exec backend python ingest.py
  ```

### 5. Lancer

```bash
./deploy.sh
```

Le script vérifie Docker et `backend/.env`, construit et démarre le backend (API, Redis, modèles locaux) puis le frontend, et attend que les deux répondent. Le premier démarrage prend plusieurs minutes (construction de l'index de recherche rapide, environ 3 min).

Une fois terminé :

- Interface : http://localhost:3000
- API : http://localhost:8000 (documentation : http://localhost:8000/docs)

### Options de `deploy.sh`

```bash
./deploy.sh --api-url https://api.exemple.sn --front-url https://exemple.sn   # serveur public
./deploy.sh --scale     # plusieurs instances du backend derrière Nginx
./deploy.sh --pull      # récupère d'abord la dernière version (git pull)
./deploy.sh --down      # arrête tous les services
./deploy.sh --help
```

`--api-url` est l'adresse de l'API vue par le navigateur : elle est intégrée à l'interface au moment du build, la changer impose de relancer `deploy.sh`.

### Sous Windows (sans bash)

`start-all.bat` démarre backend et frontend avec Docker Compose, `stop-all.bat` les arrête.

### Suivi et dépannage

```bash
cd backend  && docker compose logs -f      # journaux de l'API
cd frontend && docker compose logs -f      # journaux de l'interface
curl http://localhost:8000/api/health      # état de l'API
```

## Voix

| Langue | Reconnaissance (question à l'oral) | Lecture de la réponse |
|---|---|---|
| Français, anglais | Soynade | Piper (local) ou voix du navigateur |
| Wolof | Soynade | Soynade, voix locale en secours |
| Pulaar | — (question écrite) | Modèle Wuro-Nucobiyo-Tanle (Space Hugging Face, ZeroGPU) |

La voix pulaar dépend du quota GPU du compte Hugging Face de `HF_TOKEN` (quelques minutes par jour en compte gratuit). Chaque audio généré est gardé 7 jours en cache.
