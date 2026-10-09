# XAM-XAM — web

Next.js (App Router) implementation of the XAM-XAM screens. `/accueil`, the
live product, has moved past the original Claude Design handoff
(`../project/XAM-XAM.dc.html`, brief in `../chats/chat1.md`) into its own
Tailwind-based visual direction (see "Two visual systems" below); `/vocal`
is also live, still in the original handoff's visual language. The other
four screens still recreate that original handoff pixel-faithfully with
nothing wired up.

## Scope

**`/accueil` is a real, working app**, wired to `../backend`: it posts every
question to `POST /api/query`, renders the actual grounded answer or
explicit refusal returned, lists the live `GET /api/sources` périmètre
instead of a hardcoded list, and opens a traceability panel per citation
built from real response fields (`document_title`, page, exact quote,
`verified`) plus a "Consulter la publication" link to the backend's
`/files/<filename>` static mount. The empty-state headline figures (18 126
390 habitants, 107 opérations, 62,9 % alphabétisation) stay hardcoded —
they're institutional communication copy, not something the RAG endpoint
serves.

**The mic on `/accueil` is fully wired too**, in all three languages.
Pressing it drops straight into the conversation view — a "recording" turn
is added immediately (the same `turns.length > 0` check that already
switches from the hero to the chat log does the rest, so no separate
transition logic was needed), as if a question had already been started.
Once recording stops, the clip becomes playable in that same bubble right
away (`onRecorded` in `lib/voice.ts`, before the transcript is even back),
while transcription — then the RAG answer — are still in flight, and the
turn auto-asks the moment a transcript arrives (no manual "send" step).
Every answered turn also gets an "Écouter" button. Mic capture state lives
in the page (`app/accueil/page.tsx`), not in `Composer`, on purpose: the
hero `Composer` instance unmounts the moment the first turn appears —
mid-recording, by design — and a capture state owned by `Composer` itself
would be lost at exactly that moment; `Composer` just reflects a `listening`
prop instead.

**`/vocal` is also real**, as a dedicated hands-free wolof mode: same
`captureVoice`/`speakText` plumbing (`lib/voice.ts`), auto-asks the moment
a transcript is back, reads the answer aloud automatically, and also shows
the user's own recording alongside the transcript. Typing into the footer
bar instead of speaking works too. Two fields from the original mockup are
dropped rather than faked: the big "figure" callout and the bilingual
glossary panel assumed a structured-data layer this backend doesn't have
(the same reason `/tracabilite`'s live panel on `/accueil` drops its
"valeur brute avant arrondi" field) — the answer renders as prose plus real
citations instead, like `/accueil`.

**Voice provider, by language** (`lib/voice.ts` calls `/api/voice/*` on the
backend either way — the frontend never talks to a provider directly, see
`../backend/README.md#voice-io`): wolof goes through Soynade; French/English
go through Mistral's own Voxtral speech models (same `MISTRAL_API_KEY` as
the RAG pipeline, no separate account). An earlier version of this feature
ran French/English through the browser's built-in Web Speech API instead —
dropped for a noticeably robotic voice, no `SpeechRecognition` in Firefox
at all, inconsistent Safari support, and it sent audio to Google's servers.
Missing the relevant key doesn't break anything else: only the affected
voice call fails, with a clear error, while everything else — including
text chat in that same language — keeps working.

### Two visual systems, on purpose

`/accueil` was deliberately restyled away from the original brief's sobre
institutional constraints (no gradients, no glassmorphism, no glow — see
`../chats/chat1.md`) toward a more vibrant, modern product look: gradients,
soft shadows/glow, glass panels, Motion micro-interactions. That's a
requested visual-direction change, not scope creep — it lives entirely in
`components/chat/` (Tailwind) and doesn't touch `/vocal` or the four
reference screens below, which all still use the original CSS-Modules
components and design tokens and remain faithful to the approved mockup.
`app/globals.css` now carries both token systems side by side: a `@theme`
block (Tailwind utilities like `bg-brand-600`, `from-accent-400`) for
`/accueil`, and the original `:root { --c-* }` custom properties for
everything else.

