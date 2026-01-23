import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { TipsService } from './tips.service';
import { CreateTipDto, TipResponseDto, TipVerificationDto } from './dto/create-tip.dto';
import { Tip, TipStatus } from './entities/tip.entity';
import { PaginatedResult } from './tips.service';

@ApiTags('tips')
@Controller('tips')
export class TipsController {
  constructor(private readonly tipsService: TipsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tip with Stellar transaction verification' })
  @ApiResponse({ status: 201, description: 'Tip created successfully', type: TipResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid data or transaction verification failed' })
  @ApiResponse({ status: 404, description: 'Artist or Track not found' })
  @ApiResponse({ status: 409, description: 'Conflict - Transaction already processed' })
  async create(@Body() createTipDto: CreateTipDto): Promise<Tip> {
    return this.tipsService.createTip(createTipDto);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify a pending tip transaction' })
  @ApiResponse({ status: 200, description: 'Tip verified successfully', type: TipResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request - Tip not pending or verification failed' })
  @ApiResponse({ status: 404, description: 'Tip not found' })
  async verifyTip(@Body() verificationDto: TipVerificationDto): Promise<Tip> {
    // First find the tip by transaction hash
    const tips = await this.tipsService.findAll(1, 1);
    const tip = tips.data.find(t => t.stellarTxHash === verificationDto.stellarTxHash);
    
    if (!tip) {
      throw new BadRequestException('No tip found with this transaction hash');
    }

    return this.tipsService.verifyTip(tip.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tips with pagination and filtering' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (pending, verified, failed, reversed)' })
  @ApiResponse({ status: 200, description: 'Paginated list of tips' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: TipStatus,
  ): Promise<PaginatedResult<Tip>> {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 10;
    
    return this.tipsService.findAll(pageNum, limitNum, status);
  }

  @Get('artist/:artistId')
  @ApiOperation({ summary: 'Get tips by artist ID with pagination' })
  @ApiParam({ name: 'artistId', description: 'Artist ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10, max: 100)' })
  @ApiResponse({ status: 200, description: 'Paginated tips for artist' })
  @ApiResponse({ status: 404, description: 'Artist not found' })
  findByArtist(
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResult<Tip>> {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 10;
    
    return this.tipsService.findByArtist(artistId, pageNum, limitNum);
  }

  @Get('track/:trackId')
  @ApiOperation({ summary: 'Get tips by track ID with pagination' })
  @ApiParam({ name: 'trackId', description: 'Track ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10, max: 100)' })
  @ApiResponse({ status: 200, description: 'Paginated tips for track' })
  @ApiResponse({ status: 404, description: 'Track not found' })
  findByTrack(
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResult<Tip>> {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 10;
    
    return this.tipsService.findByTrack(trackId, pageNum, limitNum);
  }

  @Get('sender/:senderAddress')
  @ApiOperation({ summary: 'Get tips by sender Stellar address with pagination' })
  @ApiParam({ name: 'senderAddress', description: 'Sender Stellar address' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10, max: 100)' })
  @ApiResponse({ status: 200, description: 'Paginated tips from sender' })
  findBySender(
    @Param('senderAddress') senderAddress: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResult<Tip>> {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 10;
    
    return this.tipsService.findBySender(senderAddress, pageNum, limitNum);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get tip statistics' })
  @ApiQuery({ name: 'artistId', required: false, description: 'Filter statistics by artist ID' })
  @ApiResponse({ status: 200, description: 'Tip statistics' })
  getStatistics(@Query('artistId') artistId?: string): Promise<any> {
    return this.tipsService.getStatistics(artistId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tip by ID' })
  @ApiParam({ name: 'id', description: 'Tip ID' })
  @ApiResponse({ status: 200, description: 'Tip details', type: TipResponseDto })
  @ApiResponse({ status: 404, description: 'Tip not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Tip> {
    return this.tipsService.findOne(id);
  }

  @Patch(':id/reverse')
  @ApiOperation({ summary: 'Reverse a verified tip (admin function)' })
  @ApiParam({ name: 'id', description: 'Tip ID' })
  @ApiResponse({ status: 200, description: 'Tip reversed successfully', type: TipResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request - Tip not verified' })
  @ApiResponse({ status: 404, description: 'Tip not found' })
  reverseTip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ): Promise<Tip> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Reversal reason is required');
    }
    
    return this.tipsService.reverseTip(id, reason);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify a pending tip by ID' })
  @ApiParam({ name: 'id', description: 'Tip ID' })
  @ApiResponse({ status: 200, description: 'Tip verified successfully', type: TipResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request - Tip not pending or verification failed' })
  @ApiResponse({ status: 404, description: 'Tip not found' })
  verifyTipById(@Param('id', ParseUUIDPipe) id: string): Promise<Tip> {
    return this.tipsService.verifyTip(id);
  }
}
