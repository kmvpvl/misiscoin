import { model, Schema, Types } from "mongoose";
import MongoProto from "./mongoproto";
import { IProduct, mongoProducts } from "./product";
import Transaction, { Balance, ITransaction, mongoTransactions } from "./transaction";
import Person from "./person";

export interface IGameTriField {
    _id?: Types.ObjectId;
    group: string;
    cellmaxweight: number[];
    cellexploded: boolean[];
    whowhere: number[][];
    stepCount: number;
    finishersCount: number;
    blocked: boolean;
    created: Date;
    changed?: Date;
    history?: Array<any>;
}

export const GameTriFieldSchema = new Schema({
    group: {type: String, require: true, unique: true},
    cellmaxweight: {type: Array},
    cellexploded: {type: Array},
    whowhere: {type: Array},
    stepCount: {type: Number},
    finishersCount: {type: Number},
    blocked: {type: Boolean, require: true},
    created: {type: Date, require: true},
    changed: {type: Date, require: false},
    history: {type: Array, require: false},
})

export const mongoGameTriField = model<IGameTriField>('gametris', GameTriFieldSchema)

export default class GameTriField extends MongoProto<IGameTriField> {
    constructor(id?: Types.ObjectId, data?: IGameTriField){
        super(mongoGameTriField, id, data);
    }
    static async getByGroup(group: string): Promise<GameTriField | undefined> {
        MongoProto.connectMongo();
        const ou = await mongoGameTriField.aggregate([{
            '$match': {'group': group,'blocked': false}
        }]);
        if (ou.length === 1) {
            const ret = ou[0];
            return new GameTriField(undefined, ret);
        }
    }
    async Goto(who: Person, whereto: number): Promise<boolean> {
        const whereAmI = this.json.whowhere.findIndex(el=>el.filter(e=>e === who.json.tguserid).length===1);
        if (this.json.cellexploded[whereAmI]) return false;
        if (Math.abs(Math.floor(whereto/6) - Math.floor(whereAmI/6)) > 1) return false;
        if (whereto!= 42 && whereAmI !== -1 && Math.abs(whereto % 6 - whereAmI % 6) > 1) return false;

        if (whereAmI >= 0) this.json.whowhere[whereAmI] = this.json.whowhere[whereAmI].filter(el=>el !== who.json.tguserid);
        if (whereto != 42){
            this.json.whowhere[whereto].push(who.json.tguserid);
            this.json.cellexploded[whereto] = this.json.whowhere[whereto].length > this.json.cellmaxweight[whereto];
            this.json.cellmaxweight[whereto]--;
            const tr = new Transaction(undefined, {
                created: new Date(),
                blocked: false,
                from: who.uid,
                to: new Types.ObjectId('36e7fdc7a6d2d239006cf289'),
                count: 1
            });
            await tr.save();
        } else {
            const tr = new Transaction(undefined, {
                created: new Date(),
                blocked: false,
                to: who.uid,
                from: new Types.ObjectId('36e7fdc7a6d2d239006cf289'),
                count: 10
            });
            await tr.save();
            this.json.finishersCount++;
        }
        this.json.stepCount++;
        await this.save();
        return true;
    }
}
