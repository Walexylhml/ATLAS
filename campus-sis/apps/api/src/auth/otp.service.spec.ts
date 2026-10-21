import { OtpService } from "./otp.service.js";

describe("OtpService", () => {
  const svc = new OtpService();

  it("generates a numeric code of the configured length", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = svc.generateCode();
      expect(code).toMatch(/^\d{6}$/); // OTP_LENGTH default = 6
    }
  });

  it("verifies a correct code and rejects a wrong one", () => {
    const code = svc.generateCode();
    const hash = svc.hashCode(code, "challenge-1");
    expect(svc.verifyCode(code, "challenge-1", hash)).toBe(true);
    expect(svc.verifyCode("000000", "challenge-1", hash)).toBe(false);
  });

  it("binds a code hash to its challenge (not portable across challenges)", () => {
    const code = svc.generateCode();
    const hashA = svc.hashCode(code, "challenge-A");
    const hashB = svc.hashCode(code, "challenge-B");
    expect(hashA).not.toBe(hashB);
    // Same code, different challenge → must not verify.
    expect(svc.verifyCode(code, "challenge-B", hashA)).toBe(false);
  });

  it("never returns the plaintext code in the hash", () => {
    const code = svc.generateCode();
    const hash = svc.hashCode(code, "challenge-1");
    expect(hash).not.toContain(code);
  });
});
