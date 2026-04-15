import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from './decorators/current-user.decorator';

export function assertUserCanCreateProfessionalContent(user: AuthUser): void {
  if (!user?.id) {
    throw new BadRequestException('Neplatný uživatel.');
  }
}
