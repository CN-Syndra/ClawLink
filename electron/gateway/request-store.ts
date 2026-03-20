export interface PendingGatewayRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export function clearPendingGatewayRequests(
  pendingRequests: Map<string, PendingGatewayRequest>,
  error: Error,
): void {
  for (const [, request] of pendingRequests) {
    clearTimeout(request.timeout);
    request.reject(error);
  }
  pendingRequests.clear();
}

export function resolvePendingGatewayRequest(
  pendingRequests: Map<string, PendingGatewayRequest>,
  id: string,
  value: unknown,
): boolean {
  const request = pendingRequests.get(id);
  if (!request) return false;
  clearTimeout(request.timeout);
  pendingRequests.delete(id);
  request.resolve(value);
  return true;
}

export function rejectPendingGatewayRequest(
  pendingRequests: Map<string, PendingGatewayRequest>,
  id: string,
  error: Error,
): boolean {
  const request = pendingRequests.get(id);
  if (!request) return false;
  clearTimeout(request.timeout);
  pendingRequests.delete(id);
  request.reject(error);
  return true;
}
