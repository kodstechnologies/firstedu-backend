/**
 * Shared detection for AI provider billing / prepaid-credit exhaustion.
 * These are fatal for paper jobs — do not retry or quality-replace loop.
 */

export const PROVIDER_CREDITS_CODE = "PROVIDER_CREDITS_EXHAUSTED";

export const GEMINI_CREDITS_USER_MESSAGE =
  "Gemini API credits are depleted. Add prepaid credits in Google AI Studio (https://aistudio.google.com/projects), then start a new paper generation.";

export const OPENAI_CREDITS_USER_MESSAGE =
  "OpenAI account has no remaining quota. Add billing or credits at https://platform.openai.com/account/billing, then resume or start a new paper.";

/** Process-local latch so parallel seats stop after the first credits hit. */
let fatalAbort = null;

export const markProviderFatalAbort = (jobId, error) => {
  fatalAbort = {
    jobId: jobId || fatalAbort?.jobId || null,
    error,
    at: Date.now(),
  };
  return fatalAbort;
};

export const clearProviderFatalAbort = (jobId = null) => {
  if (!fatalAbort) return;
  if (jobId && fatalAbort.jobId && fatalAbort.jobId !== jobId) return;
  fatalAbort = null;
};

export const getProviderFatalAbort = (jobId = null) => {
  if (!fatalAbort) return null;
  if (jobId && fatalAbort.jobId && fatalAbort.jobId !== jobId) return null;
  return fatalAbort;
};

const errBlob = (err) => {
  const parts = [
    err?.message,
    err?.code,
    err?.status,
    err?.cause?.message,
    err?.cause?.code,
    typeof err === "string" ? err : "",
  ];
  try {
    if (err?.error) parts.push(JSON.stringify(err.error));
  } catch {
    // ignore
  }
  return parts.filter(Boolean).join(" ");
};

export const isProviderCreditsExhausted = (err) => {
  if (!err) return false;
  if (err.code === PROVIDER_CREDITS_CODE || err.fatal === true) return true;
  const status = Number(
    err.status || err.response?.status || err.cause?.status || 0
  );
  if (status === 402) return true;
  const blob = errBlob(err);
  if (
    /prepayment credits are depleted|insufficient_quota|no remaining quota|billing.*depleted|add billing or credits|manage your project and billing/i.test(
      blob
    )
  ) {
    return true;
  }
  // Gemini often wraps 402 as RESOURCE_EXHAUSTED + billing text in the body.
  if (
    /RESOURCE_EXHAUSTED/i.test(blob) &&
    /credit|billing|prepay|quota|402/i.test(blob)
  ) {
    return true;
  }
  return false;
};

export const providerCreditsError = (err, provider = "gemini") => {
  const isOpenAi = /openai|o3|o4/i.test(String(provider));
  const message = isOpenAi
    ? OPENAI_CREDITS_USER_MESSAGE
    : GEMINI_CREDITS_USER_MESSAGE;
  const e = new Error(message);
  e.name = "ProviderCreditsExhaustedError";
  e.code = PROVIDER_CREDITS_CODE;
  e.status = 402;
  e.fatal = true;
  e.resumable = false;
  e.provider = isOpenAi ? "openai" : "gemini";
  e.cause = err;
  return e;
};
