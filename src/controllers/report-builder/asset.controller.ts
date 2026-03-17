// import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, FilterExcludingWhere} from '@loopback/filter/dist/query';
import {
  del,
  get,
  getModelSchemaRef,
  param,
  patch,
  post,
  put,
  Request,
  requestBody,
  response,
  RestBindings,
} from '@loopback/rest';
import _ from 'lodash';
import {AssetModel} from 'rb-core-middleware/dist/models';
import {AssetService} from 'rb-core-middleware/dist/services';
import {Logger} from 'winston';

export class AssetController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private req: Request,
    @inject('services.logger') private logger: Logger,
    @inject('services.AssetService') private assetService: AssetService,
  ) {}

  @post('/asset')
  @response(200, {
    description: 'AssetModel instance',
    content: {'application/json': {schema: getModelSchemaRef(AssetModel)}},
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(AssetModel, {
            title: 'NewAsset',
            exclude: ['id'],
          }),
        },
      },
    })
    asset: Omit<AssetModel, 'id'>,
  ): Promise<AssetModel | {error: string; errorType: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `AssetController - create - Creating asset for user ${userId}`,
    );
    return this.assetService.create(userId, asset);
  }

  @get('/assets')
  @response(200, {
    description: 'Array of AssetModel instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(AssetModel, {includeRelations: true}),
        },
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async find(
    @param.filter(AssetModel) filter?: Filter<AssetModel>,
  ): Promise<AssetModel[]> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `AssetController - find - Fetching assets for user ${userId}`,
    );
    return this.assetService.find(userId, filter);
  }

  @get('/asset/{id}')
  @response(200, {
    description: 'AssetModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(AssetModel, {includeRelations: true}),
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async findById(
    @param.path.string('id') id: string,
    @param.filter(AssetModel, {exclude: 'where'})
    filter?: FilterExcludingWhere<AssetModel>,
  ): Promise<AssetModel | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    // const orgMembers = await getUsersOrganizationMembers(userId);
    // logger.info(`route</asset/{id}> Fetching asset- ${id}`);
    // logger.debug(`Finding asset- ${id} with filter- ${JSON.stringify(filter)}`);
    this.logger.info(
      `AssetController - findById - Fetching asset ${id} for user ${userId}`,
    );
    return this.assetService.findById([userId], id, filter);
  }

  @patch('/asset/{id}')
  @response(204, {
    description: 'Asset PATCH success',
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(AssetModel, {partial: true}),
        },
      },
    })
    asset: AssetModel,
  ): Promise<void | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `AssetController - updateById - Updating asset ${id} for user ${userId}`,
    );
    return this.assetService.updateById(userId, id, asset);
  }

  @put('/asset/{id}')
  @response(204, {
    description: 'Asset PUT success',
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async replaceById(
    @param.path.string('id') id: string,
    @requestBody() asset: AssetModel,
  ): Promise<void | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `AssetController - replaceById - Replacing asset ${id} for user ${userId}`,
    );
    return this.assetService.replaceById(id, userId, asset);
  }

  @del('/asset/{id}')
  @response(204, {
    description: 'Asset DELETE success',
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async deleteById(
    @param.path.string('id') id: string,
  ): Promise<void | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `AssetController - deleteById - Deleting asset ${id} for user ${userId}`,
    );
    return this.assetService.deleteById(userId, id);
  }

  @get('/asset/duplicate/{id}')
  @response(200, {
    description: 'AssetModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(AssetModel, {includeRelations: true}),
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async duplicate(
    @param.path.string('id') id: string,
  ): Promise<AssetModel | {error: string; errorType: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `AssetController - duplicate - Duplicating asset ${id} for user ${userId}`,
    );
    return this.assetService.duplicate(userId, id);
  }
}
