import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, FilterExcludingWhere} from '@loopback/repository';
import {
  del,
  get,
  getModelSchemaRef,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {securityId, UserProfile} from '@loopback/security';
import {ChartModel} from 'rb-core-middleware/dist/models';
import {ChartService} from 'rb-core-middleware/dist/services/chart.service';
import {Logger} from 'winston';
import {
  assertSafeId,
  assertServiceResult,
  omitServerManagedFields,
} from '../../utils/access';

export class ChartController {
  constructor(
    @inject('services.logger') private logger: Logger,
    @inject('services.ChartService') private chartService: ChartService,
    @inject(AuthenticationBindings.CURRENT_USER, {optional: true})
    private currentUserProfile?: UserProfile,
  ) {}

  private getCurrentUserId(): string {
    return (
      this.currentUserProfile?.id ??
      (typeof this.currentUserProfile?.[securityId] === 'string'
        ? this.currentUserProfile[securityId]
        : undefined) ??
      'anonymous'
    );
  }

  @post('/chart')
  @response(200, {
    description: 'ChartModel instance',
    content: {'application/json': {schema: getModelSchemaRef(ChartModel)}},
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(ChartModel, {
            title: 'NewChart',
            exclude: ['id'],
          }),
        },
      },
    })
    chart: Omit<ChartModel, 'id'>,
  ): Promise<ChartModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ChartController - create - Creating chart for user ${userId}`,
    );
    // datasetId is later used to build a file path when rendering.
    assertSafeId(chart.datasetId, 'datasetId');
    return this.chartService.create(userId, omitServerManagedFields(chart));
  }

  @get('/chart/sample-data/{datasetId}')
  @response(200)
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async sampleData(@param.path.string('datasetId') datasetId: string) {
    assertSafeId(datasetId, 'datasetId');
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ChartController - sampleData - Fetching sample data for user ${userId} and dataset ${datasetId}`,
    );
    return this.chartService.sampleData(
      datasetId,
      [userId],
      process.env.BACKEND_API_BASE_URL ?? 'http://localhost:4004',
    );
  }

  @get('/charts')
  @response(200, {
    description: 'Array of ChartModel instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(ChartModel, {includeRelations: true}),
        },
      },
    },
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async find(
    @param.filter(ChartModel) filter?: Filter<ChartModel>,
  ): Promise<ChartModel[]> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ChartController - find - Fetching charts for user ${userId}`,
    );
    return this.chartService.find(userId, filter);
  }

  @get('/chart/{id}')
  @response(200, {
    description: 'ChartModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(ChartModel, {includeRelations: true}),
      },
    },
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async findById(
    @param.path.string('id') id: string,
    @param.filter(ChartModel, {exclude: 'where'})
    filter?: FilterExcludingWhere<ChartModel>,
  ): Promise<ChartModel> {
    const userId = this.getCurrentUserId();
    // const orgMembers = await getUsersOrganizationMembers(userId);
    // logger.info(`route</chart/{id}> Fetching chart- ${id}`);
    // logger.debug(`Finding chart- ${id} with filter- ${JSON.stringify(filter)}`);
    this.logger.info(
      `ChartController - findById - Fetching chart ${id} for user ${userId}`,
    );
    return assertServiceResult(
      await this.chartService.findById(id, [userId], filter),
    );
  }

  @post('/chart/{id}/render')
  @response(200, {
    description: 'ChartModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(ChartModel, {includeRelations: true}),
      },
    },
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async renderChart(
    @param.path.string('id') id: string,
    @requestBody() body: any,
  ): Promise<ChartModel | {name: string; error: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ChartController - renderChart - Rendering chart ${id} for user ${userId}`,
    );
    if (id === 'new') {
      assertSafeId(body?.rows?.[0]?.[0]?.datasetId, 'datasetId');
    } else {
      assertServiceResult(await this.chartService.findById(id, [userId]));
    }
    return this.chartService.renderById(
      id,
      userId,
      body,
      process.env.PARSED_DATA_FILES_PATH ??
        '../data-exporer.backend/parsed-data-files/',
    );
  }

  @patch('/chart/{id}')
  @response(204, {
    description: 'Chart PATCH success',
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(ChartModel, {partial: true}),
        },
      },
    })
    chart: ChartModel,
  ): Promise<ChartModel> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ChartController - updateById - Updating chart ${id} for user ${userId}`,
    );
    if (chart.datasetId !== undefined) {
      assertSafeId(chart.datasetId, 'datasetId');
    }
    return assertServiceResult(
      await this.chartService.updateById(
        id,
        userId,
        omitServerManagedFields(chart),
      ),
    );
  }

  @del('/chart/{id}')
  @response(204, {
    description: 'Chart DELETE success',
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async deleteById(@param.path.string('id') id: string): Promise<void> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ChartController - deleteById - Deleting chart ${id} for user ${userId}`,
    );
    assertServiceResult(await this.chartService.deleteById(id, userId));
  }

  @get('/chart/duplicate/{id}')
  @response(200, {
    description: 'ChartModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(ChartModel, {includeRelations: true}),
      },
    },
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async duplicate(
    @param.path.string('id') id: string,
  ): Promise<ChartModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ChartController - duplicate - Duplicating chart ${id} for user ${userId}`,
    );
    // The service copies any chart by id, so check read access first.
    assertServiceResult(await this.chartService.findById(id, [userId]));
    return this.chartService.duplicate(id, userId);
  }
}
