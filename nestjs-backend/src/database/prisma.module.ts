import { Global, Module } from '@nestjs/common';
import { AccountUniquenessService } from '../common/account-uniqueness.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, AccountUniquenessService],
  exports: [PrismaService, AccountUniquenessService],
})
export class PrismaModule {}
