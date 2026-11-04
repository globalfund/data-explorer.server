// import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  param,
  Request,
  response,
  RestBindings,
} from '@loopback/rest';
import {DatasetModel} from 'rb-core-middleware/dist/models';
import {DatasetService} from 'rb-core-middleware/dist/services';
import {Logger} from 'winston';
import {assertSafeId} from '../../utils/access';

export class DatasetController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private req: Request,
    @inject('services.logger') private logger: Logger,
    @inject('services.DatasetService') private datasetService: DatasetService,
  ) {}

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
    return this.datasetService.find(filter);
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
