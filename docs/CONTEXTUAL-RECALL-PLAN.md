# Contextual Recall — Planning Document

**Status**: Draft — updated 2026-04-14 with knowledge graph synthesis
**Author**: drafted with Claude
**Related**: `SPEC.md`, `HOW-LEARNING-WORKS.md`, `OPEN-SOURCE-AND-AGENT-NATIVE-PLAN.md`

---

## 1. The Problem (in plain language)

The Resilience Companion already captures a lot of learning: ORRs, incidents, discoveries, dependencies, contributing factors, action items, experiment suggestions, and case studies. But all of that knowledge is **trapped in the practice it was created in**.

When a team starts a new ORR for service A, the agent doesn't know:

- That the same service had an incident two months ago whose contributing factors are directly relevant
- That another team's ORR on a similar architecture flagged a blind spot the team is about to walk into
- That a public postmortem (Cloudflare 2022, AWS 2021, etc.) describes the same failure mode they're discussing

Today's "retrieval" is substring search inside the *current* practice. There is no cross-practice memory.

The goal of this work is **cross-practice contextual recall**: let the agent surface relevant prior learning at the right moments in a conversation, so teams build on what's already been learned instead of rediscovering it.

---

## 2. Trigger moments

Retrieval is worthless if the agent doesn't know when to ask. These are the **trigger moments** — points in a conversation where prior context would change the conversation's direction.

| # | Trigger | What we'd retrieve | Why it matters |
|---|---------|--------------------|----------------|
| T1 | New dependency discovered in an ORR | Prior incidents touching that dependency (any team) | "This dependency caused a 4h outage on payments service in Jan" |
| T2 | Section assessed SURFACE despite multiple turns | Prior ORRs of the same service or similar architecture | The team is stuck — show them what previous reviews surfaced |
| T3 | Contributing factor logged in incident analysis | Public postmortems with same failure category + prior internal incidents with same factor | "AWS S3 had this exact failure mode in 2017" |
| T4 | New ORR started for a service | The most recent ORR for that service + any incidents since | Continuity — don't make teams re-derive what last quarter's review found |
| T5 | Engagement zone = FRUSTRATED (from Phase 1) | Anything relevant — used as a circuit-breaker hint | "Other teams found this hard too, here's what unstuck them" |
| T6 | `record_discovery` called | Similar prior discoveries across practices | Detect repeated discoveries → systemic blind spot |

**Priority**: T1, T3, T4 are must-haves (structural queries). T2, T5, T6 are nice-to-haves (analytics queries). Build for the must-haves first.

---

## 3. The insight: it's already a graph

Previous versions of this plan debated three storage approaches:
- **Path A** (sqlite-vec): embed everything, cosine similarity, fast but no structure
- **Path B** (MemPalace): structured memory sidecar, temporal validity, but new dependency
- **Path C** (knowledge graph): graph traversals, structural queries, relationship-aware

