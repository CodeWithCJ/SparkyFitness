import type { Request, Response, NextFunction } from 'express';
import { log } from '../config/logging.js';

// Client-supplied strings go into single-line log records; anything outside
// printable ASCII (newlines especially) could forge extra log lines, so it
// becomes '?', and length is capped well above any real MCP method/tool name.
function sanitizeRpcField(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, '?').slice(0, 64);
}

// Extracts "[<jsonrpc method> <tool name>]" from an MCP request body; returns
// '' for any body that isn't JSON-RPC (every non-MCP route).
function rpcContext(body: unknown): string {
  const { method, params } = (body ?? {}) as {
    method?: unknown;
    params?: { name?: unknown } | null;
  };
  if (typeof method !== 'string') return '';
  const toolName =
    typeof params?.name === 'string' ? ` ${sanitizeRpcField(params.name)}` : '';
  return ` [${sanitizeRpcField(method)}${toolName}]`;
}

// Logs every request that reaches it. Used in two places: globally after the
// /api/auth interceptor, and locally on the /mcp chain, which is mounted above
// the global logger so its route-local body parser beats the global 50mb one.
// logCompletion adds a status + duration + JSON-RPC context line when the
// response finishes (or aborts); only the /mcp chain enables it, to keep
// global log volume down.
export function requestLogger(options: { logCompletion?: boolean } = {}) {
  return function (req: Request, res: Response, next: NextFunction): void {
    log(
      'info',
      `Incoming request: ${req.method} ${req.originalUrl} (Path: ${req.path})`
    );
    if (options.logCompletion) {
      const start = Date.now();
      // req.body is unparsed here (the JSON parser is mounted after this
      // middleware), but these events fire after the whole chain has run, so
      // the body is populated by then on any request that got past the parser.
      res.on('finish', () => {
        log(
          'info',
          `Request finished: ${req.method} ${req.originalUrl} ${res.statusCode} in ${Date.now() - start}ms${rpcContext(req.body)}`
        );
      });
      // 'close' without a completed write means the connection died before the
      // response went out — the "response lost in transit" case.
      res.on('close', () => {
        if (!res.writableFinished) {
          log(
            'warn',
            `Request aborted: ${req.method} ${req.originalUrl} after ${Date.now() - start}ms${rpcContext(req.body)}`
          );
        }
      });
    }
    next();
  };
}
