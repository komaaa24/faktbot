import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import { User } from "./User.js";

export enum PaymentStatus {
    PENDING = "pending",
    PAID = "paid",
    FAILED = "failed",
    CANCELLED = "cancelled"
}

@Entity("payments")
@Index("IDX_payments_botUsername", ["botUsername"])
export class Payment {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "varchar", unique: true })
    transactionParam!: string;

    @ManyToOne(() => User, user => user.payments)
    @JoinColumn({ name: "userId" })
    user!: User;

    @Column({ type: "int" })
    userId!: number;

    @Column({ type: "varchar", default: "legacy" })
    botUsername!: string;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    amount!: number;

    @Column({
        type: "enum",
        enum: PaymentStatus,
        default: PaymentStatus.PENDING
    })
    status!: PaymentStatus;

    @Column({ type: "varchar", nullable: true })
    clickTransId?: string;

    @Column({ type: "varchar", nullable: true })
    merchantTransId?: string;

    @Column({ type: "jsonb", nullable: true })
    metadata?: Record<string, any>;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
