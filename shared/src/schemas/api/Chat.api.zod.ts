import { z } from 'zod';

export const chatApprovalCapabilitySchema = z.object({
  approvals: z.boolean().optional().default(false),
});

export const chatOutsideSourceSchema = z.object({
  servers: z.array(z.string()),
  toolServers: z.record(z.string(), z.string()),
  toolTitles: z.record(z.string(), z.string()).default({}),
  approvalSummaries: z
    .record(
      z.string(),
      z.object({ text: z.string(), kind: z.enum(['delete', 'change']) })
    )
    .default({}),
  approvalSources: z.record(z.string(), z.array(z.string())),
});

export type ChatOutsideSource = z.infer<typeof chatOutsideSourceSchema>;

export function readChatOutsideSource(metadata: unknown): ChatOutsideSource {
  const wrapper = z
    .object({ custom: z.object({ outsideSource: chatOutsideSourceSchema }) })
    .safeParse(metadata);
  return wrapper.success
    ? wrapper.data.custom.outsideSource
    : {
        servers: [],
        toolServers: {},
        toolTitles: {},
        approvalSummaries: {},
        approvalSources: {},
      };
}

export function savedChatMessageMetadata(metadata: unknown, id: string) {
  const record = metadata && typeof metadata === 'object' ? metadata : {};
  const custom =
    'custom' in record && record.custom && typeof record.custom === 'object'
      ? record.custom
      : {};
  return { ...record, custom: { ...custom, savedMessageId: id } };
}

export function chatApprovalResponsesReady({
  messages,
}: {
  messages: readonly {
    role: string;
    parts: readonly { type: string; state?: string; preliminary?: boolean }[];
  }[];
}): boolean {
  const message = messages.at(-1);
  if (!message || message.role !== 'assistant') return false;
  if (message.parts.some((part) => part.state === 'approval-requested'))
    return false;
  const stepStart = message.parts
    .map((part) => part.type)
    .lastIndexOf('step-start');
  const tools = message.parts
    .slice(stepStart + 1)
    .filter(
      (part) => part.type.startsWith('tool-') || part.type === 'dynamic-tool'
    );
  return (
    tools.some((part) => part.state === 'approval-responded') &&
    tools.every(
      (part) =>
        (part.state === 'output-available' && part.preliminary !== true) ||
        part.state === 'output-error' ||
        part.state === 'output-denied' ||
        part.state === 'approval-responded'
    )
  );
}