The other four screens stay **static design references**, each for a
concrete reason rather than by omission:
- `/reponse-graphique` needs EHCVM poverty data the backend doesn't have
  loaded (see `../backend/README.md`) — wiring it would mean either
  fabricating a chart or always showing a refusal, neither of which
  demonstrates the intended screen.
- `/tracabilite`'s original mockup fields (valeur brute avant arrondi,
  identifiant de cellule en base) assume a structured-data validator this
  backend's PDF-citation architecture doesn't have — see the simplified,
  *live* version of this panel on `/accueil` instead.
- `/reponse-chiffree` (its original hardcoded content) is kept as the
  original approved mockup for reference alongside `/accueil`'s live
  equivalent.

Question fields and buttons on these four are real, focusable, semantic
elements (for keyboard-focus accessibility) but intentionally not wired.

- `/` — redirects straight to `/accueil` (so visiting the site lands on the real app, not a design index)
- `/accueil` — 1. Accueil — **live, backend-connected chat interface**
- `/reponse-chiffree` — 2. Conversation, réponse chiffrée sourcée (static reference)
- `/reponse-graphique` — 3. Réponse avec graphique (static reference)
- `/refus` — 4. Refus explicite (static reference)
- `/tracabilite` — 5. Panneau de traçabilité (static reference — see the live version on `/accueil`)
- `/vocal` — 6. Mode vocal wolof — **live**, see "Scope" above
- `/sommaire` — index of all six screens with links (the former `/`), kept for browsing the static references

## Structure

- `app/globals.css` — both token systems (see "Two visual systems" above):
  the Tailwind `@theme` block and the brief's original `--c-*` tokens.
- `lib/voice.ts` — mic capture (`captureVoice`) and read-aloud (`speakText`),
  shared by `/accueil`'s `Composer` and `/vocal`. One code path for every
  language: record via `MediaRecorder`, upload to the backend, which picks
  Soynade or Mistral server-side (see `../backend/README.md#voice-io`) — the
  frontend doesn't special-case any language itself.
- `components/chat/` — `/accueil`-only, Tailwind + [Motion](https://motion.dev):
  `ChatHeader`, `Composer`, `CitationCard`, `TracePanel`, `TypingIndicator`.
  `Composer`'s mic is purely presentational (`listening` / `onMicClick`
  props) — capture itself is owned by `app/accueil/page.tsx`, not the
  component, so it survives the hero → conversation layout swap (see
  "Scope" above for why that matters). Icons from `lucide-react`.
  `lib/utils.ts`'s `cn()` (clsx + tailwind-merge) is the className helper
  used throughout.
- `components/` (top level) — shared pieces reused across `/vocal` and the
  four *reference* screens: `Header`, `QuestionBar`, `ReliabilityBadge`
  (étiquette de fiabilité), `Citation` (ligne de citation, filet bleu),
  `TintPanel` (encadré de définition / glossaire / granularité),
  `ActionButton`, and the linear icon set in `icons.tsx`. `Header` and
  `QuestionBar` are also used, in their original CSS-Modules styling, by
  nothing in `/accueil` anymore — `components/chat/` replaced them there.
  `QuestionBar`'s mic button is wired only on `/vocal` (`onMicClick` /
  `micRecording` props) — everywhere else it stays a real but unwired
  button, same as the rest of the four reference screens.
- `app/<screen>/page.tsx` + `page.module.css` — one route per reference
  screen; `app/accueil/page.tsx` has no `.module.css`, it's Tailwind classes
  directly.

## Run

Needs `../backend` running too (see `../backend/README.md`), or use
`../start.sh` at the repo root to run both via Docker.

```bash
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL, defaults to http://localhost:8000
npm install
npm run dev
```

`lib/api.ts` is the typed client for the backend — its shapes mirror
`../backend/app/schemas.py` exactly; if that changes, update both.

## Next steps if this becomes the real product

- Add EHCVM (and the other brief-named sources) to the backend corpus, then
  wire `/reponse-graphique`'s chart to a real series instead of retiring it.
- `Header`'s language switch already drives real `language` values sent to
  the backend (fr/wo/en) — what's still missing is translating the
  interface chrome itself (labels, buttons) if that's ever required beyond
  the assistant's own answers.
