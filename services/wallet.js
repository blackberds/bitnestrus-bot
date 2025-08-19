// services/walletService.js
const bip39 = require('bip39');
const { ethers } = require('ethers');
const crypto = require('crypto');
const NodeCache = require('node-cache');

class WalletService {
  constructor(db, config, logger) {
    this.db = db;
    this.config = config;
    this.logger = logger;
    
    // Константы
    this.ALGORITHM = 'aes-256-cbc';
    this.IV_LENGTH = 16;
    this.ENCRYPTION_VERSION = 'v1';
    this.BALANCE_CACHE_TTL = 60; // 1 минута
    this.RPC_TIMEOUT = 10000; // 10 секунд
    
    // Инициализация кэша
    this.balanceCache = new NodeCache({ stdTTL: this.BALANCE_CACHE_TTL });
    
    // Инициализация провайдера
    this.provider = new ethers.JsonRpcProvider(
      this.config.bscRpc, 
      {
        name: 'binance',
        chainId: 56,
        timeout: this.RPC_TIMEOUT
      }
    );
  }

  getEncryptionKey() {
    try {
      if (!this.config.encryptionKey) {
        throw new Error('Encryption key not configured');
      }

      const key = Buffer.from(this.config.encryptionKey, 'hex');
      
      if (key.length < 32) {
        throw new Error('Encryption key must be at least 32 bytes');
      }

      return key.slice(0, 32);
    } catch (error) {
      this.logError('Encryption key error', error);
      throw new WalletServiceError('Failed to get encryption key', error);
    }
  }

  encryptSeed(seedPhrase) {
    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new WalletServiceError('Invalid seed phrase');
    }

    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(
        this.ALGORITHM, 
        this.getEncryptionKey(), 
        iv
      );
      
      let encrypted = cipher.update(seedPhrase, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return `${this.ENCRYPTION_VERSION}:${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      this.logError('Seed encryption failed', error);
      throw new WalletServiceError('Encryption failed', error);
    }
  }

  decryptSeed(encryptedData) {
    if (!encryptedData) {
      throw new WalletServiceError('No encrypted data');
    }

    try {
      const [version, ivHex, encryptedSeed] = encryptedData.split(':');
      
      if (version !== this.ENCRYPTION_VERSION) {
        throw new Error(`Unsupported version: ${version}`);
      }

      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(
        this.ALGORITHM,
        this.getEncryptionKey(),
        iv
      );
      
      let decrypted = decipher.update(encryptedSeed, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      if (!bip39.validateMnemonic(decrypted)) {
        throw new Error('Invalid seed phrase');
      }
      
      return decrypted;
    } catch (error) {
      this.logError('Seed decryption failed', error, {
        encryptedData: encryptedData ? `${encryptedData.substring(0, 10)}...` : null
      });
      throw new WalletServiceError('Decryption failed', error);
    }
  }

  async createWallet(userId) {
    if (!userId) {
      throw new WalletServiceError('User ID required');
    }

    try {
      const mnemonic = bip39.generateMnemonic();
      const wallet = ethers.Wallet.fromPhrase(mnemonic);
      const encrypted = this.encryptSeed(mnemonic);

      const [res] = await this.db.execute(
        'INSERT INTO wallets (user_id, address, encrypted_seed) VALUES (?, ?, ?)',
        [userId, wallet.address, encrypted]
      );

      this.logger.info('Wallet created', {
        userId,
        walletId: res.insertId,
        address: wallet.address
      });

      return { 
        id: res.insertId, 
        address: wallet.address,
        mnemonic 
      };
    } catch (error) {
      this.logError('Wallet creation failed', error, { userId });
      throw new WalletServiceError('Failed to create wallet', error);
    }
  }

  async getWallet(userId) {
    if (!userId) {
      throw new WalletServiceError('User ID required');
    }

    try {
      const [rows] = await this.db.execute(
        'SELECT * FROM wallets WHERE user_id = ?', 
        [userId]
      );
      
      return rows[0] || null;
    } catch (error) {
      this.logError('Failed to get wallet', error, { userId });
      throw new WalletServiceError('Failed to retrieve wallet', error);
    }
  }

  async getBalances(address) {
    if (!this.isValidAddress(address)) {
      throw new WalletServiceError('Invalid wallet address');
    }

    const cacheKey = `balances:${address.toLowerCase()}`;
    const cached = this.balanceCache.get(cacheKey);
    if (cached) return cached;

    try {
      const [bnbBalance, usdtBalance] = await Promise.all([
        this.getNativeBalance(address),
        this.getTokenBalance(address)
      ]);

      const balances = { 
        bnb: this.formatBalance(bnbBalance, 18),
        usdt: this.formatBalance(usdtBalance, 18) // USDT uses 18 decimals on BSC
      };

      this.balanceCache.set(cacheKey, balances);
      return balances;
    } catch (error) {
      this.logError('Balance check failed', error, { address });
      
      // Fallback to cached data if available
      return this.balanceCache.get(cacheKey) || { bnb: 0, usdt: 0 };
    }
  }

  // Вспомогательные методы
  async getNativeBalance(address) {
    return this.provider.getBalance(address);
  }

  async getTokenBalance(address) {
    const tokenContract = new ethers.Contract(
      '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );
    return tokenContract.balanceOf(address);
  }

  isValidAddress(address) {
    return ethers.isAddress(address);
  }

  formatBalance(value, decimals) {
    const amount = parseFloat(ethers.formatUnits(value, decimals));
    return isNaN(amount) ? 0 : amount;
  }

  logError(message, error, context = {}) {
    this.logger.error(message, {
      ...context,
      error: error.message,
      stack: error.stack
    });
  }

  cleanup() {
    this.balanceCache.close();
  }
}

class WalletServiceError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'WalletServiceError';
    this.originalError = originalError;
  }
}

module.exports = {
  WalletService,
  WalletServiceError
};