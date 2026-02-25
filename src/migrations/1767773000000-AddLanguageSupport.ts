import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddLanguageSupport1767773000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const usersTable = await queryRunner.getTable("users");
        const preferredLanguageColumn = usersTable?.findColumnByName("preferredLanguage");

        if (!preferredLanguageColumn) {
            await queryRunner.addColumn(
                "users",
                new TableColumn({
                    name: "preferredLanguage",
                    type: "varchar",
                    length: "2",
                    isNullable: false,
                    default: "'uz'"
                })
            );
        }

        const jokesTable = await queryRunner.getTable("jokes");
        const languageColumn = jokesTable?.findColumnByName("language");

        if (!languageColumn) {
            await queryRunner.addColumn(
                "jokes",
                new TableColumn({
                    name: "language",
                    type: "varchar",
                    length: "2",
                    isNullable: false,
                    default: "'uz'"
                })
            );
        }

        await queryRunner.query(`
            UPDATE "jokes"
            SET "externalId" = CONCAT('uz:', "externalId")
            WHERE POSITION(':' IN "externalId") = 0
        `);

        await queryRunner.query(`
            UPDATE "jokes"
            SET "language" = CASE
                WHEN "externalId" LIKE 'en:%' THEN 'en'
                ELSE 'uz'
            END
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_jokes_language" ON "jokes" ("language")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jokes_language"`);

        const jokesTable = await queryRunner.getTable("jokes");
        const languageColumn = jokesTable?.findColumnByName("language");
        if (languageColumn) {
            await queryRunner.dropColumn("jokes", "language");
        }

        const usersTable = await queryRunner.getTable("users");
        const preferredLanguageColumn = usersTable?.findColumnByName("preferredLanguage");
        if (preferredLanguageColumn) {
            await queryRunner.dropColumn("users", "preferredLanguage");
        }

        await queryRunner.query(`
            UPDATE "jokes"
            SET "externalId" = REGEXP_REPLACE("externalId", '^(uz|en):', '')
        `);
    }
}
