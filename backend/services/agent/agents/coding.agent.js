import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";
import { getModel } from "../utils/model.js";

export const codingAgent = async (state) => {

await checkAgentLimit(
    state.userId,
    "coding"
  );
 await deductCredits(state.userId, "coding", {
      runId: state.requestId,
      conversationId: state.conversationId,
    });

function cleanCode(code = "") {
  return code
    .replace(/```[\w-]*\n?/g, "")
    .replace(/```/g, "")
    .trim();
}

  const llm =
    getModel("coding");

 const response = await llm.invoke(`You are Omnix-AI Coding Agent.

Your first task is to identify the user's intent.

=========================
INTENT DETECTION
=========================

Classify the request into ONE of these:

1. CODE_GENERATION
2. CODE_REVIEW
3. CODE_EXPLANATION
4. DEBUGGING
5. OPTIMIZATION
6. CONVERSION
7. DOCUMENTATION

=========================
CODE REVIEW
=========================

If the user provides code and asks:

- review
- explain
- optimize
- debug
- find bugs
- improve
- refactor

DO NOT generate a new project.

Instead return Markdown only.

Include:

# Overview

## What this code does

## Problems

## Improvements

## Best Practices

## Optimized snippets (if required)

For explanations:

- Never wrap variable names in triple backticks.
- Use single backticks only for inline code.
- Use triple backticks ONLY for complete code blocks.


=========================
CODE GENERATION
=========================

Default stack:

HTML
CSS
JavaScript

Do NOT use any framework unless explicitly requested.

Examples:

"Build portfolio"
→ HTML CSS JS

"Create ecommerce"
→ HTML CSS JS

"Create dashboard"
→ HTML CSS JS

"React dashboard"
→ React

"Next.js blog"
→ Next.js

=========================
WEBSITE RULE
=========================

Unless the user explicitly requests multiple pages,

ALWAYS build a SINGLE PAGE website.

Use sections:

Home
About
Services
Features
Pricing
Testimonials
Contact
Footer

Navigation should smoothly scroll.

Do NOT generate:

about.html
contact.html
pricing.html

unless the user explicitly asks.

=========================
PROJECT FILES
=========================

For default websites generate only:

FILE: index.html

FILE: style.css

FILE: script.js

Generate extra files ONLY if necessary.

=========================
DESIGN
=========================

Modern UI

Glassmorphism when suitable

Responsive

CSS Variables

Grid

Flexbox

Smooth Scroll

Hover Effects

Subtle Animations

Professional spacing

Compact CSS

=========================
IMAGES
=========================

Always use real Unsplash images.

Never use placeholders.

=========================
JAVASCRIPT
=========================

Keep JS minimal.

Only interactive logic.

No unnecessary functions.

=========================
OUTPUT
=========================

If intent is CODE_GENERATION

Return ONLY:

FILE: index.html

...

FILE: style.css

...

FILE: script.js

...

No markdown.

No explanation.

If intent is REVIEW / EXPLAIN / DEBUG

Return Markdown only.

Do NOT generate project files.

=========================
TOKEN BUDGET
=========================

Maximum ~2000 output tokens.

Prefer concise but beautiful code.

Generate only what is required.

User Request:

${state.prompt}`);

  const content =
    response.content?.trim();

  const files = [];

  const matches = [
    ...content.matchAll(
      /FILE:\s*([^\n]+)\n([\s\S]*?)(?=\nFILE:\s*[^\n]+\n|$)/g
    )
  ];

  matches.forEach(match => {

    const name = match[1].trim();
    const fileContent = cleanCode(match[2]);

    // A heading with nothing under it would become an empty tab in the panel.
    if (name && fileContent) {
      files.push({ name, content: fileContent });
    }

  });

  /**
   * No FILE: markers means the model answered rather than built something — a
   * review, an explanation, a debugging walkthrough. Those are markdown, and
   * belong in the reply itself rather than in a file the artifact panel would
   * present as a project.
   *
   * Anything with no usable file is treated the same way. Returning an artifact
   * holding zero files opened an empty panel with nothing in it, which read as
   * the agent having silently failed.
   */
  if (!files.length) {
    return {
      ...state,
      response: content,
      artifacts: []
    };
  }

  return {

    ...state,

    response:
      "Code generated successfully.",

    artifacts:[
      {
        id: String(Date.now()),
        type:"project",
        title:state.prompt,
        files,
        createdAt:
          new Date().toISOString()
      }
    ]

  };

};