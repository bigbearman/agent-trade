// Shared helpers for MCP tool responses

export function formatResult(data: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }];
}

export function handleError(error: unknown): { content: { type: 'text'; text: string }[]; isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}
