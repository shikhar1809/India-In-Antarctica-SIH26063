# Public API

Everything NCPOR has published, readable by anyone, no key required.

**Base:** `https://asia-south1-indiainantartica.cloudfunctions.net/api`

Implemented in [`functions/index.js`](../functions/index.js). Read-only by
design — there is no write path. Publishing happens in the portal, behind
Firebase Auth and the admin check in `firestore.rules`.

## Endpoints

### `GET /api/records`

Every published record, newest first.

| Query | Values | Effect |
|---|---|---|
| `station` | `maitri` `bharati` `dakshin` `ship` `ncpor` | Filter by station |
| `category` | `expedition` `dataset` `publication` `media` `institution` | Filter by type |
| `limit` | 1–200 (default 100) | Cap results |

```bash
curl 'https://asia-south1-indiainantartica.cloudfunctions.net/api/records?station=maitri&limit=5'
```

```json
{
  "count": 5,
  "records": [
    {
      "id": "field-demo-maitri-ice",
      "title": "Measuring the ice at Maitri",
      "kind": "Dataset",
      "station": "maitri",
      "year": "2026",
      "body": ["On 22 January 2026, a field team drilled through the ice …"],
      "table": [{ "label": "Ice thickness", "value": "164 cm" }],
      "measurements": [
        { "fieldId": "iceThickCm", "label": "Ice thickness", "value": "164", "unit": "cm" }
      ],
      "chart": {
        "kind": "bar", "unit": "cm",
        "data": [{ "label": "Ice thickness", "value": 164 }]
      },
      "metadata": {
        "identifier": "IIA-2026-0001",
        "creators": [{ "name": "Dr A. Sharma", "affiliation": "NCPOR" }],
        "publisher": "NCPOR",
        "resourceType": "Dataset",
        "spatial": { "lat": -70.7659, "lon": 11.7314, "datum": "WGS84" },
        "temporal": { "observedAt": 1769068800000 },
        "license": "CC BY 4.0",
        "provenance": { "sourceType": "dispatch", "sourceId": "…" }
      }
    }
  ],
  "source": "National Centre for Polar and Ocean Research (NCPOR), Ministry of Earth Sciences"
}
```

### `GET /api/records/:id`

One record, as `{ "record": { … } }`. `404` if it isn't published.

### `GET /api/stats`

```json
{
  "total": 13,
  "byCategory": { "dataset": 5, "expedition": 4, "publication": 2, "institution": 1, "media": 1 },
  "byStation": { "maitri": 6, "bharati": 4, "dakshin": 1, "ncpor": 1, "ship": 1 },
  "observationRange": { "from": "1981-01-01T00:00:00.000Z", "to": "2026-01-29T11:30:00.000Z" }
}
```

## Direct Firestore access

`publicArchive` is world-readable, so it is also reachable with no server at
all — useful as a fallback:

```
GET https://firestore.googleapis.com/v1/projects/indiainantartica/databases/(default)/documents/publicArchive
```

This returns Google's typed-value wrapper (`{"title":{"stringValue":"…"}}`),
which is why the Cloud Function exists.

## Notes for consumers

- **CORS** is open (`*`) on all endpoints.
- **Caching**: `public, max-age=300, s-maxage=600`.
- **Licence** is per record, in `metadata.license`. Attribute using
  `metadata.creators` and `metadata.identifier`.
- **Ordering** with a filter is done in memory, so a composite Firestore index
  isn't needed. Fine at this collection size; revisit past a few thousand
  records.
- Raw field reports are **not** exposed here and never will be. What you see
  is a projection built for publication — see
  [ARCHITECTURE.md](ARCHITECTURE.md).
