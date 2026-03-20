import type { IncomingMessage, ServerResponse } from 'http';
import { logger } from '../../utils/logger';
import type { HostApiContext } from '../context';
import { sendJson } from '../route-utils';

export async function handleLogRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/logs' && req.method === 'GET') {
    const tailLines = Number(url.searchParams.get('tailLines') || '100');
    sendJson(res, 200, { content: await logger.readLogFile(Number.isFinite(tailLines) ? tailLines : 100) });
    return true;
  }

  if (url.pathname === '/api/logs/dir' && req.method === 'GET') {
    sendJson(res, 200, { dir: logger.getLogDir() });
    return true;
  }

  if (url.pathname === '/api/logs/files' && req.method === 'GET') {
    sendJson(res, 200, { files: await logger.listLogFiles() });
    return true;
  }

  return false;
}
