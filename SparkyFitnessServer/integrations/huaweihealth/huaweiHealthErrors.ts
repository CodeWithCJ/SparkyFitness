export type HuaweiHealthErrorCode =
  | 'HUAWEI_NOT_CONFIGURED'
  | 'HUAWEI_CONFIGURATION_INVALID'
  | 'HUAWEI_OWNER_ONLY'
  | 'HUAWEI_PROVIDER_CONFLICT'
  | 'HUAWEI_OAUTH_STATE_INVALID'
  | 'HUAWEI_OAUTH_STATE_EXPIRED'
  | 'HUAWEI_OAUTH_EXCHANGE_FAILED'
  | 'HUAWEI_TOKEN_RESPONSE_INVALID'
  | 'HUAWEI_TOKEN_REFRESH_FAILED'
  | 'HUAWEI_NOT_CONNECTED'
  | 'HUAWEI_ID_TOKEN_INVALID'
  | 'HUAWEI_DISCONNECT_FAILED'
  | 'HUAWEI_PRIVACY_DISABLED'
  | 'HUAWEI_HEALTH_APP_REQUIRED'
  | 'HUAWEI_API_REQUEST_FAILED'
  | 'HUAWEI_API_RESPONSE_INVALID';

export class HuaweiHealthError extends Error {
  constructor(
    public readonly code: HuaweiHealthErrorCode,
    public readonly statusCode: number,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'HuaweiHealthError';
  }
}
