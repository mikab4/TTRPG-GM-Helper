# RPG GM Helper Demo Script

Use this script to demonstrate the first milestone once the application is implemented.

## Demo Goal

Show the end-to-end workflow from free-text notes to searchable structured campaign data.

## Demo Flow

1. Create a campaign.
2. Open the campaign detail page and show that it starts empty.
3. Upload a source asset or paste/import session material into the asset ingestion flow.
4. Run extraction on that text.
5. Review the extracted candidate entities and relationships.
6. Approve a subset of candidates and reject or edit one candidate to show human review.
7. Open the saved entity records and show their provenance back to the source note.
8. Run a keyword search for one extracted character, location, or faction.
9. Show that search returns both structured entity results and related notes.

## What The Demo Should Prove

- the app stores campaign data in a structured way
- free text can be turned into candidate records
- extracted data is reviewed before becoming canonical
- saved records remain searchable
- the product preserves a clean evidence-to-canonical workflow

## Recommended Demo Data

Use one short session summary with:
- 2-3 characters
- 1-2 locations
- 1 faction or organization
- 1 item or quest reference

See [sample notes](sample-notes/README.md) for a starter fixture.
