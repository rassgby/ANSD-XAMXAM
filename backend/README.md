# ANSD RAG

Systeme de questions-reponses base sur les publications publiques de l'ANSD
(Agence Nationale de la Statistique et de la Demographie du Senegal),
reproduisant en Python pur l'architecture RAG decrite dans le memoire de
Mouhamad KOUNTA (ESP/UCAD, 2024-2025).

Les PDF ne sont **jamais stockes sur disque** : ils sont recuperes en
memoire, decoupes, vectorises et indexes a la volee, puis les octets sont
abandonnes. Seuls le texte decoupe (dans Chroma) et les metadonnees
(`data/manifest.csv` : titre, URL, taille) persistent localement.

## Correspondance avec le memoire original

| Etape du memoire | Outil original | Ce projet |
|---|---|---|
| Extraction PDF | NiFi + PyMuPDF | fetch en memoire depuis ansd.sn + PyMuPDF |
| Stockage brut | Supabase | aucun (traitement a la volee) |
| Decoupage | RecursiveCharacterTextSplitter (LangChain) | identique |
| Embeddings | Ollama (nomic-embed-text) | fastembed, local, multilingue |
| Base vectorielle | Pinecone (cloud) | Chroma (local, persistant) |
| Generation | GPT-4.1-nano via OpenRouter | identique |
| Orchestration | n8n | scripts Python (`scraper.py` / `ingest.py` / `rag.py`) |
| Interface | Streamlit | identique |

Le site de l'ANSD reference environ **2500 documents PDF** au total. Pour
garder un temps d'indexation raisonnable, le catalogue se limite par defaut
aux 100 premiers documents (les plus recents) ; ajuste `--max-docs`,
`--category` ou `--type` pour elargir ou cibler le corpus.

Note technique : le certificat SSL de `ansd.sn` a une chaine incomplete
(`unable to get local issuer certificate`). Les navigateurs la completent
automatiquement, mais pas la librairie `requests` : la verification SSL est
donc desactivee dans `scraper.py`/`ingest.py` pour ce site public en lecture
seule.

## Installation

```bash
cd ansd-rag
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Renseigne `OPENROUTER_API_KEY` dans `.env` avec une cle obtenue sur
https://openrouter.ai/keys.

## Utilisation

1. Cataloguer les publications ANSD (titre + URL uniquement, pas de telechargement) :

```bash
python scraper.py --max-docs 100
```

Options utiles :
- `--max-docs N` : nombre de documents a referencer (defaut 100)
- `--category {economie,demographie,societe,autres}` : filtrer par theme
- `--type {rapports,donnees,reference}` : filtrer par type de document
- `--delay 0.3` : delai entre deux pages du catalogue (politesse envers le serveur)

2. Indexer les documents (fetch en memoire, extraction, decoupage, embeddings) :

```bash
python ingest.py
```

Ajoute `--reset` pour repartir de zero si tu relances une indexation.

Mise a jour ensuite (nouvelles publications seulement, sans rien retirer du catalogue) :

```bash
python update_corpus.py                  # une fois : scraper.py --update puis ingest.py
python update_corpus.py --every-days 7   # en boucle (service Docker corpus-updater)
```

Le backend en marche reconstruit son index de recherche rapide de lui-meme (verification toutes
les 10 minutes). Attention : `scraper.py` sans `--update` reecrit tout le catalogue.

3. Interroger le systeme :

```bash
# en ligne de commande
python rag.py "Quel est le taux de scolarisation au Senegal ?"
```

L'interface web est le frontend Next.js (`../frontend`), qui interroge l'API (`uvicorn api:app`).

## Tests et questions de reference

```bash
pip install -r requirements-dev.txt
python -m pytest -q            # tests sans reseau ni base (aussi lances par GitHub Actions)
python eval/run_eval.py        # questions de reference, sur l'API demarree (voir eval/run_eval.py)
python eval/run_eval.py --fresh  # idem sans le cache des reponses
```

`eval/reference.json` : questions dont la reponse a ete verifiee dans les publications (valeur
attendue, publication a citer). Les erreurs connues y sont marquees `known_issue` : elles ne font
pas echouer la verification, qui signale quand elles sont corrigees. A relancer apres chaque
changement du prompt, du decoupage, de la recherche ou du modele.

## Structure

```
ansd-rag/
  config.py       parametres centraux (chemins, chunking, modeles)
  scraper.py      catalogue les PDF depuis ansd.sn/toutes-les-publications (titre + URL)
  ingest.py       fetch en memoire + extraction texte + decoupage + embeddings + indexation Chroma
  rag.py          recuperation vectorielle + generation via OpenRouter
  conversation.py messages traites sans modele (salutations, mises en forme, relances de periode)
  api.py          API FastAPI : questions, explications, titres
  schemas.py      formes des requetes et reponses de l'API
  limits.py       limitation de debit
  routes_admin.py journal d'utilisation, avis des utilisateurs, tableau de bord admin
  routes_voice.py transcription et lecture audio
  analytics.py    journal d'utilisation et avis (SQLite, conservation ANALYTICS_RETENTION_DAYS)
  update_corpus.py  mise a jour du corpus (nouvelles publications)
  eval/           questions de reference
  tests/          tests automatiques
  data/manifest.csv  catalogue des documents references (titre, url, taille)
  storage/chroma/ base vectorielle persistante (texte + embeddings, pas les PDF)
