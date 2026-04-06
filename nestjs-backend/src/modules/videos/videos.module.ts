import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [PrismaModule],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
