import OpenAPIBackend, { Context, Document, UnknownParams } from 'openapi-backend';
import express, { Application, Request, Response } from "express";
import cors from 'cors';

import TelegramBot from "node-telegram-bot-api";
import fs from 'fs';
import colours from "./colours";
import path from 'path';
import { createHmac, randomUUID } from 'crypto';
import Person from './person';
import telegram from './telegram';
import Product from './product';
import GameMinesField from './gamemines';
import GamePsw from './gamepsw';
import GameTap from './gametap';
import GameTriField from './gametri';
import GameWordField from './gameword';
import { mongoGameChessField } from './gamechess';
import MongoProto from './mongoproto';

export default function checkSettings(){
    const dotenv = require('dotenv');
    dotenv.config();
    if (process.env.mongouri === undefined) throw new Error(`Environment variable 'mongouri' is empty`);
    if (process.env.tg_bot_authtoken === undefined) throw new Error(`Environment variable 'tg_bot_authtoken' is empty`);
};

export async function setupTelegramBot(bot: TelegramBot): Promise<any> {
    const res: any = {};
    let ret = false;
    //bot info
    /* for a while manually
    try {
        ret = await bot.setMyName(process.env.tg_bot_name);
        console.log(`${colours.fg.green}Setting TG setMyName successful '${JSON.stringify(ret)}'${colours.reset}`)
    } catch(reason: any) {
        console.log(`${colours.fg.red}Setting TG setMyName error '${JSON.stringify(reason)}'${colours.reset}`);
    }
    */
    //trying create webhook
    try {
        // on render.com got the error if webhook already installed, because getting webhook info first 
        const newURL = `${process.env.tg_web_hook_server}/telegram`;
        const webhookInfo = await bot.getWebHookInfo();
        res.oldWebhookInfoGetSuccess = true;
        res.oldWebhookInfo = webhookInfo;
        if (webhookInfo.url === newURL) {
            console.log(`${colours.fg.green}TG web hook url = '${webhookInfo.url}' already created${colours.reset}`);
        } else {
            console.log(`${colours.fg.yellow}Old TG web hook url = '${webhookInfo.url}' found. Trying to change${colours.reset}`);
            try {
                ret = await bot.setWebHook(newURL);
                res.newWebhookSetSuccess = ret;
                console.log(`${colours.fg.green}TG web hook url = '${newURL}' created successfully${colours.reset}`);
            } catch (reason: any) {
                res.newWebhookSetSuccess = false;
                console.log(`${colours.fg.red}Setting TG webhook error '${JSON.stringify(reason)}'${colours.reset}`);
            }
        }
    } catch(reason: any) {
        res.oldWebhookInfoGetSuccess = false;
        console.log(`${colours.fg.red}Setting TG getWebhookInfo error '${JSON.stringify(reason)}'${colours.reset}`);
    }

    //bot menu, description and short description
    try {
        ret = await bot.setChatMenuButton({menu_button: {type: "commands"}});
        res.setChatMenuButtonSuccess = ret;
        console.log(`${colours.fg.green}TG SetChatMenuButton return '${ret}' ${colours.reset}`);
        res.setMyCommandsSuccess = [];
        res.setMyDescriptionSuccess = [];
        res.setMyShortDescriptionSuccess = [];
        try {
            ret = await bot.setMyCommands([
                {command: "start", description: "Register me"},
                {command: "operations", description: "My last 10 operations"}, 
                {command: "balance", description: "My current net balance"}, 
                {command: "settings", description: "My settings"}, 
                {command: "newproduct", description: "Create new product"}, 
                {command: "help", description: "List of available commands"}]);
            res.setMyCommandsSuccess.push(ret);
            console.log(`${colours.fg.green}Setting TG setMyCommand successful = '${JSON.stringify(ret)}'${colours.reset}`);
        } catch(reason: any){
            res.setMyCommandsSuccess.push(false);
            console.log(`${colours.fg.red}Setting TG setMyCommand error '${JSON.stringify(reason)}'${colours.reset}`)
        }
        try {
            ret = await (bot as any).setMyShortDescription({short_description: "MISIS Coin bot"});
            res.setMyShortDescriptionSuccess.push(ret);
            console.log(`${colours.fg.green}Setting TG setMyShortDescription successful '${JSON.stringify(ret)}'${colours.reset}`);
        } catch (reason: any) {
            res.setMyShortDescriptionSuccess.push(false);
            console.log(`${colours.fg.red}Setting TG setMyShortDescription error '${JSON.stringify(reason)}'${colours.reset}`)
        }

        try {
            ret = await (bot as any).setMyDescription({description: "Here is MISIS students BRS coins exchange bot"});
            res.setMyDescriptionSuccess.push(ret);
            console.log(`${colours.fg.green}Setting TG setMyDescription successful '${JSON.stringify(ret)}'${colours.reset}`);
        } catch (reason: any) {
            res.setMyDescriptionSuccess.push(false);
            console.log(`${colours.fg.red}Setting TG setMyDescription error '${JSON.stringify(reason)}'${colours.reset}`);
        }
    } catch(reason: any) {
        res.setChatMenuButtonSuccess = false;
        console.log(`${colours.fg.red}Setting TG SetChatMenuButton error '${JSON.stringify(reason)}'${colours.reset}`);
    }
    return res;
}

