import { model, Schema, Types } from "mongoose";
import MongoProto from "./mongoproto";

export interface IGamePsw {
    _id?: Types.ObjectId;
    tguserid: number;
    psw?: string;
    group?: string;
    rulestime: Date[];
    blocked: boolean;
    created: Date;
    changed?: Date;
    history?: Array<any>;
}

export const GamePswSchema = new Schema({
    tguserid: {type: Number, require: true, unique: true},
    psw: {type: String},
    group: {type: String},
    starttime: {type: Date},
    rulestime: {type: Array},
    blocked: {type: Boolean, require: true},
    created: {type: Date, require: true},
    changed: {type: Date, require: false},
    history: {type: Array, require: false},
})

export const mongoGamePsw = model<IGamePsw>('gamepsw', GamePswSchema)

export default class GamePsw extends MongoProto<IGamePsw> {
    constructor(id?: Types.ObjectId, data?: IGamePsw){
        super(mongoGamePsw, id, data);
    }
    static async getById(tguserid: number): Promise<GamePsw | undefined> {
        MongoProto.connectMongo();
        const ou = await mongoGamePsw.aggregate([{
            '$match': {'tguserid': tguserid,'blocked': false}
        }]);
        if (ou.length === 1) {
            const ret = ou[0];
            return new GamePsw(undefined, ret);
        }
    }
    static async groupScore(group: string): Promise<{minLength: number, maxLevel: number}> {
        const rating = await mongoGamePsw.aggregate([
            {$match: {group: group}},
            {$addFields: {}}
        ]);
        return {minLength: 0, maxLevel: 0};
    }

    async ruleNumberPassed(ruleNumber: number, psw: string) {
        const isOk = this.json.rulestime.length == ruleNumber;
        if (isOk) {
            this.json.psw = psw;
            this.json.rulestime.push(new Date);
            await this.save();
        }
    }
}
