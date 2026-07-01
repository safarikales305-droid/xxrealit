import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { Response } from 'express';
import { MulterError } from 'multer';
import { INTRO_VIDEO_UPLOAD_MAX_BYTES } from './intro-video-upload.config';

function messageFromRawMultipartError(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes('unexpected end')) {
    return 'Multipart požadavek je neúplný (Unexpected end). Soubor se zřejmě neočekávaně zkrátil při přenosu — zkuste menší soubor nebo znovu nahrát.';
  }
  if (lower.includes('no multipart boundary') || lower.includes('boundary')) {
    return 'Chybí multipart boundary v Content-Type. Neposílejte Content-Type ručně — prohlížeč ho nastaví sám.';
  }
  if (lower.includes('field missing') || lower.includes('field name')) {
    return 'Chybí povinné pole formuláře (očekáváno pole „video“).';
  }
  return null;
}

function multerErrorMessage(exception: MulterError): string {
  const maxMb = INTRO_VIDEO_UPLOAD_MAX_BYTES / (1024 * 1024);
  switch (exception.code) {
    case 'LIMIT_FILE_SIZE':
      return `Soubor je příliš velký (File too large). Maximální velikost je ${maxMb} MB.`;
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Neočekávané pole souboru. Použijte pole formuláře pojmenované „video“.';
    case 'LIMIT_PART_COUNT':
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_FIELD_KEY':
    case 'LIMIT_FIELD_VALUE':
    case 'LIMIT_FIELD_COUNT':
      return `Omezení multipart požadavku (${exception.code}). Zkuste menší soubor.`;
    default:
      return `Nahrávání souboru selhalo (${exception.code}): ${exception.message}`;
  }
}

@Catch()
export class IntroVideoUploadExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(protected readonly httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof MulterError) {
      console.error(
        '[intro-videos][multer]',
        exception.code,
        exception.message,
        'field=',
        (exception as MulterError & { field?: string }).field,
      );
      res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: multerErrorMessage(exception),
        error: 'Bad Request',
      });
      return;
    }

    if (exception instanceof Error) {
      const mapped = messageFromRawMultipartError(exception.message ?? '');
      if (mapped) {
        console.error('[intro-videos][multipart]', exception.message);
        res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: mapped,
          error: 'Bad Request',
        });
        return;
      }
    }

    super.catch(exception, host);
  }
}
