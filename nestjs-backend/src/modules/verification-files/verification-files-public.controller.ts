import { Controller, Get, Header, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { VerificationFilesService } from './verification-files.service';

@Controller('public/verification-files')
export class VerificationFilesPublicController {
  constructor(private readonly verificationFiles: VerificationFilesService) {}

  @Get(':filename')
  @Header('Cache-Control', 'public, max-age=300')
  async serve(@Param('filename') filename: string, @Res() res: Response) {
    const file = await this.verificationFiles.getPublicFile(filename);
    if (!file) {
      throw new NotFoundException();
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (file.mimeType.startsWith('text/html')) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
    }
    res.status(200).send(file.content);
  }
}
