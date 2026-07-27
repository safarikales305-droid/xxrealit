import { HttpException } from '@nestjs/common';

export type OpenAiErrorCode =
  | 'OPENAI_DISABLED'
  | 'OPENAI_NOT_CONFIGURED'
  | 'OPENAI_INVALID_KEY'
  | 'OPENAI_PERMISSION_DENIED'
  | 'OPENAI_QUOTA_EXCEEDED'
  | 'OPENAI_RATE_LIMITED'
  | 'OPENAI_MODEL_NOT_AVAILABLE'
  | 'OPENAI_INVALID_REQUEST'
  | 'OPENAI_TIMEOUT'
  | 'OPENAI_CONNECTION_ERROR'
  | 'OPENAI_INVALID_RESPONSE'
  | 'OPENAI_UNKNOWN_ERROR';

export class OpenAiRequestException extends HttpException {
  readonly openAiCode: OpenAiErrorCode;
  readonly upstreamStatus?: number;
  readonly retryable: boolean;

  constructor(
    code: OpenAiErrorCode,
    message: string,
    httpStatus: number,
    meta?: { upstreamStatus?: number; retryable?: boolean },
  ) {
    super(
      {
        success: false,
        code,
        message,
        upstreamStatus: meta?.upstreamStatus,
        retryable: meta?.retryable ?? false,
      },
      httpStatus,
    );
    this.openAiCode = code;
    this.upstreamStatus = meta?.upstreamStatus;
    this.retryable = meta?.retryable ?? false;
  }
}
