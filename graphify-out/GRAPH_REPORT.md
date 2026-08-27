# Graph Report - .  (2026-08-07)

## Corpus Check
- Large corpus: 254 files · ~4,255,814 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1427 nodes · 3374 edges · 1 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.7)
- Token cost: 103,603 input · 0 output

## Community Hubs (Navigation)
- Uncategorized (clustering skipped)

## God Nodes (most connected - your core abstractions)
1. `Repository` - 60 edges
2. `json()` - 58 edges
3. `fetch()` - 48 edges
4. `scripts` - 44 edges
5. `warn()` - 42 edges
6. `pickString()` - 36 edges
7. `info()` - 35 edges
8. `writeSqlFile()` - 27 edges
9. `readSourceRows()` - 22 edges
10. `writeNormalizedSource()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `README.md project overview (단지戰 MVP)` --semantically_similar_to--> `Cloudflare Pages Deployment doc`  [INFERRED] [semantically similar]
  README.md → docs/deployment.md
- `GEMINI.md AI Development Guidelines` --conceptually_related_to--> `README.md project overview (단지戰 MVP)`  [AMBIGUOUS]
  GEMINI.md → README.md
- `생활안전지도 sm-apis raw response (키 값 불일치 alert)` --conceptually_related_to--> `공사정보 수집 실행안 (construction data ingestion plan)`  [INFERRED]
  logs/raw/lifesafety-construction.sm-apis.raw.txt → docs/data-ingestion-plan.md
- `생활안전지도 getLayerData raw response (500 error page)` --conceptually_related_to--> `Collect District Data (CI workflow)`  [INFERRED]
  logs/raw/lifesafety-construction.getLayerData.raw.txt → .github/workflows/collect-data.yml
- `README.md project overview (단지戰 MVP)` --conceptually_related_to--> `공사정보 수집 실행안 (construction data ingestion plan)`  [INFERRED]
  README.md → docs/data-ingestion-plan.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Shared API key env vars (KAKAO_REST_API_KEY, DATA_GO_KR_SERVICE_KEY) across pipeline config & docs** — _github_workflows_collect_data_workflow, readme_overview, docs_data_ingestion_plan_overview [EXTRACTED 1.00]
- **whatsinhere.pages.dev deployment identity (domain, Kakao key config, Pages settings) shared across docs and entry HTML** — readme_overview, docs_deployment_overview, index_app_entry [INFERRED 0.85]
- **생활안전지도/공사정보 data collection failure signals** — logs_raw_lifesafety_construction_getlayerdata_raw_response, logs_raw_lifesafety_construction_sm_apis_raw_response, docs_data_ingestion_plan_overview [INFERRED 0.65]
- **Three-pin category layout depicting construction, primary location, and building development types** — public_og_image_pin_construction, public_og_image_pin_main, public_og_image_pin_building [INFERRED 0.85]

## Communities (1 total, 0 thin omitted)

### Community 0 - "Uncategorized (clustering skipped)"
Cohesion: 1.00
Nodes (1145): firebase, npx, markers, defaultCenter, FUNCTIONS_NEARBY_URL_CANDIDATES, TYPE_LABELS, HIGHLIGHT_PROJECTS, bootstrap() (+1137 more)

## Ambiguous Edges - Review These
- `GEMINI.md AI Development Guidelines` → `README.md project overview (단지戰 MVP)`  [AMBIGUOUS]
  GEMINI.md · relation: conceptually_related_to

## Knowledge Gaps
- **360 isolated node(s):** `npx`, `markers`, `defaultCenter`, `FUNCTIONS_NEARBY_URL_CANDIDATES`, `TYPE_LABELS` (+355 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GEMINI.md AI Development Guidelines` and `README.md project overview (단지戰 MVP)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What connects `npx`, `markers`, `defaultCenter` to the rest of the system?**
  _360 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Uncategorized (clustering skipped)` be split into smaller, more focused modules?**
  _Cohesion score 0.0033161302116760413 - nodes in this community are weakly interconnected._