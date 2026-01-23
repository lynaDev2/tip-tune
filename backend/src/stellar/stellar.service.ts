import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Server from '@stellar/stellar-sdk';
import { 
  Transaction, 
  Networks,
  Asset,
  Account,
  Keypair
} from '@stellar/stellar-sdk';

export interface StellarTransactionDetails {
  hash: string;
  sourceAccount: string;
  destinationAccount: string;
  amount: string;
  asset: string;
  memo?: string;
  timestamp: Date;
  successful: boolean;
}

export interface TransactionVerificationResult {
  valid: boolean;
  details?: StellarTransactionDetails;
  error?: string;
}

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly server: any;
  private readonly networkPassphrase: string;

  constructor(private configService: ConfigService) {
    const horizonUrl = this.configService.get<string>('STELLAR_HORIZON_URL') || 'https://horizon-testnet.stellar.org';
    this.networkPassphrase = this.configService.get<string>('STELLAR_NETWORK_PASSPHRASE') || Networks.TESTNET;
    
    this.server = new Server(horizonUrl);
    this.logger.log(`Stellar service initialized with horizon: ${horizonUrl}`);
  }

  /**
   * Verify a Stellar transaction on the blockchain
   */
  async verifyTransaction(transactionHash: string): Promise<TransactionVerificationResult> {
    try {
      this.logger.log(`Verifying Stellar transaction: ${transactionHash}`);
      
      // Get transaction from Stellar network
      const horizonResponse = await this.server.transactions()
        .transaction(transactionHash)
        .call();

      if (!horizonResponse.successful) {
        return {
          valid: false,
          error: 'Transaction was not successful on Stellar network'
        };
      }

      // Parse transaction envelope to extract details
      const transaction = new Transaction(horizonResponse.envelope_xdr, this.networkPassphrase);
      
      // Extract payment operations
      const paymentOperations = transaction.operations
        .filter(op => op.type === 'payment')
        .map(op => ({
          destination: (op as any).destination,
          amount: (op as any).amount,
          asset: (op as any).asset instanceof Asset 
            ? (op as any).asset.code 
            : 'XLM',
        }));

      if (paymentOperations.length === 0) {
        return {
          valid: false,
          error: 'No payment operations found in transaction'
        };
      }

      // For simplicity, we'll use the first payment operation
      const payment = paymentOperations[0];
      
      const details: StellarTransactionDetails = {
        hash: horizonResponse.hash,
        sourceAccount: transaction.source,
        destinationAccount: payment.destination,
        amount: payment.amount,
        asset: payment.asset,
        memo: transaction.memo?.value?.toString(),
        timestamp: new Date(horizonResponse.created_at),
        successful: horizonResponse.successful,
      };

      this.logger.log(`Transaction verified successfully: ${transactionHash}`);
      
      return {
        valid: true,
        details,
      };

    } catch (error) {
      this.logger.error(`Failed to verify transaction ${transactionHash}: ${error.message}`);
      
      if (error.response?.status === 404) {
        return {
          valid: false,
          error: 'Transaction not found on Stellar network'
        };
      }

      return {
        valid: false,
        error: `Failed to verify transaction: ${error.message}`
      };
    }
  }

  /**
   * Get account information from Stellar
   */
  async getAccount(accountId: string): Promise<Account> {
    try {
      const account = await this.server.accounts().accountId(accountId).call();
      return new Account(account.account_id, account.sequence);
    } catch (error) {
      if (error.response?.status === 404) {
        throw new NotFoundException(`Stellar account ${accountId} not found`);
      }
      throw new BadRequestException(`Failed to get account: ${error.message}`);
    }
  }

  /**
   * Get transaction history for an account
   */
  async getAccountTransactions(accountId: string, limit: number = 10): Promise<any[]> {
    try {
      const transactions = await this.server
        .transactions()
        .forAccount(accountId)
        .limit(limit)
        .order('desc')
        .call();

      return transactions.records;
    } catch (error) {
      this.logger.error(`Failed to get transactions for account ${accountId}: ${error.message}`);
      throw new BadRequestException(`Failed to get transaction history: ${error.message}`);
    }
  }

  /**
   * Validate Stellar address format
   */
  validateStellarAddress(address: string): boolean {
    try {
      Keypair.fromPublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current network information
   */
  async getNetworkInfo(): Promise<any> {
    try {
      const friendbot = this.configService.get<string>('STELLAR_FRIENDBOT_URL');
      if (friendbot) {
        // Testnet friendbot is available
        return { network: 'testnet', friendbot: true };
      }
      
      // Check if we can reach horizon
      await this.server.root().call();
      return { network: this.networkPassphrase === Networks.TESTNET ? 'testnet' : 'public' };
    } catch (error) {
      throw new BadRequestException(`Unable to connect to Stellar network: ${error.message}`);
    }
  }

  /**
   * Get asset information
   */
  async getAssetInfo(assetCode: string, issuer?: string): Promise<any> {
    try {
      const asset = issuer 
        ? new Asset(assetCode, issuer)
        : Asset.native();

      // For native XLM, we don't need to query
      if (asset.isNative()) {
        return {
          asset_code: 'XLM',
          asset_issuer: null,
          asset_type: 'native'
        };
      }

      // For custom assets, we could query balances or other info
      // This is a placeholder for more complex asset management
      return {
        asset_code: assetCode,
        asset_issuer: issuer,
        asset_type: 'credit_alphanum4'
      };
    } catch (error) {
      throw new BadRequestException(`Invalid asset: ${error.message}`);
    }
  }

  /**
   * Format amount from stroops to XLM
   */
  formatAmount(stroops: string): string {
    const amount = parseFloat(stroops) / 10000000; // 1 XLM = 10^7 stroops
    return amount.toFixed(7);
  }

  /**
   * Convert amount to stroops
   */
  toStroops(amount: string): string {
    const xlm = parseFloat(amount);
    return (xlm * 10000000).toString();
  }
}
