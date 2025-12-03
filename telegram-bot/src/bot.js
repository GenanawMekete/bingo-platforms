require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const winston = require('winston');
const { setupCommands } = require('./commands');
const { handleCallbackQuery } = require('./handlers/callbackHandler');
const { handleMessage } = require('./handlers/messageHandler');
const API = require('./services/apiClient');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

class GeezBingoBot {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    this.webAppUrl = process.env.WEB_APP_URL || 'https://bingo.yourdomain.com';
    this.api = new API(this.backendUrl);
    
    if (!this.token) {
      logger.error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
      process.exit(1);
    }
    
    // Initialize bot
    if (process.env.NODE_ENV === 'production') {
      this.bot = new TelegramBot(this.token);
      this.setupWebhook();
    } else {
      this.bot = new TelegramBot(this.token, { polling: true });
      logger.info('🤖 Bot started in polling mode');
    }
    
    // Setup command handlers
    this.setupHandlers();
    
    // Setup bot commands
    setupCommands(this.bot);
    
    // Store user sessions
    this.userSessions = new Map();
    
    logger.info('✅ Geez Bingo Telegram Bot initialized');
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
      res.json({ status: 'healthy', service: 'telegram-bot' });
    });
    
    app.listen(port, () => {
      logger.info(`🤖 Telegram Bot Webhook listening on port ${port}`);
      
      // Set webhook
      this.bot.setWebHook(`${process.env.WEBHOOK_URL}/webhook/${this.token}`)
        .then(() => logger.info('✅ Webhook set successfully'))
        .catch(err => logger.error('❌ Failed to set webhook:', err));
    });
  }
  
  setupHandlers() {
    // Handle callback queries
    this.bot.on('callback_query', async (callbackQuery) => {
      await handleCallbackQuery(this.bot, callbackQuery, this.api);
    });
    
    // Handle messages
    this.bot.on('message', async (msg) => {
      await handleMessage(this.bot, msg, this.api);
    });
    
    // Handle errors
    this.bot.on('polling_error', (error) => {
      logger.error('Polling error:', error);
    });
    
    this.bot.on('webhook_error', (error) => {
      logger.error('Webhook error:', error);
    });
    
    // Handle /start command
    this.bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const referralCode = match ? match[1] : null;
      
      try {
        // Register or authenticate user
        const userData = await this.api.registerTelegramUser({
          telegramId: msg.from.id,
          username: msg.from.username,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name,
          chatId: chatId,
          referralCode: referralCode
        });
        
        if (userData.success) {
          // Store user session
          this.userSessions.set(chatId, {
            userId: userData.user.id,
            username: userData.user.username,
            balance: userData.user.balance
          });
          
          // Send welcome message
          await this.sendWelcomeMessage(chatId, msg.from.first_name, userData.user);
        } else {
          await this.bot.sendMessage(chatId, '❌ Failed to register. Please try again.');
        }
      } catch (error) {
        logger.error('Start command error:', error);
        await this.bot.sendMessage(chatId, '❌ Error processing your request.');
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
    
    // Handle /help command
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      await this.showHelp(chatId);
    });
  }
  
  async sendWelcomeMessage(chatId, firstName, userData) {
    const welcomeText = `
🎉 *Welcome to GEEZ BINGO, ${firstName}*\\!

💰 *Welcome Bonus*: \`$${userData.bonus || 100}\\.
🔑 *Your Referral Code*: \`${userData.referralCode}\\.

*Get started:*
🎮 Use /play to join current game
💰 Use /balance to check your funds
📱 Use the buttons below for quick actions
    `;
    
    await this.bot.sendMessage(chatId, welcomeText, {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        keyboard: [
          [{ text: '🎮 Play Game' }, { text: '💰 Wallet' }],
          [{ text: '📊 My Cards' }, { text: '📈 Statistics' }],
          [{ text: '👥 Invite Friends' }, { text: '❓ Help' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    });
  }
  
  async handlePlayCommand(chatId) {
    try {
      const currentGame = await this.api.getCurrentGame();
      
      if (!currentGame || !currentGame.game) {
        await this.bot.sendMessage(chatId, '🎮 *Creating new game...*', { parse_mode: 'Markdown' });
        const newGame = await this.api.createNewGame();
        await this.showGameInfo(chatId, newGame);
      } else {
        await this.showGameInfo(chatId, currentGame.game);
      }
    } catch (error) {
      logger.error('Play command error:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading game information.');
    }
  }
  
  async showGameInfo(chatId, game) {
    const gameText = `
🎮 *Game \\#${game.game_id.slice(0, 8)}*

*Status*: ${game.status.toUpperCase()}
*Pot*: \`$${game.pot}\\.
*Start Time*: ${new Date(game.start_time).toLocaleTimeString()}
*Duration*: ${game.settings.game_duration} seconds

*Available Cards*: ${400 - (game.cards_sold || 0)}/400
*Bet per Card*: \`$${game.settings.bet_amount}\\.
    `;
    
    const keyboard = {
      inline_keyboard: []
    };
    
    if (game.status === 'waiting') {
      keyboard.inline_keyboard.push([
        { text: '🃏 Select Cards', callback_data: `select_cards_${game.id}` },
        { text: '🎲 Buy Random', callback_data: `buy_random_${game.id}` }
      ]);
    } else if (game.status === 'active') {
      keyboard.inline_keyboard.push([
        { text: '📞 View Numbers', callback_data: `view_numbers_${game.id}` },
        { text: '🏆 Claim Bingo', callback_data: `claim_bingo_${game.id}` }
      ]);
    }
    
    keyboard.inline_keyboard.push([
      { text: '🌐 Open Web App', web_app: { url: `${this.webAppUrl}/game/${game.id}` } }
    ]);
    
    await this.bot.sendMessage(chatId, gameText, {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard
    });
  }
  
  async showBalance(chatId) {
    try {
      const session = this.userSessions.get(chatId);
      if (!session) {
        await this.bot.sendMessage(chatId, 'Please send /start first.');
        return;
      }
      
      const balance = await this.api.getUserBalance(session.userId);
      
      const balanceText = `
💰 *YOUR BALANCE*

*Available*: \`$${balance.available.toFixed(2)}\\.
*In Play*: \`$${balance.inPlay.toFixed(2)}\\.
*Total Won*: \`$${balance.totalWon.toFixed(2)}\\.

*Wallet Address*: \`${balance.walletAddress || 'Not set'}\\.
      `;
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '💳 Deposit', callback_data: 'deposit' },
            { text: '🏧 Withdraw', callback_data: 'withdraw' }
          ],
          [
            { text: '📤 Transfer', callback_data: 'transfer' },
            { text: '📈 History', callback_data: 'history' }
          ],
          [{ text: '🔙 Main Menu', callback_data: 'main_menu' }]
        ]
      };
      
      await this.bot.sendMessage(chatId, balanceText, {
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard
      });
    } catch (error) {
      logger.error('Balance error:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading balance.');
    }
  }
  
  async showHelp(chatId) {
    const helpText = `
❓ *HOW TO PLAY GEEZ BINGO*

🎮 *Game Rules:*
1\\. Each game lasts 3 minutes
2\\. Buy cards during 30\\-second waiting period
3\\. Cards cost \\$10 each
4\\. Numbers called automatically
5\\. First to complete row/column/diagonal wins\\!
6\\. Winner gets 95% of pot

💰 *Wallet:*
• Use /deposit to add funds
• Use /withdraw to cash out
• Use /balance to check funds

🃏 *Cards:*
• 400 unique cards per game
• Use /play to view and buy cards
• Auto\\-mark as numbers called

🏆 *Winning Patterns:*
• 5 in a row \\(horizontal\\)
• 5 in a column \\(vertical\\)
• 5 diagonal

*Commands:*
/start \\- Start the bot
/play \\- Join current game
/balance \\- Check balance
/deposit \\- Add funds
/withdraw \\- Withdraw funds
/cards \\- View your cards
/stats \\- Your statistics
/invite \\- Invite friends
/help \\- This message
/menu \\- Show main menu

*Need Help\\?*
Contact @geezbingo\\_support
    `;
    
    await this.bot.sendMessage(chatId, helpText, {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Play Now', callback_data: 'play_now' }],
          [{ text: '💰 Deposit Funds', callback_data: 'deposit' }],
          [{ text: '📞 Contact Support', url: 'https://t.me/geezbingo_support' }]
        ]
      }
    });
  }
  
  // Send game notifications
  async sendGameNotification(chatId, notification) {
    try {
      let message = '';
      let keyboard = { inline_keyboard: [] };
      
      switch (notification.type) {
        case 'game_starting':
          message = `🎮 *Game Starting* \\#${notification.gameId.slice(0, 8)}\n\nGet ready!`;
          keyboard.inline_keyboard.push([
            { text: '🎯 Buy Cards', callback_data: `select_cards_${notification.gameId}` }
          ]);
          break;
          
        case 'number_called':
          message = `📢 *${notification.number}* called!\n\nCurrent calls: ${notification.currentCalls}`;
          break;
          
        case 'winner':
          if (notification.isWinner) {
            message = `🏆 *BINGO! YOU WON* \\$${notification.amount.toFixed(2)}!\n\nCongratulations!`;
          } else {
            message = `🏆 *${notification.winnerName}* won \\$${notification.amount.toFixed(2)}!\n\nBetter luck next time!`;
          }
          break;
      }
      
      if (message) {
        await this.bot.sendMessage(chatId, message, {
          parse_mode: 'MarkdownV2',
          reply_markup: keyboard
        });
      }
    } catch (error) {
      logger.error('Notification error:', error);
    }
  }
}

// Start the bot
const bot = new GeezBingoBot();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing bot');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing bot');
  process.exit(0);
});

module.exports = bot;
