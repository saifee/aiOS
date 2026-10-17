-- aiOS upgrade for an EXISTING database. Safe to run more than once (phpMyAdmin -> SQL tab).
-- Adds the new tables (AI keys, preferences, goals, decisions) and the Free plan.

CREATE TABLE IF NOT EXISTS `AiKey` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NULL,
  `model` VARCHAR(191) NULL,
  `baseUrl` VARCHAR(191) NULL,
  `keyEnc` VARCHAR(191) NOT NULL,
  `keyHint` VARCHAR(191) NOT NULL,
  `priority` INTEGER NOT NULL DEFAULT 0,
  `enabled` BOOLEAN NOT NULL DEFAULT 1,
  `shared` BOOLEAN NOT NULL DEFAULT 1,
  `lastOkAt` DATETIME(3) NULL,
  `lastError` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `AiKey_tenantId_priority_idx` (`tenantId`, `priority`),
  INDEX `AiKey_userId_idx` (`userId`),
  CONSTRAINT `AiKey_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AiKey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `UserPref` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `value` JSON NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `UserPref_userId_key_key` (`userId`, `key`),
  CONSTRAINT `UserPref_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Goal` (
  `id` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `lane` VARCHAR(191) NULL,
  `target` VARCHAR(191) NULL,
  `progress` INTEGER NOT NULL DEFAULT 0,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `dueAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Goal_businessId_status_idx` (`businessId`, `status`),
  CONSTRAINT `Goal_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Decision` (
  `id` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `context` VARCHAR(191) NULL,
  `outcome` VARCHAR(191) NULL,
  `decidedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Decision_businessId_createdAt_idx` (`businessId`, `createdAt`),
  CONSTRAINT `Decision_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `Business` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Tenant` MODIFY `plan` ENUM('TRIAL','STARTER','GROWTH','SCALE','ENTERPRISE','FREE') NOT NULL DEFAULT 'FREE';
ALTER TABLE `Subscription` MODIFY `plan` ENUM('TRIAL','STARTER','GROWTH','SCALE','ENTERPRISE','FREE') NOT NULL DEFAULT 'TRIAL';

-- Superadmin: manual payments + platform settings (payment methods)
CREATE TABLE IF NOT EXISTS `Payment` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `amountCents` INTEGER NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `method` VARCHAR(191) NOT NULL DEFAULT 'manual',
  `reference` VARCHAR(191) NULL,
  `note` VARCHAR(191) NULL,
  `plan` VARCHAR(191) NULL,
  `months` INTEGER NULL,
  `recordedBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Payment_tenantId_createdAt_idx` (`tenantId`, `createdAt`),
  CONSTRAINT `Payment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PlatformSetting` (
  `key` VARCHAR(191) NOT NULL,
  `value` JSON NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
