import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Payment } from "./Payment.js";

@Entity("users")
export class User {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "bigint", unique: true })
    telegramId!: number;

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

    // Admin tomonidan revoke qilingan vaqt (agar revoke qilingan bo'lsa)
    @Column({ type: "timestamp", nullable: true })
    revokedAt?: Date;

    @OneToMany(() => Payment, payment => payment.user)
    payments!: Payment[];

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
