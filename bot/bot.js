// Основной файл бота: bot.js
const { Telegraf, Markup } = require('telegraf');
const bip39 = require('bip39');
const { ethers } = require('ethers');
const pool = require('./db');
const config = require('./config');
const logger = require('./utils/logger');

class CryptoBot {
  constructor() {
    this.bot = new Telegraf(config.telegramToken);
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.USDT_CONTRACT = '0x...'; // Адрес контракта USDT
    this.currentBlock = 0;
    this.init();
  }

  async init() {
    this.setupMiddlewares();
    this.setupHandlers();
    this.setupDepositTracker();
    await this.bot.launch();
    logger.info('🤖 Бот успешно запущен');
  }

  setupMiddlewares() {
    this.bot.use(async (ctx, next) => {
      // Пропускаем сообщения не из личных чатов
      if (ctx.message?.chat?.type !== 'private') return;
      logger.debug(`Update from ${ctx.from.id}: ${ctx.message?.text}`);
      return next();
    });

    this.bot.use(session());
  }

  setupHandlers() {
    // Команда старта
    this.bot.start(this.handleStart.bind(this));
    
    // Основные команды
    this.bot.command('wallet', this.handleWallet.bind(this));
    this.bot.command('pool', this.handlePool.bind(this));
    
    // Обработчики кнопок
    this.bot.action('menu', this.showMainMenu.bind(this));
    this.bot.action('create_wallet', this.createWallet.bind(this));
    this.bot.action('invest', this.handleInvestment.bind(this));
    
    // Текстовые сообщения
    this.bot.on('text', this.handleText.bind(this));
  }

  async handleStart(ctx) {
    try {
      const user = await this.ensureUser(ctx.from.id, ctx.from.username);
      await this.showMainMenu(ctx);
    } catch (error) {
      logger.error('Start error:', error);
      await ctx.reply('⚠️ Ошибка при запуске бота');
    }
  }

  async showMainMenu(ctx) {
    await ctx.replyWithPhoto(
      { source: './assets/menu.jpg' },
      {
        caption: 'Главное меню:',
        reply_markup: this.getMainKeyboard()
      }
    );
  }

  getMainKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('💰 Кошелек', 'wallet')],
      [Markup.button.callback('🌊 Пул', 'pool')]
    ]);
  }

  // ... другие методы ...

  async setupDepositTracker() {
    this.currentBlock = await this.provider.getBlockNumber();
    setInterval(this.checkDeposits.bind(this), 15000);
  }

  async checkDeposits() {
    try {
      const newBlock = await this.provider.getBlockNumber();
      const contract = new ethers.Contract(this.USDT_CONTRACT, ['event Transfer(address,address,uint256)'], this.provider);
      
      const events = await contract.queryFilter('Transfer', this.currentBlock, newBlock);
      for (const event of events) {
        await this.processDeposit(event);
      }
      
      this.currentBlock = newBlock;
    } catch (error) {
      logger.error('Deposit check failed:', error);
    }
  }

  async processDeposit(event) {
    const [from, to, value] = event.args;
    const amount = ethers.formatUnits(value, 18);
    
    // Поиск пользователя по адресу кошелька
    const [user] = await pool.execute(
      `SELECT u.telegram_id FROM users u 
       JOIN wallets w ON w.user_id = u.id 
       WHERE w.address = ?`, 
      [to.toLowerCase()]
    );

    if (user) {
      await this.notifyDeposit(user.telegram_id, amount, event.transactionHash);
    }
  }
}

// Запуск бота
new CryptoBot();

module.exports = { CryptoBot };