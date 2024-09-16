import { model, Schema, Types } from "mongoose";
import MongoProto from "./mongoproto";
import { IProduct, mongoProducts } from "./product";
import { Balance, ITransaction, mongoTransactions } from "./transaction";

export interface IPerson {
    _id?: Types.ObjectId;
    tguserid: number;
    group?: string;
    name?: string;
    emission?: boolean;
    blocked: boolean;
    created: Date;
    changed?: Date;
    awaitcommanddata?: string;
    history?: Array<any>;
}

export const PersonSchema = new Schema({
    tguserid: {type: Number, require: true, unique: true},
    name: {type: String, require: false},
    group: {type: String, require: false},
    emission: {type: Boolean, require: false},
    blocked: {type: Boolean, require: true},
    awaitcommanddata: {type: String, require: false},
    created: {type: Date, require: true},
    changed: {type: Date, require: false},
    history: {type: Array, require: false},
})

export const mongoPersons = model<IPerson>('persons', PersonSchema)

export default class Person extends MongoProto<IPerson> {
    constructor(id?: Types.ObjectId, data?: IPerson){
        super(mongoPersons, id, data);
    }
    static async getByTgUserId(tg_user_id: number | string): Promise<Person | undefined> {
        MongoProto.connectMongo();
        if (typeof tg_user_id === "string") tg_user_id = parseInt(tg_user_id as string);
        const ou = await mongoPersons.aggregate([{
            '$match': {'tguserid': tg_user_id,'blocked': false}
        }]);
        if (ou.length === 1) {
            const ret = ou[0];
            return new Person(undefined, ret);
        }
    }
    async getProducts(): Promise<Array<IProduct>> {
        const products = await mongoProducts.aggregate([{
            $match: {"owner":this.uid}
        }]);
        return products;
    }
    async setGroup(groupname: string) {
        this.checkData();
        if (this.data !== undefined) {
            this.data.group = groupname;
            await this.save();
        }
    }
    async balance(): Promise<Balance> {
        const debet: Balance = await mongoTransactions.aggregate(
        [{$match: {to: this.uid, $expr: {$or: [{$gt: ["$spendupto", "$now"]},{$not: "$spendupto"}]}}},
        {$group: {_id: {validthru: "$validthru",spendupto: "$spendupto"},sum: {$sum: "$count"}}},
        {$addFields: {spendupto: "$_id.spendupto",validthru: "$_id.validthru"}},
        {$sort: {"_id.spendupto": -1,"_id.validthru": -1}}
        ]);
        const credit = await mongoTransactions.aggregate(
            [{$match: {from: this.uid}},
            {$group: {_id: {validthru: "$validthru",spendupto: "$spendupto"},sum: {$sum: "$count"}}},
            {$addFields: {spendupto: "$_id.spendupto",validthru: "$_id.validthru"}},
            {$sort: {"_id.spendupto": -1,"_id.validthru": -1}}
            ]);
        const ret: Balance = [];
        for (const r of debet) {
            const idx = ret.findIndex(el=>el.validthru?.getTime() === r.validthru?.getTime() && el.spendupto?.getTime() === r.spendupto?.getTime());
            if (idx === -1) {
                ret.push(r);
            } else {
                ret[idx].sum += r.sum;
            }
        }
        for (const r of credit) {
            const idx = ret.findIndex(el=>el.validthru?.getTime() === r.validthru?.getTime() && el.spendupto?.getTime() === r.spendupto?.getTime());
            if (idx === -1) {
                r.sum = -r.sum;
                ret.push(r);
            } else {
                ret[idx].sum -= r.sum;
            }
        }
        return ret.filter(v=>v.sum !== 0);
    }
    async lastOperations(count: number = 10): Promise<Array<ITransaction>> {
        const tr = await mongoTransactions.aggregate([
            {$match: {$expr: {$or:[{$eq:[this.uid, "$to"]}, {$eq:[this.uid, "$from"]}]}}},
            {$sort: {"created": -1}},
            {$limit: count}
        ]);
        return tr;
    }
}
