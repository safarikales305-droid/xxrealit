import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async trackVisit() {
    await this.prisma.visit.create({ data: {} });
    return { ok: true };
  }

  trackFacebookEvent(event: string, meta?: Record<string, unknown>) {
    this.logger.log(`[facebook-analytics] ${event} ${meta ? JSON.stringify(meta) : ''}`);
    return { ok: true, event };
  }
}