```

## Limites (heritees du memoire original)

- Pas de score de confiance sur les reponses generees.
- Les questions sans indication temporelle peuvent renvoyer une donnee
  perimee si plusieurs annees sont couvertes par le corpus.
- La qualite depend de l'extraction texte des PDF (mise en page complexe,
  tableaux scannes non-OCRises).
- Chaque relance d'`ingest.py` retelecharge en memoire les PDF non encore
  indexes (aucun cache disque) : un corpus large induit plus de trafic
  reseau a chaque ajout de documents.

## API REST (pour le frontend Next.js)

`api.py` expose le RAG en FastAPI pour le frontend `ANSD-RAG-main` :

```bash
uvicorn api:app --reload --port 8000   # docs : http://localhost:8000/docs
```

ou en Docker : `docker compose up --build`. Variable `CORS_ORIGINS` : URL(s)
du frontend autorisées. Guide complet de lancement : `../../LANCEMENT.md`.

## Montée en charge

Ce qui rend le backend capable de tenir une forte charge :

| Mécanisme | Effet |
|---|---|
| Cache des réponses (`cache.py`, Redis) | une question déjà posée (même langue, à la casse/accents près) est servie sans appeler le modèle |
| Regroupement des questions identiques | 500 questions identiques simultanées → 1 à 2 appels au modèle |
| Appels au modèle asynchrones (`httpx`, pool de connexions) | un processus gère des milliers de requêtes en attente ; nouvelles tentatives sur 429/5xx |
| Plusieurs processus (`WEB_CONCURRENCY`) | un par cœur CPU environ (~600 Mo de RAM chacun, modèle d'embedding inclus) |
| Limitation de débit | `RATE_LIMIT_PER_MINUTE` par utilisateur, `RATE_LIMIT_IP_PER_MINUTE` par IP |
| Journal d'utilisation en arrière-plan | écritures groupées, SQLite en WAL ; agrégats du tableau de bord calculés en SQL et mis en cache 30 s |

Mesures sur un MacBook Air (Docker, 1 instance, 4 processus) :

| Charge | Avant | Après |
|---|---|---|
| Question déjà posée (500 en parallèle) | ~11 req/s, 2 s | ~4 450 req/s, 56 ms (médiane) |
| `/api/sources` | 221 req/s | ~9 300 req/s |
| Question nouvelle × 500 simultanées | 500 appels au modèle | 2 appels au modèle |

Plusieurs instances derrière Nginx (Redis partagé) :

```bash
docker compose -f docker-compose.scale.yml up --build -d
docker compose -f docker-compose.scale.yml up -d --scale backend=6
```

Limites de cette configuration (à traiter en production à très grande échelle) :
les questions *nouvelles* restent bornées par les quotas du fournisseur du
modèle ; le journal SQLite et l'index Chroma sont locaux à une machine (passer
à PostgreSQL et à une base vectorielle partagée pour plusieurs serveurs).
