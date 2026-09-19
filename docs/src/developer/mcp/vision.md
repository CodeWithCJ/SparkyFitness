---
title: Vision Integration Tools
description: Tools for analyzing images, such as food photos and nutrition labels.
---

# Vision Integration Tools

The vision tools are designed to integrate computer vision capabilities into the SparkyFitness platform. These tools will enable the analysis of images, such as food photos for nutritional estimation and nutrition labels for data extraction.

**Tool Names:** `sparky_analyze_food_image`, `sparky_scan_label` (a group of separate tools, not a single one)

## Tools within Vision

### `sparky_analyze_food_image`
- **Description:** Analyzes an image of food to estimate its nutritional content. This tool will connect with advanced vision models (e.g., Gemini/GPT-4o Vision) to provide macro and calorie estimations from visual data.
- **Parameters:**
    - `image_url` (string): Base64 encoded image data or a URL of the food image to be analyzed.

### `sparky_scan_label`
- **Description:** Scans a nutrition label from an image to extract detailed nutritional information. This tool will utilize OCR and structured data extraction techniques to parse data from food packaging labels.
- **Parameters:**
    - `image_url` (string): Base64 encoded image data or a URL of the nutrition label image to be scanned.
