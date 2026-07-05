-- Chování po zavření gamifikační hry

ALTER TABLE "RegistrationGamificationSetting"
ADD COLUMN IF NOT EXISTS "onCloseAction" TEXT NOT NULL DEFAULT 'OPEN_REGISTRATION_MODAL',
ADD COLUMN IF NOT EXISTS "closeModalPromoEnabled" BOOLEAN NOT NULL DEFAULT true;
