import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { OgDebugController } from './og-debug.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OgDebugController],
})
export class DebugModule {}