checkSettings();
const PORT = process.env.PORT || 8000;

async function notFound(c: any, req: Request, res: Response){
    const p = path.join(__dirname, '..', 'public', req.path);
    if (fs.existsSync(p)) {
        return res.sendFile(p);
    }
    return res.status(404).json('Not found');
}

const bot = new TelegramBot(process.env.tg_bot_authtoken as string);

const api = new OpenAPIBackend({ 
    definition: 'misiscoin.yml'
});
api.init();
api.register({
    version: async (c, req, res, person) => {
        try {
            const pkg = require("../package.json");
            return res.status(200).json(pkg.version);
        } catch (e) {
            return res.status(400).json(e);
        }
    },
    tgconfig: async (c, req, res, person) => {
        const ret = await setupTelegramBot(bot);
        return res.status(200).json(ret);
    },
    //supportsendmessagetouser: async (c, req, res, user) => supportsendmessagetouser(c, req, res, user, bot),
    telegram: async (c, req, res, user) => telegram(c, req, res, bot),
    productbalance: async (c, req, res, person) => productbalance(c, req, res, person, bot),
    contributions: async (c, req, res, person) => contributions(c, req, res, person, bot),
    sendtextmessage: async (c, req, res, person) => sendtextmessage(c, req, res, person, bot),
    gameminesmakefield: async (c, req, res, person) => gameminesmakefield(c, req, res, person, bot),
    gameminesgo: async (c, req, res, person) => gameminesgo(c, req, res, person, bot),
    gamepswinit: async (c, req, res, person) => gamepswinit(c, req, res, person, bot),
    gamepswgo: async (c, req, res, person) => gamepswgo(c, req, res, person, bot),
    gametapgo: async (c, req, res, person) => gametapgo(c, req, res, person, bot),
    gametrigo: async (c, req, res, person) => gametrigo(c, req, res, person, bot),
    gamewordgo: async (c, req, res, person) => gamewordgo(c, req, res, person, bot),
    gamechess: async (c, req, res, person) => gamechess(c, req, res, person, bot),

    validationFail: (c, req, res) => res.status(400).json({ err: c.validation.errors }),
    notFound: (c, req, res) => notFound(c, req, res),
    notImplemented: (c, req, res) => res.status(500).json({ err: 'not implemented' }),
    unauthorizedHandler: (c, req, res) => res.status(401).json({ err: 'not auth' })
});

async function productbalance(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    const product_name = req.body.productname;
    const product = await Product.getByName(product_name);
    if (product !== undefined) {
        return res.status(200).json({product: product.json, balance: await product.balance(), contributors: await product.contributors()});
    } else {
        return res.status(400).json({ok: false, error: `Product '${product_name}' not found`});
    }
}

