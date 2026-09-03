# Relationship Semantics V1 Reasoning

## Why One Relationship Model Still Works

The backend keeps a single `Relationship` model instead of splitting kinship, romance, political office, residence, and membership into separate tables. The repo is still validating the extraction-review workflow, and a single relationship storage model keeps CRUD, extraction targets, and search/indexing simpler. The semantics move into backend code through a relationship catalog rather than through a wider schema split.

## Why Relationship Meaning Lives In A Catalog

The earlier schema already stored directed relationship rows. The unresolved problem was meaning:

- which relationship types exist
- which source and target entity types are legal
- which types are symmetric
- how reverse labels should render
- how custom extensions should stay structured instead of turning into free text

A backend-owned catalog solves that without adding a `relationship_types` lookup table for built-ins. Built-ins stay in code so they remain easy to refine. Campaign custom types persist in the database because they are user-created campaign assets, not static application vocabulary.

## Why Entity Types Changed

The old entity vocabulary (`npc`, `artifact`, `faction`, `lore`) did not fit the relationship design well. The relationship catalog needs broad top-level types that can validate both user-entered and extracted assertions cleanly. The new set:

- `person`
- `location`
- `organization`
- `item`
- `event`
- `deity`
- `other`

matches the campaign source material better and leaves room for later subtyping without locking v1 into narrow gameplay-specific buckets.

## Why Status Became Three Fields

The relationship discussion surfaced that `current/former`, `public/secret`, and `confirmed/rumored` are different dimensions. A single status enum would collapse them into awkward combinations and make later filtering harder. Splitting them into:

- `lifecycle_status`
- `visibility_status`
- `certainty_status`

keeps the semantics explicit and allows combinations like:

- current + secret + confirmed
- former + public + rumored

without inventing a larger status enum.

## Why Confidence Stayed But Lost Semantic Authority

`certainty_status` answers the GM-facing question: how should the campaign treat this assertion?

`confidence` answers a different question: how strongly did an extraction or matching system believe the candidate?

Keeping both is useful, but only if they are not treated as the same thing. The implementation keeps `confidence` as provenance/scoring context and keeps `certainty_status` as the semantic truth posture.

## Why Custom Types Are Structured

The user wanted extension beyond the built-in list, but not a Kanka-style free-text free-for-all. The implemented custom type flow therefore requires:

- a label
- a normalized key
- a family
- source and target top-level type rules
- symmetry or reverse-label metadata

That keeps custom types reusable and queryable while avoiding ontology drift from one-off text labels on individual relationship rows.

## Why Semantic Custom Type Fields Lock After First Use

Allowing users to edit a custom type’s label is safe. Allowing them to rewrite its family, symmetry, or allowed entity types after relationships already depend on it can invalidate existing rows or silently change meaning. The medium editability model keeps the useful flexibility while avoiding retroactive data drift:

- label and reverse label stay editable
- semantic fields lock after the type is used
- used types cannot be deleted

## Why Inference Was Deferred

The conversation surfaced real examples like `grandparent_of` and sibling transitivity. Those rules are tempting, but the minute the backend starts inferring canonical rows it also needs:

- provenance for the inferred edge
- invalidation when source assertions change
- guardrails for non-transitive family relations
- a clear user review path

That is too much domain complexity for this step. The implementation therefore stores asserted relationships only and leaves inference for a later read-only or approval-based feature.
