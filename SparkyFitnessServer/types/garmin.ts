export interface GarminTokenPayload {
  di_token: string;
  di_refresh_token: string;
  di_client_id: string;
}

export interface GarminJwtPayload {
  managed_status?: string;
  scope?: string[];
  iss?: string;
  revocation_eligibility?: string[];
  client_type?: string;
  exp?: number;
  iat?: number;
  garmin_guid?: string;
  jti?: string;
  client_id?: string;
}

export interface GarminRefreshTokenPayload {
  refreshTokenValue: string;
  garminGuid: string;
}
