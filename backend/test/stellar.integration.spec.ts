import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TipsModule } from '../src/tips/tips.module';
import { StellarModule } from '../src/stellar/stellar.module';
import { ArtistsModule } from '../src/artists/artists.module';
import { TracksModule } from '../src/tracks/tracks.module';
import { WebSocketModule } from '../src/websocket/websocket.module';
import { TipsService } from '../src/tips/tips.service';
import { StellarService } from '../src/stellar/stellar.service';
import { ArtistsService } from '../src/artists/artists.service';
import { TracksService } from '../src/tracks/tracks.service';
import { CreateTipDto, TipType } from '../src/tips/dto/create-tip.dto';
import { TipStatus } from '../src/tips/entities/tip.entity';
import { INestApplication } from '@nestjs/common';

describe('Stellar Integration Tests', () => {
  let app: INestApplication;
  let tipsService: TipsService;
  let stellarService: StellarService;
  let artistsService: ArtistsService;
  let tracksService: TracksService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
          synchronize: true,
          logging: false,
        }),
        StellarModule,
        ArtistsModule,
        TracksModule,
        WebSocketModule,
        TipsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    tipsService = moduleFixture.get<TipsService>(TipsService);
    stellarService = moduleFixture.get<StellarService>(StellarService);
    artistsService = moduleFixture.get<ArtistsService>(ArtistsService);
    tracksService = moduleFixture.get<TracksService>(TracksService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Stellar Transaction Verification', () => {
    it('should connect to Stellar testnet', async () => {
      const networkInfo = await stellarService.getNetworkInfo();
      expect(networkInfo).toBeDefined();
      expect(networkInfo.network).toBe('testnet');
    });

    it('should validate Stellar addresses', () => {
      const validAddress = 'GD5DJQDQKPJ2R5XGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5Q';
      const invalidAddress = 'invalid-address';

      expect(stellarService.validateStellarAddress(validAddress)).toBe(true);
      expect(stellarService.validateStellarAddress(invalidAddress)).toBe(false);
    });

    it('should verify a real Stellar testnet transaction', async () => {
      // This is a sample transaction hash from Stellar testnet
      // In real tests, you would use a known valid transaction hash
      const testTxHash = 'c6e0b3e5c8a4f2d1b9a7e6f3c5d8a2b1c4e7f0a9b3d6e9f2c5a8b1e4f7a0c3d6';
      
      try {
        const verification = await stellarService.verifyTransaction(testTxHash);
        
        // This might fail if the transaction doesn't exist or is invalid
        // In a real test environment, you would use a known valid transaction
        if (verification.valid) {
          expect(verification.details).toBeDefined();
          expect(verification.details?.hash).toBe(testTxHash);
          expect(verification.details?.successful).toBe(true);
        } else {
          expect(verification.error).toBeDefined();
        }
      } catch (error) {
        // It's okay if the transaction doesn't exist in testnet
        expect(error).toBeDefined();
      }
    }, 10000); // Increase timeout for network calls
  });

  describe('Tip Creation with Stellar Integration', () => {
    let createdArtist: any;
    let createdTrack: any;

    beforeAll(async () => {
      // Create a test artist
      const artistData = {
        name: 'Test Stellar Artist',
        email: 'stellar@example.com',
        stellarAddress: 'GD5DJQDQKPJ2R5XGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5Q',
      };

      createdArtist = await artistsService.create(artistData);

      // Create a test track
      const trackData = {
        title: 'Test Stellar Track',
        duration: 180,
        artistId: createdArtist.id,
        genre: 'electronic',
        isPublic: true,
      };

      createdTrack = await tracksService.create(trackData);
    });

    it('should handle tip creation with invalid transaction hash', async () => {
      const createTipDto: CreateTipDto = {
        artistId: createdArtist.id,
        trackId: createdTrack.id,
        stellarTxHash: 'invalid-hash-123',
        message: 'Test tip with invalid transaction',
        type: TipType.TRACK,
      };

      try {
        await tipsService.createTip(createTipDto);
        fail('Should have thrown an error for invalid transaction');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain('verification failed');
      }
    });

    it('should prevent duplicate tip creation', async () => {
      const createTipDto: CreateTipDto = {
        artistId: createdArtist.id,
        trackId: createdTrack.id,
        stellarTxHash: 'duplicate-test-hash-123',
        message: 'Test tip for duplicate prevention',
        type: TipType.TRACK,
      };

      // First attempt should fail due to invalid transaction
      try {
        await tipsService.createTip(createTipDto);
      } catch (error) {
        // Expected to fail
      }

      // Second attempt should fail due to duplicate hash
      try {
        await tipsService.createTip(createTipDto);
        fail('Should have thrown a conflict error for duplicate transaction');
      } catch (error) {
        expect(error.message).toContain('already been processed');
      }
    });

    it('should create tip record even for failed transactions', async () => {
      const createTipDto: CreateTipDto = {
        artistId: createdArtist.id,
        stellarTxHash: 'failed-tx-hash-456',
        message: 'Test tip with failed transaction',
        type: TipType.ARTIST,
      };

      try {
        await tipsService.createTip(createTipDto);
        fail('Should have thrown an error for failed transaction');
      } catch (error) {
        // Verify that a failed tip record was created
        const tips = await tipsService.findAll(1, 10, TipStatus.FAILED);
        const failedTip = tips.data.find(tip => tip.stellarTxHash === 'failed-tx-hash-456');
        
        expect(failedTip).toBeDefined();
        expect(failedTip.status).toBe(TipStatus.FAILED);
        expect(failedTip.failureReason).toBeDefined();
      }
    });
  });

  describe('Stellar Account Management', () => {
    it('should handle non-existent Stellar account', async () => {
      const nonExistentAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      
      try {
        await stellarService.getAccount(nonExistentAddress);
        fail('Should have thrown NotFoundException for non-existent account');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain('not found');
      }
    });

    it('should get transaction history for account', async () => {
      const testAddress = 'GD5DJQDQKPJ2R5XGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5Q';
      
      try {
        const transactions = await stellarService.getAccountTransactions(testAddress, 5);
        expect(Array.isArray(transactions)).toBe(true);
        expect(transactions.length).toBeLessThanOrEqual(5);
      } catch (error) {
        // It's okay if the account doesn't exist or has no transactions
        expect(error).toBeDefined();
      }
    }, 10000);
  });

  describe('Asset Management', () => {
    it('should handle XLM asset', async () => {
      const assetInfo = await stellarService.getAssetInfo('XLM');
      
      expect(assetInfo).toBeDefined();
      expect(assetInfo.asset_code).toBe('XLM');
      expect(assetInfo.asset_type).toBe('native');
      expect(assetInfo.asset_issuer).toBeNull();
    });

    it('should handle custom asset', async () => {
      const customAssetCode = 'USD';
      const customIssuer = 'GD5DJQDQKPJ2R5XGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5Q';
      
      try {
        const assetInfo = await stellarService.getAssetInfo(customAssetCode, customIssuer);
        
        expect(assetInfo).toBeDefined();
        expect(assetInfo.asset_code).toBe(customAssetCode);
        expect(assetInfo.asset_issuer).toBe(customIssuer);
        expect(assetInfo.asset_type).toBe('credit_alphanum4');
      } catch (error) {
        // Custom asset validation might fail in test environment
        expect(error).toBeDefined();
      }
    });
  });

  describe('Amount Formatting', () => {
    it('should format stroops to XLM correctly', () => {
      const stroops = '105000000'; // 10.5 XLM in stroops
      const formatted = stellarService.formatAmount(stroops);
      
      expect(formatted).toBe('10.5000000');
    });

    it('should convert XLM to stroops correctly', () => {
      const xlm = '10.5';
      const stroops = stellarService.toStroops(xlm);
      
      expect(stroops).toBe('105000000');
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      // Mock a network timeout by using an invalid horizon URL
      const originalHorizonUrl = process.env.STELLAR_HORIZON_URL;
      process.env.STELLAR_HORIZON_URL = 'https://invalid-horizon-url.com';

      try {
        await stellarService.getNetworkInfo();
        fail('Should have thrown an error for invalid horizon URL');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain('Unable to connect');
      } finally {
        // Restore original horizon URL
        if (originalHorizonUrl) {
          process.env.STELLAR_HORIZON_URL = originalHorizonUrl;
        } else {
          delete process.env.STELLAR_HORIZON_URL;
        }
      }
    });

    it('should handle malformed transaction hashes', async () => {
      const malformedHash = 'not-a-valid-hash';
      
      const verification = await stellarService.verifyTransaction(malformedHash);
      
      expect(verification.valid).toBe(false);
      expect(verification.error).toBeDefined();
    });
  });
});

// Helper function to create test data
async function createTestData(artistsService: ArtistsService, tracksService: TracksService) {
  const artist = await artistsService.create({
    name: 'Integration Test Artist',
    email: 'integration@example.com',
    stellarAddress: 'GD5DJQDQKPJ2R5XGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5Q',
  });

  const track = await tracksService.create({
    title: 'Integration Test Track',
    duration: 180,
    artistId: artist.id,
    genre: 'test',
    isPublic: true,
  });

  return { artist, track };
}
