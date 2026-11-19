import { Type } from 'typebox';
import { Check } from 'typebox/value';
import { readBackendMemberResolution } from './backend-db-adapter.ts';
import type { BackendRuntime } from './backend-runtime.ts';
import { assertCurrentInvocation } from './request-context.ts';

export const MEMBER_STATUS_TOOL_NAMES = Object.freeze(['rein_member_status']);
const parameters = Type.Object({}, { additionalProperties: false });
const reply = (details: Record<string, unknown>) => ({
  ...(details.ok === false ? { isError: true } : {}),
  content: [{ type: 'text' as const, text: JSON.stringify(details) }], details,
});
const failure = (error: string) => reply({ tool: 'rein_member_status', ok: false, error,
  message: error === 'invalid_request'
    ? 'This self-check accepts no identity or other arguments; the sender comes only from the host.'
    : 'The current sender identity could not be verified. Try again later.',
});

/** Community self-check: no governance configuration, private email, or canonical contact ID. */
export function createMemberStatusToolRegistration({ runtime }: { runtime: BackendRuntime }) {
  return runtime.wrapRegistration({
    contextVersion: 2 as const,
    create(ctx: unknown) {
      return [{
        name: 'rein_member_status', parameters,
        description: 'Read only the CURRENT trusted Discord/Slack sender verified Community Member link and current Contributor/director standing. Accepts no claimed identity. Returns no email or private contact ID. Roles describe current standing; this read grants no role, governance access, or spending authority.',
        async execute(_callId: string, args: unknown) {
          assertCurrentInvocation(ctx);
          if (!Check(parameters, args)) return failure('invalid_request');
          const proof = runtime.proofProvider(ctx);
          if (!proof?.ok) return failure('identity_check_unavailable');
          let member;
          try {
            member = readBackendMemberResolution(await runtime.transport.resolveIdentity(proof.proof));
          } catch {
            return failure('identity_check_unavailable');
          }
          assertCurrentInvocation(ctx);
          if (member.status === 'unavailable') return failure('identity_check_unavailable');
          const linked = member.status === 'resolved';
          return reply({ tool: 'rein_member_status', ok: true, linked, status: member.status,
            reason: member.reason,
            isActiveContributor: linked && member.isActiveContributor,
            isDirector: linked && member.isDirector,
            profile: linked && member.profile ? { name: member.profile.name, joinedAt: member.profile.joinedAt } : null,
            roles: linked ? ['community_member', ...(member.isActiveContributor ? ['contributor'] : []),
              ...(member.isDirector ? ['director'] : [])] : [],
            authorizesSpending: false,
          });
        },
      }];
    },
  });
}
