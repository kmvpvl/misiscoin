import TelegramBot from "node-telegram-bot-api";
import colours from "./colours";
import { Request, Response } from 'express';
import Person, { IPerson, mongoPersons } from "./person";
import Product from "./product";
import Transaction from "./transaction";
import { Types } from "mongoose";
import GameChessField, { IGameChessField, mongoGameChessField } from "./gamechess";

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
        case 'close':
            const prodName = cbcommand[1];
            const prod = await Product.getByName(prodName);
            if (prod === undefined) {
                bot.answerCallbackQuery(tgData.callback_query?.id as string, {text: `Product ${JSON.stringify(prodName)} not found`});
                return true;
            }
            const contributors = await prod.contributors();
            const sum = contributors.reduce<number>((prevSum, curDepositor)=>(!curDepositor.blocked?curDepositor.sum:0)+prevSum, 0);
            const productOwner = new Person(prod.json.owner);
            await productOwner.load();
            contributors.forEach( (contributor, i)=>{
                if (contributor.blocked) return;
                setTimeout( async ()=> {
                    const transaction = new Transaction(undefined, {
                        from: prod.uid,
                        to: new Types.ObjectId(contributor._id),
                        count: contributor.sum,
                        created: new Date(),
                        blocked: false,
                    });
                    await transaction.save();
                    //await bot.answerCallbackQuery(tgData.callback_query?.id as string, {text: `${contributor.tguserid} Продукт ${prodName} успешно защищен. Вам вернулись Ваши инвестии ${contributor.sum}`});
                    try {
                        await bot.sendMessage(contributor.tguserid, `Продукт ${prodName} успешно защищен. Вам вернулись Ваши инвестии ${contributor.sum}`);
                    } catch(e) {
                        console.error(`Message to tgid = '${contributor.tguserid}' wasn't sent`);
                    }
                    console.log(`${contributor.tguserid} Продукт ${prodName} успешно защищен. Вам вернулись Ваши инвестии ${contributor.sum}`);
                }, 2000 * i)
            });
            prod.json.closed = true;
            await prod.save();
            const transaction = new Transaction(undefined, {
                from: prod.uid,
                to: productOwner.uid,
                count: sum,
                created: new Date(),
                blocked: false,
            });
            await transaction.save();
            try {
                await bot.sendMessage(chat_id, `Запущен процесс оповещения контрибуторов продукта ${prodName}`);
            } catch(e) {
                console.error(`Message to tgid = '${chat_id}' wasn't sent`);
            }
            try {
                await bot.sendMessage(productOwner.json.tguserid, `Запущен процесс оповещения контрибуторов продукта ${prodName} о закрытии проекта. Вам достаются $${sum}. Разделите их между участниками`);
            } catch(e) {
                console.error(`Message to tgid = '${productOwner.json.tguserid}' wasn't sent`);
            }
}
    return true;
}

