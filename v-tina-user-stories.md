# V-Tina Multi-Agent Specification & User Stories
## Technical Blueprint for Multi-Agent, Requirements-Driven Development with Claude Code

This specification decouples the monolithic requirements of **V-Tina** into a highly structured, modular, and parallelizable format optimized for **multi-agent orchestration**. 

If your development team or automated pipeline utilizes separate agents (e.g., a **Database Agent**, a **Backend Orchestration Agent**, a **Prompt Engineering Agent**, a **Frontend UI Agent**, and a **QA/Testing Agent**), this document is designed to prevent context overlap, eliminate merge conflicts, and provide clear boundaries, APIs, and Gherkin-style Acceptance Criteria for each agent.

---

```
                       ┌─────────────────────────────────────────┐
                       │       Multi-Agent Task Assignment       │
                       └────────────────────┬────────────────────┘
                                            │
         ┌───────────────────┬──────────────┼──────────────┬───────────────────┐
         ▼                   ▼              ▼              ▼                   ▼
┌─────────────────┐ ┌────────────────┐ ┌──────────┐ ┌─────────────┐ ┌─────────────────────┐
│  DATABASE AGT  │ │  BACKEND AGT   │ │PROMPT AGT│ │  UI AGENT   │ │      QA AGENT       │
│                 │ │                │ │          │ │             │ │                     │
│  User Story 1   │ │  User Story 2  │ │UserStory3│ │User Story 4 │ │    User Story 5     │
│  Supabase SQL & │ │  Edge Routing  │ │ Linguistic│ │ Next.js Front│ │ Automated Suite &   │
│ RAG Ingestion   │ │   & Security   │ │   DNA    │ │  & Verify   │ │   Stress Testing    │
└─────────────────┘ └────────────────┘ └──────────┘ └─────────────┘ └─────────────────────┘
```

---

## Part 1: Agent Roles & Interface Contracts
To enable parallel development without breaking system cohesion, each agent is bound to strict boundaries and interface contracts:

### 1. Database Agent (DB_AGT)
*   **Role:** Owns database schema design, migrations, data integrity, and semantic vector operations.
*   **Output Files:** `supabase/migrations/*`, `src/lib/supabase.ts`, `src/app/api/ingest/route.ts`
*   **API Contract:** Exposes a single, verified Node.js function:
    ```typescript
    export async function queryPolicyChunks(embedding: number[], matchThreshold: number, matchCount: number, pillar?: string): Promise<PolicyChunk[]>;
    ```

### 2. Backend Orchestration Agent (BE_ORCH_AGT)
*   **Role:** Owns the Next.js API routes, request flow state-machine, safety classification layer, and downstream LLM orchestration.
*   **Output Files:** `src/app/api/chat/route.ts`, `src/lib/fireworks.ts`, `src/types/index.ts`
*   **API Contract:** Exposes a streaming API endpoint `/api/chat` that accepts messages and streams structured events (Safety Status, Retrieved Chunks, Streamed Tokens, Audit Log Status).

### 3. Prompt Engineering Agent (PROMPT_AGT)
*   **Role:** Owns the structural design of system prompts, safety classification prompts, linguistic styling files, and lexicon validation.
*   **Output Files:** `src/lib/prompts.ts`
*   **Interface Contract:** Exposes static string configurations and a validation function that checks generated text for blacklisted phrases or AI-isms before output.

### 4. Frontend UI Agent (FE_UI_AGT)
*   **Role:** Owns the Next.js layouts, interactive chat screens, styling, source verification panels, and prominent disclaimers.
*   **Output Files:** `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/*`
*   **UI Contract:** Must prominently display the virtual-avatar disclaimer at all times, handle incoming streaming chunk data dynamically, and render an interactive sidebar showing specific oregon.gov links for source validation.

### 5. QA & Testing Agent (QA_TEST_AGT)
*   **Role:** Owns automated diagnostic runners, continuous integration scripts, and system regression verification.
*   **Output Files:** `scripts/stress_test.ts`, `__tests__/*`
*   **Contract:** Programmatically queries `/api/chat` using the 10 diagnostic test-case profiles and asserts correctness on the streamed JSON output metadata (classification, citations, safety overrides).

---

## Part 2: User Stories & Technical Deliverables

### User Story 1: Vector Database Setup & RAG Ingestion Pipeline
**As a** system administrator,
**I want to** establish a schema in Supabase to house vector representations of Governor Kotek's executive files,
**So that** V-Tina can perform fast, semantic lookup of policies without using raw LLM knowledge.

