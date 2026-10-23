"""Question a voix haute : choix du service de reconnaissance selon la langue parlee (voir voice.transcribe).
Les appels reseau (Voxtral, Soynade) et la conversion audio sont simules."""

import asyncio

import pytest

import voice


@pytest.fixture
def services(monkeypatch):
    calls = []
    outputs = {}

    async def fake_wav(data, filename):
        return data

    async def fake_voxtral(wav):
        calls.append("voxtral")
        return outputs["voxtral"]

    async def fake_soynade(wav, language):
        calls.append(f"soynade:{language}")
        return outputs["soynade"]

    monkeypatch.setattr(voice, "_to_wav", fake_wav)
    monkeypatch.setattr(voice, "_voxtral_transcribe", fake_voxtral)
    monkeypatch.setattr(voice, "_soynade_transcribe", fake_soynade)
    monkeypatch.setenv("MISTRAL_API_KEY", "test")
    monkeypatch.setenv("SOYNADE_API_KEY", "test")
    return calls, outputs


def run(language):
    return asyncio.run(voice.transcribe(b"audio", "r.webm", language))


def test_english_with_french_interface(services):
    calls, outputs = services
    outputs["voxtral"] = "What is the population of Senegal in 2023?"
    assert run("fr") == ("What is the population of Senegal in 2023?", "en")
    assert calls == ["voxtral"]  # Soynade (quota limite) n'est pas sollicite


def test_wolof_falls_back_to_soynade(services):
    calls, outputs = services
    # Voxtral ne connait pas le wolof : il l'ecrit phonetiquement.
    outputs["voxtral"] = "Nya tanit nyonek si Senegal, chi atum nyar juni."
    outputs["soynade"] = "Ñaata nit ñoo nekk ci Senegaal?"
    assert run("fr") == ("Ñaata nit ñoo nekk ci Senegaal?", "wo")
    assert calls == ["voxtral", "soynade:wo"]


def test_wolof_interface_french_speech(services):
    calls, outputs = services
    # Interface en wolof : Soynade en parallele ; il laisse le francais tel quel.
    outputs["voxtral"] = "Quel est le taux de chômage au Sénégal ?"
    outputs["soynade"] = "Quel est le taux de chômage au Sénégal?"
    text, language = run("wo")
    assert language == "fr"
    assert "chômage" in text


def test_wolof_interface_english_speech(services):
    calls, outputs = services
    # Soynade traduirait l'anglais en wolof : on garde Voxtral.
    outputs["voxtral"] = "What is the unemployment rate?"
    outputs["soynade"] = "Lan mooy taux chômage bi?"
    assert run("wo") == ("What is the unemployment rate?", "en")


def test_without_mistral_key_uses_interface_language(services, monkeypatch):
    calls, outputs = services
    monkeypatch.delenv("MISTRAL_API_KEY")
    outputs["soynade"] = "Quel est le taux de chômage ?"
    assert run("fr") == ("Quel est le taux de chômage ?", "fr")
    assert calls == ["soynade:fr"]


def test_empty_audio_rejected(services):
    with pytest.raises(voice.VoiceError):
        asyncio.run(voice.transcribe(b"", "r.webm", "fr"))
