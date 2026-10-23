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

Ensuite, le service `corpus-updater` ajoute chaque semaine les nouvelles publications de l'ANSD (`CORPUS_UPDATE_DAYS`, 7 par défaut). Pour le lancer à la main :

```bash
cd backend && docker compose exec backend python update_corpus.py
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
./deploy.sh --backend-only  # API seule (interface hébergée ailleurs)
./deploy.sh --down      # arrête tous les services
./deploy.sh --help
```

`--api-url` est l'adresse de l'API vue par le navigateur : elle est intégrée à l'interface au moment du build, la changer impose de relancer `deploy.sh`.

### Sous Windows

Lancer `./deploy.sh` depuis Git Bash ou WSL (voir les prérequis).

### Suivi et dépannage

```bash
cd backend  && docker compose logs -f      # journaux de l'API
cd frontend && docker compose logs -f      # journaux de l'interface
curl http://localhost:8000/api/health      # état de l'API
```

### Données d'utilisation

Le tableau de bord `/admin` affiche les questions posées et les avis des utilisateurs (« utile / pas utile », avec commentaire). Ces données sont supprimées au-delà de `ANALYTICS_RETENTION_DAYS` jours (365 par défaut, `0` pour tout garder).

### Vérifications

À chaque envoi sur GitHub, les tests du backend, le lint et les types du frontend sont vérifiés (`.github/workflows/ci.yml`). Après un changement qui touche aux réponses, lancer aussi les questions de référence (voir [backend/README.md](backend/README.md)).

### Déploiement automatique

Après chaque `git push` sur `main`, si les vérifications passent, GitHub Actions (job `deploy` de `.github/workflows/ci.yml`) se connecte au serveur en SSH, avance le dépôt du serveur jusqu'au commit testé (`git merge --ff-only`) et relance `./deploy.sh --backend-only` : le serveur n'héberge que l'API. L'interface est hébergée sur Vercel, qui la redéploie lui-même à chaque push. Un seul déploiement tourne à la fois. Pour redéployer sans nouveau commit : onglet **Actions** → **CI** → **Run workflow**.

Mise en place, une seule fois :

1. **Sur le serveur** : cloner le dépôt (par défaut dans `~/ANSD-XAMXAM`), remplir `backend/.env`, et réussir un premier `./deploy.sh` à la main. L'utilisateur SSH doit pouvoir lancer `docker` sans `sudo` (groupe `docker`) et faire `git fetch` (dépôt privé : clé de déploiement GitHub en lecture seule sur le serveur).
2. **Une clé SSH réservée au déploiement**, créée sur votre poste :

   ```bash
   ssh-keygen -t ed25519 -N "" -C github-deploy -f xamxam_deploy
   ```

   Ajouter `xamxam_deploy.pub` à `~/.ssh/authorized_keys` de l'utilisateur du serveur.
3. **Sur GitHub** : *Settings → Environments → New environment* `production`, puis y ajouter :

   | Nom | Type | Valeur |
   |---|---|---|
   | `DEPLOY_HOST` | secret | adresse du serveur |
   | `DEPLOY_USER` | secret | utilisateur SSH |
   | `DEPLOY_SSH_KEY` | secret | contenu de `xamxam_deploy` (clé privée) |
   | `DEPLOY_KNOWN_HOSTS` | secret | résultat de `ssh-keyscan -p <port> <serveur>` |
   | `DEPLOY_PORT` | secret | port SSH (facultatif, 22 par défaut) |
   | `DEPLOY_PATH` | variable | dossier du dépôt sur le serveur (défaut `~/ANSD-XAMXAM`) |
   | `DEPLOY_ARGS` | variable | options supplémentaires de `deploy.sh`, facultatif (ex. `--scale`) |

   Sans `DEPLOY_HOST`, le job `deploy` est ignoré (avertissement dans Actions). L'environnement `production` permet aussi, si besoin, d'exiger une approbation manuelle avant chaque déploiement (*Required reviewers*).

Ne modifiez pas les fichiers suivis par Git directement sur le serveur : l'avance rapide échouerait et le déploiement s'arrêterait (le site garde alors la version précédente).

## Voix

| Langue | Reconnaissance (question à l'oral) | Lecture de la réponse |
|---|---|---|
| Français, anglais | Soynade | Piper (local) ou voix du navigateur |
| Wolof | Soynade | Soynade, voix locale en secours |
| Pulaar | — (question écrite) | Modèle Wuro-Nucobiyo-Tanle (Space Hugging Face, ZeroGPU) |

La voix pulaar dépend du quota GPU du compte Hugging Face de `HF_TOKEN` (quelques minutes par jour en compte gratuit). Chaque audio généré est gardé 7 jours en cache.
