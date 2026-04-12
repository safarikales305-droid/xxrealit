-- CreateTable
CREATE TABLE "PropertyConversation" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "userLowId" TEXT NOT NULL,
    "userHighId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "PropertyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyConversation_propertyId_userLowId_userHighId_key" ON "PropertyConversation"("propertyId", "userLowId", "userHighId");

-- CreateIndex
CREATE INDEX "PropertyConversation_userLowId_idx" ON "PropertyConversation"("userLowId");

-- CreateIndex
CREATE INDEX "PropertyConversation_userHighId_idx" ON "PropertyConversation"("userHighId");

-- CreateIndex
CREATE INDEX "PropertyConversation_propertyId_idx" ON "PropertyConversation"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyMessage_conversationId_createdAt_idx" ON "PropertyMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "PropertyMessage_senderId_idx" ON "PropertyMessage"("senderId");

-- AddForeignKey
ALTER TABLE "PropertyConversation" ADD CONSTRAINT "PropertyConversation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyConversation" ADD CONSTRAINT "PropertyConversation_userLowId_fkey" FOREIGN KEY ("userLowId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyConversation" ADD CONSTRAINT "PropertyConversation_userHighId_fkey" FOREIGN KEY ("userHighId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyMessage" ADD CONSTRAINT "PropertyMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "PropertyConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyMessage" ADD CONSTRAINT "PropertyMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
