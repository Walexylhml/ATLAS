/**
 * The authenticated caller, resolved from a verified access token. This is the
 * single object every guard, controller and service reasons about — never the
 * raw token. Kept deliberately small: identity + session assurance. Effective
 * permissions are loaded on demand by AuthzService (they change independently
 * of the token and must not be cached inside it).
 */
export interface Principal {
  /** user_account id */
  accountId: string;
  /** person id (the human behind the account) */
  personId: string;
  /** tenant the session belongs to */
  tenantId: string;
  /** auth_session id — lets us revoke this exact session */
  sessionId: string;
  /** 'otp' | 'step_up' | 'sso' — how strongly this session is authenticated */
  assurance: string;
}

declare global {
  // Attached by AuthGuard so @CurrentPrincipal() and downstream code can read it.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}
