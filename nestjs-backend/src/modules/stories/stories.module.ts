import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';

@Module({
  imports: [PrismaModule],
  controllers: [StoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}
