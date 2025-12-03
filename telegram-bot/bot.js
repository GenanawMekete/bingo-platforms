require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const crypto = require('crypto');
const WebSocket = require('ws');

class GeezBingoBot {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
        this.webAppUrl = process.env.WEB_APP_URL || 'https://your-bingo-app.com';
        
        // Initialize bot with webhook or polling
        if (process.env.NODE_ENV === 'production') {
            this.bot = new TelegramBot(this.token);
            this.setupWebhook();
        } else {
            this.bot = new TelegramBot(this.token, { polling: true });
        }
        
        this.userSessions = new Map();
        this.gameNotifications = new Map();
        
        this.setupCommands();
        this.setupMessageHandlers();
        this.setupCallbacks();
    }
    
    setupWebhook() {
        const app = express();
        const port = process.env.TELEGRAM_BOT_PORT || 3001;
        
        app.use(express.json());
        
        // Webhook endpoint
        app.post(`/webhook/${this.token}`, (req, res) => {
            this.bot.processUpdate(req.body);
            res.sendStatus(200);
        });
        
        // Health check
        app.get('/health', (req, res) => {
            res.json({ status: 'ok', service: 'telegram-bot' });
        });
        
        app.listen(port, () => {
            console.log(`🤖 Telegram Bot Webhook listening on port ${port}`);
            
            // Set webhook
            this.bot.setWebHook(`${process.env.WEBHOOK_URL}/webhook/${this.token}`);
        });
    }
    
    async setupCommands() {
        // Set bot commands for menu
        await this.bot.setMyCommands([
            {
                command: 'start',
                description: 'Start the bot and register 🚀'
            },
            {
                command: 'play',
                description: 'Join current game 🎮'
            },
            {
                command: 'balance',
                description: 'Check your balance 💰'
            },
            {
                command: 'deposit',
                description: 'Deposit funds 💳'
            },
            {
                command: 'withdraw',
                description: 'Withdraw funds 🏧'
            },
            {
                command: 'cards',
                description: 'View your cards 🃏'
            },
            {
                command: 'stats',
                description: 'Your statistics 📊'
            },
            {
                command: 'invite',
                description: 'Invite friends 👥'
            },
            {
                command: 'help',
                description: 'How to play ❓'
            },
            {
                command: 'menu',
                description: 'Show main menu 📱'
            }
        ]);
        
        console.log('✅ Bot commands set up');
    }
    
    setupMessageHandlers() {
        // Handle /start command
        this.bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
            const chatId = msg.chat.id;
            const referralCode = match ? match[1] : null;
            
            try {
                // Register user in backend
                const response = await axios.post(`${this.backendUrl}/api/users/telegram`, {
                    telegramId: msg.from.id,
                    username: msg.from.username,
                    firstName: msg.from.first_name,
                    lastName: msg.from.last_name,
                    referralCode: referralCode
                });
                
                if (response.data.success) {
                    await this.sendWelcomeMessage(chatId, msg.from.first_name, response.data);
                } else {
                    await this.bot.sendMessage(chatId, `Welcome back, ${msg.from.first_name}! 🎮`);
                }
                
                // Show main menu
                await this.showMainMenu(chatId);
                
            } catch (error) {
                console.error('Start command error:', error);
                await this.bot.sendMessage(chatId, '❌ Error registering. Please try again.');
            }
        });
        
        // Handle /play command
        this.bot.onText(/\/play/, async (msg) => {
            const chatId = msg.chat.id;
            await this.handlePlayCommand(chatId);
        });
        
        // Handle /balance command
        this.bot.onText(/\/balance/, async (msg) => {
            const chatId = msg.chat.id;
            await this.showBalance(chatId);
        });
        
        // Handle /deposit command
        this.bot.onText(/\/deposit/, async (msg) => {
            const chatId = msg.chat.id;
            await this.showDepositOptions(chatId);
        });
        
        // Handle /withdraw command
        this.bot.onText(/\/withdraw/, async (msg) => {
            const chatId = msg.chat.id;
            await this.showWithdrawOptions(chatId);
        });
        
        // Handle /cards command
        this.bot.onText(/\/cards/, async (msg) => {
            const chatId = msg.chat.id;
            await this.showUserCards(chatId);
        });
        
        // Handle /stats command
        this.bot.onText(/\/stats/, async (msg) => {
            const chatId = msg.chat.id;
            await this.showUserStats(chatId);
        });
        
        // Handle /invite command
        this.bot.onText(/\/invite/, async (msg) => {
            const chatId = msg.chat.id;
            await this.showInviteOptions(chatId);
        });
        
        // Handle /help command
        this.bot.onText(/\/help/, async (msg) => {
            const chatId = msg.chat.id;
            await this.showHelp(chatId);
        });
        
        // Handle /menu command
        this.bot.onText(/\/menu/, async (msg) => {
            const chatId = msg.chat.id;
            await this.showMainMenu(chatId);
        });
        
        // Handle text messages for quick actions
        this.bot.on('message', async (msg) => {
            if (msg.text && !msg.text.startsWith('/')) {
                await this.handleQuickAction(msg);
            }
        });
    }
    
    setupCallbacks() {
        // Handle callback queries
        this.bot.on('callback_query', async (callbackQuery) => {
            const chatId = callbackQuery.message.chat.id;
            const data = callbackQuery.data;
            
            try {
                await this.bot.answerCallbackQuery(callbackQuery.id);
                
                if (data.startsWith('join_game_')) {
                    const gameId = data.replace('join_game_', '');
                    await this.joinGame(chatId, gameId);
                }
                else if (data.startsWith('buy_card_')) {
                    const [_, gameId, cardNumber] = data.split('_');
                    await this.buyCard(chatId, gameId, parseInt(cardNumber));
                }
                else if (data.startsWith('select_card_page_')) {
                    const [_, gameId, page] = data.split('_').slice(2);
                    await this.showCardSelection(chatId, gameId, parseInt(page));
                }
                else if (data === 'view_web_app') {
                    await this.openWebApp(chatId);
                }
                else if (data === 'view_balance') {
                    await this.showBalance(chatId);
                }
                else if (data.startsWith('deposit_')) {
                    const amount = data.replace('deposit_', '');
                    await this.processDeposit(chatId, amount);
                }
                else if (data === 'claim_bingo') {
                    await this.claimBingo(chatId);
                }
                else if (data === 'main_menu') {
                    await this.showMainMenu(chatId);
                }
                
            } catch (error) {
                console.error('Callback error:', error);
                await this.bot.sendMessage(chatId, '❌ Error processing request.');
            }
        });
    }
    
    async sendWelcomeMessage(chatId, firstName, userData) {
        const welcomeMessage = `
🎉 *Welcome to GEEZ BINGO, ${firstName}*\\!

💰 *Welcome Bonus*: \`$${userData.bonus || 100}\\.
🔑 *Your Referral Code*: \`${userData.referralCode}\\.

*Features:*
🎮 400 unique bingo cards
💰 Instant crypto withdrawals
🏆 95% prize pool distribution
⏰ Games every 30 seconds

*Get started by clicking /play*
        `;
        
        await this.bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎮 Play Now', callback_data: 'view_web_app' }],
                    [{ text: '💰 Check Balance', callback_data: 'view_balance' }]
                ]
            }
        });
    }
    
    async showMainMenu(chatId) {
        const menuMessage = `
📱 *GEEZ BINGO MAIN MENU*

Choose an option:
        `;
        
        const keyboard = {
            reply_markup: {
                keyboard: [
                    ['🎮 Play Game', '💰 Wallet'],
                    ['📊 My Cards', '📈 Statistics'],
                    ['👥 Invite Friends', '❓ Help']
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        };
        
        await this.bot.sendMessage(chatId, menuMessage, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
    
    async handlePlayCommand(chatId) {
        try {
            // Get current game from backend
            const response = await axios.get(`${this.backendUrl}/api/games/current`);
            
            if (response.data.game) {
                const game = response.data.game;
                
                const gameMessage = `
🎮 *Current Game* \\#${game.id.slice(0, 8)}

*Status*: ${game.status.toUpperCase()}
*Pot*: \`$${game.pot}\\.
*Players*: ${game.playerCount || 0}
*Cards Available*: ${game.availableCards || 400}

*Time Left*: ${game.timeLeft || 30} seconds
                `;
                
                const keyboard = {
                    inline_keyboard: []
                };
                
                if (game.status === 'waiting') {
                    keyboard.inline_keyboard.push([
                        { text: '🎯 Select Cards', callback_data: `select_card_page_${game.id}_1` },
                        { text: '👁️ View Game', callback_data: `join_game_${game.id}` }
                    ]);
                } else if (game.status === 'active') {
                    keyboard.inline_keyboard.push([
                        { text: '📞 View Numbers', callback_data: `join_game_${game.id}` },
                        { text: '🏆 Claim Bingo', callback_data: 'claim_bingo' }
                    ]);
                }
                
                keyboard.inline_keyboard.push([
                    { text: '🌐 Open Web App', callback_data: 'view_web_app' }
                ]);
                
                await this.bot.sendMessage(chatId, gameMessage, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: keyboard
                });
                
            } else {
                await this.bot.sendMessage(chatId, '📭 No active games. Starting a new game...');
                
                // Create new game
                const newGame = await axios.post(`${this.backendUrl}/api/games`);
                await this.handlePlayCommand(chatId); // Recursive call
            }
            
        } catch (error) {
            console.error('Play command error:', error);
            await this.bot.sendMessage(chatId, '❌ Error loading game. Please try again.');
        }
    }
    
    async showCardSelection(chatId, gameId, page = 1) {
        try {
            // Get available cards for this page
            const response = await axios.get(`${this.backendUrl}/api/games/${gameId}/cards`, {
                params: { page, limit: 12 }
            });
            
            const cards = response.data.cards;
            const totalPages = response.data.totalPages;
            
            let message = `🃏 *Select a Card* \\(Page ${page}/${totalPages}\\)\n\n`;
            
            // Create inline keyboard with cards
            const keyboard = {
                inline_keyboard: []
            };
            
            // Add cards in rows of 4
            for (let i = 0; i < cards.length; i += 4) {
                const row = cards.slice(i, i + 4).map(card => ({
                    text: `#${card.number}`,
                    callback_data: `buy_card_${gameId}_${card.number}`
                }));
                keyboard.inline_keyboard.push(row);
            }
            
            // Add navigation buttons
            const navButtons = [];
            if (page > 1) {
                navButtons.push({
                    text: '⬅️ Previous',
                    callback_data: `select_card_page_${gameId}_${page - 1}`
                });
            }
            
            navButtons.push({
                text: `Page ${page}/${totalPages}`,
                callback_data: 'noop'
            });
            
            if (page < totalPages) {
                navButtons.push({
                    text: 'Next ➡️',
                    callback_data: `select_card_page_${gameId}_${page + 1}`
                });
            }
            
            if (navButtons.length > 0) {
                keyboard.inline_keyboard.push(navButtons);
            }
            
            // Add action buttons
            keyboard.inline_keyboard.push([
                { text: '🎲 Buy Random Card', callback_data: `buy_card_${gameId}_random` },
                { text: '❌ Cancel', callback_data: 'main_menu' }
            ]);
            
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'MarkdownV2',
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Card selection error:', error);
            await this.bot.sendMessage(chatId, '❌ Error loading cards. Please try again.');
        }
    }
    
    async buyCard(chatId, gameId, cardNumber) {
        try {
            // Get user ID from session
            const userId = await this.getUserId(chatId);
            
            // Buy card via backend
            const response = await axios.post(`${this.backendUrl}/api/games/${gameId}/buy-card`, {
                userId,
                cardNumber: cardNumber === 'random' ? null : cardNumber,
                telegramChatId: chatId
            });
            
            if (response.data.success) {
                const card = response.data.card;
                
                // Format card as text grid
                const cardText = this.formatCardAsText(card);
                
                const message = `
✅ *Card Purchased* \\#${card.number}

*Cost*: \`$10\\.
*New Balance*: \`$${response.data.newBalance}\\.

*Your Card:*
\`\`\`
${cardText}
\`\`\`
                `;
                
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🃏 Buy Another Card', callback_data: `select_card_page_${gameId}_1` }],
                            [{ text: '🎮 View Game', callback_data: `join_game_${gameId}` }]
                        ]
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, `❌ ${response.data.error}`);
            }
            
        } catch (error) {
            console.error('Buy card error:', error);
            await this.bot.sendMessage(chatId, '❌ Error purchasing card. Please check your balance.');
        }
    }
    
    formatCardAsText(card) {
        const columns = ['B', 'I', 'N', 'G', 'O'];
        let text = '     ' + columns.join('    ') + '\n';
        text += '   ' + '─────'.repeat(5) + '\n';
        
        for (let row = 0; row < 5; row++) {
            let rowText = `${row + 1} |`;
            for (let col = 0; col < 5; col++) {
                const cell = card.numbers[row][col];
                if (cell.free) {
                    rowText += ' FREE ';
                } else {
                    const num = cell.number.toString().padStart(2, '0');
                    rowText += ` ${cell.letter}${num} `;
                }
            }
            text += rowText + '\n';
        }
        
        return text;
    }
    
    async showBalance(chatId) {
        try {
            const userId = await this.getUserId(chatId);
            const response = await axios.get(`${this.backendUrl}/api/users/${userId}/balance`);
            
            const balance = response.data;
            
            const message = `
💰 *YOUR BALANCE*

*Available*: \`$${balance.available.toFixed(2)}\\.
*In Play*: \`$${balance.inPlay.toFixed(2)}\\.
*Total Won*: \`$${balance.totalWon.toFixed(2)}\\.

*Wallet Address*: \`${balance.walletAddress || 'Not set'}\\.
            `;
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '💳 Deposit', callback_data: 'deposit_menu' },
                        { text: '🏧 Withdraw', callback_data: 'withdraw_menu' }
                    ],
                    [
                        { text: '📤 Transfer', callback_data: 'transfer_menu' },
                        { text: '📈 History', callback_data: 'transaction_history' }
                    ],
                    [{ text: '🔙 Main Menu', callback_data: 'main_menu' }]
                ]
            };
            
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'MarkdownV2',
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Balance error:', error);
            await this.bot.sendMessage(chatId, '❌ Error loading balance.');
        }
    }
    
    async showDepositOptions(chatId) {
        const message = `
💳 *DEPOSIT FUNDS*

*Minimum deposit*: \`$10\\.
*Accepted currencies*: USDT, USDC, ETH, BNB

*Select deposit amount:*
        `;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '$10', callback_data: 'deposit_10' },
                    { text: '$25', callback_data: 'deposit_25' },
                    { text: '$50', callback_data: 'deposit_50' }
                ],
                [
                    { text: '$100', callback_data: 'deposit_100' },
                    { text: '$250', callback_data: 'deposit_250' },
                    { text: '$500', callback_data: 'deposit_500' }
                ],
                [
                    { text: '📝 Custom Amount', callback_data: 'deposit_custom' },
                    { text: '💰 View Balance', callback_data: 'view_balance' }
                ],
                [{ text: '🔙 Back', callback_data: 'main_menu' }]
            ]
        };
        
        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2',
            reply_markup: keyboard
        });
    }
    
    async processDeposit(chatId, amount) {
        try {
            const userId = await this.getUserId(chatId);
            const response = await axios.post(`${this.backendUrl}/api/users/${userId}/deposit`, {
                amount: amount === 'custom' ? null : parseFloat(amount),
                telegramChatId: chatId
            });
            
            const depositInfo = response.data;
            
            const message = `
💳 *DEPOSIT ${amount === 'custom' ? '' : '\\$' + amount}*

*Send funds to this address:*
\`${depositInfo.address}\\.

*Network*: ${depositInfo.network}
*Memo/Tag*: \`${depositInfo.memo}\\.

⚠️ *IMPORTANT*:
• Send only *${depositInfo.currency}* to this address
• Include the memo/tag exactly as shown
• Transaction may take 2\\-5 minutes to confirm
            `;
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📋 Copy Address', callback_data: 'copy_address' }],
                    [{ text: '✅ I\'ve Deposited', callback_data: 'check_deposit' }],
                    [{ text: '🔙 Back to Wallet', callback_data: 'view_balance' }]
                ]
            };
            
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'MarkdownV2',
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Deposit error:', error);
            await this.bot.sendMessage(chatId, '❌ Error processing deposit.');
        }
    }
    
    async showUserCards(chatId) {
        try {
            const userId = await this.getUserId(chatId);
            const response = await axios.get(`${this.backendUrl}/api/users/${userId}/cards`);
            
            const cards = response.data.cards;
            
            if (!cards || cards.length === 0) {
                await this.bot.sendMessage(chatId, '📭 You have no active cards. Join a game first!');
                return;
            }
            
            let message = `🃏 *YOUR CARDS* \\(${cards.length} active\\)\n\n`;
            
            for (const card of cards.slice(0, 5)) { // Show first 5 cards
                const marked = card.numbers.flat().filter(n => n.called).length;
                message += `*Card #${card.number}* \\(Game ${card.gameId.slice(0, 8)}\\)\n`;
                message += `Marked: ${marked}/25 | Value: \\$${card.value || 10}\n\n`;
            }
            
            if (cards.length > 5) {
                message += `*... and ${cards.length - 5} more cards*\n`;
            }
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🎮 View Active Game', callback_data: 'view_active_game' }],
                    [{ text: '🌐 Open Web App', callback_data: 'view_web_app' }],
                    [{ text: '🔙 Main Menu', callback_data: 'main_menu' }]
                ]
            };
            
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'MarkdownV2',
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Cards error:', error);
            await this.bot.sendMessage(chatId, '❌ Error loading your cards.');
        }
    }
    
    async showUserStats(chatId) {
        try {
            const userId = await this.getUserId(chatId);
            const response = await axios.get(`${this.backendUrl}/api/users/${userId}/stats`);
            
            const stats = response.data;
            
            const message = `
📊 *YOUR STATISTICS*

*Games Played*: ${stats.gamesPlayed}
*Games Won*: ${stats.gamesWon}
*Win Rate*: ${stats.winRate}%
*Total Won*: \\$${stats.totalWon.toFixed(2)}

*Avg. Cards/Game*: ${stats.avgCardsPerGame}
*Best Win*: \\$${stats.biggestWin.toFixed(2)}
*Current Streak*: ${stats.currentStreak} games

*Rank*: #${stats.rank} on leaderboard
*Level*: ${stats.level}
            `;
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🏆 Leaderboard', callback_data: 'view_leaderboard' }],
                    [{ text: '📈 View Charts', callback_data: 'view_web_app?tab=stats' }],
                    [{ text: '🔙 Main Menu', callback_data: 'main_menu' }]
                ]
            };
            
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'MarkdownV2',
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Stats error:', error);
            await this.bot.sendMessage(chatId, '❌ Error loading statistics.');
        }
    }
    
    async showInviteOptions(chatId) {
        try {
            const userId = await this.getUserId(chatId);
            const response = await axios.get(`${this.backendUrl}/api/users/${userId}/referral`);
            
            const referral = response.data;
            
            const message = `
👥 *INVITE FRIENDS & EARN*

*Your Referral Code*: \`${referral.code}\\.

*Share this link:*
https://t.me/${(await this.bot.getMe()).username}?start=${referral.code}

*Earn 10%* of your friends' first deposit!
Plus get \\$5 when they play their first game\\.

*Your Earnings*:
👥 Referrals: ${referral.totalReferrals}
💰 Earned: \\$${referral.totalEarned.toFixed(2)}
            `;
            
            const keyboard = {
                inline_keyboard: [
                    [{ 
                        text: '📱 Share Invite Link', 
                        url: `https://t.me/share/url?url=Join me on Geez Bingo! Use my code: ${referral.code}&text=Play exciting Bingo games and win big! 🎰`
                    }],
                    [{ text: '📋 Copy Code', callback_data: `copy_code_${referral.code}` }],
                    [{ text: '👥 My Referrals', callback_data: 'view_referrals' }],
                    [{ text: '🔙 Main Menu', callback_data: 'main_menu' }]
                ]
            };
            
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'MarkdownV2',
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Invite error:', error);
            await this.bot.sendMessage(chatId, '❌ Error loading referral info.');
        }
    }
    
    async showHelp(chatId) {
        const message = `
❓ *HOW TO PLAY GEEZ BINGO*

🎮 *Game Rules*:
1. Each game lasts 3 minutes
2. Buy cards during 30\\-second waiting period
3. Cards cost \\$10 each
4. Numbers called automatically
5. First to complete row/column/diagonal wins!
6. Winner gets 95% of pot

💰 *Wallet*:
• Use /deposit to add funds
• Use /withdraw to cash out
• Use /balance to check funds

🃏 *Cards*:
• 400 unique cards per game
• Use /play to view and buy cards
• Auto\\-mark as numbers called

🏆 *Winning Patterns*:
• 5 in a row (horizontal)
• 5 in a column (vertical)
• 5 diagonal

*Commands*:
/play \\- Join current game
/balance \\- Check balance
/deposit \\- Add funds
/cards \\- View your cards
/stats \\- Your statistics
/invite \\- Invite friends
/help \\- This message
/menu \\- Show main menu

*Need Help?*
Contact @geezbingo_support
        `;
        
        const keyboard = {
            inline_keyboard: [
                [{ text: '🎮 Play Now', callback_data: 'view_web_app' }],
                [{ text: '💰 Deposit Funds', callback_data: 'deposit_menu' }],
                [{ text: '📞 Contact Support', url: 'https://t.me/geezbingo_support' }]
            ]
        };
        
        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2',
            reply_markup: keyboard
        });
    }
    
    async openWebApp(chatId) {
        const message = `
🌐 *OPEN WEB APP*

For the best gaming experience, open our web app:

• Full screen game view
• Interactive card marking
• Live game statistics
• Multiple card management
        `;
        
        const keyboard = {
            inline_keyboard: [[{
                text: '🎮 Open Game Interface',
                web_app: { url: `${this.webAppUrl}/game` }
            }]]
        };
        
        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2',
            reply_markup: keyboard
        });
    }
    
    async handleQuickAction(msg) {
        const chatId = msg.chat.id;
        const text = msg.text;
        
        switch (text) {
            case '🎮 Play Game':
                await this.handlePlayCommand(chatId);
                break;
            case '💰 Wallet':
                await this.showBalance(chatId);
                break;
            case '📊 My Cards':
                await this.showUserCards(chatId);
                break;
            case '📈 Statistics':
                await this.showUserStats(chatId);
                break;
            case '👥 Invite Friends':
                await this.showInviteOptions(chatId);
                break;
            case '❓ Help':
                await this.showHelp(chatId);
                break;
            case '📞 Support':
                await this.bot.sendMessage(chatId, '📞 Contact support: @geezbingo_support');
                break;
            case '🏆 Claim Bingo':
                await this.claimBingo(chatId);
                break;
        }
    }
    
    async claimBingo(chatId) {
        try {
            const userId = await this.getUserId(chatId);
            const response = await axios.post(`${this.backendUrl}/api/games/claim-bingo`, {
                userId,
                telegramChatId: chatId
            });
            
            if (response.data.success) {
                await this.bot.sendMessage(chatId, '🎉 BINGO! Your win is being verified...');
            } else {
                await this.bot.sendMessage(chatId, '❌ No winning pattern found on your cards.');
            }
            
        } catch (error) {
            console.error('Claim bingo error:', error);
            await this.bot.sendMessage(chatId, '❌ Error checking for bingo.');
        }
    }
    
    async getUserId(chatId) {
        // In production, this would fetch from database
        // For now, return telegram ID as user ID
        return `telegram_${chatId}`;
    }
    
    // Notification methods
    async sendGameNotification(chatId, gameId, type, data) {
        try {
            let message = '';
            let keyboard = { inline_keyboard: [] };
            
            switch (type) {
                case 'game_starting':
                    message = `🎮 *Game Starting* \\#${gameId.slice(0, 8)}\n\nGet ready! Game starts in 30 seconds.`;
                    keyboard.inline_keyboard.push([
                        { text: '🎯 Buy Cards', callback_data: `select_card_page_${gameId}_1` }
                    ]);
                    break;
                    
                case 'number_called':
                    message = `📢 *${data.letter}${data.number}* called!\n\nCurrent calls: ${data.currentCalls}`;
                    keyboard.inline_keyboard.push([
                        { text: '🎮 View Game', callback_data: `join_game_${gameId}` }
                    ]);
                    break;
                    
                case 'player_joined':
                    message = `👤 *${data.username}* joined the game!\n\nPlayers: ${data.totalPlayers}`;
                    break;
                    
                case 'card_sold':
                    message = `🃏 Card #${data.cardNumber} sold!\n\nPot: \\$${data.pot}`;
                    break;
                    
                case 'winner':
                    if (data.userId === await this.getUserId(chatId)) {
                        message = `🏆 *BINGO! YOU WON* \\$${data.amount.toFixed(2)}!\n\nCongratulations!`;
                    } else {
                        message = `🏆 *${data.username}* won \\$${data.amount.toFixed(2)}!\n\nBetter luck next time!`;
                    }
                    keyboard.inline_keyboard.push([
                        { text: '🎮 Play Again', callback_data: 'main_menu' }
                    ]);
                    break;
                    
                case 'game_ending':
                    message = `⏰ *Game ending in 60 seconds*\n\nLast chance to claim bingo!`;
                    keyboard.inline_keyboard.push([
                        { text: '🏆 Claim Bingo', callback_data: 'claim_bingo' }
                    ]);
                    break;
            }
            
            if (message) {
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'MarkdownV2',
                    reply_markup: keyboard
                });
            }
            
        } catch (error) {
            console.error('Notification error:', error);
        }
    }
    
    async broadcastGameUpdate(gameId, type, data) {
        // Get all players in this game
        try {
            const response = await axios.get(`${this.backendUrl}/api/games/${gameId}/players`);
            const players = response.data.players;
            
            for (const player of players) {
                if (player.telegramChatId) {
                    await this.sendGameNotification(player.telegramChatId, gameId, type, data);
                    // Rate limiting
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
        } catch (error) {
            console.error('Broadcast error:', error);
        }
    }
}

// Start the bot
const bot = new GeezBingoBot();

// Export for use in other files
module.exports = bot;