async function contributions(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    try {
        return res.status(200).json({person: person.json, contributions: await person.contributions()});
    } catch(e: any) {
        return res.status(400).json({ok: false, error: `${JSON.stringify(e)}`});
    }
}

async function sendtextmessage(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    try {
        const whom = req.body.whom;
        const text = req.body.text;
        if (whom !== undefined && text !== undefined){
            bot.sendMessage(whom, `Сообщение от '${person.json.name} (${person.json.tguserid})': ${text}`.substring(0, 399), {disable_notification: true});
        }
        return res.status(200).json({ok: true});
    } catch(e: any) {
        return res.status(400).json({ok: false, error: `${JSON.stringify(e)}`});
    }
}

async function gameminesmakefield(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    let group = person.json.group?person.json.group:"";
    const group_admin = req.body.group;
    group = group_admin === undefined? group: group_admin;
    let field = await GameMinesField.getByGroup(group);
    if (field === undefined) {
        const weights = new Array(42).fill(0).map(el=>{
            let x = Math.round(Math.random()*5);
            //x = x - 2;
            //x = x < 0?0:x;
            return x;
        });
        //for (const el in weights) weights[el] = Math.round(Math.random()*7);
        field = new GameMinesField(undefined, {
            group: group,
            whowhere: Array(42).fill([]),
            cellexploded: Array(42).fill(false),
            cellmaxweight: weights,
            stepCount: 0,
            finishersCount:0,
            blocked: false,
            created: new Date()
        });
        //field.json.cellmaxweight.forEach((el, idx, arr)=>arr[idx] = Math.round(Math.random()*7))
        await field.save();
    }
    return res.status(200).json(field.json);
}

async function gameminesgo(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    const group = person.json.group?person.json.group:"";
    let field = await GameMinesField.getByGroup(group);
    if (field === undefined) {
        return res.status(404).json();
    }
    const whereto = req.body.whereto;
    const right = await field.Goto(person, whereto);
    if (right) {
        return res.status(200).json({field: field.json, ok: true});
    } else {
        return res.status(203).json({field: field.json, ok: false});
    }
}

async function gametrigo(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    const group = person.json.group?person.json.group:"";
    let field = await GameTriField.getByTgId(person);
    if (field === undefined) {
        return res.status(404).json();
    }
    const whereto = parseInt(req.body.whereto);
    const mat = await field.getAvg();
    if (whereto !== undefined) {
        const right = await field.Goto(person, whereto);
        if (right) {
            return res.status(200).json({field: field.json, avg: mat, ok: true});
        } else {
            return res.status(203).json({field: field.json, avg: mat, ok: false});
        }
    } else {
        return res.status(200).json({field: field.json, avg: mat, ok: true});
    }
}

async function gamewordgo(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    const group = person.json.group?person.json.group:"";

    let field = await GameWordField.getByTgId(person);
    
    if (field === undefined) {
        return res.status(404).json();
    }
    const myword = req.body.myword;
    const checkword = req.body.checkword;
    if (myword !== undefined) {
        const ret = await field.setMyWord(person, myword);
        return res.status(200).json({field: field.json, stats: await field.getStats(group), ok: ret});
    } else if (checkword !== undefined){
        await field.checkWord(person, checkword);
        return res.status(200).json({field: field.json, stats: await field.getStats(group), ok: true});
    } else {
        return res.status(200).json({field: field.json, stats: await field.getStats(group), ok: true});
    }
}

async function gamechess(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    MongoProto.connectMongo();
    const field = await mongoGameChessField.aggregate([
        {$match: {color: {$exists: true}}}
    ]);
    return res.status(200).json({field: field, ok: true});
}

async function gamepswinit(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    const groupreq = req.body.group;
    const group = person.json.group?person.json.group:groupreq;
    let gamer = await GamePsw.getById(person.json.tguserid);
    if (gamer === undefined) {
        gamer = new GamePsw(undefined, {
            tguserid: person.json.tguserid,
            group: person.json.group,
            blocked: false,
            created: new Date(),
            rulestime: []
        });
        await gamer.save();
    }
    return res.status(200).json({gamer: gamer.json, group: await GamePsw.groupScore(group), ok: true});
}

