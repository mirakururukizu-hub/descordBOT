// --- 🌐 UptimeRobot用のWEBサーバー機能 (ここを1行目に追加) ---
const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Botは正常に稼働中やで！');
}).listen(process.env.PORT || 3000);
 
// --------------------------------------------------------
const { Client, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
 
// ⚠️ 【ここをご自身のトークンとキーに書き換えて、" " で囲んでください】
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN; 
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;     
 
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});
 
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const DATA_FILE = './coin_data.json';
 
function loadData() {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
 
function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
 
function getUserData(userId) {
    const data = loadData();
    if (!data[userId]) {
        data[userId] = { coins: 100, lastDaily: 0 };
        saveData(data);
    }
    return data[userId];
}
 
client.once('ready', async () => {
    const commands = [
        new SlashCommandBuilder().setName('gpt').setDescription('2ちゃんねらー（なんJ民）のAIに質問をします').addStringOption(opt => opt.setName('prompt').setDescription('質問内容').setRequired(true)),
        new SlashCommandBuilder().setName('daily').setDescription('1日1回、100コインを受け取ります'),
        new SlashCommandBuilder().setName('coin').setDescription('現在のコインの残高を確認します'),
        new SlashCommandBuilder().setName('slot').setDescription('スロットを回します（勝つと150%〜200%、負けると50%戻る）').addIntegerOption(opt => opt.setName('amount').setDescription('賭ける枚数を入力（省略すると10）')),
        new SlashCommandBuilder().setName('dice').setDescription('サイコロの目を予想します（ピッタリ200%、1違い150%、ハズレ50%戻る）').addIntegerOption(opt => opt.setName('guess').setDescription('予想する数字（1〜6）').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('賭ける枚数を入力（省略すると10）')),
        new SlashCommandBuilder().setName('coinflip').setDescription('コインフリップで賭けをします（当たると125%、ハズレると50%戻る）').addStringOption(opt => opt.setName('bet').setDescription('表か裏かを選んでください').setRequired(true).addChoices({ name: '表', value: '表' }, { name: '裏', value: '裏' })).addIntegerOption(opt => opt.setName('amount').setDescription('賭ける枚数を入力（省略すると10）')),
        new SlashCommandBuilder().setName('ranking').setDescription('コイン所持数ランキングを表示します'),
        new SlashCommandBuilder().setName('send').setDescription('他のユーザーにコインを送ります').addUserOption(opt => opt.setName('user').setDescription('送る相手').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('送る枚数').setRequired(true)),
        new SlashCommandBuilder().setName('setcoin').setDescription('【管理者限定】指定したユーザーのコイン残高を変更します').addUserOption(opt => opt.setName('user').setDescription('対象のユーザー').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('設定する枚数').setRequired(true)),
        new SlashCommandBuilder().setName('addcoin').setDescription('【管理者限定】指定したユーザーにコインを付与・没収します').addUserOption(opt => opt.setName('user').setDescription('対象のユーザー').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('増減させる枚数（マイナスも可）').setRequired(true))
    ];
 
    for (const cmd of commands) {
        await client.application.commands.create(cmd);
    }
    console.log('Botが起動し、すべてのコマンドを登録しました。');
});
 
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
 
    const userId = interaction.user.id;
    const userWallet = getUserData(userId);
    const globalData = loadData();
 
    const hasAdminRole = interaction.member.roles.cache.some(role => role.name === '管理者権限');
    const isOwner = interaction.guild.ownerId === userId;
 
    // --- 🤖 /gpt (なんJ民AI機能) ---
    if (interaction.commandName === 'gpt') {
        await interaction.deferReply();
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview', 
                contents: interaction.options.getString('prompt'),
                config: { 
                    systemInstruction: "あなたは2ちゃんねる（5ちゃんねる）のなんでも実況J（なんJ）板に生息する「なんJ民」です。口調は「〜やで」「〜やろ」「〜で草」「〇〇ニキ」などのなんJ特有のネットスラングを使い、少し生意気でユーモアのある2ちゃんねらーとして回答してください。改行や3点リーダー（…）を多用し、親しみやすい煽り口調を意識してください。" 
                }
            });
            await interaction.editReply(response.text.substring(0, 1990));
        } catch (error) {
            await interaction.editReply('❌ エラーが発生しました。');
        }
    }
 
    // --- 📅 /daily ---
    if (interaction.commandName === 'daily') {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        if (now - userWallet.lastDaily < oneDay) {
            const remaining = oneDay - (now - userWallet.lastDaily);
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            return interaction.reply(`❌ デイリーボーナスはすでに受け取っています。あと **${hours}時間** 待ってください。`);
        }
        globalData[userId].coins += 100;
        globalData[userId].lastDaily = now;
        saveData(globalData);
        await interaction.reply(`🎁 **デイリーボーナス！** 100コインを受け取りました。\n現在の残高: **${globalData[userId].coins}** コイン`);
    }
 
    // --- 🪙 /coin ---
    if (interaction.commandName === 'coin') {
        await interaction.reply(`💰 ${interaction.user.username}さんの現在の残高は **${userWallet.coins}** コインです。`);
    }
 
    // --- 🎰 /slot ---
    if (interaction.commandName === 'slot') {
        const amount = interaction.options.getInteger('amount') || 10;
        if (userWallet.coins < amount) return interaction.reply(`❌ コインが足りません。（所持金: **${userWallet.coins}** コイン）`);
        if (amount <= 0) return interaction.reply('❌ 1コイン以上を賭けてください。');
 
        globalData[userId].coins -= amount;
 
        const emojis = ['🍒', '🍏', '💎', '🌟', '🎰'];
        const s1 = emojis[Math.floor(Math.random() * emojis.length)];
        const s2 = emojis[Math.floor(Math.random() * emojis.length)];
        const s3 = emojis[Math.floor(Math.random() * emojis.length)];
 
        let msg = `🎰 **SLOT** | [ ${s1} | ${s2} | ${s3} ]\n`;
        if (s1 === s2 && s2 === s3) {
            const winAmount = Math.floor(amount * 2.0);
            globalData[userId].coins += winAmount;
            msg += `🎉 **大当り！！200%（${winAmount}コイン）の払い戻しです！**`;
        } else if (s1 === s2 || s2 === s3 || s1 === s3) {
            const winAmount = Math.floor(amount * 1.5);
            globalData[userId].coins += winAmount;
            msg += `✨ **小当り！150%（${winAmount}コイン）の払い戻しです！**`;
        } else {
            const backAmount = Math.floor(amount * 0.5);
            globalData[userId].coins += backAmount;
            msg += `😢 ハズレです…50%（${backAmount}コイン）が戻りました。`;
        }
        saveData(globalData);
        await interaction.reply(`${msg}\n現在の残高: **${globalData[userId].coins}** コイン`);
    }
 
    // --- 🎲 /dice ---
    if (interaction.commandName === 'dice') {
        const guess = interaction.options.getInteger('guess');
        const amount = interaction.options.getInteger('amount') || 10;
 
        if (guess < 1 || guess > 6) return interaction.reply('❌ サイコロの目は1〜6の間で予想してください。');
        if (userWallet.coins < amount) return interaction.reply(`❌ コインが足りません。（所持金: **${userWallet.coins}** コイン）`);
        if (amount <= 0) return interaction.reply('❌ 1コイン以上を賭けてください。');
 
        globalData[userId].coins -= amount;
        const diceResult = Math.floor(Math.random() * 6) + 1;
        const diff = Math.abs(guess - diceResult);
 
        let msg = `🎲 サイコロの出た目: **[ ${diceResult} ]** (あなたの予想: ${guess})\n`;
 
        if (diff === 0) {
            const winAmount = Math.floor(amount * 2.0);
            globalData[userId].coins += winAmount;
            msg += `🎉 **ピッタリ的中！200%（${winAmount}コイン）の払い戻しです！**`;
        } else if (diff === 1) {
            const winAmount = Math.floor(amount * 1.5);
            globalData[userId].coins += winAmount;
            msg += `✨ **1違いで惜しい！150%（${winAmount}コイン）の払い戻しです！**`;
        } else {
            const backAmount = Math.floor(amount * 0.5);
            globalData[userId].coins += backAmount;
            msg += `😢 ハズレ（2つ以上ズレ）です。50%（${backAmount}コイン）が戻りました。`;
        }
        saveData(globalData);
        await interaction.reply(`${msg}\n現在の残高: **${globalData[userId].coins}** コイン`);
    }
 
    // --- 🪙 /coinflip ---
    if (interaction.commandName === 'coinflip') {
        const bet = interaction.options.getString('bet');
        const amount = interaction.options.getInteger('amount') || 10;
 
        if (userWallet.coins < amount) return interaction.reply(`❌ コインが足りません。（所持金: **${userWallet.coins}** コイン）`);
        if (amount <= 0) return interaction.reply('❌ 1コイン以上を賭けてください。');
 
        globalData[userId].coins -= amount;
        const result = Math.random() < 0.5 ? '表' : '裏';
 
        let msg = `🪙 コインの結果: **【 ${result} 】** (あなたの予想: ${bet})\n`;
        if (bet === result) {
            const winAmount = Math.floor(amount * 1.25);
            globalData[userId].coins += winAmount;
            msg += `🎉 **的中！125%（${winAmount}コイン）の払い戻しです！**`;
        } else {
            const backAmount = Math.floor(amount * 0.5);
            globalData[userId].coins += backAmount;
            msg += `😢 ハズレです。50%（${backAmount}コイン）が戻りました。`;
        }
        saveData(globalData);
        await interaction.reply(`${msg}\n現在の残高: **${globalData[userId].coins}** コイン`);
    }
 
    // --- 🏆 /ranking ---
    if (interaction.commandName === 'ranking') {
        const sorted = Object.entries(globalData).sort((a, b) => b[1].coins - a[1].coins).slice(0, 10);
        let msg = `🏆 **コイン所持数ランキング TOP10** 🏆\n`;
        let rank = 1;
        for (const [id, val] of sorted) {
            const user = await client.users.fetch(id).catch(() => null);
            const name = user ? user.username : `不明なユーザー(${id})`;
            msg += `${rank}位. ${name} — **${val.coins}** コイン\n`;
            rank++;
        }
        await interaction.reply(msg);
    }
 
    // --- 🎁 /send ---
    if (interaction.commandName === 'send') {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
 
        if (targetUser.id === userId) return interaction.reply('❌ 自分にコインは送れません。');
        if (amount <= 0) return interaction.reply('❌ 1コイン以上を指定してください。');
        if (userWallet.coins < amount) return interaction.reply('❌ 送るコインが足りません。');
 
        getUserData(targetUser.id);
        globalData[userId].coins -= amount;
        globalData[targetUser.id].coins += amount;
        saveData(globalData);
        await interaction.reply(`💸 **送金成功**\n${interaction.user.username}さんから${targetUser.username}さんへ **${amount}** コイン送られました。`);
    }
 
    // --- 👑 /setcoin ---
    if (interaction.commandName === 'setcoin') {
        if (!hasAdminRole && !isOwner) return interaction.reply({ content: '❌ このコマンドは「管理者権限」のロールを持っている人しか使えません。', ephemeral: true });
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        if (amount < 0) return interaction.reply('❌ 0以上のコインを指定してください。');
 
        getUserData(targetUser.id);
        globalData[targetUser.id].coins = amount;
        saveData(globalData);
        await interaction.reply(`👑 **管理コマンド実行**\n${targetUser.username}さんの残高を **${amount}** コインに設定しました。`);
    }
 
    // --- 👑 /addcoin ---
    if (interaction.commandName === 'addcoin') {
        if (!hasAdminRole && !isOwner) return interaction.reply({ content: '❌ このコマンドは「管理者権限」のロールを持っている人しか使えません。', ephemeral: true });
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
 
        getUserData(targetUser.id);
        globalData[targetUser.id].coins += amount;
        if (globalData[targetUser.id].coins < 0) globalData[targetUser.id].coins = 0;
        saveData(globalData);
 
        if (amount >= 0) {
            await interaction.reply(`👑 **管理コマンド実行**\n${targetUser.username}さんに **${amount}** コインを付与しました。`);
        } else {
            await interaction.reply(`👑 **管理コマンド実行**\n${targetUser.username}さんから **${Math.abs(amount)}** コインを没収しました。`);
        }
    }
});
 
// ログインして起動！
client.login(process.env.DISCORD_BOT_TOKEN);