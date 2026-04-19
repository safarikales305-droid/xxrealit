import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ImportedBrokerContactService } from './imported-broker-contact.service';

@Module({
  imports: [PrismaModule],
  providers: [ImportedBrokerContactService],
  exports: [ImportedBrokerContactService],
})
export class ImportedBrokerContactsModule {}
