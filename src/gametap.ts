import { model, Schema, Types } from "mongoose";
import MongoProto from "./mongoproto";
import Person from "./person";

export interface ITap {
    _id?: Types.ObjectId;
    tguserid: number;
    group?: string;
    score: number;
    blocked: boolean;
    created: Date;
    changed?: Date;
    history?: Array<any>;
}

export const TapSchema = new Schema({
    tguserid: {type: Number, require: true, unique: true},
    group: {type: String},
    score: {type: Number},
    blocked: {type: Boolean, require: true},
    created: {type: Date, require: true},
    changed: {type: Date, require: false},
    history: {type: Array, require: false},
})

export const mongoTap = model<ITap>('gametap', TapSchema)

export default class GameTap extends MongoProto<ITap> {
    constructor(id?: Types.ObjectId, data?: ITap){
        super(mongoTap, id, data);
    }
    static async getById(tguserid: number): Promise<GameTap | undefined> {
        MongoProto.connectMongo();
        const ou = await mongoTap.aggregate([{
            '$match': {'tguserid': tguserid,'blocked': false}
        }]);
        if (ou.length === 1) {
            const ret = ou[0];
            return new GameTap(undefined, ret);
        } else {
            const person = await Person.getByTgUserId(tguserid);
            if(person !== undefined) {
                const ret = new GameTap(undefined, {
                    created: new Date(),
                    blocked: false,
                    score: 0,
                    tguserid: tguserid,
                    group: person.json.group
                });
                await ret.save();
                return ret;
            }
        }
    }
    async incScore(incNumber: number): Promise<number> {
        this.json.score += incNumber;
        await this.save();
        return this.json.score;
    }
}
