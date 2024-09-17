import TelegramBot from "node-telegram-bot-api";
import colours from "./colours";
import { Request, Response } from 'express';
import Person, { mongoPersons } from "./person";
import Product from "./product";
import Transaction from "./transaction";
import { Types } from "mongoose";

export default async function telegram(c: any, req: Request, res: Response, bot: TelegramBot) {    
    const tgData: TelegramBot.Update = req.body;
    const tgUserId = tgData.callback_query?.message?.chat.id?tgData.callback_query?.message?.chat.id:tgData.message?.from?.id as number;

    console.log(`${colours.fg.blue}API: telegram function\n${JSON.stringify(tgData, undefined, 4)}${colours.reset}`);
    try {
        let personDraft = await Person.getByTgUserId(tgUserId);
        if (personDraft === undefined){
            personDraft = new Person(undefined, {
                tguserid: tgUserId,
                name: `${tgData.message?.from?.first_name} ${tgData.message?.from?.last_name}`,
                blocked: false,
                created: new Date()
            });
            await personDraft.save();
        }

        if (tgData.callback_query !== undefined) {
            // it's callback
            callback_process(tgData, bot, personDraft);
            return res.status(200).json("OK");
        }
        
        // it isn't callback. This message may be command or data from user or message to support
        message_process(tgData, bot, personDraft);
        return res.status(200).json("OK");

    } catch (e) {
        bot.sendMessage(tgUserId, 'Sorry, your account not created. Press /start or call to support');
        return res.status(200).json("User not found");
    }
}

async function callback_process(tgData: TelegramBot.Update, bot: TelegramBot, person: Person): Promise<boolean> {
    const callback = tgData.callback_query?.data as string;
    const chat_id = tgData.callback_query?.message?.chat.id as number;
    console.log(`Callback command '${callback}'`);
    const cbcommand = callback.split(':');
    switch(cbcommand[0]) {
        case 'setgroup':
            await person.setGroup(cbcommand[1]);
            bot.answerCallbackQuery(tgData.callback_query?.id as string, {text: `Group selected`});
            break;
    }
    return true;
}

