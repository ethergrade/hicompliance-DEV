

## Problem

The AI CISO chat output appears visually compressed -- paragraphs are too close together, bullet points lack spacing, and sections blend into each other. Two areas need fixing:

1. **CSS styling** in `ChatMessage.tsx` -- the prose spacing classes are too tight (`prose-ul:my-1`, `prose-li:my-0.5`)
2. **System prompt** in the edge function -- needs stronger formatting instructions to ensure the model outputs proper markdown with clear separation

## Plan

### 1. Improve ChatMessage.tsx prose styling

Update the Tailwind prose classes to add more breathing room:
- `prose-p:my-3` -- paragraph spacing
- `prose-ul:my-3 prose-ol:my-3` -- list spacing  
- `prose-li:my-1.5` -- item spacing
- `prose-headings:mt-5 prose-headings:mb-3` -- header spacing
- `prose-hr:my-4 prose-hr:border-slate-700/50` -- horizontal rule styling
- Add a subtle left border accent on blockquotes for visual separation

### 2. Refine system prompt formatting instructions

In `supabase/functions/ai-ciso-chat/index.ts`, update the `STILE DI RISPOSTA` section to explicitly instruct the model to:
- Insert a blank line between every section and every bullet group
- Use `---` horizontal rules between major sections
- Start every response with a bold **TL;DR** line followed by a blank line
- Use `###` sub-headers within sections for nested topics
- Keep each bullet on its own line with a blank line after groups of related bullets

### 3. Redeploy edge function

Deploy the updated `ai-ciso-chat` function with the refined prompt.

