"""Comparaison des valeurs du script de questions de reference (eval/run_eval.py)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "eval"))
import run_eval  # noqa: E402


def test_number_formats():
    assert run_eval.contains_value("**18 126 390 habitants**", "18 126 390")
    assert run_eval.contains_value("Senegal's population is 18,126,390", "18 126 390")
    assert run_eval.contains_value("est de 19,1 %", "19,1")
    assert run_eval.contains_value("was 19.1%", "19,1")
    assert run_eval.contains_value("9 individus par ménage", "9")


def test_no_partial_match():
    assert not run_eval.contains_value("en 1999", "9")
    assert not run_eval.contains_value("9,5 individus", "9")
    assert not run_eval.contains_value("19,15 %", "19,1")


def test_check_language_and_source():
    item = {"id": "x", "language": "fr", "expected": ["19,1"], "source": "ENES"}
    good = {"language": "fr", "answer": "Le taux est de 19,1 %.", "citations": [{"document_title": "ENES, T2-2026"}]}
    assert run_eval.check(item, good) == []
    wrong = {"language": "en", "answer": "14.6%", "citations": []}
    assert len(run_eval.check(item, wrong)) == 3
