import { Module, forwardRef } from '@nestjs/common';
import { EmailsModule } from '../emails/emails.module';
import { MessagesModule } from '../messages/messages.module';
import { CreditsModule } from '../credits/credits.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ContactMonetizationService } from './contact-monetization.service';
import { ListingContactUnlockService } from './listing-contact-unlock.service';

/**
 * Izolovaný modul pro leady / odemčení kontaktů — bez importu celého PropertiesModule,
 * aby se přerušila kruhová závislost Credits ↔ Properties.
 */
@Module({
  imports: [
    forwardRef(() => CreditsModule),
    EmailsModule,
    forwardRef(() => MessagesModule),
    forwardRef(() => WhatsAppModule),
  ],
  providers: [ContactMonetizationService, ListingContactUnlockService],
  exports: [ContactMonetizationService, ListingContactUnlockService],
})
export class ListingContactUnlockModule {}
