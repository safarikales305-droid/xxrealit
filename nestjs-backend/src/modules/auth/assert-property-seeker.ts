import { ForbiddenException } from '@nestjs/common';
import {
  isPropertySeeker,
  PROPERTY_SEEKER_TIP_BLOCKED_MSG,
} from '../../common/property-seeker.util';
import type { AuthUser } from './decorators/current-user.decorator';

export function assertPropertySeekerCannotCreateContent(user: AuthUser): void {
  if (isPropertySeeker(user.role)) {
    throw new ForbiddenException(
      'Účet hledače nemovitosti slouží pouze k prohlížení portálu.',
    );
  }
}

export function assertPropertySeekerCannotTopUp(user: AuthUser): void {
  if (isPropertySeeker(user.role)) {
    throw new ForbiddenException('Účet hledače nemovitosti nemůže dobíjet kredit.');
  }
}

export function assertPropertySeekerCannotUnlockTips(user: AuthUser): void {
  if (isPropertySeeker(user.role)) {
    throw new ForbiddenException({
      message: PROPERTY_SEEKER_TIP_BLOCKED_MSG,
      code: 'PROPERTY_SEEKER_TIP_BLOCKED',
    });
  }
}
