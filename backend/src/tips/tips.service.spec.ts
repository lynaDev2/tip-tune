import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TipsService } from './tips.service';
import { Tip, TipStatus, TipType } from './entities/tip.entity';
import { StellarService } from '../stellar/stellar.service';
import { ArtistsService } from '../artists/artists.service';
import { TracksService } from '../tracks/tracks.service';
import { WebSocketGateway } from '../websocket/websocket.gateway';
import { CreateTipDto } from './dto/create-tip.dto';
import { Artist } from '../artists/entities/artist.entity';
import { Track } from '../tracks/entities/track.entity';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

describe('TipsService', () => {
  let service: TipsService;
  let tipsRepository: Repository<Tip>;
  let stellarService: StellarService;
  let artistsService: ArtistsService;
  let tracksService: TracksService;
  let webSocketGateway: WebSocketGateway;
  let dataSource: DataSource;

  const mockArtist: Artist = {
    id: 'artist-id',
    name: 'Test Artist',
    email: 'artist@example.com',
    bio: 'Test bio',
    imageUrl: 'https://example.com/avatar.jpg',
    website: 'https://artist.com',
    socialMedia: 'https://twitter.com/artist',
    stellarAddress: 'GD5DJQDQKPJ2R5XGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5Q',
    isActive: true,
    totalTips: 0,
    totalPlays: 0,
    followerCount: 0,
    tipCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    tracks: [],
    tips: [],
  };

  const mockTrack: Track = {
    id: 'track-id',
    title: 'Test Track',
    duration: 180,
    audioUrl: 'https://example.com/audio.mp3',
    coverArtUrl: 'https://example.com/cover.jpg',
    genre: 'rock',
    releaseDate: new Date('2023-01-01'),
    plays: 0,
    totalTips: 0,
    tipCount: 0,
    filename: 'test.mp3',
    url: 'https://example.com/test.mp3',
    streamingUrl: 'https://example.com/test.mp3/stream',
    fileSize: BigInt(1024),
    mimeType: 'audio/mpeg',
    description: 'Test description',
    album: 'Test Album',
    isPublic: true,
    artistId: 'artist-id',
    artist: mockArtist,
    tips: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTip: Tip = {
    id: 'tip-id',
    artistId: 'artist-id',
    trackId: 'track-id',
    stellarTxHash: 'test-hash-123',
    senderAddress: 'GD5DJQDQKPJ2R5XGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5Q',
    receiverAddress: 'GB5XVAABE5R7D5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5Q',
    amount: 10.5,
    asset: 'XLM',
    message: 'Great music!',
    stellarMemo: 'Tip for Test Artist',
    status: TipStatus.VERIFIED,
    type: TipType.TRACK,
    verifiedAt: new Date(),
    failedAt: null,
    failureReason: null,
    reversedAt: null,
    reversalReason: null,
    stellarTimestamp: new Date(),
    exchangeRate: 0.089,
    fiatCurrency: 'USD',
    fiatAmount: 0.9345,
    isAnonymous: false,
    isPublic: true,
    metadata: '{"source": "web"}',
    artist: mockArtist,
    track: mockTrack,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStellarTransactionDetails = {
    hash: 'test-hash-123',
    sourceAccount: 'GD5DJQDQKPJ2R5XGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5Q',
    destinationAccount: 'GB5XVAABE5R7D5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5Q',
    amount: '10.5',
    asset: 'XLM',
    memo: 'Tip for Test Artist',
    timestamp: new Date(),
    successful: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TipsService,
        {
          provide: getRepositoryToken(Tip),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: StellarService,
          useValue: {
            verifyTransaction: jest.fn(),
            validateStellarAddress: jest.fn(),
          },
        },
        {
          provide: ArtistsService,
          useValue: {
            findOne: jest.fn(),
            addTips: jest.fn(),
          },
        },
        {
          provide: TracksService,
          useValue: {
            findOne: jest.fn(),
            addTips: jest.fn(),
          },
        },
        {
          provide: WebSocketGateway,
          useValue: {
            sendTipNotification: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TipsService>(TipsService);
    tipsRepository = module.get<Repository<Tip>>(getRepositoryToken(Tip));
    stellarService = module.get<StellarService>(StellarService);
    artistsService = module.get<ArtistsService>(ArtistsService);
    tracksService = module.get<TracksService>(TracksService);
    webSocketGateway = module.get<WebSocketGateway>(WebSocketGateway);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTip', () => {
    const createTipDto: CreateTipDto = {
      artistId: 'artist-id',
      trackId: 'track-id',
      stellarTxHash: 'test-hash-123',
      message: 'Great music!',
      isAnonymous: false,
      isPublic: true,
      type: TipType.TRACK,
      exchangeRate: 0.089,
      fiatCurrency: 'USD',
      metadata: '{"source": "web"}',
    };

    it('should create a tip successfully', async () => {
      // Mock transaction
      const mockTransaction = {
        findOne: jest.fn().mockResolvedValue(null), // No existing tip
        create: jest.fn().mockReturnValue(mockTip),
        save: jest.fn().mockResolvedValue(mockTip),
        increment: jest.fn(),
      };

      const mockManager = {
        findOne: mockTransaction.findOne,
        create: mockTransaction.create,
        save: mockTransaction.save,
        increment: mockTransaction.increment,
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockManager);
      });

      // Mock service calls
      jest.spyOn(artistsService, 'findOne').mockResolvedValue(mockArtist);
      jest.spyOn(tracksService, 'findOne').mockResolvedValue(mockTrack);
      jest.spyOn(stellarService, 'verifyTransaction').mockResolvedValue({
        valid: true,
        details: mockStellarTransactionDetails,
      });
      jest.spyOn(webSocketGateway, 'sendTipNotification').mockResolvedValue(undefined);

      const result = await service.createTip(createTipDto);

      expect(result).toEqual(mockTip);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(artistsService.findOne).toHaveBeenCalledWith('artist-id');
      expect(tracksService.findOne).toHaveBeenCalledWith('track-id');
      expect(stellarService.verifyTransaction).toHaveBeenCalledWith('test-hash-123');
      expect(webSocketGateway.sendTipNotification).toHaveBeenCalledWith(mockTip);
    });

    it('should throw ConflictException for duplicate transaction', async () => {
      // Mock existing tip found
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(mockTip),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockManager);
      });

      await expect(service.createTip(createTipDto)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if artist not found', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null), // No existing tip
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockManager);
      });

      jest.spyOn(artistsService, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(service.createTip(createTipDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid transaction', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null), // No existing tip
        create: jest.fn().mockReturnValue(mockTip),
        save: jest.fn().mockResolvedValue(mockTip),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockManager);
      });

      jest.spyOn(artistsService, 'findOne').mockResolvedValue(mockArtist);
      jest.spyOn(stellarService, 'verifyTransaction').mockResolvedValue({
        valid: false,
        error: 'Transaction not found',
      });

      await expect(service.createTip(createTipDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for wrong destination address', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null), // No existing tip
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockManager);
      });

      const artistWithDifferentAddress = {
        ...mockArtist,
        stellarAddress: 'GD5DJQDQKPJ2R5XGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QGQZ5QDIFFERENT',
      };

      jest.spyOn(artistsService, 'findOne').mockResolvedValue(artistWithDifferentAddress);
      jest.spyOn(stellarService, 'verifyTransaction').mockResolvedValue({
        valid: true,
        details: mockStellarTransactionDetails,
      });

      await expect(service.createTip(createTipDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyTip', () => {
    it('should verify a pending tip successfully', async () => {
      const pendingTip = {
        ...mockTip,
        status: TipStatus.PENDING,
        amount: 0,
        senderAddress: '',
        receiverAddress: '',
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(pendingTip);
      jest.spyOn(stellarService, 'verifyTransaction').mockResolvedValue({
        valid: true,
        details: mockStellarTransactionDetails,
      });
      jest.spyOn(tipsRepository, 'save').mockResolvedValue(mockTip);
      jest.spyOn(artistsService, 'addTips').mockResolvedValue(mockArtist);
      jest.spyOn(tracksService, 'addTips').mockResolvedValue(mockTrack);
      jest.spyOn(webSocketGateway, 'sendTipNotification').mockResolvedValue(undefined);

      const result = await service.verifyTip('tip-id');

      expect(result.status).toBe(TipStatus.VERIFIED);
      expect(result.amount).toBe(10.5);
      expect(artistsService.addTips).toHaveBeenCalledWith('artist-id', 10.5);
      expect(tracksService.addTips).toHaveBeenCalledWith('track-id', 10.5);
      expect(webSocketGateway.sendTipNotification).toHaveBeenCalledWith(result);
    });

    it('should throw BadRequestException if tip is not pending', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockTip);

      await expect(service.verifyTip('tip-id')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if transaction verification fails', async () => {
      const pendingTip = {
        ...mockTip,
        status: TipStatus.PENDING,
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(pendingTip);
      jest.spyOn(stellarService, 'verifyTransaction').mockResolvedValue({
        valid: false,
        error: 'Transaction failed',
      });

      await expect(service.verifyTip('tip-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a tip by ID', async () => {
      jest.spyOn(tipsRepository, 'findOne').mockResolvedValue(mockTip);

      const result = await service.findOne('tip-id');

      expect(result).toEqual(mockTip);
      expect(tipsRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'tip-id' },
        relations: ['artist', 'track'],
      });
    });

    it('should throw NotFoundException if tip not found', async () => {
      jest.spyOn(tipsRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByArtist', () => {
    it('should return paginated tips for artist', async () => {
      jest.spyOn(tipsRepository, 'findAndCount').mockResolvedValue([[mockTip], 1]);

      const result = await service.findByArtist('artist-id', 1, 10);

      expect(result).toEqual({
        data: [mockTip],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(tipsRepository.findAndCount).toHaveBeenCalledWith({
        where: { artistId: 'artist-id' },
        relations: ['artist', 'track'],
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('findByTrack', () => {
    it('should return paginated tips for track', async () => {
      jest.spyOn(tipsRepository, 'findAndCount').mockResolvedValue([[mockTip], 1]);

      const result = await service.findByTrack('track-id', 1, 10);

      expect(result).toEqual({
        data: [mockTip],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(tipsRepository.findAndCount).toHaveBeenCalledWith({
        where: { trackId: 'track-id' },
        relations: ['artist', 'track'],
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('reverseTip', () => {
    it('should reverse a verified tip successfully', async () => {
      const mockManager = {
        save: jest.fn().mockResolvedValue(mockTip),
        decrement: jest.fn(),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockManager);
      });

      jest.spyOn(service, 'findOne').mockResolvedValue(mockTip);

      const result = await service.reverseTip('tip-id', 'User requested refund');

      expect(result.status).toBe(TipStatus.REVERSED);
      expect(result.reversalReason).toBe('User requested refund');
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if tip is not verified', async () => {
      const pendingTip = { ...mockTip, status: TipStatus.PENDING };
      jest.spyOn(service, 'findOne').mockResolvedValue(pendingTip);

      await expect(service.reverseTip('tip-id', 'Test reason')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStatistics', () => {
    it('should return tip statistics', async () => {
      const mockQueryBuilder = {
        clone: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(100),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 1050.5 }),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTip]),
      };

      jest.spyOn(tipsRepository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.getStatistics('artist-id');

      expect(result).toEqual({
        totalTips: 100,
        totalAmount: 1050.5,
        verifiedTips: 100,
        pendingTips: 100,
        failedTips: 100,
        recentTips: [mockTip],
      });
    });
  });

  describe('findBySender', () => {
    it('should return paginated tips for sender', async () => {
      jest.spyOn(tipsRepository, 'findAndCount').mockResolvedValue([[mockTip], 1]);

      const result = await service.findBySender('sender-address', 1, 10);

      expect(result).toEqual({
        data: [mockTip],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(tipsRepository.findAndCount).toHaveBeenCalledWith({
        where: { senderAddress: 'sender-address' },
        relations: ['artist', 'track'],
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });
  });
});
