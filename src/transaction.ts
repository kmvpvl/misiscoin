import { model, Schema, Types } from "mongoose";
import MongoProto from "./mongoproto";

export type Balance = Array<{
    sum: number; 
    validthru?: Date; 
    spendupto?: Date}>

export interface ITransaction {
    _id?: Types.ObjectId;
    from: Types.ObjectId;
    to: Types.ObjectId;
    count: number;
    blocked: boolean;
    created: Date;
    validthru?: Date;
    spendupto?: Date;
    history?: Array<any>;
}

export const TransactionSchema = new Schema({
    from: {type: Types.ObjectId, require: true},
    to: {type: Types.ObjectId, require: true},
    count: {type: Number, require: true, min: 0},
    blocked: {type: Boolean, require: true},
    created: {type: Date, require: true},
    validthru: {type: Date, require: false},
    spendupto: {type: Date, require: false},
    history: {type: Array, require: false},
})

export const mongoTransactions = model<ITransaction>('transactions', TransactionSchema)

export default class Transaction extends MongoProto<ITransaction> {
    constructor(id?: Types.ObjectId, data?: ITransaction){
        super(mongoTransactions, id, data);
    }
}
