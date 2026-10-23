"""Mise a jour du catalogue : les nouvelles publications sont ajoutees, rien n'est retire.
Le site de l'ANSD est simule (pages du catalogue, les plus recentes d'abord)."""

import csv

import pytest

import scraper


def pdf(n):
    return {"title": f"Publication {n}", "extension": "pdf", "size": "1 Mo", "url": f"https://www.ansd.sn/files/{n}.pdf"}


@pytest.fixture
def site(tmp_path, monkeypatch):
    manifest = tmp_path / "manifest.csv"
    monkeypatch.setattr(scraper, "MANIFEST_PATH", manifest)
    pages = []
    fetched = []

    def fake_fetch(session, page, category, doc_type):
        fetched.append(page)
        return page

    monkeypatch.setattr(scraper, "fetch_page", fake_fetch)
    monkeypatch.setattr(scraper, "parse_rows", lambda page: pages[page] if page < len(pages) else [])
    monkeypatch.setattr(scraper, "has_next_page", lambda page: page + 1 < len(pages))
    monkeypatch.setattr(scraper.time, "sleep", lambda s: None)
    return manifest, pages, fetched


def write(manifest, rows):
    with open(manifest, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["title", "extension", "size", "url"])
        writer.writeheader()
        writer.writerows(rows)


def test_new_publications_prepended_nothing_removed(site):
    manifest, pages, fetched = site
    write(manifest, [pdf(3), pdf(2), pdf(1)])
    pages += [[pdf(5), pdf(4)], [pdf(3), pdf(2)], [pdf(1)], [pdf(0)]]
    new = scraper.update_catalog(stop_after=2)
    assert [r["title"] for r in new] == ["Publication 5", "Publication 4"]
    assert [r["title"] for r in scraper.read_catalog()] == [f"Publication {n}" for n in (5, 4, 3, 2, 1)]
    # Deux pages de suite sans nouveaute : on n'a pas parcouru tout le site.
    assert fetched == [0, 1, 2]


def test_non_pdf_ignored_and_no_rewrite_without_news(site):
    manifest, pages, _ = site
    write(manifest, [pdf(1)])
    before = manifest.read_text()
    pages += [[{**pdf(9), "extension": "xlsx"}, pdf(1)]]
    assert scraper.update_catalog() == []
    assert manifest.read_text() == before


def test_empty_catalog(site):
    manifest, pages, _ = site
    pages += [[pdf(1)]]
    assert len(scraper.update_catalog()) == 1
    assert manifest.exists()
