import { model, Schema, Types } from "mongoose";
import MongoProto from "./mongoproto";
import { IProduct, mongoProducts } from "./product";
import Transaction, { Balance, ITransaction, mongoTransactions } from "./transaction";
import Person from "./person";

export interface IGameTriField {
    _id?: Types.ObjectId;
    tguserid: number;
    group?: string;
    stepCount: number;
    where?: number;
    R: number;
    G: number;
    B: number;
    blocked: boolean;
    created: Date;
    changed?: Date;
    history?: Array<any>;
}

export const GameTriFieldSchema = new Schema({
    tguserid: {type: Number, require: true, unique: true},
    group: {type: String, require: false},
    stepCount: {type: Number},
    where: {type: Number},
    R: {type: Number},
    G: {type: Number},
    B: {type: Number},
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
    static async getByTgId(person: Person): Promise<GameTriField | undefined> {
        MongoProto.connectMongo();
        const ou = await mongoGameTriField.aggregate([{
            '$match': {'tguserid': person.json.tguserid,'blocked': false}
        }]);
        if (ou.length === 1) {
            const ret = ou[0];
            return new GameTriField(undefined, ret);
        }
        const rgb = Math.floor(Math.random()*3);
        const trifield = new GameTriField(undefined, {
            blocked: false,
            created: new Date(),
            tguserid: person.json.tguserid,
            group: person.json.group,
            stepCount: 0,
            R: rgb===0?255:0,
            G: rgb===1?255:0,
            B: rgb===2?255:0
        });
        await trifield.save();
        return trifield;
    }
    async Goto(who: Person, whereto: number): Promise<boolean> {
        let ret = false;
        if (this.json.where === undefined) {
            ret = Math.floor(whereto / 10) === 0;
        } else {
            if (whereto == 100) {
                ret = this.json.where >= 90;
            } else 
            ret = Math.abs(this.json.where%10 - whereto%10) === 1 && Math.abs(Math.floor(this.json.where/10) - Math.floor(whereto /10)) < 2;
        }
        if (ret) {
            if (whereto < 100){
                const mat = await this.getAvg();
                const leftK = whereto%10 == 0?undefined: mat.filter(e=>e._id===whereto-1)
                const rightK = whereto%10 == 9?undefined: mat.filter(e=>e._id===whereto+1)
                const forwardK = Math.floor(whereto/10) == 9?undefined: mat.filter(e=>e._id===whereto+10)
                const backwardK = Math.floor(whereto/10) == 0?undefined: mat.filter(e=>e._id===whereto-10)
                const centerK = mat.filter(e=>e._id===whereto)
                let [count, R, G, B] = [0, 0, 0, 0];
                if (leftK !== undefined) {
                    if (leftK.length > 0) {
                        count += leftK[0].count;
                        R += leftK[0].R * leftK[0].count
                        G += leftK[0].G * leftK[0].count
                        B += leftK[0].B * leftK[0].count
                    } else count += 1;
                }
                if (rightK !== undefined) {
                    if (rightK.length > 0) {
                        count += rightK[0].count;
                        R += rightK[0].R * rightK[0].count
                        G += rightK[0].G * rightK[0].count
                        B += rightK[0].B * rightK[0].count
                    } else count += 1;
                }

                if (centerK.length > 0) {
                    count += centerK[0].count * 8;
                    R += centerK[0].R * centerK[0].count * 8
                    G += centerK[0].G * centerK[0].count * 8
                    B += centerK[0].B * centerK[0].count * 8
                } else count += 8;
                
                if (forwardK !== undefined){
                    if (forwardK.length > 0) {
                        count += forwardK[0].count * 3;
                        R += forwardK[0].R * forwardK[0].count * 3
                        G += forwardK[0].G * forwardK[0].count * 3
                        B += forwardK[0].B * forwardK[0].count * 3
                    } else count += 3;
                }
                if (backwardK !== undefined){
                    if(backwardK.length > 0) {
                        count += backwardK[0].count * 3;
                        R += backwardK[0].R * backwardK[0].count * 3
                        G += backwardK[0].G * backwardK[0].count * 3
                        B += backwardK[0].B * backwardK[0].count * 3
                    } else count += 3;
                }
                console.log(count);
                this.json.R = Math.floor((R + 8* this.json.R)/(count));
                this.json.G = Math.floor((G + 8* this.json.G)/(count));
                this.json.B = Math.floor((B + 8* this.json.B)/(count));
            }

            this.json.where = (this.json.R==0 && this.json.G==0 && this.json.B==0) ?undefined: whereto;
            if (this.json.where === undefined) {
                const rgb = Math.floor(Math.random()*3);
                this.json.R = rgb===0?255:0,
                this.json.G = rgb===1?255:0,
                this.json.B = rgb===2?255:0
            }
            this.json.stepCount++;
            await this.save();
        }
        return ret;
    }
    async getAvg(): Promise<Array<{_id: number, count: number, R: number, G: number, B: number}>> {
        const avgs = await mongoGameTriField.aggregate([
            {$match: {group: this.json.group}},
            {$group: {
                _id: "$where",
                count: {
                    $sum: 1,
                },
                R: {
                  $avg: "$R"
                },
                G: {
                  $avg: "$G"
                },
                B: {
                  $avg: "$B"
                }
              }},
            {$project: {
                R: {$round:["$R"]},
                G: {$round:["$G"]},
                B: {$round:["$B"]},
                count: "$count"
              }}
        ]);
        return avgs;
    }
}
