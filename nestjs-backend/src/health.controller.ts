import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
        error: message,
      });
    }
  }
}
