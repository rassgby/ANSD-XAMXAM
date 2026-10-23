"""Detection de la langue d'une question : l'assistant repond dans la langue ou elle est posee."""

import pytest

import agent
import voice


@pytest.mark.parametrize(
    "question, expected",
    [
        ("Quelle est la population du Sénégal en 2023 ?", "fr"),
        ("Donne-moi le taux de chômage", "fr"),
        ("et en 2020 ?", "fr"),
        ("Bonjour", "fr"),
        ("What is the unemployment rate in Senegal?", "en"),
        ("How many people live in Dakar?", "en"),
        ("and in 2020?", "en"),
        ("Hello", "en"),
        ("Ñaata nit ñoo nekk ci Senegaal?", "wo"),
        ("Naka la population bi tollu?", "wo"),
        ("Jigéen ñi nag?", "wo"),
        ("Hol no yimɓe Senegaal foti?", "ff"),
        ("Noy foti yimbe e nder Senegaal hitaande 2023?", "ff"),
    ],
)
def test_detect_language(question, expected):
    assert voice.detect_language(question) == expected


@pytest.mark.parametrize("question", ["ok", "Dakar", "2023", "population", ""])
def test_detect_language_unsure(question):
    # Trop court ou ambigu : None, la langue choisie dans l'interface est gardee.
    assert voice.detect_language(question) is None


def test_looks_wolof():
    assert voice.looks_wolof("Ñaata nit ñoo nekk ci Senegaal?")
    assert not voice.looks_wolof("Quel est le taux de chômage au Sénégal ?")


def test_wrong_language():
    english = "The population of Senegal is estimated at 18 million inhabitants according to the census."
    french = "La population du Sénégal est estimée à 18 millions d'habitants selon le recensement de la population."
    assert agent._wrong_language(english, "fr")
    assert agent._wrong_language(french, "en")
    assert not agent._wrong_language(french, "fr")
    assert not agent._wrong_language(english, "wo")  # wolof, pulaar : passent par le francais
