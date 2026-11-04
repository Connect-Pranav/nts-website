# Agent Mapping — NTS Website 2.0

Source of truth: `Connect-Pranav/Ganesha-AI-Studio@bc8b2c3:agents/registry.json` (31 agents).
**No new agent is defined.** Four existing agents are *bound* to NTS through `agents/registry.json` in this repo. Each binding has an NTS-only scope, its own D1 database and its own logs. Ganesha's files are not touched, and GANESHA GROWTH AI (MUSHAK) is not used.

| Capability | Existing agent ID | Name | Why this one | NTS scope | Permissions in NTS | Approval required | Status |
|---|---|---|---|---|---|---|---|
| A. Master Orchestrator | `ganesha_orchestrator` | GANESHA | Its mission is exactly goal → pipeline → delegate → consolidate | Runs the content workflow, delegates to B/C/D, handles retries and errors | `read:content`, `write:jobs`, `write:agent_logs` | `publish_content` | **Selected** |
| B. Brand & Content (LinkedIn Content Writer) | `ops_maya_docs` | MAYA-OPS | Closest studio-level writer (SOPs, docs, notes). No existing agent writes blogs, so the scope is extended rather than duplicated | Blogs, tutorials, articles, captions, repurposing, brand-voice checks | `read:content`, `write:drafts` | — (drafts only) | **Selected** |
| C. Social Media (LinkedIn, Instagram, YouTube) | `ops_lakshmi_growth` | LAKSHMI-OPS | Studio-level growth & distribution with a `publish_content` gate already in its contract | Platform adaptation, scheduling, publishing via official APIs, status | `read:drafts`, `write:jobs`, `publish:approved_only` | `publish_content` | **Selected** |
| D. Growth & Analytics | `ops_soma_analytics` | SOMA | Already analyses channel performance from platform APIs | Channel reports, engagement, comparisons, recommendations | `read:analytics`, `write:recommendations` | — | **Selected** |
| E. NIKHIL AI Ninja (Phase 2) | `dal_abba` (NTS OS, `ninja-*.js`) | Dal_Abba | The existing NTS assistant | Public Q&A, programme explainers, page navigation | `read:public_content` | — | **Phase 2: not active** |

## Not selected (27 agents)

Every other Ganesha agent stays `not_selected`. That includes all Sunverse, LittleLoop and Foliocraft specialists, NARADA, CHITRAGUPTA, SAMVADA, CODE-SHAKTI/KARMA, AGNI, HANUMAN, DHARMA, LAKSHMI (LittleLoop) and MUSHAK/SAARTHI. They are brand-specific or outside this brief.
If brand-safety review is needed later, `ops_dharma_safety` is the existing candidate, so no new agent would be needed.

## Runtime rules

- Engines: Gemini free key first, then Groq free key. Paid engines are never used unless the owner adds a key **and** names the engine.
- Every run is logged in `agent_runs`: agent, task, engine, model, input/output tokens, latency, outcome and cost. Cost stays `null` unless a price is configured, so it is never guessed.
- An agent can be enabled or disabled from **Admin → Agents**. A disabled agent refuses tasks with a clear error.
- No agent can publish. Publishing happens only when an admin approves a job (`publish_jobs.status = approved`).

## Dev Mode (Nov 2026)
Dev Mode shows only the three working agents: LinkedIn Content Writer, Social Media Manager and Growth & Analytics. GANESHA runs the workflow in the background; Dal_Abba stays Phase 2. No other Ganesha agents are exposed.
