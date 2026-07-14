import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';

export type ResourceIntrospectionAuditOutcome =
  | 'active'
  | 'inactive'
  | 'credential_rejected'
  | 'request_rejected'
  | 'rate_limited'
  | 'lookup_failed';

function hashEvidence(value: string | null | undefined): string | null {
  return value ? createHash('sha256').update(value).digest('hex') : null;
}

/** Append-only, redacted evidence for a resource introspection decision. */
export class ResourceIntrospectionAuditEvent {
  private constructor(
    public readonly id: string,
    public readonly resourceServerHash: string | null,
    public readonly audienceHash: string | null,
    public readonly tokenSelectorHash: string | null,
    public readonly sessionId: string | null,
    public readonly clientIdHash: string | null,
    public readonly sourceIdentityHash: string | null,
    public readonly outcome: ResourceIntrospectionAuditOutcome,
    public readonly createdAt: Date,
  ) {}

  static create(input: {
    resourceServerAudience?: string | null;
    requestedAudience?: string | null;
    tokenSelector?: string | null;
    sessionId?: string | null;
    clientId?: string | null;
    sourceIdentity?: string | null;
    outcome: ResourceIntrospectionAuditOutcome;
  }): ResourceIntrospectionAuditEvent {
    return new ResourceIntrospectionAuditEvent(
      uuidv7(),
      hashEvidence(input.resourceServerAudience),
      hashEvidence(input.requestedAudience),
      hashEvidence(input.tokenSelector),
      input.sessionId ?? null,
      hashEvidence(input.clientId),
      hashEvidence(input.sourceIdentity),
      input.outcome,
      new Date(),
    );
  }
}