async function message_process(tgData: TelegramBot.Update, bot: TelegramBot, person: Person): Promise<boolean> {
    if (!await command_process(tgData, bot, person)) {
        const chat_id = tgData.message?.chat.id as number;
        const command_d = person.json.awaitcommanddata?.split(":", 2);
        if (tgData.message?.reply_to_message !== undefined) {
            if (/Сообщение от \'.+\([0-9]+\)\':.+/gm.test(""+tgData.message.reply_to_message.text)) {
                const words_tgid = / \([0-9]+\)':/gm.exec(""+tgData.message.reply_to_message.text);
                if (words_tgid !== null) {
                    const whom_tgid = /[0-9]+/gm.exec(words_tgid[0]);
                    if (whom_tgid !== null) bot.sendMessage(whom_tgid[0], `Сообщение от '${person.json.name} (${person.json.tguserid})': ${tgData.message.text}`, {disable_notification: true});
                }
            }
        }
        if (command_d === undefined) {
            if (tgData.message?.video !== undefined) {
                bot.sendMessage(chat_id, `Ваш видео контент принят. File_id = '${tgData.message?.video.file_id}'. Отправиьте идентификатор тому, кто имеет право делать рассылки`);
            }
            if (tgData.message?.document !== undefined) {
                bot.sendMessage(chat_id, `Ваш документ принят. File_id = '${tgData.message?.document.file_id}'. Отправиьте идентификатор тому, кто имеет право делать рассылки`);
            }
            return true;
        } 
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
    if (person.json.awaitcommanddata !== undefined) await person.setAwaitCommandData();
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
                if (msg_arr.length === 1) {
                    const products = await person.getProducts();
                    let menu = [];
                    for (const p of products) {
                        const prodObj = new Product(undefined, p);
                        const balance = await prodObj.balance();
                        const bal_str = balance.reduce((prev, cur)=>prev+cur.sum, 0);
                        menu.push( [{text: `${p.name}: ${p.desc} = ${bal_str}`, web_app: {url: `${process.env.tg_web_hook_server}/product.html?name=${encodeURIComponent(p.name)}`}}]);
                    }
                    if (menu.length > 0) bot.sendMessage(chat_id, `Ваши продукты:`, {reply_markup:{inline_keyboard:menu}});

                    const own = await person.balance();

                    const balance_c = own.reduce<number>((prev, cur)=>(cur.validthru===undefined?cur.sum:0)+prev, 0);
                    const balance_v = own.reduce<number>((prev, cur)=>(cur.validthru!==undefined?cur.sum:0)+prev, 0);
                    let spendupto = own.reduce<number>((prev, cur)=>{
                        return (cur.validthru!==undefined && cur.spendupto===undefined || cur.spendupto!==undefined && cur.spendupto > new Date()?cur.sum:0)
                        +prev}, 0);
                    spendupto = Math.min(balance_v, spendupto);
                    if (spendupto < 0) spendupto = 0;
                    bot.sendMessage(chat_id, `Ваш личный счет:\n$${balance_c} - постоянные\n$${balance_v} - временные 01.01.25`.substring(0, 399), {reply_markup: {inline_keyboard: [[
                        {text: "Мои контрибуции", web_app:{url:`${process.env.tg_web_hook_server}/person.html`}}
                    ]]}});
                } else {
                    const prod = await Product.getByName(msg_arr[1]);
                    if (prod !== undefined) {
                        let menu = [];
                        menu.push([{text: `${prod.json.name}: ${prod.json.desc}`, web_app: {url: `${process.env.tg_web_hook_server}/product.html?name=${encodeURIComponent(prod.json.name)}`}}]);
                        if (person.json.emission && !prod.json.closed) menu.push( [{text: `Успех`, callback_data: `close:${prod.json.name}`}]);
                        bot.sendMessage(chat_id, "Продукт:", {reply_markup: {inline_keyboard: menu}});
                    } else {
                        bot.sendMessage(chat_id, `Продукт '${msg_arr[1]}' не найден`);
                    }
                }
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
                if (new Date().getTime() > new Date("2024-12-27T00:00:00").getTime()) {
                    bot.sendMessage(chat_id, "Все переводы в системе запрещены");
                    return true;
                }
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
                        if (whomProduct.json.closed) {
                            bot.sendMessage(chat_id, "Проект закрыт");
                            return true;
                        }
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
                        bot.sendMessage(chat_id, `Вы заплатили ${count} '${whomPerson.json.name}' успешно`);
                        bot.sendMessage(whomPerson.json.tguserid, `Вы получили платеж от '${person.json.name}'(${person.json.tguserid}) ${count} (${what})`);
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
                const help = " /balance - Мой текущий баланс\n/spend - позволяет вкладывать бобы в проекты или передавать их иным лицам\n/message - написать сообщение другому пользователю или владельцу продукта";
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
                        {$match: {group: msg_arr[1], blocked: false}}
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
            case "/message":
                const msg = msg_arr.filter((m, i)=>i > 1).join(" ");
                if (msg_arr.length < 3 ) {
                    bot.sendMessage(chat_id, "Не получилось распознать имя получателя сообщения. /message <TgID или кратк имя продукта> <Сообщение>");
                    return true;
                }
                const userTo = await Person.getByTgUserId(msg_arr[1]);
                if (userTo !== undefined) {
                    await bot.sendMessage(msg_arr[1], `Сообщение от '${person.json.name} (${person.json.tguserid})': ${msg}`, {disable_notification: true});
                } else {
                    const prodTo = await Product.getByName(msg_arr[1]);
                    if (prodTo !== undefined) {
                        const owner = new Person(prodTo.json.owner);
                        await owner.load();
                        bot.sendMessage(owner.json.tguserid, `Сообщение от '${person.json.name} (${person.json.tguserid})': ${msg}`, {disable_notification: true});
                    } else {
                        bot.sendMessage(chat_id, "Не получилось распознать имя получателя сообщения. /message <TgID или кратк имя продукта> <Сообщение>");
                    }
                }
                return true;
            case "/broadcast":
                if (person.json.emission === undefined || !person.json.emission) return true;
                const all_persons = await mongoPersons.aggregate<IPerson>([{$match: {"blocked": false}}]);
                all_persons.forEach((p, i)=> {
                    setTimeout(async ()=>{
                        try {
                            let caption = msg_arr.filter((m, i)=>i > 2).join(" ");
                            switch (msg_arr[2]){
                                case "v":
                                    await bot.sendVideo(p.tguserid, msg_arr[1], {caption: caption});
                                    break;
                                case "d":
                                    await bot.sendDocument(p.tguserid, msg_arr[1], {caption: caption});
                                    break;
                                default: 
                                    caption = msg_arr.filter((m, i)=>i > 0).join(" ");
                                    await bot.sendMessage(p.tguserid, caption);
                            }
                            console.log(`Message to tgid = '${p.tguserid}' sent`);
                        } catch(e: any) {
                            console.error(`Message to tgid = '${p.tguserid}' wasn't sent`);
                        }
                    }, i * 2000);
                });
                return true;
            case "/tap":
                bot.sendMessage(chat_id, "Tap", {
                    reply_markup:{inline_keyboard:
                        [
                        [{text: "Tap", web_app: {url: `${process.env.tg_web_hook_server}/tap.html`}}]
                        ],
                }});
                return true;
            case "/game":
                bot.sendMessage(chat_id, "Выберите игру", {
                    reply_markup:{inline_keyboard:
                    person.json.emission?
                        [
                        [{text: "Минное поле (Админ)", web_app: {url: `${process.env.tg_web_hook_server}/game_mines.html?admin=1`}}],
                        [{text: "Слово (Админ)", web_app: {url: `${process.env.tg_web_hook_server}/word.html?admin=1`}}],
                        [{text: "Треугольники (Админ)", web_app: {url: `${process.env.tg_web_hook_server}/triangles.html?admin=1`}}],
                        [{text: "Пароль (Админ)", web_app: {url: `${process.env.tg_web_hook_server}/password.html?admin=1`}}]
                        ]
                        :
                        [
                        [{text: "Минное поле", web_app: {url: `${process.env.tg_web_hook_server}/game_mines.html`}}],
                        [{text: "Слово", web_app: {url: `${process.env.tg_web_hook_server}/word.html`}}],
                        [{text: "Треугольники", web_app: {url: `${process.env.tg_web_hook_server}/triangles.html`}}],
                        [{text: "Пароль", web_app: {url: `${process.env.tg_web_hook_server}/password.html`}}]
                        ],
                }});
                return true;
            case "/c":
            case "/chess":
                const player = await GameChessField.getByTgId(person);
                if (player !== undefined){
                    if  (player.json.color === undefined) {
                        bot.sendMessage(chat_id, "Вам не назначен цвет, обратитесь к распорядителю");
                    } else {
                        const chfrom = msg_arr[1];
                        const chto = msg_arr[2];
                        const chhm = parseInt(msg_arr[3]);
                        if (isNaN(chhm) || chhm <= 0) {
                            bot.sendMessage(chat_id, "Не удалось распознать количество перемещаемых воинов");
                            return true;
                        }

                        if (chfrom === undefined || chto === undefined || chhm === undefined) {
                            bot.sendMessage(chat_id, "Часть параметров пустые, ход не выполнен");
                            return true;
                        }
                        if (parseInt(chto.charAt(1)) < 1 || parseInt(chto.charAt(1)) > 8 || chto.charAt(0) < "a" || chto.charAt(0) > "h") {
                            bot.sendMessage(chat_id, "Неправильно указана клетка прибытия");
                            return true;
                        }
                        if (Math.abs (parseInt(chto.charAt(1)) - parseInt(chfrom.charAt(1))) > 3-Math.floor(Math.log10(chhm)) || Math.abs(chto.charCodeAt(0) - chfrom.charCodeAt(0)) > 3-Math.floor(Math.log10(chhm))) {
                            bot.sendMessage(chat_id, "Нельзя так далеко ходить");
                            return true;
                        }
                        if (player.json.whereAndHowMany !== undefined) {
                            const fromIndex = player.json.whereAndHowMany.findIndex(el=>el.where === chfrom);
                            if (fromIndex !== -1 && player.json.whereAndHowMany[fromIndex].howmany >= chhm) {
                                let toIndex = player.json.whereAndHowMany.findIndex(el=>el.where === chto);
                                let sumOnDest = 0;
                                if (toIndex === -1) {
                                    player.json.whereAndHowMany[fromIndex].howmany -= chhm;
                                    if (player.json.whereAndHowMany[fromIndex].howmany === 0) player.json.whereAndHowMany.splice(fromIndex, 1);
                                    player.json.whereAndHowMany.push({where: chto, howmany: chhm});
                                    sumOnDest = chhm;
                                    await player.save();
                                } else {
                                    player.json.whereAndHowMany[fromIndex].howmany -= chhm;
                                    player.json.whereAndHowMany[toIndex].howmany += chhm;
                                    sumOnDest = player.json.whereAndHowMany[toIndex].howmany;
                                    if (player.json.whereAndHowMany[fromIndex].howmany === 0) player.json.whereAndHowMany.splice(fromIndex, 1);
                                    await player.save();
                                }
                                const othersPlayers: IGameChessField[] = await mongoGameChessField.aggregate([
                                    {$match:{$expr: {$ne: ["$tguserid", player.json.tguserid]}}},
                                    {$match: {"whereAndHowMany": {$elemMatch:{"where":chto, "howmany":{$lte:sumOnDest}}}}}
                                ]);
                                toIndex = player.json.whereAndHowMany.findIndex(el=>el.where === chto);
                                for (const otherPlayer of othersPlayers) {
                                    const toDelElIdx = otherPlayer.whereAndHowMany?.findIndex(el=>el.where === chto);
                                    if (otherPlayer.whereAndHowMany !== undefined && toDelElIdx !== undefined && toDelElIdx >= 0) {
                                        player.json.whereAndHowMany[toIndex].howmany += otherPlayer.whereAndHowMany[toDelElIdx].howmany;
                                        bot.sendMessage(chat_id, `Вы съели ${otherPlayer.color} ${otherPlayer.whereAndHowMany[toDelElIdx].howmany}`);
                                        otherPlayer.whereAndHowMany.splice(toDelElIdx, 1);
                                        const op = new GameChessField(undefined, otherPlayer);
                                        await op.save();
                                        await player.save();
                                    }

                                }
                            } else {
                                bot.sendMessage(chat_id, `На клетке ${chfrom} недостаточно фигур`);
                            }
                        }
                        bot.sendMessage(chat_id, `Вы передвинули ${chhm} из ${chfrom} в ${chto}`);
                        
                    }
                } else {

                }
                return true;
            default: 
                bot.sendMessage(chat_id, `'${command_name}' is unknoun command. Check your spelling`);
                return true;
        }
    }
    return false;
}
