import { model, Schema, Types } from "mongoose";
import MongoProto from "./mongoproto";
import { IProduct, mongoProducts } from "./product";
import Transaction, { Balance, ITransaction, mongoTransactions } from "./transaction";
import Person from "./person";

export interface IGameChessField {
    _id?: Types.ObjectId;
    tguserid: number;
    group?: string;
    color?: string;
    whereAndHowMany?: {where: string, howmany: number}[];
    blocked: boolean;
    created: Date;
    changed?: Date;
    history?: Array<any>;
}

export const GameChessFieldSchema = new Schema({
    tguserid: {type: Number, require: true, unique: true},
    group: {type: String, require: false},
    color: {type: String, require: false},
    whereAndHowMany: {type: Array, require: false},
    blocked: {type: Boolean, require: true},
    created: {type: Date, require: true},
    changed: {type: Date, require: false},
    history: {type: Array, require: false},
})

export const mongoGameChessField = model<IGameChessField>('gamechess', GameChessFieldSchema)

export default class GameChessField extends MongoProto<IGameChessField> {
    constructor(id?: Types.ObjectId, data?: IGameChessField){
        super(mongoGameChessField, id, data);
    }
    static async getByTgId(person: Person): Promise<GameChessField | undefined> {
        MongoProto.connectMongo();
        const ou = await mongoGameChessField.aggregate([{
            '$match': {'tguserid': person.json.tguserid,'blocked': false}
        }]);
        if (ou.length === 1) {
            const ret = ou[0];
            return new GameChessField(undefined, ret);
        }
        const trifield = new GameChessField(undefined, {
            blocked: false,
            created: new Date(),
            tguserid: person.json.tguserid,
            group: person.json.group,
        });
        await trifield.save();
        return trifield;
    }

}