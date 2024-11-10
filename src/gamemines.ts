import { model, Schema, Types } from "mongoose";
import MongoProto from "./mongoproto";
import { IProduct, mongoProducts } from "./product";
import { Balance, ITransaction, mongoTransactions } from "./transaction";

export interface IGameMinesField {
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

export const GameMinesFieldSchema = new Schema({
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

export const mongoGameMinesField = model<IGameMinesField>('gamemines', GameMinesFieldSchema)

export default class GameMinesField extends MongoProto<IGameMinesField> {
    constructor(id?: Types.ObjectId, data?: IGameMinesField){
        super(mongoGameMinesField, id, data);
    }
    static async getByGroup(group: string): Promise<GameMinesField | undefined> {
        MongoProto.connectMongo();
        const ou = await mongoGameMinesField.aggregate([{
            '$match': {'group': group,'blocked': false}
        }]);
        if (ou.length === 1) {
            const ret = ou[0];
            return new GameMinesField(undefined, ret);
        }
    }
    async Goto(who: number, whereto: number): Promise<boolean> {
        const whereAmI = this.json.whowhere.findIndex(el=>el.filter(e=>e === who).length===1);
        if (this.json.cellexploded[whereAmI]) return false;
        if (Math.abs(Math.floor(whereto/6) - Math.floor(whereAmI/6)) > 1) return false;
        if (whereto!= 42 && whereAmI !== -1 && Math.abs(whereto % 6 - whereAmI % 6) > 1) return false;

        if (whereAmI >= 0) this.json.whowhere[whereAmI] = this.json.whowhere[whereAmI].filter(el=>el !== who);
        if (whereto != 42){
            this.json.whowhere[whereto].push(who);
            this.json.cellexploded[whereto] = this.json.whowhere[whereto].length > this.json.cellmaxweight[whereto];
        } else {
            this.json.finishersCount++;
        }
        this.json.stepCount++;
        await this.save();
        return true;
    }
}
