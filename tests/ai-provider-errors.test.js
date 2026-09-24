import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  isProviderCreditsExhausted,
  providerCreditsError,
  markProviderFatalAbort,
  getProviderFatalAbort,
  clearProviderFatalAbort,
  PROVIDER_CREDITS_CODE,
  GEMINI_CREDITS_USER_MESSAGE,
} from "../src/utils/aiProviderErrors.js";

describe("aiProviderErrors", () => {
  beforeEach(() => {
    clearProviderFatalAbort();
  });

  it("detects Gemini 402 prepaid credits depleted", () => {
    const err = {
      status: 402,
      message:
        '{"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio","status":"RESOURCE_EXHAUSTED"}}',
    };
    expect(isProviderCreditsExhausted(err)).toBe(true);
  });

  it("detects RESOURCE_EXHAUSTED + billing text", () => {
    expect(
      isProviderCreditsExhausted({
        message: "RESOURCE_EXHAUSTED: manage your project and billing",
      })
    ).toBe(true);
  });

  it("does not treat ordinary 429 rate limits as credits exhaustion", () => {
    expect(
      isProviderCreditsExhausted({
        status: 429,
        message: "rate limit exceeded, retry later",
      })
    ).toBe(false);
  });

  it("builds a fatal non-resumable Gemini credits error", () => {
    const e = providerCreditsError(new Error("402"), "gemini");
    expect(e.code).toBe(PROVIDER_CREDITS_CODE);
    expect(e.fatal).toBe(true);
    expect(e.resumable).toBe(false);
    expect(e.message).toBe(GEMINI_CREDITS_USER_MESSAGE);
  });

  it("latches abort per job and ignores other job ids", () => {
    const e = providerCreditsError(new Error("402"), "gemini");
    markProviderFatalAbort("apt-a", e);
    expect(getProviderFatalAbort("apt-a")?.error?.code).toBe(
      PROVIDER_CREDITS_CODE
    );
    expect(getProviderFatalAbort("apt-b")).toBeNull();
    clearProviderFatalAbort("apt-a");
    expect(getProviderFatalAbort("apt-a")).toBeNull();
  });
});
