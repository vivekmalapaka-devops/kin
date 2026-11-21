# Editorial health journal design

The design pass connects overview, report details, test history and report review while preserving the existing family permissions, result classifications and private report storage.

- Use a calm paper-like neutral canvas, deep green text and restrained status colors. Helvetica-style typography and thin rules provide the hierarchy.
- Show the latest report's actual date, summary counts and notable results. Include the lab reference and a previous comparable value when available; do not infer improvement or clinical meaning from the direction of change.
- Preserve the shortcut from a notable result to its exact row in the report. Provide a separate action from a report row to the corresponding test history.
- Provide a clear overview of individual results, filters and a link to the original PDF. Do not invent lab sections that were not extracted.
- Let mobile users switch between the PDF and extracted results during review; desktop keeps both visible. Page links use the source page saved with each result.
- In history, maintain accessible text results and graph labels. Color must never be the only status indicator.
- Verify comparisons only use confirmed reports, the same test name, same unit and a strictly earlier date. Ambiguous duplicates and non-numeric values should have no calculated change.
- Preserve existing data flows and run the React build, component checks and classification tests. Browser and device checks remain necessary where a browser cannot be run.
