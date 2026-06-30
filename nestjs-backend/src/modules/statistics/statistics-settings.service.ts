import { Injectable } from '@nestjs/common';
import type { StatisticsSettings } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { UpdateStatisticsSettingsDto } from './dto/update-statistics-settings.dto';

@Injectable()
export class StatisticsSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<StatisticsSettings> {
    return this.prisma.statisticsSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async update(dto: UpdateStatisticsSettingsDto): Promise<StatisticsSettings> {
    await this.get();
    return this.prisma.statisticsSettings.update({
      where: { id: 'default' },
      data: { ...dto },
    });
  }
}
