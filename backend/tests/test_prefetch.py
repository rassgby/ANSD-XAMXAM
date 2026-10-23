"""Recherche anticipee de l'agent : requete francaise pour une question anglaise, publication nommee."""

import agent
import rag

TITLES = ["Rapport provisoire du RGPH-5, 2023", "EDS-Continue 2023: Rapport final", "ENES, T2-2026", "IHPC, août 2026"]


def test_french_query():
    query = agent.french_query("What was the unemployment rate in Senegal in the second quarter of 2026?")
    assert query == "taux de chômage Sénégal deuxième trimestre 2026"
    assert agent.french_query("What is the total fertility rate according to the 2023 DHS?") == (
        "indice synthétique de fécondité 2023 EDS"
    )


def test_looks_english():
    assert agent.looks_english("What was the unemployment rate in Senegal in the second quarter of 2026?")
    assert not agent.looks_english("Quel est le taux de chômage au Sénégal au deuxième trimestre 2026 ?")
    assert not agent.looks_english("Ñaata nit ñoo nekk ci Senegaal ci RGPH-5 bi?")


def test_named_publication(monkeypatch):
    monkeypatch.setattr(rag, "known_sources", lambda: TITLES)
    assert agent.named_publication("Quelle est l'espérance de vie selon le RGPH-5 ?") == "RGPH-5"
    assert agent.named_publication("Quel est l'ISF selon la dernière EDS ?") == "EDS"
    # Indicateur, institution ou sigle absent des titres : pas de filtre.
    assert agent.named_publication("Quelle est la croissance du PIB selon l'ANSD ?") is None
    assert agent.named_publication("Quel est le taux de pauvreté selon l'ESPS ?") is None


def test_prefetch_args(monkeypatch):
    monkeypatch.setattr(rag, "known_sources", lambda: TITLES)
    assert agent.prefetch_args("What was the unemployment rate in Senegal in the second quarter of 2026?", []) == {
        "query": "taux de chômage Sénégal deuxième trimestre 2026", "year": 2026,
    }
    args = agent.prefetch_args("Quelle proportion des ménages a accès à l'électricité selon le RGPH-5 ?", [])
    assert args["document"] == "RGPH-5"
    assert args["query"].startswith("Quelle proportion")
