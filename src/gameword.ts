import { model, Schema, Types } from "mongoose";
import MongoProto from "./mongoproto";
import { IProduct, mongoProducts } from "./product";
import Transaction, { Balance, ITransaction, mongoTransactions } from "./transaction";
import Person from "./person";

export interface IGameWordField {
    _id?: Types.ObjectId;
    tguserid: number;
    group?: string;
    stepCount: number;
    myword: string;
    attempts: string[];
    secret: boolean;
    blocked: boolean;
    created: Date;
    changed?: Date;
    history?: Array<any>;
}

export const GameWordFieldSchema = new Schema({
    tguserid: {type: Number, require: true, unique: true},
    group: {type: String, require: false},
    stepCount: {type: Number},
    myword: {type: String},
    attempts: {type: Array},
    secret: {type: Boolean},
    blocked: {type: Boolean, require: true},
    created: {type: Date, require: true},
    changed: {type: Date, require: false},
    history: {type: Array, require: false},
})

export const mongoGameWordField = model<IGameWordField>('gamewords', GameWordFieldSchema)

export default class GameWordField extends MongoProto<IGameWordField> {
    constructor(id?: Types.ObjectId, data?: IGameWordField){
        super(mongoGameWordField, id, data);
    }
    static async getByTgId(person: Person): Promise<GameWordField | undefined> {
        MongoProto.connectMongo();
        const ou = await mongoGameWordField.aggregate([{
            '$match': {'tguserid': person.json.tguserid,'blocked': false}
        }]);
        if (ou.length === 1) {
            const ret = ou[0];
            return new GameWordField(undefined, ret);
        }
        const trifield = new GameWordField(undefined, {
            blocked: false,
            created: new Date(),
            tguserid: person.json.tguserid,
            group: person.json.group,
            stepCount: 0,
            myword: "",
            attempts: [],
            secret: true
        });
        await trifield.save();
        return trifield;
    }
    async setMyWord(who: Person, myword: string): Promise<boolean> {
        if (this.json.myword === "") {
            this.json.myword = myword;
            await this.save();
            return true;
        } else return false;
    }
    async getStats(group: string): Promise<Array<[string, number]>> {
        const ret: Array<[string, number]> = [];
        const ou = await mongoGameWordField.aggregate([
            {$match: {group:group, secret: true}},
            //{$match: {$expr: {$ne:["$tguserid", this.json.tguserid]}}}
        ]);
        for (const o of ou) {
            const w = o.myword;
            for (let i = 0; i < w.length; i++) {
                const letter = w.charAt(i);
                const idx = ret.findIndex(el=>el[0] === letter);
                if (-1 === idx) {
                    ret.push([letter, 1]);
                } else {
                    ret[idx][1] += 1;
                }
            }
        }
        return ret;
    }

    async checkWord(who: Person, word: string): Promise<boolean> {
        if (this.json.myword == "") return false;
        if (!this.json.secret) return false; 
        const ou = await mongoGameWordField.aggregate([
            {$match: {group:who.json.group, secret: true}},
            {$match: {$expr: {$ne:["$tguserid", this.json.tguserid]}}},
            {$match: {myword: word}}
        ]);
        for (const o of ou) {
            const vis = new GameWordField(undefined, o);
            vis.json.secret = false;
            this.json.stepCount = this.json.stepCount + 1;
            await vis.save();
        }
        return ou.length > 0;
    }

}