async function gamepswgo(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    const groupreq = req.body.group;
    const psw = req.body.psw;
    const ruleNumber = req.body.ruleNumber;
    const group = person.json.group?person.json.group:groupreq;
    let gamer = await GamePsw.getById(person.json.tguserid);
    if (gamer === undefined) {
        return res.status(404).json({ok: false});
    } else {
        await gamer.ruleNumberPassed(ruleNumber, psw);
        return res.status(200).json({gamer: gamer.json, group: await GamePsw.groupScore(group), ok: true});
    }
}

async function gametapgo(c: Context, req: Request, res: Response, person: Person, bot: TelegramBot) {
    const inc = req.body.score;
    let gamer = await GameTap.getById(person.json.tguserid);
    if (gamer === undefined) {
        return res.status(404).json({ok: false});
    } else {
        const curScore = await gamer.incScore(inc);
        return res.status(200).json({gamer: gamer.json, ok: true});
    }
}

api.registerSecurityHandler('MisisCoinTGUserId',  async (context, req, res, person: Person)=>{
    return person !== undefined;
});

api.registerSecurityHandler('TGQueryCheckString', async (context, req: Request, res, person: Person)=>{
    try {
        const misiscoin_tgquerycheckstring = decodeURIComponent(req.headers["misiscoin-tgquerycheckstring"] as string);
        const arr = misiscoin_tgquerycheckstring.split('&');
        const hashIndex = arr.findIndex(str => str.startsWith('hash='));
        const hash = arr.splice(hashIndex)[0].split('=')[1];

        const secret_key = createHmac('sha256', "WebAppData").update(process.env.tg_bot_authtoken as string).digest();
        arr.sort((a, b) => a.localeCompare(b));

        const check_hash = createHmac('sha256', secret_key as any).update(arr.join('\n')).digest('hex');
        return check_hash === hash;
    } catch (e) {
        return false;
    }
});


export const app: Application = express();
app.use(express.json());
app.use(cors());

// use as express middleware
app.use(async (req: Request, res: Response) => {
    const requestUUID = randomUUID();
    const requestStart = new Date();
    req.headers["misiscoin-uuid"] = requestUUID;
    req.headers["misiscoin-start"] = requestStart.toISOString();
    console.log(`🚀 ${requestStart.toISOString()} - [${requestUUID}] - ${req.method} ${colours.fg.yellow}${req.path}\n${colours.fg.blue}headers: ${Object.keys(req.headersDistinct).filter(v => v.startsWith("misiscoin-")).map(v => `${v} = '${req.headersDistinct[v]}'`).join(", ")}\nbody: ${Object.keys(req.body).map(v => `${v} = '${req.body[v]}'`).join(", ")}\nquery: ${Object.keys(req.query).map(v => `${v} = '${req.query[v]}'`).join(", ")}${colours.reset}`);

    const stguid = req.headers["misiscoin-tguid"] as string;
    const person = stguid === undefined?undefined:await Person.getByTgUserId(stguid);
    let ret;

    try {
        ret =  await api.handleRequest({
            method: req.method,
            path: req.path,
            body: req.body,
            query: req.query as {[key: string]: string},
            headers: req.headers as {[key: string]: string}
        }, 
        req, res, person);
    } catch (e){
        ret =  res.status(500).json({code: "Wrong parameters", description: `Request ${req.url}- ${(e as Error).message}`});
    }
    const requestEnd = new Date();
    req.headers["misiscoin-request-end"] = requestEnd.toISOString();
    console.log(`🏁 ${requestStart.toISOString()} - [${requestUUID}] - ${req.method} ${res.statusCode >= 200 && res.statusCode < 400 ? colours.fg.green : colours.fg.red}${req.path}${colours.reset} - ${res.statusCode} - ${requestEnd.getTime() - requestStart.getTime()} ms`);
    return ret;
});

export const server = app.listen(PORT, () => {
    console.log("Server is running on port", PORT);
});
