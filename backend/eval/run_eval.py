"""Questions de reference : verifie les reponses de l'assistant sur des questions dont on connait la reponse.

A lancer apres chaque changement du prompt, du decoupage, de la recherche ou du modele, backend demarre :

    cd backend && .venv/bin/python eval/run_eval.py                    # API locale (http://localhost:8000)
    .venv/bin/python eval/run_eval.py --api https://api.exemple.sn --only population

Chaque question de eval/reference.json precise :
  - expected : valeurs qui doivent toutes figurer dans la reponse (espaces et virgules decimales
    indifferents : « 18 126 390 » = « 18126390 », « 19,1 » = « 19.1 ») ;
  - source : morceau du titre d'une publication qui doit etre citee (facultatif).
  - known_issue : erreur connue, pas encore corrigee. Elle ne fait pas echouer la verification ;
    si la question reussit, elle est signalee « corrigee » (retirer alors known_issue).
Resultat detaille dans eval/last_run.json. Code de sortie 1 si une question sans known_issue echoue.
"""

import argparse
import json
import re
import sys
import time
import unicodedata
import uuid
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent


def _norm_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    # Separateurs de milliers : 18 126 390 / 18.126.390 / 18,126,390 -> 18126390
    text = re.sub(r"\d{1,3}(?:[ .,]\d{3})+(?![\d,.]\d)", lambda m: re.sub(r"[ .,]", "", m.group()), text)
    return re.sub(r"(?<=\d),(?=\d)", ".", text)  # virgule decimale : 19,1 -> 19.1


def contains_value(answer: str, value: str) -> bool:
    """La valeur est un nombre entier dans la reponse : « 9 » ne correspond pas a « 1999 » ni a « 9,5 »."""
    pattern = r"(?<![\d.])" + re.escape(_norm_text(value)) + r"(?![\d]|\.\d)"
    return re.search(pattern, _norm_text(answer)) is not None


def check(item: dict, response: dict) -> list[str]:
    """Problemes trouves dans la reponse (liste vide = question reussie)."""
    problems = []
    answer = response.get("answer", "")
    if response.get("language") != item.get("answer_language", item["language"]):
        problems.append(f"langue de la reponse : {response.get('language')}")
    for value in item["expected"]:
        if not contains_value(answer, value):
            problems.append(f"valeur attendue absente : {value}")
    if item.get("source"):
        titles = [c.get("document_title", "") for c in response.get("citations", [])]
        if not any(_norm_text(item["source"]) in _norm_text(t) for t in titles):
            problems.append(f"publication attendue non citee : {item['source']} (citees : {', '.join(titles) or 'aucune'})")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="Questions de reference de l'assistant")
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--only", help="ne lancer que les questions dont l'identifiant contient ce texte")
    parser.add_argument("--file", default=str(HERE / "reference.json"))
    parser.add_argument(
        "--fresh", action="store_true",
        help="ignorer le cache des reponses (comme « Relancer » : temperature plus elevee, resultats plus variables)",
    )
    args = parser.parse_args()

    items = json.loads(Path(args.file).read_text(encoding="utf-8"))
    if args.only:
        items = [i for i in items if args.only in i["id"]]
    results = []
    client_id = f"eval-{uuid.uuid4()}"
    with httpx.Client(timeout=180) as client:
        for n, item in enumerate(items, 1):
            started = time.perf_counter()
            # Le cache des reponses est vide au redemarrage du backend (sans Redis) et sa cle change avec
            # le corpus et AGENT_VERSION ; --fresh l'ignore dans tous les cas.
            payload = {"question": item["question"], "language": item["language"], "regenerate": args.fresh}
            for attempt in range(3):
                resp = client.post(f"{args.api}/api/query", json=payload, headers={"X-Client-Id": client_id})
                if resp.status_code != 429:
                    break
                time.sleep(int(resp.headers.get("Retry-After", "60")))
            seconds = time.perf_counter() - started
            if resp.status_code != 200:
                problems, body = [f"HTTP {resp.status_code} : {resp.text[:200]}"], {}
            else:
                body = resp.json()
                problems = check(item, body)
            ok = not problems
            known = item.get("known_issue")
            label = ("CORRIGE" if ok else "CONNU  ") if known else ("OK     " if ok else "ECHEC  ")
            print(f"[{n:2d}/{len(items)}] {label} {item['id']:28s} {seconds:5.1f} s"
                  + ("" if ok or known else "\n        " + "\n        ".join(problems)), flush=True)
            results.append({
                "id": item["id"], "question": item["question"], "ok": ok, "known_issue": known, "problems": problems,
                "seconds": round(seconds, 1), "answer": body.get("answer"),
                "citations": [c.get("document_title") for c in body.get("citations", [])],
            })

    tracked = [r for r in results if not r["known_issue"]]
    known = [r for r in results if r["known_issue"]]
    failed = [r for r in tracked if not r["ok"]]
    print(f"\n{len(tracked) - len(failed)}/{len(tracked)} questions reussies", end="")
    if known:
        print(f" ; problemes connus : {sum(not r['ok'] for r in known)} toujours la, {sum(r['ok'] for r in known)} corrige(s)", end="")
    print()
    (HERE / "last_run.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
