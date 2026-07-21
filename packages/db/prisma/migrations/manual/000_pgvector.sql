-- Run once before `prisma migrate deploy` (Prisma can't create extensions/vector cols itself).
CREATE EXTENSION IF NOT EXISTS vector;
-- After tables exist, create ANN indexes for fast semantic search:
-- CREATE INDEX IF NOT EXISTS memory_embedding_idx ON "Memory" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX IF NOT EXISTS knowledge_embedding_idx ON "KnowledgeChunk" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
