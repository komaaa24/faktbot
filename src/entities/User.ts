import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from "typeorm";
import { Payment } from "./Payment.js";

@Entity("users")
@Index("UQ_users_telegramId_botUsername", ["telegramId", "botUsername"], { unique: true })
export class User {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "bigint" })
    telegramId!: number;

    @Column({ type: "varchar", default: "legacy" })
    botUsername!: string;

    @Column({ type: "varchar", nullable: true })
    username?: string;

    @Column({ type: "varchar", nullable: true })
    firstName?: string;

    @Column({ type: "varchar", nullable: true })
    lastName?: string;

    @Column({ type: "boolean", default: false })
    hasPaid!: boolean;

    @Column({ type: "int", default: 0 })
    viewedJokes!: number;

    @Column({ type: "varchar", length: 2, default: "uz" })
    preferredLanguage!: string;

    // Admin tomonidan revoke qilingan vaqt (agar revoke qilingan bo'lsa)
    @Column({ type: "timestamp", nullable: true })
    revokedAt?: Date | null;

    @OneToMany(() => Payment, payment => payment.user)
    payments!: Payment[];

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
