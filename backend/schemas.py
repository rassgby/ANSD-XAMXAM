"""Schemas des requetes et reponses de l'API (FastAPI / pydantic)."""

from typing import Literal

from pydantic import BaseModel, Field


class SourceRef(BaseModel):
    title: str = Field(max_length=300)
    page: int | None = None


class HistoryTurn(BaseModel):
    """Echange precedent de la discussion (question de suite : « et ces chiffres ? »)."""
    question: str = Field(max_length=2000)
    answer: str = Field(max_length=4000)
    sources: list[SourceRef] = Field(default_factory=list, max_length=6)


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    # « Relancer » : nouvelle reponse, sans resservir celle en cache.
    regenerate: bool = False
    # Derniers echanges avec leurs sources (seuls les deux derniers sont utilises).
    history: list[HistoryTurn] = Field(default_factory=list, max_length=20)
    language: Literal["fr", "wo", "en", "ff", "srr", "dyo"] = "fr"
    # Comment la question a ete posee (statistiques d'usage uniquement).
    mode: Literal["text", "voice"] = "text"


class Citation(BaseModel):
    document_id: str
    document_title: str
    # Adresse officielle du PDF sur ansd.sn (lien partageable, ex. dans une copie).
    url: str | None = None
    quote: str
    page_start: int | None
    page_end: int | None
    verified: bool


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class DetailSource(BaseModel):
    n: int
    title: str
    page: int | None = None
    url: str | None = None


class QueryResponse(BaseModel):
    question: str
    # answer : reponse tiree des publications ; no_data : rien dans le corpus ;
    # chat : conversation courante (« bonjour », « merci »…), sans recherche ;
    # guide : conseils et etapes pour mener ses recherches, sans chiffre.
    kind: Literal["answer", "no_data", "chat", "guide"] = "answer"
    # Question reformulee de maniere autonome (questions de suite), utilisee pour
    # la recherche ; reprise par « Voir plus ».
    standalone_question: str | None = None
    language: str
    answered: bool
    answer: str
    citations: list[Citation]
    sources_used: list[str]
    model: str
    usage: Usage
    # Reponses « guide » : publications recommandees, referencees [[n]] dans le texte.
    sources: list[DetailSource] = Field(default_factory=list)
    # Langues traduites automatiquement (wolof, pulaar) : la reponse francaise d'origine.
    original_answer: str | None = None


class SourceDocument(BaseModel):
    id: str
    title: str
    publisher: str
    publication_date: str
    filename: str
    description: str


class ExplainRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=8000)
    # Sources de la reponse courte : l'explication s'appuie d'abord sur elles.
    sources: list[SourceRef] = Field(default_factory=list, max_length=6)
    language: Literal["fr", "wo", "en", "ff", "srr", "dyo"] = "fr"


class ExplainResponse(BaseModel):
    # Texte avec des references [[n]] placees apres chaque passage, renvoyant a `sources`.
    details: str
    sources: list[DetailSource] = Field(default_factory=list)


class TitleRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    # Langue de l'interface : le titre affiche dans l'historique est traduit dans cette langue.
    language: Literal["fr", "wo", "en", "ff", "srr", "dyo"] = "fr"


class TitleResponse(BaseModel):
    title: str


class TrackRequest(BaseModel):
    event: Literal["details_open", "listen"]


class FeedbackRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=8000)
    language: Literal["fr", "wo", "en", "ff", "srr", "dyo"] = "fr"
    rating: Literal["up", "down"]
    comment: str | None = Field(default=None, max_length=1000)


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    language: Literal["fr", "wo", "en", "ff", "srr", "dyo"] = "wo"
