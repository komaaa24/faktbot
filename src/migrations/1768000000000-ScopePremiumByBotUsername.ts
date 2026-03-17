import { MigrationInterface, QueryRunner } from "typeorm";

function getLegacyBotUsername(): string {
    const candidate = String(
        process.env.LEGACY_BOT_USERNAME ||
        process.env.DEFAULT_BOT_USERNAME ||
        "legacy"
    )
        .trim()
        .replace(/^@/, "");

    return candidate || "legacy";
}

function sqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

export class ScopePremiumByBotUsername1768000000000 implements MigrationInterface {
    name = "ScopePremiumByBotUsername1768000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        const legacyBotUsername = getLegacyBotUsername();
        const legacySql = sqlString(legacyBotUsername);

        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "botUsername" character varying`);
        await queryRunner.query(`
            UPDATE "users"
            SET "botUsername" = COALESCE(NULLIF("botUsername", ''), ${legacySql})
            WHERE "botUsername" IS NULL OR "botUsername" = ''
        `);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "botUsername" SET DEFAULT ${legacySql}`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "botUsername" SET NOT NULL`);

        const legacyTelegramIdConstraints: Array<{ conname: string }> = await queryRunner.query(`
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'users'::regclass
              AND contype = 'u'
              AND pg_get_constraintdef(oid) = 'UNIQUE ("telegramId")'
        `);

        for (const constraint of legacyTelegramIdConstraints) {
            await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "${constraint.conname}"`);
        }

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'users'::regclass
                      AND conname = 'UQ_users_telegramId_botUsername'
                ) THEN
                    ALTER TABLE "users"
                    ADD CONSTRAINT "UQ_users_telegramId_botUsername" UNIQUE ("telegramId", "botUsername");
                END IF;
            END $$;
        `);

        await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "botUsername" character varying`);
        await queryRunner.query(`
            UPDATE "payments" AS payment
            SET "botUsername" = COALESCE(
                NULLIF(payment."botUsername", ''),
                NULLIF(payment."metadata"->>'botUsername', ''),
                scoped_user."botUsername",
                ${legacySql}
            )
            FROM "users" AS scoped_user
            WHERE scoped_user."id" = payment."userId"
              AND (payment."botUsername" IS NULL OR payment."botUsername" = '')
        `);
        await queryRunner.query(`
            UPDATE "payments"
            SET "botUsername" = ${legacySql}
            WHERE "botUsername" IS NULL OR "botUsername" = ''
        `);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "botUsername" SET DEFAULT ${legacySql}`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "botUsername" SET NOT NULL`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payments_botUsername" ON "payments" ("botUsername")`);

        await queryRunner.query(`
            UPDATE "payments"
            SET "metadata" = COALESCE("metadata", '{}'::jsonb) || jsonb_build_object('botUsername', "botUsername")
            WHERE "metadata" IS NULL
               OR COALESCE("metadata"->>'botUsername', '') = ''
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const duplicates: Array<{ telegramId: string }> = await queryRunner.query(`
            SELECT "telegramId"
            FROM "users"
            GROUP BY "telegramId"
            HAVING COUNT(*) > 1
            LIMIT 1
        `);

        if (duplicates.length > 0) {
            throw new Error("Cannot revert bot-scoped users: duplicate telegramId values already exist.");
        }

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_botUsername"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_telegramId_botUsername"`);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'users'::regclass
                      AND conname = 'UQ_users_telegramId'
                ) THEN
                    ALTER TABLE "users"
                    ADD CONSTRAINT "UQ_users_telegramId" UNIQUE ("telegramId");
                END IF;
            END $$;
        `);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "botUsername"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "botUsername"`);
    }
}
