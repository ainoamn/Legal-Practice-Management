import { describe, it, expect, vi, afterEach } from "vitest";
import { citedAnswer } from "../apps/api/src/ai/citations.js";
import { TRIAL_MS } from "../apps/api/src/billing/trial.js";
describe("office trial and cited answers", () => {
  it("keeps a trial inside the database window and requires a real source id", () => {
    expect(TRIAL_MS).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000);
    const source = { id: "11111111-1111-4111-8111-111111111111", title: "عقد", excerpt: "المدة سنة" };
    expect(citedAnswer("المدة سنة حسب 11111111-1111-4111-8111-111111111111", [source])?.citations).toEqual([
      source.id,
    ]);
    expect(citedAnswer("المادة 12 من قانون غير مرفق", [source])).toBeNull();
  });
});
import {
  officeDay,
  officeDayStart,
  calendarDays,
  addCalendarDays,
} from "../packages/contracts/src/calendar-time.js";
describe("calendar civil-day boundaries", () => {
  it("uses the office day and actual 23/25-hour DST boundaries", () => {
    expect(officeDay("2026-11-03T22:00:00Z", "Asia/Muscat")).toBe("2026-11-04");
    expect(officeDayStart("2026-11-04", "Asia/Muscat")).toBe(
      "2026-11-03T20:00:00.000Z",
    );
    const hours = (a: string, b: string) =>
      (Date.parse(officeDayStart(b, "America/New_York")) -
        Date.parse(officeDayStart(a, "America/New_York"))) /
      3600000;
    expect(hours("2027-03-14", "2027-03-15")).toBe(23);
    expect(hours("2027-11-07", "2027-11-08")).toBe(25);
  });
  it("builds complete Monday-based weeks and leap-year month windows", () => {
    expect(calendarDays("2028-02-20", "BOARD")).toHaveLength(29);
    expect(calendarDays("2028-02-20", "WEEK")).toEqual([
      "2028-02-14",
      "2028-02-15",
      "2028-02-16",
      "2028-02-17",
      "2028-02-18",
      "2028-02-19",
      "2028-02-20",
    ]);
    expect(calendarDays("2028-02-20", "MONTH")).toHaveLength(42);
    expect(calendarDays("2028-02-20", "MONTH")[0]).toBe("2028-01-31");
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});
import {
  parseInstrumentMinor,
  formatInstrumentMinor,
  instrumentPatchSchema,
} from "../packages/contracts/src/instruments.js";
import {
  officeToday,
  officeReminderTime,
} from "../apps/api/src/instruments/time.js";
describe("instrument amounts and office dates", () => {
  it("preserves amounts larger than JavaScript integers with Arabic digits", () => {
    const amount = parseInstrumentMinor("٩٩٬٩٩٩٬٩٩٩٬٩٩٩٬٩٩٩٬٩٩٩٫٩٩٩", 3);
    expect(amount).toBe("99999999999999999999");
    expect(formatInstrumentMinor(amount, 3)).toBe("99999999999999999.999");
    expect(parseInstrumentMinor("۱۲٫۳۴۵", 3)).toBe("12345");
    for (const s of ["1e5", "-1", "١٬٢٣٫٤", "1.0001", "999999999999999999999"])
      expect(() => parseInstrumentMinor(s, 3)).toThrow();
  });
  it("keeps partial edits free from create-time defaults", () => {
    expect(
      instrumentPatchSchema.parse({ version: 1, notes: "Updated" }),
    ).toEqual({ version: 1, notes: "Updated" });
  });
  it("schedules 09:00 in the office timezone across daylight saving", () => {
    expect(
      officeReminderTime(
        new Date("2027-03-13"),
        "America/New_York",
      ).toISOString(),
    ).toBe("2027-03-13T14:00:00.000Z");
    expect(
      officeReminderTime(
        new Date("2027-03-14"),
        "America/New_York",
      ).toISOString(),
    ).toBe("2027-03-14T13:00:00.000Z");
    expect(
      officeReminderTime(new Date("2026-11-03"), "Asia/Muscat").toISOString(),
    ).toBe("2026-11-03T05:00:00.000Z");
    expect(officeToday("Asia/Muscat", new Date("2026-11-03T22:00:00Z"))).toBe(
      "2026-11-04",
    );
  });
});
import {
  base32Encode,
  base32Decode,
  totp,
  matchCounter,
  encryptSecret,
  decryptSecret,
  mfaConfigured,
} from "../apps/api/src/auth/totp.js";
import { ResendMailer } from "../apps/api/src/auth/mail.js";
import {
  parseMinor,
  displayMoney,
} from "../packages/contracts/src/platform.js";
import {
  registerSchema,
  roleSchema,
  pageSchema,
  memberPatchSchema,
  canDelegate,
  initialRoles,
  permissions,
} from "../packages/contracts/src/index.js";
describe("strict contracts and delegation", () => {
  it("normalizes email and rejects attacker-controlled office context", () => {
    const valid = {
      email: "USER@EXAMPLE.COM",
      password: "safe-long-password-123",
      fullName: "User Name",
      officeName: "Firm One",
      slug: "firm-one",
      countryCode: "OM",
    };
    expect(registerSchema.parse(valid).email).toBe("user@example.com");
    expect(
      registerSchema.safeParse({ ...valid, tenantId: "other" }).success,
    ).toBe(false);
  });
  it("rejects weak credentials and unsafe identifiers", () => {
    expect(
      registerSchema.safeParse({
        email: "bad",
        password: "short",
        slug: "../secret",
      }).success,
    ).toBe(false);
  });
  it("cannot grant above own authority", () => {
    expect(canDelegate(["workspace:read"], ["team:manage"])).toBe(false);
    expect(canDelegate(permissions, ["team:manage"])).toBe(true);
  });
  it("rejects unknown and repeated grants", () => {
    expect(
      roleSchema.safeParse({
        name: "Custom",
        key: "CUSTOM",
        permissions: ["platform:manage"],
      }).success,
    ).toBe(false);
    expect(
      roleSchema.safeParse({
        name: "Custom",
        key: "CUSTOM",
        permissions: ["team:read", "team:read"],
      }).success,
    ).toBe(false);
  });
  it("requires meaningful patches and bounds pagination", () => {
    expect(memberPatchSchema.safeParse({}).success).toBe(false);
    expect(pageSchema.safeParse({ pageSize: 1000 }).success).toBe(false);
    expect(pageSchema.parse({}).page).toBe(1);
  });
  it("gives only explicit read grants to sensitive default roles", () => {
    for (const key of ["ACCOUNTANT", "LAWYER"])
      expect(initialRoles.find((r) => r.key === key)?.permissions).toEqual([
        "workspace:read",
      ]);
    expect(initialRoles.find((r) => r.key === "CLIENT")?.permissions).toEqual([
      "workspace:read",
      "portal:read",
    ]);
    expect(initialRoles.find((r) => r.key === "OWNER")?.permissions).toEqual([
      ...permissions,
    ]);
  });
});
describe("MFA RFC vectors and authenticated encryption", () => {
  afterEach(() => vi.unstubAllEnvs());
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("matches RFC 6238 SHA1 at %s seconds", (seconds, expected) => {
    expect(totp(secret, Number(seconds) * 1000, 8)).toBe(expected);
  });
  it("round-trips base32 and rejects replayed and malformed codes", () => {
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    const time = 1234567890000,
      code = totp(secret, time),
      counter = matchCounter(secret, code, -1n, time);
    expect(counter).not.toBeNull();
    expect(matchCounter(secret, code, counter!, time)).toBeNull();
    expect(matchCounter(secret, "bad", -1n, time)).toBeNull();
    expect(() => base32Decode("bad!")).toThrow();
  });
  it("binds encrypted secrets to their user and detects tampering", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
    expect(mfaConfigured()).toBe(true);
    const encrypted = encryptSecret(secret, "user-a");
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted, "user-a")).toBe(secret);
    expect(() => decryptSecret(encrypted, "user-b")).toThrow();
    expect(encryptSecret(secret, "user-a")).not.toBe(encrypted);
    vi.stubEnv("MFA_ENCRYPTION_KEY", "bad-key");
    expect(mfaConfigured()).toBe(false);
  });
});
describe("platform monetary precision", () => {
  it("converts decimal strings into exact configured minor units", () => {
    expect(parseMinor("10.250", 3)).toBe(10250);
    expect(parseMinor("0.001", 3)).toBe(1);
    expect(parseMinor("12.34", 2)).toBe(1234);
    expect(displayMoney(10250, 3)).toBe("10.250");
  });
  it("rejects excess precision, malformed amounts and unsafe magnitudes", () => {
    for (const amount of ["1.2.3", "-1", "NaN", "1.0001", "100000000.000"])
      expect(() => parseMinor(amount, 3)).toThrow();
    expect(() => parseMinor("1", 5)).toThrow();
  });
});
describe("email adapter stays explicit and never sends during tests", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("is disabled without settings and uses the configured transport contract", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    const mailer = new ResendMailer();
    expect(mailer.configured()).toBe(false);
    await expect(
      mailer.sendPasswordReset(
        "test@tests.invalid",
        "https://example.invalid/#reset=test",
      ),
    ).rejects.toThrow();
    vi.stubEnv("RESEND_API_KEY", "test-fixture");
    vi.stubEnv("EMAIL_FROM", "Test <test@tests.invalid>");
    const transport = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", transport);
    await mailer.sendPasswordReset(
      "recipient@tests.invalid",
      "https://example.invalid/#reset=test",
    );
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");
  });
});
