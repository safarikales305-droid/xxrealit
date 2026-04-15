import { Body, Controller, Post } from '@nestjs/common';
import { EmailsService } from './emails.service';

@Controller('emails')
export class EmailsController {
  constructor(private readonly emails: EmailsService) {}

  @Post('share-listing')
  async shareListing(
    @Body()
    body: {
      propertyId?: string;
      recipientEmail?: string;
      recipientName?: string;
      senderName?: string;
      senderEmail?: string;
      senderMessage?: string;
    },
  ) {
    const propertyId = String(body.propertyId ?? '').trim();
    const recipientEmail = String(body.recipientEmail ?? '').trim().toLowerCase();
    if (!propertyId || !recipientEmail) {
      return { success: false, error: 'propertyId a recipientEmail jsou povinné.' };
    }
    try {
      await this.emails.shareListingByEmail({
        propertyId,
        recipientEmail,
        recipientName: body.recipientName?.trim() || undefined,
        senderName: body.senderName?.trim() || undefined,
        senderEmail: body.senderEmail?.trim() || undefined,
        senderMessage: body.senderMessage?.trim() || undefined,
        requesterKey: body.senderEmail?.trim().toLowerCase() || recipientEmail,
      });
      return { success: true, message: 'E-mail se sdíleným inzerátem byl odeslán.' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sdílení inzerátu e-mailem selhalo.',
      };
    }
  }
}
