/**
 * Gateway Protocol Definitions
 * JSON-RPC 2.0 protocol types for Gateway communication
 */

/**
 * JSON-RPC 2.0 Request
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC 2.0 Response
 */
export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 Error
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 Notification (no id, no response expected)
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

/**
 * Standard JSON-RPC 2.0 Error Codes
 */
export enum JsonRpcErrorCode {
  /** Invalid JSON was received */
  PARSE_ERROR = -32700,
  /** The JSON sent is not a valid Request object */
  INVALID_REQUEST = -32600,
  /** The method does not exist or is not available */
  METHOD_NOT_FOUND = -32601,
  /** Invalid method parameter(s) */
  INVALID_PARAMS = -32602,
  /** Internal JSON-RPC error */
  INTERNAL_ERROR = -32603,
  /** Server error range: -32000 to -32099 */
  SERVER_ERROR = -32000,
}

/**
 * Gateway-specific error codes
 */
export enum GatewayErrorCode {
  /** Gateway not connected */
  NOT_CONNECTED = -32001,
  /** Authentication required */
  AUTH_REQUIRED = -32002,
  /** Permission denied */
  PERMISSION_DENIED = -32003,
  /** Resource not found */
  NOT_FOUND = -32004,
  /** Operation timeout */
  TIMEOUT = -32005,
  /** Rate limit exceeded */
  RATE_LIMITED = -32006,
}

/**
 * Gateway event types
 */
export enum GatewayEventType {
  /** Gateway status changed */
  STATUS_CHANGED = 'gateway.status_changed',
  /** Channel status changed */
  CHANNEL_STATUS_CHANGED = 'channel.status_changed',
  /** New chat message received */
  MESSAGE_RECEIVED = 'chat.message_received',
  /** Message sent */
  MESSAGE_SENT = 'chat.message_sent',
  /** Tool call started */
  TOOL_CALL_STARTED = 'tool.call_started',
  /** Tool call completed */
  TOOL_CALL_COMPLETED = 'tool.call_completed',
  /** Error occurred */
  ERROR = 'error',
}

/**
 * Gateway event payload
 */
export interface GatewayEvent<T = unknown> {
  type: GatewayEventType;
  timestamp: string;
  data: T;
}

/**
 * Create a JSON-RPC request
 */
export function createRequest(
  method: string,
  params?: unknown,
  id?: string | number
): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id: id ?? crypto.randomUUID(),
    method,
    params,
  };
}

/**
 * Create a JSON-RPC success response
 */
export function createSuccessResponse<T>(
  id: string | number,
  result: T
): JsonRpcResponse<T> {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

/**
 * Create a JSON-RPC error response
 */
export function createErrorResponse(
  id: string | number,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  };
}

/**
 * Check if a message is a JSON-RPC request
 */
export function isRequest(message: unknown): message is JsonRpcRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    message.jsonrpc === '2.0' &&
    'method' in message &&
    typeof message.method === 'string' &&
    'id' in message
  );
}

/**
 * Check if a message is a JSON-RPC response
 */
export function isResponse(message: unknown): message is JsonRpcResponse {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    message.jsonrpc === '2.0' &&
    'id' in message &&
    ('result' in message || 'error' in message)
  );
}

/**
 * Check if a message is a JSON-RPC notification
 */
export function isNotification(message: unknown): message is JsonRpcNotification {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    message.jsonrpc === '2.0' &&
    'method' in message &&
    !('id' in message)
  );
}
