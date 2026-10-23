"""Messages traites par regle, sans modele : salutations, mises en forme et relances de periode."""

import conversation


def test_small_talk():
    assert conversation.small_talk_reply("Bonjour !", "fr").startswith("Bonjour")
    assert conversation.small_talk_reply("thanks", "en").startswith("You're welcome")
    assert conversation.small_talk_reply("Jërëjëf", "wo").startswith("Amul solo")
    # Langue sans reponse ecrite : francais.
    assert conversation.small_talk_reply("Merci", "ff").startswith("Avec plaisir")
    assert conversation.small_talk_reply("Quel est le taux de chômage ?", "fr") is None
    assert conversation.small_talk_reply("Bonjour, quel est le taux de chômage des jeunes au Sénégal ?", "fr") is None


def test_format_requests():
    assert conversation.format_only_clause("mets ça dans un tableau") == "sous forme de tableau"
    assert conversation.format_only_clause("point par point stp") == "point par point (liste à puces)"
    assert conversation.format_only_clause("explique-moi le PIB") is None


def test_period_follow_ups():
    assert conversation.period_only("et pour 2025 ?") == ["2025"]
    assert conversation.period_only("et au T2 ?") == ["T2"]
    assert conversation.period_only("et le chômage en 2025 ?") is None
    assert conversation.with_period("Quel est le taux de chômage en 2024 ?", ["2025"]) == "Quel est le taux de chômage en 2025 ?"
    assert conversation.with_period("Quel est le taux de chômage ?", ["T2"]) == "Quel est le taux de chômage — période : T2 ?"
    assert conversation.with_format("Quel est le PIB ? — réponds en une seule phrase.", "sous forme de tableau") == (
        "Quel est le PIB — réponds sous forme de tableau."
    )


def test_norm():
    assert conversation.norm("Évolution du Chômage, T2-2026") == "evolution du chomage t2 2026"
