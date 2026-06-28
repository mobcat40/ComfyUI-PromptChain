# Relicensing checklist (maintainer)

PromptChain ships under [AGPL-3.0](../LICENSE). This note records what must be
true to relicense the project — or a future version — under a permissive license
such as MIT. It is a maintainer reference, not part of the contributor terms.

Two independent things must **both** hold. The contributor grant only handles
the first; the second is on you regardless of any contributor terms.

## 1. Every contributor's code is relicensable

- Outside contributions are covered by the relicensing grant in
  [CONTRIBUTING.md](../CONTRIBUTING.md) **only if** they were submitted after
  that file existed and the contributor accepted the terms (by opening a PR).
- **Invariant:** no outside contribution may predate the CONTRIBUTING.md commit.
  History is currently 100% single-author (mobcat40), so this holds. If it ever
  stops holding, get an explicit written grant from that author before
  relicensing — the grant cannot reach backwards.
- The grant is a *license*, not an assignment: contributors keep copyright, and
  the AGPL availability of already-published versions cannot be withdrawn. That
  does not block offering *future* versions under MIT.
- Route all outside contributions through PRs so the assent trigger always
  fires. A DCO ("Signed-off-by") is **not** a substitute — it certifies origin,
  not a relicensing right.
- Strongest hardening, cheapest before outside PRs arrive: enable **CLA
  Assistant** as a required status check, so each contributor's grant is backed
  by a recorded, identity-bound signature rather than only the PR-template line.

## 2. Every bundled / vendored third-party component is MIT-compatible

The contributor grant covers only what contributors submit — it does nothing for
third-party code the project incorporates. A whole-project MIT relicense
additionally requires that **every** copyrightable component be MIT-compatible.

- Copyleft third-party code (GPL / AGPL / LGPL source) **cannot** be relicensed
  to MIT. Keep it as an *external dependency* loaded at runtime, not vendored
  into this tree. Vendoring a copyleft node pack's source would block a clean
  MIT relicense — watch this when doing full-install / vendoring work.
- Permissive third-party code (MIT / BSD / Apache-2.0) may be included, but its
  own license notices and attribution must be retained. The result is then
  "MIT project + retained third-party notices," not a single bare MIT file.
- Before relicensing, inventory `bundled_packs/`, `vendor/`, and
  `requirements.txt` and confirm each component's license.
