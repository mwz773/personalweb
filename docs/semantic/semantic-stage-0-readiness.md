# Semantic Upgrade — Stage 0 Readiness

## Outcome

Prepare enough high-quality content to evaluate semantic connections honestly, then choose the local embedding model we will use in the next stage. No FastAPI, pgvector, or database changes happen in this stage.

## Content target

Aim for **15–20 published entries** with a mix of types. A useful first target is:

| Type | Suggested count | What makes it useful for linking |
|---|---:|---|
| Reflections | 4–6 | Original thinking that names ideas and connections |
| Projects | 3–4 | Specific work, decisions, skills, and outcomes |
| Articles | 3–4 | Source metadata plus your own 2–3 paragraph response |
| Books | 2–3 | Why it mattered, not a plot summary |
| Music | 2–3 | A personal reflection on theme, mood, craft, or context |

The exact categories do not matter as much as the writing. An external item with a one-line note will produce weak semantic matches. Two or three thoughtful paragraphs make it useful.

## Build intentional themes

Before evaluating a model, make sure some ideas recur across different content types. Pick 3–4 real themes from your work—for example, civic technology, human-centered design, urban systems, community, data ethics, or creative practice—and ensure each theme appears in at least three entries.

Do not force tags or repeated wording. Write naturally; the embedding model should recognize related ideas expressed differently.

## Evaluation worksheet

Create this table in a note or copy it into the bottom of this document. Choose 8–10 representative entries after you have added content.

| Anchor item | Expected related items | Clearly unrelated items | What a good match should notice |
|---|---|---|---|
| _Example: an OCC project_ | _urban-design article; related reflection_ | _unrelated music entry_ | _shared idea or design decision, not merely a repeated word_ |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

We will use this as the acceptance test in Stage 2 and Stage 3. A model is useful only if its top results make sense to you with the actual evidence paragraphs.

## Embedding-model shortlist

Test these two compact English-language models against the same worksheet:

| Model | Why test it | Vector size | License |
|---|---|---:|---|
| `BAAI/bge-small-en-v1.5` | Recommended starting candidate: compact retrieval-focused model with `sentence-transformers` support | 384 | MIT |
| `sentence-transformers/all-MiniLM-L6-v2` | Simple, widely used baseline for semantic similarity and search | 384 | Apache-2.0 |

Both are small enough for the planned local-first architecture and use 384-dimensional vectors, keeping the eventual pgvector schema simple. The BGE model card documents `sentence-transformers` use and an MIT license; the MiniLM model card documents its 384-dimensional embeddings and semantic-search use. [BGE small model card](https://huggingface.co/BAAI/bge-small-en-v1.5) · [MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

## How we will choose

When the content target is ready, I will provide a small backend evaluation script for you to type and run locally. It will:

1. Embed your selected test entries with both models.
2. Compare nearest neighbors using cosine similarity.
3. Print the top results and scores for each anchor item.
4. Let you score each result as useful, borderline, or irrelevant.

Choose the model with more useful matches—not simply the higher numeric scores. Sentence Transformers describes semantic search as embedding both corpus and query into the same vector space and retrieving nearest entries; it also distinguishes query and document encoding for asymmetric search when a model supports it. [Sentence Transformers semantic-search guide](https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html)

## Ready-to-advance checklist

- [ ] I have 15–20 published entries with substantive writing.
- [ ] At least three real themes connect multiple entries.
- [ ] I completed the evaluation worksheet for 8–10 anchor items.
- [ ] I am comfortable with the public appropriateness of every entry.
- [ ] I am ready to run a local Python evaluation script in the next stage.

Once these are true, tell me: **“Stage 0 is ready.”** I will then give you only the backend code for the model comparison, while continuing to implement any frontend work myself.
