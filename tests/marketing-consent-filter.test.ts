import { describe, it, expect } from "vitest";
import {
  consentConditionsFor,
  appendUnsubscribeFooter,
} from "../server/services/marketingConsent";

describe("consentConditionsFor", () => {
  it("returns sms consent condition for sms channel", () => {
    const conds = consentConditionsFor("sms");
    // Just assert shape: 2 conditions returned (sms flag true + not unsubscribed)
    expect(conds).toHaveLength(2);
  });

  it("returns email consent condition for email channel", () => {
    const conds = consentConditionsFor("email");
    expect(conds).toHaveLength(2);
  });

  it("returns email consent condition for html_email channel", () => {
    const conds = consentConditionsFor("html_email");
    expect(conds).toHaveLength(2);
  });

  it("returns empty array for unknown channel (defensive)", () => {
    const conds = consentConditionsFor("unknown");
    expect(conds).toHaveLength(0);
  });
});

describe("appendUnsubscribeFooter", () => {
  it("appends footer with unsubscribe link to HTML", () => {
    const html = "<p>Hello</p>";
    const out = appendUnsubscribeFooter(
      html,
      "tok_abc",
      "https://viali.app",
      "de",
    );
    expect(out).toContain("<p>Hello</p>");
    expect(out).toContain("tok_abc");
    expect(out).toContain("https://viali.app/unsubscribe/tok_abc");
  });

  it("uses German copy for de locale", () => {
    const out = appendUnsubscribeFooter(
      "",
      "tok",
      "https://v.app",
      "de",
    );
    expect(out.toLowerCase()).toContain("abmelden");
  });

  it("uses English copy for en locale", () => {
    const out = appendUnsubscribeFooter(
      "",
      "tok",
      "https://v.app",
      "en",
    );
    expect(out.toLowerCase()).toContain("unsubscribe");
  });

  it("falls back to German for unknown locale", () => {
    const out = appendUnsubscribeFooter("", "tok", "https://v.app", "xx");
    expect(out.toLowerCase()).toContain("abmelden");
  });
});
