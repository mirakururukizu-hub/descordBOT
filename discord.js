// --- UptimeRobot用のWEBサーバー機能 ---
const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Botは正常に稼働中やで！');
}).listen(process.env.PORT || 3000);

// ==========================================

const { Client, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

// チャンネル・スレッド・フォーラムごとの会話履歴を保存する箱
const chatHistories = new Map();

// 環境変数からトークンとキーを読み込み
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

// --- データの読み書き関数 ---
function loadData() {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// サーバーIDとユーザーIDをセットでデータを取得する関数
function getUserData(guildId, userId) {
    const data = loadData();
    if (!data[guildId]) {
        data[guildId] = {};
    }
    if (!data[guildId][userId]) {
        data[guildId][userId] = { coins: 100, lastDaily: 0 };
        saveData(data);
    }
    return data[guildId][userId];
}

// サーバーIDとユーザーIDを指定してデータを上書き保存する関数
function saveUserData(guildId, userId, userWallet) {
    const data = loadData();
    if (!data[guildId]) data[guildId] = {};
    data[guildId][userId] = userWallet;
    saveData(data);
}

// --- ボット起動時の処理（コマンド登録） ---
client.once('ready', async () => {
    const commands = [
        new SlashCommandBuilder().setName('gpt').setDescription('2ちゃんねらー（なんJ民）風のAIと雑談します').addStringOption(opt => opt.setName('prompt').setDescription('話しかける内容').setRequired(true)),
        new SlashCommandBuilder().setName('daily').setDescription('1日1回、100コインを受け取ります'),
        new SlashCommandBuilder().setName('coin').setDescription('現在のコインの残高を確認します'),
        new SlashCommandBuilder().setName('slot').setDescription('スロットを回します（勝つとコイン増）').addIntegerOption(opt => opt.setName('amount').setDescription('賭けるコインの枚数（1〜）').setRequired(false)),
        new SlashCommandBuilder().setName('dice').setDescription('サイコロの目を予想します（当たると3倍）').addIntegerOption(opt => opt.setName('predict').setDescription('予想する目（1〜6）').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('賭けるコインの枚数').setRequired(true)),
        new SlashCommandBuilder().setName('ranking').setDescription('コイン所持ランキングを表示します'),
        new SlashCommandBuilder().setName('send').setDescription('他のユーザーにコインを送ります').addUserOption(opt => opt.setName('target').setDescription('送る相手').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('送る枚数').setRequired(true)),
        new SlashCommandBuilder().setName('setcoin').setDescription('【管理者限定】指定したユーザーのコインを設定します').addUserOption(opt => opt.setName('target').setDescription('対象のユーザー').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('設定する枚数').setRequired(true)),
        new SlashCommandBuilder().setName('addcoin').setDescription('【管理者限定】指定したユーザーのコインを増やします').addUserOption(opt => opt.setName('target').setDescription('対象のユーザー').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('増やす枚数').setRequired(true))
    ];

    for (const cmd of commands) {
        await client.application.commands.create(cmd);
    }
    console.log('Botが起動し、すべてのコマンドを登録しました。');
});

// --- コマンド＆メッセージ処理 ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;

    // // --- 🤖 /gpt ---
    if (interaction.commandName === 'gpt') {
        const userPrompt = interaction.options.getString('prompt');
        const channelId = interaction.channelId;

        await interaction.deferReply();

        if (!chatHistories.has(channelId)) {
            chatHistories.set(channelId, []);
        }

        let history = chatHistories.get(channelId);
        history.push({ role: 'user', parts: [{ text: userPrompt }] });

        if (history.length > 20) {
            history = history.slice(-20);
        }

        try {
            const response = await ai.models.generateContent({
                model: '1.5-flash',
                contents: history,
                config: {
                    systemInstruction: "あなたは2ちゃんねる（5ちゃんねる）のなんJ民です。ニキ、ワイなどのなんJ語、猛虎弁を完全に使いこなしてください。改行や3点リーダー（…）を多用し、親しみやすい煽り口調を意識してください。アドバイスは煽りつつも、親身になって答えるツンデレな態度を取ってください。"
                }
            });

            const aiResponse = response.text().substring(0, 1990);
            
            history.push({ role: 'model', parts: [{ text: aiResponse }] });
            chatHistories.set(channelId, history);

            await interaction.editReply(aiResponse);
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ エラーが発生しました。');
        }
    }

    // // --- 🎁 /daily ---
    if (interaction.commandName === 'daily') {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const userWallet = getUserData(interaction.guildId, userId);

        if (now - userWallet.lastDaily < oneDay) {
            const remaining = oneDay - (now - userWallet.lastDaily);
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            return interaction.reply(`❌ デイリーボーナスはすでに受け取っています。あと **${hours}時間** 待ってください。`);
        }

        userWallet.coins += 100;
        userWallet.lastDaily = now;
        saveUserData(interaction.guildId, userId, userWallet);
        
        await interaction.reply(`🎁 **デイリーボーナス！** 100コインを受け取りました。\n現在の残高: **${userWallet.coins}** コイン`);
    }

    // // --- 🪙 /coin ---
    if (interaction.commandName === 'coin') {
        const userWallet = getUserData(interaction.guildId, userId);
        await interaction.reply(`🪙 ${interaction.user.username}さんの現在の残高は **${userWallet.coins}** コインです。`);
    }

    // // --- 🎰 /slot ---
    if (interaction.commandName === 'slot') {
        const amount = interaction.options.getInteger('amount') || 10;
        const userWallet = getUserData(interaction.guildId, userId);

        if (userWallet.coins < amount) {
            return interaction.reply(`❌ コインが足りません。（所持金: **${userWallet.coins}** コイン）`);
        }
        if (amount <= 0) {
            return interaction.reply('❌ 1コイン以上を賭けてください。');
        }

        userWallet.coins -= amount;

        const emojis = ['🍒', '🍏', '🍋', '🍇', '⭐', '💎'];
        const s1 = emojis[Math.floor(Math.random() * emojis.length)];
        const s2 = emojis[Math.floor(Math.random() * emojis.length)];
        const s3 = emojis[Math.floor(Math.random() * emojis.length)];

        let msg = `🎰 **SLOT** 🎰\n| ${s1} | ${s2} | ${s3} |\n`;

        if (s1 === s2 && s2 === s3) {
            const winAmount = Math.floor(amount * 2.0);
            userWallet.coins += winAmount;
            msg += `✨ **大当たり！200%（${winAmount}コイン）** の払い戻しです！ ✨`;
        } else if (s1 === s2 || s2 === s3 || s1 === s3) {
            const winAmount = Math.floor(amount * 1.5);
            userWallet.coins += winAmount;
            msg += `✨ **小当たり！150%（${winAmount}コイン）** の払い戻しです！ ✨`;
        } else {
            const backAmount = Math.floor(amount * 0.5);
            userWallet.coins += backAmount;
            msg += `😭 **ハズレです…** 50%（${backAmount}コイン）が戻りました。`;
        }

        saveUserData(interaction.guildId, userId, userWallet);
        await interaction.reply(`${msg}\n現在の残高: **${userWallet.coins}** コイン`);
    }

    // // --- 🎲 /dice ---
    if (interaction.commandName === 'dice') {
        const predict = interaction.options.getInteger('predict');
        const amount = interaction.options.getInteger('amount');
        const userWallet = getUserData(interaction.guildId, userId);

        if (predict < 1 || predict > 6) return interaction.reply('❌ サイコロの目は1〜6の間で指定してください。');
        if (userWallet.coins < amount) return interaction.reply(`❌ コインが足りません。（所持金: **${userWallet.coins}** コイン）`);
        if (amount <= 0) return interaction.reply('❌ 1コイン以上を賭けてください。');

        userWallet.coins -= amount;
        const result = Math.floor(Math.random() * 6) + 1;
        let msg = `🎲 サイコロの目は **【 ${result} 】** でした！（あなたの予想: ${predict}）\n`;

        if (result === predict) {
            const winAmount = amount * 3;
            userWallet.coins += winAmount;
            msg += `🎉 **的中！3倍（${winAmount}コイン）** を獲得しました！`;
        } else {
            msg += `😭 残念、ハズレです。`;
        }

        saveUserData(interaction.guildId, userId, userWallet);
        await interaction.reply(`${msg}\n現在の残高: **${userWallet.coins}** コイン`);
    }

    // // --- 📊 /ranking ---
    if (interaction.commandName === 'ranking') {
        const data = loadData();
        const guildId = interaction.guildId;
        const guildData = data[guildId] || {};

        const sorted = Object.entries(guildData)
            .map(([id, wallet]) => ({ id, coins: wallet.coins }))
            .sort((a, b) => b.coins - a.coins)
            .slice(0, 10);

        if (sorted.length === 0) return interaction.reply('🪙 まだこのサーバーでコインを持っているユーザーがいません。');

        let rankMsg = `🏆 **${interaction.guild.name} コイン所持ランキング (Top 10)**\n--------------------------------------\n`;
        for (let i = 0; i < sorted.length; i++) {
            try {
                const user = await client.users.fetch(sorted[i].id);
                rankMsg += `${i + 1}位: **${user.username}** - ${sorted[i].coins} コイン\n`;
            } catch {
                rankMsg += `${i + 1}位: Unknown User (${sorted[i].id}) - ${sorted[i].coins} コイン\n`;
            }
        }
        await interaction.reply(rankMsg);
    }

    // // --- 💸 /send ---
    if (interaction.commandName === 'send') {
        const targetUser = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        const guildId = interaction.guildId;

        if (targetUser.id === userId) return interaction.reply('❌ 自分自身に送ることはできません。');
        if (amount <= 0) return interaction.reply('❌ 1コイン以上を指定してください。');

        const userWallet = getUserData(guildId, userId);
        const targetWallet = getUserData(guildId, targetUser.id);

        if (userWallet.coins < amount) return interaction.reply(`❌ コインが足りません。（所放金: **${userWallet.coins}** コイン）`);

        userWallet.coins -= amount;
        targetWallet.coins += amount;

        saveUserData(guildId, userId, userWallet);
        saveUserData(guildId, targetUser.id, targetWallet);

        await interaction.reply(`💸 **${interaction.user.username}** さんが **${targetUser.username}** さんに **${amount}コイン** を送金しました！`);
    }

    // // --- 🛠️ /setcoin (管理者限定) ---
    if (interaction.commandName === 'setcoin') {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply('❌ このコマンドは管理者のみ実行できます。');
        const targetUser = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        const guildId = interaction.guildId;

        const targetWallet = getUserData(guildId, targetUser.id);
        targetWallet.coins = amount;
        saveUserData(guildId, targetUser.id, targetWallet);

        await interaction.reply(`⚙️ **${targetUser.username}** さんのコインを **${amount}枚** に設定しました。`);
    }

    // // --- ➕ /addcoin (管理者限定) ---
    if (interaction.commandName === 'addcoin') {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply('❌ このコマンドは管理者のみ実行できます。');
        const targetUser = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        const guildId = interaction.guildId;

        const targetWallet = getUserData(guildId, targetUser.id);
        targetWallet.coins += amount;
        saveUserData(guildId, targetUser.id, targetWallet);

        await interaction.reply(`⚙️ **${targetUser.username}** さんのコインを **${amount}枚** 増やしました。（現在の残高: ${targetWallet.coins}）`);
    }
});

client.login(DISCORD_BOT_TOKEN);