import { model, Schema, Types } from "mongoose";
import MongoProto from "./mongoproto";
import { Balance, mongoTransactions } from "./transaction";
import { IPerson, mongoPersons } from "./person";

export interface IProduct {
    _id?: Types.ObjectId;
    name: string;
    desc: string;
    owner: Types.ObjectId;
    blocked: boolean;
    created: Date;
    changed?: Date;
    history?: Array<any>;
}

export const ProductSchema = new Schema({
    name: {type: String, require: true, unique: true},
    desc: {type: String, require: true},
    owner: {type: Types.ObjectId, require: true},
    blocked: {type: Boolean, require: true},
    created: {type: Date, require: true},
    changed: {type: Date, require: false},
    history: {type: Array, require: false},
})

interface Depositor extends IPerson {
    contributions: Array<{
        validthru?: Date;
        sum: number;
    }>
}


export const mongoProducts = model<IProduct>('products', ProductSchema)

export default class Product extends MongoProto<IProduct> {
    constructor(id?: Types.ObjectId, data?: IProduct){
        super(mongoProducts, id, data);
    }
    static async getByName(name: string): Promise<Product | undefined> {
        MongoProto.connectMongo();
        const ou = await mongoProducts.aggregate([{
            '$match': {'name': name,'blocked': false}
        }]);
        if (ou.length === 1) {
            const ret = ou[0];
            return new Product(undefined, ret);
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

    async contributors(): Promise<Array<Depositor>> {
        const depositors = await mongoPersons.aggregate([
            {$lookup:{
                from: "transactions",
                localField: "_id",
                foreignField: "from",
                pipeline: [
                    {$match:{to: this.uid}},
                    {$group:{_id: {from: "$from", validthru: "$validthru"},sum: {$sum: "$count"}}},
                    {$addFields: {from: "$_id.from",validthru: "$_id.validthru"}}
                  ],
                  as: "contributions"
                }
            },{$match:{$expr: {$ne: ["$contributions", []]}}},
            {$addFields:{sum: {$sum: "$contributions.sum"}}},
            {$sort:{sum: -1}},
            {$project:{"contributions.from": 0,"contributions._id": 0}}
        ]);
        return depositors;
    }
}