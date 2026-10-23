"""Mise a jour du corpus : nouvelles publications de l'ANSD ajoutees au catalogue puis indexees.

    python update_corpus.py                 # une fois
    python update_corpus.py --every-days 7  # en boucle (service Docker corpus-updater)

Seuls les documents absents de la base sont telecharges et indexes. Le backend en cours
d'execution voit le changement tout seul : il reconstruit son index de recherche rapide
(fastindex.py) des que le nombre de passages de la base change.
"""

import argparse
import time
import traceback

import ingest
import scraper


def update() -> int:
    new = scraper.update_catalog()
    if new:
        ingest.ingest(reset=False)
    return len(new)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--every-days", type=float, default=0, help="Relance la mise a jour tous les N jours (0 = une fois)")
    args = parser.parse_args()
    while True:
        started = time.strftime("%Y-%m-%d %H:%M")
        try:
            print(f"[{started}] mise a jour du corpus…", flush=True)
            print(f"[{time.strftime('%Y-%m-%d %H:%M')}] termine : {update()} nouvelle(s) publication(s)", flush=True)
        except Exception:
            # Site de l'ANSD indisponible, PDF illisible… : on reessaiera a la prochaine echeance.
            traceback.print_exc()
            if not args.every_days:
                raise
        if not args.every_days:
            return
        time.sleep(args.every_days * 86400)


if __name__ == "__main__":
    main()
