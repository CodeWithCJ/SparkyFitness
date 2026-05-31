-- Migration: Add parts column to sparky_chat_history for multimodal support
-- Created at: 2026-05-29 14:00:00

ALTER TABLE public.sparky_chat_history ADD COLUMN IF NOT EXISTS parts JSONB;

-- Add a comment for clarity
COMMENT ON COLUMN public.sparky_chat_history.parts IS 'Stores multimodal message parts (text, image, etc.) as an array of objects. Compatible with Vercel AI SDK CoreMessage parts.';
