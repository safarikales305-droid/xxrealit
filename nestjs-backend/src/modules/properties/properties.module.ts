import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { SeedController } from './seed.controller';

@Module({
  controllers: [PropertiesController, SeedController],
  providers: [PropertiesService],
})
export class PropertiesModule {}
