-- Migration: Add ApiRequestLog table and expand Consulta with scraping details
-- Date: 2026-01-20
-- Description:
--   1. Add new table ApiRequestLog to track API requests
--   2. Add scraping details columns to Consulta table

-- ============================================================================
-- 1. ALTER TABLE Consulta - Add scraping details columns
-- ============================================================================

ALTER TABLE "Consulta"
ADD COLUMN IF NOT EXISTS "publicacoesNovas" INTEGER,
ADD COLUMN IF NOT EXISTS "duracaoMs" INTEGER,
ADD COLUMN IF NOT EXISTS "paginasNavegadas" INTEGER,
ADD COLUMN IF NOT EXISTS "blocosProcessados" INTEGER,
ADD COLUMN IF NOT EXISTS "captchaDetectado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "bloqueioDetectado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "detalhesRaspagem" JSONB;

-- ============================================================================
-- 2. CREATE TABLE ApiRequestLog - Log all API requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ApiRequestLog" (
    "id" TEXT NOT NULL,

    -- Request identification
    "metodo" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "queryParams" JSONB,

    -- Origin
    "ip" TEXT,
    "userAgent" TEXT,
    "apiKeyId" TEXT,
    "apiKeyPrefixo" TEXT,
    "origem" TEXT,

    -- Request content
    "requestBody" JSONB,
    "requestHeaders" JSONB,

    -- Response
    "statusCode" INTEGER NOT NULL,
    "responseBody" JSONB,
    "responseTime" INTEGER,

    -- Status
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "erro" TEXT,

    -- Context
    "advogadoId" TEXT,
    "consultaId" TEXT,
    "companyId" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRequestLog_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 3. CREATE INDEXES for ApiRequestLog
-- ============================================================================

CREATE INDEX IF NOT EXISTS "ApiRequestLog_metodo_idx" ON "ApiRequestLog"("metodo");
CREATE INDEX IF NOT EXISTS "ApiRequestLog_path_idx" ON "ApiRequestLog"("path");
CREATE INDEX IF NOT EXISTS "ApiRequestLog_apiKeyId_idx" ON "ApiRequestLog"("apiKeyId");
CREATE INDEX IF NOT EXISTS "ApiRequestLog_sucesso_idx" ON "ApiRequestLog"("sucesso");
CREATE INDEX IF NOT EXISTS "ApiRequestLog_createdAt_idx" ON "ApiRequestLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ApiRequestLog_companyId_idx" ON "ApiRequestLog"("companyId");

-- ============================================================================
-- Notes:
-- - Run this migration when the database is available
-- - Or use: npx prisma migrate dev (when Docker is running)
-- - Or use: npx prisma db push (for direct schema push)
-- ============================================================================