After studying [Graphify](https://github.com/safishamsi/graphify) (knowledge graphs + MCP), [unlost](https://github.com/unfault/unlost) (intent-based retrieval), and [MemPalace](https://github.com/mempalace) (temporal validity), the synthesis is clear:

**The Companion's data is already a knowledge graph — we just haven't made it explicit.**

```
Service ──has_dependency──→ Dependency
Service ──reviewed_in──→ ORR ──has_section──→ Section
Section ──surfaced──→ Discovery
Section ──assessed_at──→ Depth (SURFACE/MODERATE/DEEP)
Incident ──involved──→ Service
Incident ──had_factor──→ Contributing Factor
Contributing Factor ──similar_to──→ Teaching Moment
Discovery ──contradicts──→ Prior Assessment
Team ──owns──→ Service
```

The queries we need for T1, T3, T4 are **graph traversals**, not similarity searches:
- T1: `Dependency → involved_in → Incident → had_factor → Contributing Factor` (what do we know about this dependency?)
- T3: `Contributing Factor → similar_to → Prior Incidents + Public Postmortems` (what else had this failure mode?)
- T4: `Service → reviewed_in → Prior ORRs + recent Incidents` (what's happened since last review?)

These are path queries, not "find me something semantically similar." The graph structure is the retrieval mechanism.

---

## 4. Implementation: Postgres + Apache AGE

The Companion is moving to Postgres for production (multi-team, shared org database — see `OPEN-SOURCE-AND-AGENT-NATIVE-PLAN.md` P4). This unlocks **Apache AGE** — a graph extension that adds Cypher queries to Postgres. No separate graph database, no sidecar, no sync layer.

### Why this collapses the three-path decision

| | Path A: sqlite-vec | Path B: MemPalace | **Synthesis: Postgres + AGE** |
|---|---|---|---|
| Query style | "What's similar to X?" | Structured rooms + temporal | "What's connected to X?" |
| Temporal validity | Manual filters | Built-in | Edges have `created_at`, `validated_at`, `confidence` |
| Structural queries | No | No | Native — it's a graph |
| New infrastructure | SQLite extension | Python sidecar | None — it's the same Postgres |
| Trigger coverage | T3 (semantic) | T4 (temporal) | T1, T3, T4 (structural + temporal) |
| Learning measurement | Separate analytics | Separate analytics | **Graph topology IS the measurement** |

### The graph as learning measurement

This is the connection back to the book's core argument — measure learning, don't count checklists:

- **Discovery rate** = new nodes added per session
- **Blind spots** = high-degree nodes (critical services, key dependencies) with no recent edges
- **Drift** = edges older than staleness threshold without revalidation
- **Team knowledge depth** = subgraph density per team
- **Cross-team learning** = edges between team subgraphs
- **Productive struggle** = sessions that added nodes to sparse areas (not just reinforcing known areas)

The graph's topology *is* the measurement. No separate analytics layer needed.

### Example queries

**T1 — Dependency discovered:**
```sql
SELECT * FROM cypher('resilience', $$
  MATCH (d:Dependency {name: 'Redis'})-[*1..3]-(related)
  RETURN related, labels(related), type(relationships(related))
  ORDER BY related.created_at DESC
$$) as (result agtype);
```

**T4 — New ORR started:**
```sql
SELECT * FROM cypher('resilience', $$
  MATCH (s:Service {name: 'payments'})-[:reviewed_in]->(orr:ORR)
  OPTIONAL MATCH (s)-[:involved_in]->(i:Incident)
  WHERE i.created_at > orr.created_at
  RETURN orr, collect(i) as incidents_since
  ORDER BY orr.created_at DESC LIMIT 1
$$) as (result agtype);
```

**Blind spot detection:**
```sql
SELECT * FROM cypher('resilience', $$
  MATCH (s:Service)-[:has_dependency]->(d:Dependency)
  WHERE NOT EXISTS {
    MATCH (d)-[:involved_in|surfaced_in]->(anything)
    WHERE anything.created_at > date() - interval '6 months'
  }
  AND size((d)-[]-()) > 3
  RETURN d.name, size((d)-[]-()) as connection_count
$$) as (result agtype);
```

---

## 5. Intent-based tool vocabulary

Inspired by [unlost](https://github.com/unfault/unlost)'s four-direction model. Tools are named after *intent*, not CRUD operations. Each intent maps to a graph operation.

| Intent | Tool name | Graph operation | Maps to triggers |
|--------|-----------|----------------|------------------|
| **Recall** | `recall` | Traverse from a node — surface connected ORRs, incidents, discoveries, postmortems | T1, T3, T4, T6 |
| **Reflect** | `reflect` | Subgraph analysis — density, recency, depth trends, blind spots | T2, measurement |
| **Challenge** | `challenge` | Find contradicting paths — incidents that disprove assessments, drift since last review | T3, T5 |
| **Explore** | `explore` | Shortest paths between nodes — "what if Redis AND primary DB fail?" | T3 (public postmortems) |

These tools are exposed:
1. To the **internal facilitator agent** — called at trigger moments during ORR/incident sessions
2. As **MCP tools** — callable by external agents (Claude Code, Cursor, etc.)
3. Via **Slack** — the bot can answer "what do we know about Redis?" in a channel

Same interface, same backend, multiple consumers.

**Why this framing matters**:
- The old tool names (`retrieve_prior_learnings`, `get_prior_incidents`) describe *mechanism*. These describe *purpose*.
- The four intents map cleanly onto the book's learning cycle: recall = prior knowledge, reflect = meta-learning, challenge = productive struggle, explore = discovery.
- The backend changes (SQLite → Postgres → AGE) without the interface changing.

---

## 6. How the graph grows

No separate ingestion pipeline. The graph grows from existing DB writes:

| When this happens | Nodes created | Edges created |
|---|---|---|
| ORR created | ORR node | Service → ORR |
| Section updated | Section node (if new) | ORR → Section |
| Discovery recorded | Discovery node | Section → Discovery |
| Dependency logged | Dependency node (if new) | Service → Dependency |
| Depth assessment updated | — | Section → Depth (update edge) |
| Incident created | Incident node | Service → Incident |
| Contributing factor logged | Factor node | Incident → Factor |
| Action item created | Action node | Section/Incident → Action |
| Teaching moment matched | — | Factor → Teaching Moment |

Each edge carries metadata:
- `created_at` — when the relationship was established
- `confidence` — EXTRACTED (from explicit user action) vs INFERRED (by the agent)
- `validated_at` — last time this edge was confirmed (refreshed on ORR re-review)
- `invalidated_by` — optional pointer to an incident/discovery that contradicts this edge

---

## 7. Database migration path

| Phase | Database | Graph | Dev experience |
|---|---|---|---|
| **Now** | SQLite (better-sqlite3) | None | `npm run dev` — zero config, no containers |
| **Phase 1** | Postgres (Drizzle + node-postgres) | Relational joins only | `docker compose up` — Postgres only runs in containers |
| **Phase 2** | Postgres + Apache AGE extension | Cypher queries on same data | Same `docker compose up`, AGE loaded as extension |

**SQLite stays for local dev**. If `DATABASE_URL` is set → Postgres; otherwise → SQLite. `npm run dev` works with zero config, no containers needed. `docker compose up db` starts just Postgres for devs who want to test against it. **Postgres never runs natively — containers only.** Postgres is the production target.

**Phase 1 → Phase 2 is incremental**. The intent tools (`recall`, `challenge`, etc.) start as SQL joins in Phase 1. When AGE is added, they switch to Cypher queries. The MCP/Slack/Skills interface doesn't change.

---

## 8. Phase 1 work breakdown

1. **Postgres migration**: Drizzle dialect swap, docker-compose with Postgres container, migration scripts. Keep SQLite for local dev via env flag.
2. **Graph-aware writes**: Every `record_discovery`, `update_section`, `log_incident` etc. also maintains relationship metadata (initially as regular Postgres tables — `graph_nodes`, `graph_edges`). This is the materialized graph, built from the same writes.
3. **Four intent tools**: `recall`, `reflect`, `challenge`, `explore` — implemented as SQL joins over the graph tables. Exposed to internal agent AND as MCP tools.
4. **System prompt**: Teach the agent trigger moments (T1, T3, T4) explicitly, framed using the intent vocabulary. This is the behavioral work — non-negotiable regardless of storage.
5. **Tracing**: Log every retrieval call with intent, query, results, and whether the agent cited them.
6. **Tests**: Graph construction correctness, retrieval on a fixture corpus, prompt-trigger smoke tests.

**Phase 2 (only after Phase 1 proves value)**:
- Add Apache AGE extension
- Migrate intent tools from SQL joins to Cypher queries
- Community detection (Leiden) for automatic cluster discovery
- Cross-team retrieval (opt-in)
- Public postmortem ingestion
- Graph visualization in dashboard (sparse areas glow red)

---

## 9. Open questions

1. ~~Trigger priorities~~ — **Resolved**: T1, T3, T4 are must-haves.
2. **Team scoping**: Start strictly per-team, or allow opt-in cross-team retrieval? With an org-wide Postgres DB, cross-team is technically trivial — the question is whether it's useful or noisy.
3. ~~Embedding provider~~ — **Resolved**: No embeddings needed. Graph traversals replace similarity search.
4. **Public postmortems**: Ingest as nodes in the graph? Or defer until internal graph proves useful?
5. ~~Path A vs B vs C~~ — **Resolved**: Knowledge graph via Postgres + AGE.
6. ~~Intent vocabulary~~ — **Resolved**: recall / reflect / challenge / explore.
7. **AGE vs plain SQL**: Is Phase 1 (SQL joins) sufficient indefinitely, or is AGE's Cypher genuinely needed for multi-hop queries? Could skip AGE entirely if SQL joins handle everything.

---

## 10. What this plan deliberately does NOT do

- Pick a graph database (Neo4j). Postgres + AGE runs in the same container with the same connection pool.
- Use embeddings. The data is structured — graph traversals beat cosine similarity for our query patterns.
- Build a separate ingestion pipeline. The graph grows from existing writes.
- Add a Python sidecar (MemPalace, NetworkX, Graphify). Everything runs in-process in TypeScript.
- Build retrieval before agreeing on trigger moments. The behavioral work (system prompt) comes first.
- Treat this as a search feature when it's really a learning feature. The graph topology IS the learning measurement.
- Name tools after CRUD verbs when intent verbs are clearer.

---

## 11. Inspirations and what we took from each

| Project | What we took | What we left |
|---|---|---|
| [Graphify](https://github.com/safishamsi/graphify) | Knowledge graph model, MCP query interface, confidence scoring on edges, persistent graph | AST parsing, Python/NetworkX, file-based ingestion |
| [unlost](https://github.com/unfault/unlost) | Intent-based tool vocabulary (recall/reflect/challenge/explore) | Memory palace metaphor |
| MemPalace | Temporal validity on edges (findings expire, get invalidated) | Python sidecar, sync layer |
| [caveman](https://github.com/JuliusBrussee/caveman) | Evidence-in-the-repo (graph is exportable, versionable) | Multi-platform packaging, telegram voice |
| The book | Graph topology as learning measurement | — |
