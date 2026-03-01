-- CreateEnum
CREATE TYPE "PaymentGatewayType" AS ENUM ('STRIPE', 'PAYPAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PaymentGatewayStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SWITCHING', 'ERROR');

-- CreateTable
CREATE TABLE "PaymentGateway" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentGatewayType" NOT NULL DEFAULT 'CUSTOM',
    "currentUrl" TEXT NOT NULL,
    "siteId" TEXT,
    "status" "PaymentGatewayStatus" NOT NULL DEFAULT 'INACTIVE',
    "lastSwitchAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSpareUrl" (
    "id" TEXT NOT NULL,
    "paymentGatewayId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSpareUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePaymentGateway" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "paymentGatewayId" TEXT NOT NULL,
    "envVarName" TEXT NOT NULL DEFAULT 'PAYMENT_URL',
    "lastPropagatedAt" TIMESTAMP(3),
    "lastPropagateOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitePaymentGateway_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGateway_siteId_key" ON "PaymentGateway"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SitePaymentGateway_siteId_paymentGatewayId_key" ON "SitePaymentGateway"("siteId", "paymentGatewayId");

-- AddForeignKey
ALTER TABLE "PaymentGateway" ADD CONSTRAINT "PaymentGateway_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSpareUrl" ADD CONSTRAINT "PaymentSpareUrl_paymentGatewayId_fkey" FOREIGN KEY ("paymentGatewayId") REFERENCES "PaymentGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePaymentGateway" ADD CONSTRAINT "SitePaymentGateway_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePaymentGateway" ADD CONSTRAINT "SitePaymentGateway_paymentGatewayId_fkey" FOREIGN KEY ("paymentGatewayId") REFERENCES "PaymentGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
