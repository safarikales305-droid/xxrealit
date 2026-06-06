-- CreateTable
CREATE TABLE "FacebookConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facebookUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacebookConnection_userId_key" ON "FacebookConnection"("userId");

-- AddForeignKey
ALTER TABLE "FacebookConnection" ADD CONSTRAINT "FacebookConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
