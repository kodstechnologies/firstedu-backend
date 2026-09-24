/**
 * Keep explanation closing letters in sync with the marked correctAnswer.
 * LLMs often end with "Therefore … [C]" while the key is B (or after option shuffle).
 */

const LETTER = "[A-D]";

/** Closing / verdict phrases that name an option letter. */
const CLOSING_LETTER_RES = [
  // Therefore/Hence/Thus … option/answer/choice … X
  new RegExp(
    `\\b(?:Hence|Therefore|Thus|So),?\\s+(?:the\\s+)?(?:correct|Dorrect)?\\s*(?:option|answer|choice)\\s*(?:is|:|=)?\\s*[\\[\\(]?${LETTER}[\\]\\)]?`,
    "gi"
  ),
  // correct/right option/answer/choice is/: X  (incl. "Correct option: B")
  new RegExp(
    `\\b(?:the\\s+)?(?:correct|right|Dorrect)\\s+(?:option|answer|choice)\\s*(?:is|:|=)\\s*[\\[\\(]?${LETTER}[\\]\\)]?`,
    "gi"
  ),
  // option X is (therefore) correct
  new RegExp(
    `\\boption\\s*[\\[\\(]?${LETTER}[\\]\\)]?\\s+is\\s+(?:therefore\\s+)?(?:the\\s+)?correct\\b`,
    "gi"
  ),
  // corresponds / corresponding to option X
  new RegExp(
    `\\bcorrespond(?:s|ing)\\s+to\\s+(?:option|choice)\\s*[\\[\\(]?${LETTER}[\\]\\)]?`,
    "gi"
  ),
  // Answer: X / Answer = X / Final answer: X
  new RegExp(
    `\\b(?:FINAL[_\\s-]?ANSWER|Locked answer|Answer)\\s*[:=]\\s*[\\[\\(]?${LETTER}[\\]\\)]?`,
    "gi"
  ),
  // option \textbf{X} / option textbfX / option textbf{X}
  new RegExp(
    `\\boption\\s*(?:\\\\?textbf\\s*\\{?|\\\\mathbf\\s*\\{)?\\s*${LETTER}\\}?`,
    "gi"
  ),
  // \\boxed{X} / $\\boxed{X}$
  new RegExp(`\\\\boxed\\{${LETTER}\\}`, "gi"),
  // trailing bracket-only verdict: "... is [C]." / "... → [B]"
  new RegExp(
    `(?:correct(?:\\s+answer)?\\s+is|answer\\s+is|choice\\s+is|→|->|⇒)\\s*[\\[\\(]${LETTER}[\\]\\)]`,
    "gi"
  ),
  // bare trailing "[X]" / "(X)" after "option" / "answer"
  new RegExp(
    `\\b(?:option|answer|choice)\\s*[\\[\\(]${LETTER}[\\]\\)]`,
    "gi"
  ),
];

/** Last isolated A–D in a chunk (the verdict), never letters inside words like "correct". */
const extractVerdictLetter = (chunk = "") => {
  const s = String(chunk);
  let last = null;
  const re = /(?<![A-Za-z])[A-D](?![A-Za-z])/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    last = m[0].toUpperCase();
  }
  return last;
};

/** Replace only the last isolated A–D (verdict letter), leave words intact. */
const replaceVerdictLetter = (chunk, ans) => {
  const s = String(chunk);
  let lastIdx = -1;
  const re = /(?<![A-Za-z])[A-D](?![A-Za-z])/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    lastIdx = m.index;
  }
  if (lastIdx < 0) return s;
  return `${s.slice(0, lastIdx)}${ans}${s.slice(lastIdx + 1)}`;
};

/**
 * Force closing verdict phrases to name `marked` (A–D).
 * Mid-explanation critiques ("option B is false") are left alone when they
 * don't match closing-style templates.
 */
export const alignExplanationToMarkedAnswer = (text, marked) => {
  const ans = String(marked || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-D].*$/, "")
    .slice(0, 1);
  if (!text || !/^[A-D]$/.test(ans)) return text;

  let out = String(text);

  for (const re of CLOSING_LETTER_RES) {
    out = out.replace(new RegExp(re.source, re.flags), (chunk) => {
      const letter = extractVerdictLetter(chunk);
      if (!letter || letter === ans) return chunk;
      return replaceVerdictLetter(chunk, ans);
    });
  }

  // Terminal bare bracket verdict at end of text
  out = out.replace(
    /([\[\(/])\s*([A-D])\s*([\]\)])(\s*\.?[\s]*)$/i,
    (_full, open, letter, close, trail) =>
      letter.toUpperCase() === ans
        ? `${open}${letter}${close}${trail}`
        : `${open}${ans}${close}${trail}`
  );

  // LaTeX bold / boxed option leftovers (only isolated letter inside braces)
  out = out.replace(/\\mathbf\{[A-D]\}/gi, `\\mathbf{${ans}}`);
  out = out.replace(/\\textbf\{[A-D]\}/gi, `\\textbf{${ans}}`);
  out = out.replace(/\\boxed\{[A-D]\}/gi, `\\boxed{${ans}}`);
  out = out.replace(/\btextbf\{[A-D]\}/gi, `\\textbf{${ans}}`);
  out = out.replace(/\btextbf([A-D])\b/gi, `\\textbf{${ans}}`);

  // If the explanation never clearly names the marked key at the end, append one.
  const endWindow = out.slice(Math.max(0, out.length - 180));
  const endNamesAns =
    new RegExp(
      `(?:correct\\s+(?:option|answer|choice)\\s*(?:is|:)?\\s*[\\[\\(]?${ans}[\\]\\)]?|[\\[\\(]${ans}[\\]\\)]\\s*\\.?\\s*$)`,
      "i"
    ).test(endWindow) ||
    new RegExp(
      `\\boption\\s*[\\[\\(]?${ans}[\\]\\)]?(?:\\s+is\\s+correct)?\\b`,
      "i"
    ).test(endWindow) ||
    new RegExp(`\\bCorrect\\s+option\\s*:\\s*${ans}\\b`, "i").test(endWindow);

  if (!endNamesAns) {
    out = `${out.trim()}\n\nTherefore, the correct option is ${ans}.`;
  }

  return out;
};

export default { alignExplanationToMarkedAnswer };
