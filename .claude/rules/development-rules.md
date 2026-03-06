# Development Rules — whales-market-mcp

## Code Style
- TypeScript strict mode, no `any`
- Use `type` imports where possible
- All API methods in `api-client.ts`, tool definitions in `index.ts`
- Error handling: wrap all tool handlers in try/catch, return `isError: true`

## Adding New Tools
1. Add API method to `WhalesMarketAPI` class in `src/api-client.ts`
2. Add tool definition in `src/index.ts` using `server.tool()`
3. Use zod schemas for parameter validation
4. Update CLAUDE.md tool table
5. Update memory file with new tool info

## API Conventions
- Base path: endpoints start with `/v2/` or `/` (no prefix needed)
- Pagination: `{ page: number, take: number }`
- Sort: `{ sortField: string, sortType: 'ASC' | 'DESC' }`
- Auth: Bearer token in Authorization header (optional for public endpoints)

## Testing
- Use `npm run inspect` to test tools via MCP Inspector
- Use `npm run dev` for hot-reload development
- Always `npm run build` before committing
