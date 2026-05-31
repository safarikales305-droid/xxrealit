import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  importPropertyHiddenData,
  importedPropertiesMissingActiveBranchWhere,
} from '../properties/property-import-branch-visibility';

@Injectable()
export class ImportPropertyVisibilityService implements OnModuleInit {
  private readonly log = new Logger(ImportPropertyVisibilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reconcileOrphanImportedProperties();
  }

  /** Skryje importované inzeráty bez existující aktivní větve. */
  async reconcileOrphanImportedProperties(): Promise<number> {
    const result = await this.prisma.property.updateMany({
      where: {
        AND: [
          importedPropertiesMissingActiveBranchWhere,
          {
            OR: [{ isVisible: true }, { isActive: true }],
          },
        ],
      },
      data: importPropertyHiddenData,
    });
    if (result.count > 0) {
      this.log.warn(
        `Property hidden because import branch no longer exists (or is disabled): ${result.count} listing(s)`,
      );
    }
    return result.count;
  }
}
