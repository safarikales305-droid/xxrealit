import { Module, forwardRef } from '@nestjs/common';
import { MetaCatalogModule } from '../meta-catalog/meta-catalog.module';
import { SocialModule } from '../social/social.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { MetaCenterAssetsService } from './meta-center-assets.service';
import { MetaCenterAdminController } from './meta-center-admin.controller';
import { MetaCenterPublicController } from './meta-center-public.controller';
import { MetaCenterService } from './meta-center.service';
import { MetaConnectDiagnosticsService } from './meta-connect-diagnostics.service';
import { MetaCenterGraphDiagnosticsService } from './meta-center-graph-diagnostics.service';
import { MetaCenterIntegrationStatusService } from './meta-center-integration-status.service';
import { MetaConnectDiscoveryService } from './meta-connect-discovery.service';
import { MetaConnectEventsService } from './meta-connect-events.service';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaConnectProvisionService } from './meta-connect-provision.service';
import { MetaConnectSyncCronService } from './meta-connect-sync.cron.service';
import { MetaGraphClientService } from './meta-graph-client.service';
import { MetaCenterApiLogService } from './meta-center-api-log.service';

@Module({
  imports: [forwardRef(() => MetaCatalogModule), forwardRef(() => SocialModule), WhatsAppModule],
  controllers: [
    MetaCenterAdminController,
    MetaCenterPublicController,
  ],
  providers: [
    MetaCenterService,
    MetaGraphClientService,
    MetaConnectDiscoveryService,
    MetaConnectOAuthService,
    MetaConnectProvisionService,
    MetaConnectDiagnosticsService,
    MetaConnectEventsService,
    MetaConnectSyncCronService,
    MetaCenterGraphDiagnosticsService,
    MetaCenterIntegrationStatusService,
    MetaCenterAssetsService,
    MetaCenterApiLogService,
  ],
  exports: [MetaCenterService, MetaConnectOAuthService],
})
export class MetaCenterModule {}
