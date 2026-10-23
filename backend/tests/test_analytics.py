"""Journal d'utilisation : avis des utilisateurs et duree de conservation (base SQLite temporaire)."""

import time

import pytest

import analytics


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(analytics, "DB_PATH", tmp_path / "analytics.sqlite3")
    monkeypatch.setattr(analytics, "_conn", None)
    analytics._stats_cache.clear()
    yield
    if analytics._conn is not None:
        analytics._conn.close()
    analytics._conn = None


def test_feedback_counts_in_stats():
    analytics.log_feedback(question="q1", answer="a1", rating=1, client_id="c1")
    analytics.log_feedback(question="q2", answer="a2", rating=-1, client_id="c1", comment="chiffre faux")
    kpis = analytics.stats(30)["kpis"]
    assert (kpis["feedback_up"], kpis["feedback_down"], kpis["satisfaction_rate"]) == (1, 1, 50.0)
    down = analytics.recent_feedback(30, rating=-1)
    assert down["total"] == 1 and down["items"][0]["comment"] == "chiffre faux"


def test_changing_opinion_replaces_previous_vote():
    analytics.log_feedback(question="q", answer="a", rating=1, client_id="c1")
    analytics.log_feedback(question="q", answer="a", rating=-1, client_id="c1")
    items = analytics.recent_feedback(None)["items"]
    assert [i["rating"] for i in items] == [-1]


def test_purge_removes_old_rows_only():
    db = analytics._db()
    old = time.time() - 400 * 86400
    db.execute("INSERT INTO events (ts, type, question) VALUES (?, 'query', 'ancienne')", (old,))
    db.execute("INSERT INTO events (ts, type, question) VALUES (?, 'query', 'recente')", (time.time(),))
    db.execute(
        "INSERT INTO feedback (ts, question, answer, rating) VALUES (?, 'q', 'a', 1)", (old,)
    )
    db.commit()
    assert analytics.purge(365) == 2
    assert [r[0] for r in db.execute("SELECT question FROM events")] == ["recente"]
    assert analytics.purge(0) == 0  # 0 = conservation sans limite
