import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';
import { PROFILE_UPLOAD_MAX_BYTES } from './profile-images.service';

@Catch(MulterError)
export class MulterProfileExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const maxMb = PROFILE_UPLOAD_MAX_BYTES / (1024 * 1024);

    let message: string;
    switch (exception.code) {
      case 'LIMIT_FILE_SIZE':
        message = `Soubor je příliš velký. Maximální velikost je ${maxMb} MB.`;
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message =
          'Neočekávané pole souboru. Pro avatar a cover použijte pole formuláře pojmenované „file“.';
        break;
      case 'LIMIT_PART_COUNT':
      case 'LIMIT_FILE_COUNT':
      case 'LIMIT_FIELD_KEY':
      case 'LIMIT_FIELD_VALUE':
      case 'LIMIT_FIELD_COUNT':
        message = `Omezení multipart požadavku (${exception.code}). Zkuste menší soubor.`;
        break;
      default:
        message = `Nahrávání souboru selhalo (${exception.code}).`;
    }

    console.error(
      '[upload][multer]',
      exception.code,
      exception.message,
      'field=',
      (exception as MulterError & { field?: string }).field,
    );

    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message,
      error: 'Bad Request',
    });
  }
}
