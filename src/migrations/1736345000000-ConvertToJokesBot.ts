import { MigrationInterface, QueryRunner } from "typeorm";

export class ConvertToJokesBot1736345000000 implements MigrationInterface {
    name = 'ConvertToJokesBot1736345000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Rename poems table to jokes
        await queryRunner.query(`ALTER TABLE "poems" RENAME TO "jokes"`);

        // Rename author column to category
        await queryRunner.query(`ALTER TABLE "jokes" RENAME COLUMN "author" TO "category"`);

        // Rename viewedAnecdotes column to viewedJokes in users table
        await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "viewedAnecdotes" TO "viewedJokes"`);

        // Update indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_poems_author"`);
        await queryRunner.query(`CREATE INDEX "IDX_jokes_category" ON "jokes" ("category")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jokes_category"`);
        await queryRunner.query(`CREATE INDEX "IDX_poems_author" ON "poems" ("author")`);

        // Revert viewedJokes column to viewedAnecdotes
        await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "viewedJokes" TO "viewedAnecdotes"`);

        // Revert category column to author
        await queryRunner.query(`ALTER TABLE "jokes" RENAME COLUMN "category" TO "author"`);

        // Revert table name
        await queryRunner.query(`ALTER TABLE "jokes" RENAME TO "poems"`);
    }
}
