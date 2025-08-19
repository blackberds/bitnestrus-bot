// services/poolService.js
const { ethers } = require('ethers');
const { WalletServiceError } = require('./walletService');
const logger = require('../utils/logger');

class PoolService {
  constructor(db, config, walletService) {
    this.db = db;
    this.config = config;
    this.walletService = walletService;
    
    // Конфигурация токена USDT на BSC
    this.USDT_CONFIG = {
      address: '0x55d398326f99059fF775485246999027B3197955', // Mainnet USDT
      abi: [
        'function balanceOf(address) view returns (uint256)',
        'function transfer(address to, uint256 amount) returns (bool)',
        'function decimals() view returns (uint8)'
      ],
      decimals: 18 // На BSC USDT использует 18 decimals
    };

    this.provider = new ethers.JsonRpcProvider(this.config.bscRpc);
    this.gasLimit = 200000; // Лимит газа для USDT трансфера
  }

  async sendToPool(userId, amount, periodDays) {
    const connection = await this.db.getConnection();
    
    try {
      await connection.beginTransaction();

      // 1. Получаем данные пользователя и кошелька
      const walletData = await this.getUserWalletData(userId);
      
      // 2. Проверяем сумму
      this.validateAmount(amount);

      // 3. Получаем кошелек
      const wallet = await this.getWallet(walletData);

      // 4. Проверяем баланс BNB для газа
      await this.checkGasBalance(wallet);

      // 5. Инициализируем контракт USDT
      const usdtContract = await this.initUsdtContract(wallet);

      // 6. Конвертируем сумму в wei
      const amountWei = await this.convertToWei(usdtContract, amount);

      // 7. Проверяем баланс USDT
      await this.checkUsdtBalance(usdtContract, wallet.address, amountWei);

      // 8. Отправляем транзакцию
      const txHash = await this.sendTransaction(
        usdtContract, 
        this.config.poolContractAddress, 
        amountWei
      );

      // 9. Сохраняем инвестицию в БД
      await this.saveInvestment(
        connection, 
        userId, 
        amount, 
        periodDays, 
        txHash
      );

      await connection.commit();
      return txHash;

    } catch (error) {
      await connection.rollback();
      this.logError('Transfer failed', error, { userId, amount, periodDays });
      throw this.translateError(error);
    } finally {
      connection.release();
    }
  }

  // Вспомогательные методы
  async getUserWalletData(userId) {
    const [wallets] = await this.db.execute(
      `SELECT w.*, u.telegram_id 
       FROM wallets w
       JOIN users u ON w.user_id = u.id
       WHERE w.user_id = ? LIMIT 1`,
      [userId]
    );
    
    if (!wallets.length) {
      throw new WalletServiceError('WALLET_NOT_FOUND');
    }
    
    return wallets[0];
  }

  validateAmount(amount) {
    if (amount <= 0) {
      throw new WalletServiceError('INVALID_AMOUNT');
    }
  }

  async getWallet(walletData) {
    try {
      const seedPhrase = await this.walletService.decryptSeed(walletData.encrypted_seed);
      return ethers.Wallet.fromPhrase(seedPhrase, this.provider);
    } catch (error) {
      this.logError('Wallet decryption failed', error);
      throw new WalletServiceError('WALLET_RECOVERY_REQUIRED');
    }
  }

  async checkGasBalance(wallet) {
    const [balance, feeData] = await Promise.all([
      wallet.provider.getBalance(wallet.address),
      wallet.provider.getFeeData()
    ]);
    
    const estimatedCost = (feeData.maxFeePerGas || feeData.gasPrice) * BigInt(this.gasLimit);
    const minRequired = estimatedCost * 2n; // Запас 2x

    if (balance < minRequired) {
      throw new WalletServiceError(
        `INSUFFICIENT_BNB_FOR_GAS: Need ${ethers.formatEther(minRequired)} BNB (has ${ethers.formatEther(balance)})`
      );
    }
  }

  async initUsdtContract(wallet) {
    return new ethers.Contract(
      this.USDT_CONFIG.address,
      this.USDT_CONFIG.abi,
      wallet
    );
  }

  async convertToWei(contract, amount) {
    const decimals = await contract.decimals();
    return ethers.parseUnits(amount.toString(), decimals);
  }

  async checkUsdtBalance(contract, address, amountWei) {
    const balance = await contract.balanceOf(address);
    if (balance < amountWei) {
      const decimals = await contract.decimals();
      throw new WalletServiceError(
        `INSUFFICIENT_USDT: Need ${ethers.formatUnits(amountWei, decimals)} USDT but have ${ethers.formatUnits(balance, decimals)}`
      );
    }
  }

  async sendTransaction(contract, toAddress, amountWei) {
    const tx = await contract.transfer(
      toAddress, 
      amountWei, 
      {
        gasLimit: this.gasLimit,
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
        maxFeePerGas: ethers.parseUnits('5', 'gwei')
      }
    );

    const receipt = await tx.wait(1);
    if (receipt.status !== 1) {
      throw new WalletServiceError('TRANSACTION_FAILED');
    }

    return tx.hash;
  }

  async saveInvestment(connection, userId, amount, periodDays, txHash) {
    await connection.execute(
      `INSERT INTO investments 
       (user_id, amount_decimal, period_days, status, tx_hash)
       VALUES (?, ?, ?, 'pending', ?)`,
      [userId, amount, periodDays, txHash]
    );
  }

  translateError(error) {
    const errorMessages = {
      'WALLET_NOT_FOUND': 'Кошелек не найден. Создайте или импортируйте кошелек.',
      'WALLET_RECOVERY_REQUIRED': 'Требуется восстановление кошелька. Обратитесь в поддержку.',
      'INVALID_AMOUNT': 'Сумма должна быть больше нуля.',
      'INSUFFICIENT_BNB_FOR_GAS': this.formatBnbError,
      'INSUFFICIENT_USDT': this.formatUsdtError,
      'TRANSACTION_FAILED': '❌ Транзакция не выполнена. Попробуйте позже.',
      'default': '⚠️ Ошибка при переводе USDT. Попробуйте позже или обратитесь в поддержку.'
    };

    const errorKey = error.message.split(':')[0];
    const handler = errorMessages[errorKey] || errorMessages.default;
    
    return typeof handler === 'function' 
      ? handler(error.message) 
      : new Error(handler);
  }

  formatBnbError(message) {
    const matches = message.match(/Need ([\d.]+) BNB \(has ([\d.]+)\)/);
    return new Error(
      matches 
        ? `⚠️ Недостаточно BNB для комиссий сети\n\nТребуется: ${matches[1]} BNB\nНа балансе: ${matches[2]} BNB`
        : '⚠️ Недостаточно BNB для комиссий сети (минимум 0.005 BNB)'
    );
  }

  formatUsdtError(message) {
    const matches = message.match(/Need ([\d.]+) USDT but have ([\d.]+)/);
    return new Error(
      matches
        ? `⚠️ Недостаточно USDT\n\nТребуется: ${matches[1]} USDT\nНа балансе: ${matches[2]} USDT`
        : '⚠️ Недостаточно USDT'
    );
  }

  logError(context, error, extra = {}) {
    logger.error(context, {
      ...extra,
      error: error.message,
      stack: error.stack
    });
  }
}

module.exports = { PoolService };