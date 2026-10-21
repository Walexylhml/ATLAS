import { TokenService } from "./token.service.js";
import type { AccessTokenClaims } from "./token.service.js";

describe("TokenService", () => {
  const svc = new TokenService();
  const claims: AccessTokenClaims = {
    sub: "acct-1",
    tid: "tenant-1",
    pid: "person-1",
    sid: "session-1",
    aas: "otp",
  };

  it("round-trips a signed access token", () => {
    const { token } = svc.issueAccessToken(claims);
    expect(token.split(".")).toHaveLength(3);
    expect(svc.verifyAccessToken(token)).toEqual(claims);
  });

  it("rejects a token with a tampered payload", () => {
    const { token } = svc.issueAccessToken(claims);
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: "attacker" })).toString(
      "base64url",
    );
    expect(svc.verifyAccessToken(`${h}.${forged}.${s}`)).toBeNull();
  });

  it("rejects a token with a tampered signature", () => {
    const { token } = svc.issueAccessToken(claims);
    expect(svc.verifyAccessToken(`${token}x`)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    expect(svc.verifyAccessToken("not-a-token")).toBeNull();
    expect(svc.verifyAccessToken("")).toBeNull();
  });

  it("rejects an expired token", () => {
    const { token, expiresIn } = svc.issueAccessToken(claims);
    const past = Date.now() + (expiresIn + 60) * 1000;
    const spy = jest.spyOn(Date, "now").mockReturnValue(past);
    try {
      expect(svc.verifyAccessToken(token)).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("hashes refresh tokens deterministically and uniquely", () => {
    const a = svc.issueRefreshToken();
    const b = svc.issueRefreshToken();
    expect(a.token).not.toEqual(b.token);
    expect(a.hash).not.toEqual(b.hash);
    expect(svc.hashRefreshToken(a.token)).toBe(a.hash);
    // The stored hash must not be the token itself.
    expect(a.hash).not.toBe(a.token);
  });
});
