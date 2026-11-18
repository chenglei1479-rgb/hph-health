// §34.2 static disclaimers.
//
// These were fixed Japanese strings shown verbatim on the review surfaces that T2/T4 wire into the UI.
// #261: they are user-visible prose, so they are translated like the rest of the UI. The English
// strings below are the i18n keys (AGENTS.md: keys are the English source text); `ja` keeps the
// original Japanese wording in its catalog. The text is local copy and is never uploaded.
//
// Each string is deliberately a negation/limitation, so the approval-claim guard in
// `src/shared/ethics-protocol/approval-claims.ts` must not flag any of them — in any locale.

/** §34.2 ① — research-design / selection-exclusion / endpoint / confounding checklist. */
export const S34_2_RESEARCH_DESIGN_CHECKLIST =
  'This feature helps by presenting a checklist of the points commonly checked for study design, selection and exclusion, endpoints, and confounding or missing data. It does not judge or guarantee suitability for a high-impact journal or the chances of acceptance. The final decision belongs to you and your supervising physician.'

/** §34.2 ② — protocol / explanatory-document drafting. */
export const S34_2_PROTOCOL_DRAFTING =
  'This feature helps draft protocols, explanatory documents and similar text. We are not responsible for the content or outcome of an application to an ethics review board; follow your institution’s rules and the board’s decision. During the seed test period, use fictional data only; use with real data starts after an institution-approved pilot.'

/** §34.2 ③ — literature / guideline-based points to consider. */
export const S34_2_LITERATURE_POINTS =
  'The points and check items presented are prompts for consideration based on sources in the literature and guidelines. They do not conclude anything about novelty, clinical value or data availability. You and your supervising physician decide whether to adopt them. Guideline and paper bodies are not reproduced in the product; only source links and titles are shown.'