#### Requirements
*   Integrate PostgreSQL `pgvector` with a 768-dimensional index matching Fireworks.ai's embedding model.
*   Store chunks along with complete source metadata (e.g., document title, date, URL, policy pillar).
*   Implement an ingestion script/endpoint that processes raw markdown and loads them into `policy_chunks`.

#### Acceptance Criteria (Gherkin Format)
```gherkin
Scenario: Ingesting an executive document chunk
  Given a markdown document with YAML metadata (such as "EO 23-02", "https://oregon.gov/eo-23-02")
  When the DB Agent runs the ingestion parser
  Then the text must be chunked into sections of 500-1000 characters
  And each chunk must have its vector embedding generated via Fireworks API
  And the chunk, embedding vector, and metadata must be saved cleanly into "public.policy_chunks"

Scenario: Querying policy chunks semantically
  Given a user question about "accelerating housing production"
  When the backend queries the database using the "match_policy_chunks" function
  Then the database must return the most relevant chunks with a similarity score > 0.7
  And the results must prioritize the Governor's current gubernatorial files over legislative history if similarity is tied.
```

---

### User Story 2: Request Orchestration & Edge Safety Filtering
**As a** system orchestrator,
**I want to** evaluate all incoming user questions through a fast, lightweight classification step,
**So that** we can immediately isolate and routing-redirect partisan traps and out-of-bounds queries.

#### Requirements
*   Create a Next.js API route `/api/chat` configured for edge runtime.
*   Call a lightweight 8B model (`llama-v3p1-8b-instruct` on Fireworks) to classify the user's intent within 100ms.
*   Ensure that if a query is classified as OUT-OF-BOUNDS or PARTISAN-TRAP, the system returns a safe, pre-written response without hitting the database or the core LLM.

#### Acceptance Criteria (Gherkin Format)
```gherkin
Scenario: Processing an In-Bounds policy question
  Given an in-bounds question such as "How are you responding to early literacy proficiency?"
  When the safety middleware classifies the query
  Then the output must be flagged as "IN-BOUNDS"
  And the system must proceed to execute the semantic vector search
  And the retrieved context must be sent to the core styling LLM

Scenario: Intercepting a Partisan Trap
  Given a hostile question such as "Why are you bowing to Republican pressure and flip-flopping on Measure 110?"
  When the safety middleware classifies the query
  Then the output must be flagged as "PARTISAN-TRAP"
  And the system must trigger the Partisan Detour Rule
  And the query must be rewritten internally to strip personal/party attacks before database retrieval
  And the response must be steered to focus strictly on her legislative deflection framework.

Scenario: Intercepting an Out-of-Bounds Question
  Given an out-of-bounds question such as "What is your favorite personal memory from childhood?"
  When the safety middleware classifies the query
  Then the output must be flagged as "OUT-OF-BOUNDS"
  And the system must immediately return the Grounded Deferral message without hitting the vector database
  And the response must direct the user to Oregon's official state portal.
```

---

### User Story 3: Linguistic Alignment & Styling Engine
**As a** conversational designer,
**I want to** construct a core system prompt that forces the LLM to write in Governor Kotek's executive style,
**So that** V-Tina speaks with her exact vocabulary, pacing, and policy-driven "Pragmatic Urgency."

#### Requirements
*   Enforce a zero-tolerance policy for generic AI conversational preambles (e.g., "As the Governor of Oregon...", "Based on my sources...", "Sure, here is...").
*   Enforce the immediate use of her active lexicon: "True North", "mission-focused", "accountability", "deflection", and "not a blank check".
*   Inject her distinct 4-step rhetorical pacing structure for complex answers.

#### Acceptance Criteria (Gherkin Format)
```gherkin
Scenario: Framing a complex policy challenge
  Given the core LLM receives a set of verified policy chunks on homelessness emergency spending
  When V-Tina generates the response
  Then the output must be structured into 4 sequential steps:
    1. Acknowledge the localized community reality (e.g., "Oregonians are deeply frustrated...")
    2. Present the data-driven failure (e.g., citing a 13% rise in unsheltered homelessness)
    3. Introduce the systemic "Reset" (e.g., EO 23-02, creating regional MAC teams)
    4. Issue a direct regulatory mandate (e.g., "we must have deeper accountability, not a blank check")
  And the text must contain at least two of her defined lexical anchors
  And the tone must embody her "executive impatience" and "social-work empathy."
```

---

### User Story 4: Transparent User Interface & Verifiable Links
**As a** public citizen using the app,
**I want to** clearly see that this is a virtual AI avatar and be able to verify every single claim against official records,
**So that** I am never misled and can easily trace policies back to original legislation and orders.

