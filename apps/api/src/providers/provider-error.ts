export type ProviderName = "OPENROUTESERVICE_GEOCODING" | "OPENROUTESERVICE_ROUTING" | "NLR_AFDC";

export type ProviderErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_INVALID_RESPONSE";

export interface ProviderErrorOptions {
  provider: ProviderName;
  code: ProviderErrorCode;
  message: string;
  statusCode?: number;
}

export class ProviderError extends Error {
  readonly provider: ProviderName;
  readonly code: ProviderErrorCode;
  readonly statusCode: number | undefined;

  constructor(options: ProviderErrorOptions) {
    super(options.message);
    this.name = "ProviderError";
    this.provider = options.provider;
    this.code = options.code;
    this.statusCode = options.statusCode;
  }
}
