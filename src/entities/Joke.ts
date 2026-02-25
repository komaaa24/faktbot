import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

@Entity("jokes")
@Index(["category"])
@Index(["language"])
export class Joke {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "varchar", unique: true })
    externalId!: string;

    @Column({ type: "varchar", nullable: true })
    category?: string;

    @Column({ type: "varchar", nullable: true })
    title?: string;

    @Column({ type: "varchar", length: 2, default: "uz" })
    language!: string;

    @Column({ type: "text" })
    content!: string;

    @Column({ type: "int", default: 0 })
    views!: number;

    @Column({ type: "int", default: 0 })
    likes!: number;

    @Column({ type: "int", default: 0 })
    dislikes!: number;

    @CreateDateColumn()
    createdAt!: Date;
}
