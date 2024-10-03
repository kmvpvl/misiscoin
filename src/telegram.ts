import TelegramBot from "node-telegram-bot-api";
import colours from "./colours";
import { Request, Response } from 'express';
import Person, { IPerson, mongoPersons } from "./person";
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
            await callback_process(tgData, bot, personDraft);
            return res.status(200).json("OK");
        }
        
        // it isn't callback. This message may be command or data from user or message to support
        await message_process(tgData, bot, personDraft);
        return res.status(200).json("OK");

    } catch (e) {
        bot.sendMessage(tgUserId, 'Извините, Ваш аккаунт не найден. Выполните команду /start');
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
            bot.answerCallbackQuery(tgData.callback_query?.id as string, {text: `Группа выбрана`});
            break;
    }
    return true;
}

async function message_process(tgData: TelegramBot.Update, bot: TelegramBot, person: Person): Promise<boolean> {
    if (!await command_process(tgData, bot, person)) {
        const chat_id = tgData.message?.chat.id as number;
        const command_d = person.json.awaitcommanddata?.split(":", 2);
        if (command_d === undefined) return true; 
        switch (command_d[0]) {
            case "ProductLongName":
                bot.sendMessage(chat_id, "Теперь введите короткий идентификатор продукта");
                await person.setAwaitCommandData(`ProductShortName:${tgData.message?.text}`);
                break;
            case "ProductShortName":
                const name_candidate = tgData.message?.text as string;
                if (name_candidate?.includes(" ")) {
                    bot.sendMessage(chat_id, "Идентификатор продукта не должен содержать пробелы");
                    return true;
                } else {
                    const p = await Product.getByName(name_candidate);
                    if (p !== undefined) {
                        bot.sendMessage(chat_id, "Этот идентификатор уже использован. Придумайте новый и попробуйте снова");
                        return true;
                    } else {
                        const p = new Product(undefined, {
                            name: name_candidate,
                            owner: person.uid,
                            desc: command_d[1],
                            created: new Date(),
                            blocked: false
                        });
                        await p.save();
                        
                        await person.setAwaitCommandData();
                        bot.sendMessage(chat_id, "Продукт создан, проверьте баланс");
                    }
                }
                break;
            default:
                await person.setAwaitCommandData();
                bot.sendMessage(chat_id, "Неизвестная команда");
        }
    }
    return true
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
        const msg_arr = tgData.message?.text?.split(" ") as Array<string>;
        switch (command_name) {
            case '/start': 
                bot.sendMessage(chat_id, `Привет, студент! Этот бот создан с целью вложения или получения бобов. Искренне верим, что вам удастся воспользоваться им правильно и получить заветную оценку. Удачи!\nВаш Telegram ID '${chat_id}'. Используйте его для получения бобов`);
                return true;
            case '/balance':
                const products = await person.getProducts();
                let str = [];
                for (const p of products) {
                    const prodObj = new Product(undefined, p);
                    const balance = await prodObj.balance();
                    const bal_str = balance.reduce((prev, cur)=>prev+cur.sum, 0);
                    str.push( `${p.name}: ${p.desc} = ${bal_str}`);
                }
                bot.sendMessage(chat_id, `Ваши продукты:\n${str.join("\n")}`);

                const own = await person.balance();

                const balance_c = own.reduce<number>((prev, cur)=>(cur.validthru===undefined?cur.sum:0)+prev, 0);
                const balance_v = own.reduce<number>((prev, cur)=>(cur.validthru!==undefined?cur.sum:0)+prev, 0);
                let spendupto = own.reduce<number>((prev, cur)=>{
                    return (cur.validthru!==undefined && cur.spendupto===undefined || cur.spendupto!==undefined && cur.spendupto > new Date()?cur.sum:0)
                    +prev}, 0);
                spendupto = Math.min(balance_v, spendupto);
                if (spendupto < 0) spendupto = 0;
                bot.sendMessage(chat_id, `Ваш личный счет:\n$${balance_c} - постоянные\n$${balance_v} - временные 01.01.25\n$${spendupto} - доступные`.substring(0, 399));
                return true;
            case '/settings':
                if (person.json.group !== undefined) {
                    bot.sendMessage(chat_id, `Ваша группа - ${person.json.group}`);
                } else {
                    bot.sendMessage(chat_id, `Выберите группу`, {reply_markup: {inline_keyboard: [
                    [{text: "БЭК-24-1", callback_data: "setgroup:БЭК-24-1"}],
                    [{text: "БЭК-24-2", callback_data: "setgroup:БЭК-24-2"}],
                    [{text: "БЭК-24-3", callback_data: "setgroup:БЭК-24-3"}],
                    [{text: "БЭК-24-4", callback_data: "setgroup:БЭК-24-4"}],
                    [{text: "БЭК-24-5", callback_data: "setgroup:БЭК-24-5"}],
                    [{text: "БЭК-24-6", callback_data: "setgroup:БЭК-24-6"}],
                    [{text: "БЭК-24-7", callback_data: "setgroup:БЭК-24-7"}],
                    [{text: "БТД-24-1", callback_data: "setgroup:БТД-24-1"}],
                    ]}});
                }
                return true;
            case '/spend':
                if (msg_arr?.length !== 4) {
                    bot.sendMessage(chat_id, `Неправильный формат команды '/spend'. Попробуйте /spend whom howmuch options`);
                    return false;
                } else {
                    const whom = msg_arr[1];
                    const whomProduct = await Product.getByName(whom);
                    const whomPerson = await Person.getByTgUserId(whom);
                    const count = parseInt(msg_arr[2]);
                    const what = msg_arr[3];
                    const balance = await person.balance();
                    if (isNaN(count) || count <= 0) {
                        bot.sendMessage(chat_id, "2-й параметр команды '/spend' должен быть положительным целым числом");
                        return false;
                    }
                    if (what !== "c" && what !== "v") {
                        bot.sendMessage(chat_id, "3-й параметр команды '/spend' должен быть латинской буквой: 'c' - постоянные или 'v' - временные");
                        return false;
                    }

                    if (what === "c" && person.json.emission === undefined) {
                        const limit = balance.reduce<number>((prev, cur)=>(cur.validthru===undefined?cur.sum:0)+prev, 0);
                        if (limit < count) {
                            bot.sendMessage(chat_id, `Недостаточно бобов для выполнения операции. Лимит ${limit}`);
                            return true;
                        }
                    }
                    
                    if (what === "v" && person.json.emission === undefined) {
                        //const limit = balance.reduce<number>((prev, cur)=>(cur.validthru!==undefined?cur.sum:0)+prev, 0);
                        const balance_v = balance.reduce<number>((prev, cur)=>(cur.validthru!==undefined?cur.sum:0)+prev, 0);
                        let spendupto = balance.reduce<number>((prev, cur)=>{
                            return (cur.validthru!==undefined && cur.spendupto===undefined || cur.spendupto!==undefined && cur.spendupto > new Date()?cur.sum:0)
                            +prev}, 0);
                        spendupto = Math.min(balance_v, spendupto);
                        if (spendupto < 0) spendupto = 0;
                        
                        if (balance_v < count) {
                            bot.sendMessage(chat_id, `Недостаточно бобов для выполнения операции. Лимит ${balance_v}`);
                            return true;
                        }
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
                        bot.sendMessage(chat_id, `Вы заплатили ${count} на продукт '${whomProduct.json.desc}'`);
                        bot.sendMessage(productownder.json.tguserid, `На продукт '${whomProduct.json.desc}' перечислено ${count}`);
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
                        bot.sendMessage(chat_id, `Не получилось распознать получателя платежа`);
                        return true;
                    }
                }
                return true;
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
            case '/help':
                const help = "/start - начать (получить Telegram ID) \n/balance - Мой текущий баланс\n/spend - позволяет вкладывать бобы в проекты или передавать их иным лицам\n/operations - отображает ваши последние 10 операций";
                bot.sendMessage(chat_id, help);
                return true;
            case '/newproduct':
                await person.setAwaitCommandData("ProductLongName");
                bot.sendMessage(chat_id, "Введите наименование продукта");
                return true;
            case '/emission':
                if (person.json.emission === undefined || !person.json.emission) return true;
                if (msg_arr?.length !== 2) {
                    bot.sendMessage(chat_id, `Неправильный формат команды '/emission'. Попробуйте /emission groupname`);
                    return true;
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
                        bot.sendMessage(pers.tguserid, `Вы получили 10 на счет. Потратьте до: ${tr.json.spendupto?.toLocaleString()}`);
                    }
                    return true;
                }
            case "/broadcast":
                if (person.json.emission === undefined || !person.json.emission) return true;
                const all_persons = await mongoPersons.aggregate<IPerson>([{$match: {"blocked": false}}]);
                all_persons.forEach((p, i)=> {
                    setTimeout(()=>bot.sendMessage(p.tguserid, msg_arr[1]), i * 2000);
                });
                return true;
            default: 
                bot.sendMessage(chat_id, `'${command_name}' is unknoun command. Check your spelling`);
                return true;
        }
    }
    return false;
}