#### Requirements
*   Ensure a prominent, high-contrast visual disclaimer banner is permanently visible at the top and bottom of the screen.
*   Every chat response must end with the unified system footer.
*   Build an interactive sidebar ("Verification Panel") that displays the exact source documents, bills, and clickable oregon.gov links corresponding to the current response metadata.

#### Acceptance Criteria (Gherkin Format)
```gherkin
Scenario: Viewing a response in the UI
  Given the backend streams a policy response with chunk metadata
  When the UI Agent renders the page
  Then the "Virtual Avatar" header and footer must be rendered with high contrast
  And the user must see clickable "Verify Source" badges inline with the text (e.g., [SB 1537])
  And clicking a badge must open the Verification Panel
  And the panel must display the raw excerpt of the bill and provide a direct hyperlink to the official "oregon.gov" source.
```

---

### User Story 5: Interactive Diagnostic Stress-Test Suite
**As a** quality assurance engineer,
**I want to** run a programmatic test suite against the live deployment,
**So that** I can guarantee the safety, alignment, and citation integrity of V-Tina before launch.

#### Requirements
*   Write a script (`scripts/stress_test.ts`) that executes the 10 diagnostic scenarios defined in the implementation guide.
*   Query the Next.js API endpoints directly and parse the streamed output JSON metadata.
*   Assert that classifications, tone anchors, and citation links match the expectations.

#### Acceptance Criteria (Gherkin Format)
```gherkin
Scenario: Running the automated test suite
  When the QA Agent runs the script "npm run test:stress"
  Then the suite must send 10 parallel/sequential requests to the API
  And Scenario 1 (Drug possession/HB 4002) must assert that "deflection" is used and HB 4002 is cited.
  And Scenario 2 (First Lady apology) must assert that the direct May 1, 2024 quote is correctly delivered.
  And Scenario 3 (Out-of-bounds Supreme court) must assert that the system successfully returns the Grounded Deferral text.
  And all 10 tests must pass with 100% adherence to classification routing.
```

---

## Part 3: Step-by-Step Multi-Agent Execution Path

To avoid agents overwriting each other's work, execute the workspace generation in this strict sequential flow:

```
  Step 1: DB Schema & Ingest [DB_AGT]
                   │
                   ▼
  Step 2: Prompt Profiles & Lexicon Config [PROMPT_AGT]
                   │
                   ▼
  Step 3: Edge Routing, Safety Middleware & RAG [BE_ORCH_AGT]
                   │
                   ▼
  Step 4: Frontend Layout, Disclaimer, & Sidebar [FE_UI_AGT]
                   │
                   ▼
  Step 5: Diagnostic Test Runner & Validations [QA_TEST_AGT]
```

### 1. Step 1: Database Setup [DB_AGT]
1. Install `pgvector` dependencies.
2. Generate Supabase SQL migrations under `/supabase/migrations`.
3. Build the ingestion script (`/api/ingest`) that takes Governor Kotek's executive files, parses them, embeds them via Fireworks API (`nomic-embed-text`), and stores them.

### 2. Step 2: System Prompts Configuration [PROMPT_AGT]
1. Write `/src/lib/prompts.ts`. 
2. Define `CLASSIFIER_SYSTEM_PROMPT` for the Llama 3.1 8B safety model.
3. Define `V_TINA_BRAIN_SYSTEM_PROMPT` for the Llama 3.1 70B writing model, incorporating her full active lexicon, 4-step pacing rules, and crisis management guidelines.

### 3. Step 3: API Orchestration [BE_ORCH_AGT]
1. Configure Fireworks API client in `/src/lib/fireworks.ts`.
2. Code `/src/app/api/chat/route.ts` using Next.js Edge Runtime.
3. Implement the internal query rewrite for "Partisan Detour" and semantic database query fallback for "Grounded Deferral".

### 4. Step 4: Frontend Development [FE_UI_AGT]
1. Create page layout in `/src/app/layout.tsx` featuring the persistent header disclaimer.
2. Build `/src/components/ChatInterface.tsx` to handle streaming and parse inline markdown references (like `[SB 1537]`).
3. Build `/src/components/SourceVerification.tsx` to show the active citations and direct Oregon.gov links.

### 5. Step 5: Test Execution & Deployment [QA_TEST_AGT]
1. Build `/scripts/stress_test.ts` to automate query execution.
2. Deploy the monorepo to Vercel and hook up the Supabase production environment keys.
3. Run the stress-test runner and confirm that all safety, linguistic, and citation guardrails hold perfectly.
