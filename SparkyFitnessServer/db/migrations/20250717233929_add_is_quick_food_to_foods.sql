-- Migration to add the is_quick_food flag to the foods table.
-- This allows users to create food items that are not saved to their main food list for future use.

-- Add the is_quick_food column to the foods table
-- It defaults to FALSE, so all existing food items will be unaffected and remain searchable.
ALTER TABLE public.foods
ADD COLUMN is_quick_food BOOLEAN NOT NULL DEFAULT FALSE;