async function message_process(tgData: TelegramBot.Update, bot: TelegramBot, person: Person): Promise<boolean> {
    return command_process(tgData, bot, person);
}
async function command_process(tgData: TelegramBot.Update, bot: TelegramBot, person: Person): Promise<boolean> {
    // looking for bot-command from user
    const chat_id = tgData.message?.chat.id as number;
    const commands = tgData.message?.entities?.filter(v => v.type == "bot_command");
    if (!commands || !(commands as any).length ) return false;
    console.log(`command(s) found: ${tgData.message?.text}`);
    for (let [i, c] of Object.entries(commands as Array<TelegramBot.MessageEntity>)) {
        const command_name = tgData.message?.text?.substring(c.offset, c.offset + c.length);
        console.log(`${colours.fg.green}Processing command = '${command_name}'${colours.reset}`);
        const msg_arr = tgData.message?.text?.split(" ");
        switch (command_name) {
            case '/start': 
                bot.sendMessage(chat_id, `Welcome! Your id is ${chat_id}. Use this number as your account to receive coins`);
                break;
            case '/balance':
                const products = await person.getProducts();
                let str = [];
                for (const p of products) {
                    const prodObj = new Product(undefined, p);
                    const balance = await prodObj.balance();
                    const bal_str = balance.reduce((prev, cur)=>prev+cur.sum, 0);
                    str.push( `${p.name}: ${p.desc} = ${bal_str}`);
                }
                bot.sendMessage(chat_id, `Your products:\n${str.join("\n")}`);
                const own = await person.balance();
                const str_own = own.map((r, i)=>`${r.sum} - ${r.validthru?`valid thru: ${r.validthru?.toLocaleDateString()}`:""} ${r.spendupto?`spend up to: ${r.spendupto?.toLocaleDateString()}`:""}${!r.validthru && !r.spendupto?"constant":""}`);
                bot.sendMessage(chat_id, `Your own:\n${str_own.join("\n")}`);
                break;
            case '/settings':
                if (person.json.group !== undefined) {
                    bot.sendMessage(chat_id, `Your group is ${person.json.group}`);
                } else {
                    bot.sendMessage(chat_id, `Select group`, {reply_markup: {inline_keyboard: [
                    [{text: "БЭК-24-1", callback_data: "setgroup:БЭК-24-1"}],
                    [{text: "БЭК-24-2", callback_data: "setgroup:БЭК-24-2"}],
                    [{text: "БЭК-24-3", callback_data: "setgroup:БЭК-24-3"}],
                    [{text: "БЭК-24-4", callback_data: "setgroup:БЭК-24-4"}],
                    [{text: "БЭК-24-5", callback_data: "setgroup:БЭК-24-5"}],
                    [{text: "БЭК-24-6", callback_data: "setgroup:БЭК-24-6"}],
                    [{text: "БТД-24-1", callback_data: "setgroup:БТД-24-1"}],
                    ]}});
                }
                break;
            case '/spend':
                if (msg_arr?.length !== 4) {
                    bot.sendMessage(chat_id, `Wrong format of command '/spend'. Try /spend whom howmuch options`);
                    return false;
                } else {
                    const whom = msg_arr[1];
                    const whomProduct = await Product.getByName(whom);
                    const whomPerson = await Person.getByTgUserId(whom);
                    const count = parseInt(msg_arr[2]);
                    const what = msg_arr[3];
                    const balance = await person.balance();
                    if (isNaN(count) || count <= 0) {
                        bot.sendMessage(chat_id, "2nd parameter of '/spend' command must be positive integer number");
                        return false;
                    }
                    if (what !== "c" && what !== "v") {
                        bot.sendMessage(chat_id, "3rd parameter of '/spend' command must be one letter: 'c' - constant or 'v' - valide thru");
                        return false;
                    }

                    if (what === "c" && person.json.emission === undefined) {
                        const limit = balance.reduce<number>((prev, cur)=>(cur.validthru===undefined?cur.sum:0)+prev, 0);
                        if (limit < count) bot.sendMessage(chat_id, `Not enough beans on your account. Limit is ${limit}`);
                        return true;
                    }
                    
                    if (what === "v" && person.json.emission === undefined) {
                        const limit = balance.reduce<number>((prev, cur)=>(cur.validthru!==undefined?cur.sum:0)+prev, 0);
                        if (limit < count) bot.sendMessage(chat_id, `Not enough beans on your account. Limit is ${limit}`);
                        return true;
                    }

                    if (whomProduct !== undefined) {
                        const tr = new Transaction(undefined, {
                            from: person.uid,
                            to: whomProduct.uid,
                            count: count,
                            created: new Date(),
                            blocked: false,
                            validthru: what==="c"?undefined:new Date("2024-12-31T21:00:00.000+00:00")
                        });
                        const productownder = new Person(whomProduct.json.owner);
                        await productownder.load();
                        await tr.save();
                        bot.sendMessage(chat_id, `You've paid ${count} to product '${whomProduct.json.desc}' successfully`);
                        bot.sendMessage(productownder.json.tguserid, `Your product '${whomProduct.json.desc}' got payment ${count}`);
                        return true;
                    }
                    if (whomPerson !== undefined) {
                        const tr = new Transaction(undefined, {
                            from: person.uid,
                            to: whomPerson.uid,
                            count: count,
                            created: new Date(),
                            blocked: false,
                            validthru: what==="c"?undefined:new Date("2024-12-31T21:00:00.000+00:00")
                        });
                        await tr.save();
                        bot.sendMessage(chat_id, `You've paid ${count} to person '${whomPerson.json.name}' successfully`);
                        bot.sendMessage(whomPerson.json.tguserid, `You've gotten payment from '${person.json.name}' ${count}`);
                        return true;
                    }
                    if (whomProduct === undefined && whomPerson === undefined) {
                        bot.sendMessage(chat_id, `It's NOT recognized the receiver of payment`);
                        return true;
                    }
                }
                break;
            case '/operations':
                const trs = await person.lastOperations();
                let op_str = "";
                for (const tr of trs) {
                    const cur_str = `${person.uid.equals(tr.to)?"in":"out"} ${tr.created.toLocaleString()} ${tr.count}\n`
                    if (op_str.length + cur_str.length > 400) {
                        await bot.sendMessage(chat_id, op_str);
                        op_str = cur_str;
                    } else {
                        op_str = op_str + cur_str;
                    }
                }
                if (op_str !== "") await bot.sendMessage(chat_id, op_str);
                return true;
                break;
            case '/help':
                const help = "/start - shows your Telegram id to get MISIS Coins\n/balance - reveals your own and your products current net balance and date of expiration your coins\n/spend - allows your spending coins to product or another persons' services\n/operations - 10 last operations of your account";
                bot.sendMessage(chat_id, help);
                break;
            case '/emission':
                if (msg_arr?.length !== 2) {
                    bot.sendMessage(chat_id, `Wrong format of command '/emission'. Try /emission groupname`);
                    return false;
                } else {
                    const whom = msg_arr[1];
                    const persons = await mongoPersons.aggregate([
                        {$match: {group: msg_arr[1]}}
                    ]);
                    for (const pers of persons){
                        const tr = new Transaction(undefined, {
                            from: person.uid,
                            to: new Types.ObjectId(pers._id),
                            count: 10,
                            validthru: new Date("2024-12-31T21:00:00.000+00:00"),
                            created: new Date(),
                            blocked: false,
                            spendupto: new Date(new Date().getTime() + 1000*60*60*24*7)
                        });
                        await tr.save();
                        bot.sendMessage(pers.tguserid, `You've got 10. Spend it up to: ${tr.json.spendupto?.toLocaleString()}`);
                    }
                    return true;
                }
                break;
            default: 
                bot.sendMessage(chat_id, `'${command_name}' is unknoun command. Check your spelling`);
                return false;
        }
    }
    return true;
}
