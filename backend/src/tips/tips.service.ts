import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tip, TipStatus, TipType } from './entities/tip.entity';
import { CreateTipDto } from './dto/create-tip.dto';
import { StellarService, StellarTransactionDetails } from '../stellar/stellar.service';
import { ArtistsService } from '../artists/artists.service';
import { TracksService } from '../tracks/tracks.service';
import { WebSocketGateway } from '../websocket/websocket.gateway';
import { Artist } from '../artists/entities/artist.entity';
import { Track } from '../tracks/entities/track.entity';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class TipsService {
  private readonly logger = new Logger(TipsService.name);

  constructor(
    @InjectRepository(Tip)
    private tipsRepository: Repository<Tip>,
    private stellarService: StellarService,
    private artistsService: ArtistsService,
    private tracksService: TracksService,
    private webSocketGateway: WebSocketGateway,
    private dataSource: DataSource,
  ) {}

  /**
   * Create a new tip with Stellar transaction verification
   */
  async createTip(createTipDto: CreateTipDto): Promise<Tip> {
    const { artistId, trackId, stellarTxHash, message, isAnonymous = false, isPublic = true, type = TipType.ARTIST } = createTipDto;

    this.logger.log(`Creating tip for artist ${artistId} with transaction ${stellarTxHash}`);

    // Use transaction for atomicity
    const result = await this.dataSource.transaction(async manager => {
      // Check if transaction hash already exists (idempotency)
      const existingTip = await manager.findOne(Tip, { 
        where: { stellarTxHash } 
      });

      if (existingTip) {
        throw new ConflictException(`Transaction ${stellarTxHash} has already been processed`);
      }

      // Verify artist exists
      const artist = await this.artistsService.findOne(artistId);
      if (!artist) {
        throw new NotFoundException(`Artist with ID ${artistId} not found`);
      }

      // Verify track exists if trackId is provided
      let track = null;
      if (trackId) {
        track = await this.tracksService.findOne(trackId);
        if (!track) {
          throw new NotFoundException(`Track with ID ${trackId} not found`);
        }
      }

      // Verify Stellar transaction
      const verification = await this.stellarService.verifyTransaction(stellarTxHash);
      
      if (!verification.valid) {
        // Create failed tip record
        const failedTip = manager.create(Tip, {
          artistId,
          trackId,
          stellarTxHash,
          senderAddress: '',
          receiverAddress: artist.stellarAddress || '',
          amount: 0,
          asset: 'XLM',
          message,
          status: TipStatus.FAILED,
          type,
          failureReason: verification.error,
          failedAt: new Date(),
          isAnonymous,
          isPublic,
        });

        const savedFailedTip = await manager.save(failedTip);
        throw new BadRequestException(`Transaction verification failed: ${verification.error}`);
      }

      const txDetails = verification.details!;

      // Verify the transaction is for the correct artist
      if (artist.stellarAddress && txDetails.destinationAccount !== artist.stellarAddress) {
        throw new BadRequestException(`Transaction destination ${txDetails.destinationAccount} does not match artist's Stellar address ${artist.stellarAddress}`);
      }

      // Create tip record
      const tip = manager.create(Tip, {
        artistId,
        trackId,
        stellarTxHash,
        senderAddress: txDetails.sourceAccount,
        receiverAddress: txDetails.destinationAccount,
        amount: parseFloat(txDetails.amount),
        asset: txDetails.asset,
        message,
        stellarMemo: txDetails.memo,
        status: TipStatus.VERIFIED,
        type,
        verifiedAt: new Date(),
        stellarTimestamp: txDetails.timestamp,
        exchangeRate: createTipDto.exchangeRate,
        fiatCurrency: createTipDto.fiatCurrency,
        fiatAmount: createTipDto.exchangeRate && createTipDto.fiatCurrency 
          ? parseFloat(txDetails.amount) * createTipDto.exchangeRate 
          : undefined,
        isAnonymous,
        isPublic,
        metadata: createTipDto.metadata,
      });

      const savedTip = await manager.save(tip);

      // Update artist's total tips and tip count
      await manager.increment(Artist, { id: artistId }, 'totalTips', parseFloat(txDetails.amount));
      await manager.increment(Artist, { id: artistId }, 'tipCount', 1);

      // Update track's total tips and tip count if track is specified
      if (trackId) {
        await manager.increment(Track, { id: trackId }, 'totalTips', parseFloat(txDetails.amount));
        await manager.increment(Track, { id: trackId }, 'tipCount', 1);
      }

      return savedTip;
    });

    // Send real-time notification
    try {
      await this.webSocketGateway.sendTipNotification(result);
    } catch (error) {
      this.logger.warn(`Failed to send WebSocket notification: ${error.message}`);
    }

    this.logger.log(`Tip created successfully: ${result.id}`);
    return result;
  }

  /**
   * Verify a pending tip
   */
  async verifyTip(tipId: string): Promise<Tip> {
    const tip = await this.findOne(tipId);

    if (tip.status !== TipStatus.PENDING) {
      throw new BadRequestException(`Tip ${tipId} is not in pending status`);
    }

    const verification = await this.stellarService.verifyTransaction(tip.stellarTxHash);

    if (!verification.valid) {
      tip.status = TipStatus.FAILED;
      tip.failureReason = verification.error;
      tip.failedAt = new Date();
      await this.tipsRepository.save(tip);
      throw new BadRequestException(`Transaction verification failed: ${verification.error}`);
    }

    const txDetails = verification.details!;

    // Update tip with verified details
    tip.senderAddress = txDetails.sourceAccount;
    tip.receiverAddress = txDetails.destinationAccount;
    tip.amount = parseFloat(txDetails.amount);
    tip.asset = txDetails.asset;
    tip.stellarMemo = txDetails.memo;
    tip.stellarTimestamp = txDetails.timestamp;
    tip.status = TipStatus.VERIFIED;
    tip.verifiedAt = new Date();

    const updatedTip = await this.tipsRepository.save(tip);

    // Update artist's total tips
    await this.artistsService.addTips(tip.artistId, parseFloat(txDetails.amount));

    // Update track's total tips if track is specified
    if (tip.trackId) {
      await this.tracksService.addTips(tip.trackId, parseFloat(txDetails.amount));
    }

    // Send real-time notification
    try {
      await this.webSocketGateway.sendTipNotification(updatedTip);
    } catch (error) {
      this.logger.warn(`Failed to send WebSocket notification: ${error.message}`);
    }

    this.logger.log(`Tip verified successfully: ${tipId}`);
    return updatedTip;
  }

  /**
   * Get tip by ID
   */
  async findOne(id: string): Promise<Tip> {
    const tip = await this.tipsRepository.findOne({ 
      where: { id },
      relations: ['artist', 'track'],
    });

    if (!tip) {
      throw new NotFoundException(`Tip with ID ${id} not found`);
    }

    return tip;
  }

  /**
   * Get tips by artist ID with pagination
   */
  async findByArtist(artistId: string, page: number = 1, limit: number = 10): Promise<PaginatedResult<Tip>> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.tipsRepository.findAndCount({
      where: { artistId },
      relations: ['artist', 'track'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get tips by track ID with pagination
   */
  async findByTrack(trackId: string, page: number = 1, limit: number = 10): Promise<PaginatedResult<Tip>> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.tipsRepository.findAndCount({
      where: { trackId },
      relations: ['artist', 'track'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all tips with pagination and filtering
   */
  async findAll(page: number = 1, limit: number = 10, status?: TipStatus): Promise<PaginatedResult<Tip>> {
    const skip = (page - 1) * limit;

    const whereClause = status ? { status } : {};

    const [data, total] = await this.tipsRepository.findAndCount({
      where: whereClause,
      relations: ['artist', 'track'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get tips by sender address
   */
  async findBySender(senderAddress: string, page: number = 1, limit: number = 10): Promise<PaginatedResult<Tip>> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.tipsRepository.findAndCount({
      where: { senderAddress },
      relations: ['artist', 'track'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Reverse a tip (admin function)
   */
  async reverseTip(tipId: string, reason: string): Promise<Tip> {
    const tip = await this.findOne(tipId);

    if (tip.status !== TipStatus.VERIFIED) {
      throw new BadRequestException(`Only verified tips can be reversed`);
    }

    // Use transaction for atomicity
    const result = await this.dataSource.transaction(async manager => {
      // Update tip status
      tip.status = TipStatus.REVERSED;
      tip.reversalReason = reason;
      tip.reversedAt = new Date();

      const updatedTip = await manager.save(tip);

      // Subtract from artist's total tips
      await manager.decrement(Artist, { id: tip.artistId }, 'totalTips', tip.amount);
      await manager.decrement(Artist, { id: tip.artistId }, 'tipCount', 1);

      // Subtract from track's total tips if track is specified
      if (tip.trackId) {
        await manager.decrement(Track, { id: tip.trackId }, 'totalTips', tip.amount);
        await manager.decrement(Track, { id: tip.trackId }, 'tipCount', 1);
      }

      return updatedTip;
    });

    this.logger.log(`Tip reversed: ${tipId} - ${reason}`);
    return result;
  }

  /**
   * Get tip statistics
   */
  async getStatistics(artistId?: string): Promise<any> {
    const queryBuilder = this.tipsRepository.createQueryBuilder('tip');

    if (artistId) {
      queryBuilder.where('tip.artistId = :artistId', { artistId });
    }

    const [
      totalTips,
      totalAmount,
      verifiedTips,
      pendingTips,
      failedTips,
      recentTips
    ] = await Promise.all([
      queryBuilder.clone().getCount(),
      queryBuilder.clone().select('SUM(tip.amount)', 'total').getRawOne(),
      queryBuilder.clone().where('tip.status = :status', { status: TipStatus.VERIFIED }).getCount(),
      queryBuilder.clone().where('tip.status = :status', { status: TipStatus.PENDING }).getCount(),
      queryBuilder.clone().where('tip.status = :status', { status: TipStatus.FAILED }).getCount(),
      queryBuilder.clone()
        .where('tip.status = :status', { status: TipStatus.VERIFIED })
        .orderBy('tip.createdAt', 'DESC')
        .limit(10)
        .getMany()
    ]);

    return {
      totalTips,
      totalAmount: totalAmount.total || 0,
      verifiedTips,
      pendingTips,
      failedTips,
      recentTips,
    };
  }
}
