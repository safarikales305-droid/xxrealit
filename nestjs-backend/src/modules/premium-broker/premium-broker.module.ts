import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { MessagesModule } from '../messages/messages.module';
import { BrokerLeadOfferService } from './broker-lead-offer.service';
import { BrokerPointsService } from './broker-points.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OwnerListingNotifyService } from './owner-listing-notify.service';

@Global()
@Module({
  imports: [PrismaModule, MessagesModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    BrokerPointsService,
    OwnerListingNotifyService,
    BrokerLeadOfferService,
  ],
  exports: [
    NotificationsService,
    BrokerPointsService,
    OwnerListingNotifyService,
    BrokerLeadOfferService,
  ],
})
export class PremiumBrokerModule {}
