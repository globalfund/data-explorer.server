import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  HttpErrors,
  param,
  post,
  Request,
  requestBody,
  Response,
  response,
  RestBindings,
} from '@loopback/rest';
import {securityId, UserProfile} from '@loopback/security';
import multer from 'multer';
import {DatasetModel} from 'rb-core-middleware/dist/models';
import {
  DatasetBackend,
  DatasetService,
  ExternalDataset,
} from 'rb-core-middleware/dist/services';
import {Logger} from 'winston';
import {assertSafeId} from '../../utils/access';

const EXTERNAL_SOURCES = ['WHO', 'Kaggle'];
const UPLOAD_MAX_MB = Number(process.env.DATASET_UPLOAD_MAX_MB ?? 50);

const getBackend = (): DatasetBackend => ({
  baseUrl: process.env.BACKEND_API_BASE_URL ?? 'http://localhost:4004',
  apiKey: process.env.GF_BACKEND_API_KEY,
});

const uploadSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: UPLOAD_MAX_MB * 1024 * 1024, files: 1},
}).single('file');

export class DatasetController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private req: Request,
    @inject('services.logger') private logger: Logger,
    @inject('services.DatasetService') private datasetService: DatasetService,
    @inject(RestBindings.Http.RESPONSE) private res: Response,
    @inject(AuthenticationBindings.CURRENT_USER, {optional: true})
    private currentUserProfile?: UserProfile,
  ) {}

  private getCurrentUserId(): string {
    const userId =
      this.currentUserProfile?.id ??
      (typeof this.currentUserProfile?.[securityId] === 'string'
        ? this.currentUserProfile[securityId]
        : undefined);
    if (!userId) throw new HttpErrors.Unauthorized();
    return userId;
  }

  @get('/report-builder/datasets')
  @response(200, {description: 'The datasets the user connected or uploaded'})
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async findOwn(): Promise<DatasetModel[]> {
    return this.datasetService.findOwn(this.getCurrentUserId());
  }

  @get('/report-builder/external-sources/counts')
  @response(200, {description: 'The number of datasets per external source'})
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async externalSourceCounts(): Promise<Record<string, number>> {
    return this.datasetService.externalSourceCounts(getBackend());
  }

  @get('/report-builder/external-sources/search')
  @response(200, {description: 'Datasets found in an external source'})
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async externalSourceSearch(
    @param.query.string('source') source: string,
    @param.query.string('q') q?: string,
    @param.query.integer('limit') limit?: number,
    @param.query.integer('offset') offset?: number,
    @param.query.string('sortBy') sortBy?: string,
  ): Promise<ExternalDataset[]> {
    if (!EXTERNAL_SOURCES.includes(source)) {
      throw new HttpErrors.BadRequest('Invalid source');
    }
    return this.datasetService.searchExternalSources(
      {
        source,
        q,
        limit,
        offset,
        sortBy: sortBy === 'name' ? 'name' : undefined,
      },
      getBackend(),
    );
  }

  @post('/report-builder/external-sources/connect')
  @response(200, {
    description: 'The dataset created from the external dataset',
    content: {'application/json': {schema: getModelSchemaRef(DatasetModel)}},
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async connectExternalDataset(
    @requestBody() body: ExternalDataset,
  ): Promise<DatasetModel> {
    if (!EXTERNAL_SOURCES.includes(body?.source)) {
      throw new HttpErrors.BadRequest('Invalid external dataset');
    }
    return this.datasetService.connectExternalDataset(
      this.getCurrentUserId(),
      body,
      getBackend(),
    );
  }

  @post('/report-builder/datasets/upload')
  @response(200, {
    description: 'The dataset created from the uploaded file',
    content: {'application/json': {schema: getModelSchemaRef(DatasetModel)}},
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async uploadDataset(
    @requestBody.file() request: Request,
  ): Promise<DatasetModel> {
    await new Promise<void>((resolve, reject) => {
      // @types/multer brings its own copy of the express types.
      uploadSingleFile(
        request as never,
        this.res as never,
        (error: unknown) => {
          if (!error) return resolve();
          if ((error as multer.MulterError).code === 'LIMIT_FILE_SIZE') {
            return reject(
              new HttpErrors.PayloadTooLarge(
                `The file is larger than ${UPLOAD_MAX_MB} MB.`,
              ),
            );
          }
          reject(new HttpErrors.BadRequest('Invalid file upload'));
        },
      );
    });
    const file = (request as Request & {file?: Express.Multer.File}).file;
    if (!file) throw new HttpErrors.BadRequest('The file is empty.');
    return this.datasetService.uploadDataset(
      this.getCurrentUserId(),
      {
        // multer decodes file names as latin1, browsers send them as utf8.
        fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        content: file.buffer,
        name: typeof request.body?.name === 'string' ? request.body.name : '',
      },
      getBackend(),
    );
  }

  @get('/datasets')
  @response(200, {
    description: 'Array of DatasetModel instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(DatasetModel, {includeRelations: true}),
        },
      },
    },
  })
  // @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async find(
    @param.filter(DatasetModel) filter?: Filter<DatasetModel>,
  ): Promise<DatasetModel[]> {
    this.logger.info('DatasetController - find - Fetching datasets');
    // This route is open, and the datasets users upload or connect are private.
    return this.datasetService.findPublic(filter);
  }

  @get('/datasets/{id}/data')
  @response(200, {
    description: 'Dataset content',
    content: {
      'application/json': {
        schema: [],
      },
    },
  })
  // @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async datasetContent(
    @param.path.string('id') id: string,
    @param.query.string('page') page: string,
    @param.query.string('pageSize') pageSize: string,
  ): Promise<any> {
    this.logger.info(
      `DatasetController - datasetContent - Fetching content for dataset ${id}`,
    );
    assertSafeId(id, 'datasetId');
    return this.datasetService.datasetContent(
      id,
      page,
      pageSize,
      process.env.BACKEND_API_BASE_URL ?? 'http://localhost:4004',
    );
  }
}
