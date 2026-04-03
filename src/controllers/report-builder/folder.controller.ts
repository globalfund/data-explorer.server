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
import {FolderModel} from 'rb-core-middleware/dist/models';
import {FolderService} from 'rb-core-middleware/dist/services';
import {Logger} from 'winston';

export class FolderController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private req: Request,
    @inject('services.logger') private logger: Logger,
    @inject('services.FolderService') private folderService: FolderService,
  ) {}

  @post('/folder')
  @response(200, {
    description: 'FolderModel instance',
    content: {'application/json': {schema: getModelSchemaRef(FolderModel)}},
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(FolderModel, {
            title: 'NewFolder',
            exclude: ['id'],
          }),
        },
      },
    })
    folder: Omit<FolderModel, 'id'>,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - create - Creating folder for user ${userId}`,
    );
    return this.folderService.create(userId, folder);
  }

  @get('/folders')
  @response(200, {
    description: 'Array of FolderModel instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(FolderModel, {includeRelations: true}),
        },
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async find(
    @param.filter(FolderModel) filter?: Filter<FolderModel>,
  ): Promise<FolderModel[]> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - find - Fetching folders for user ${userId}`,
    );
    return this.folderService.find(userId, filter);
  }

  @get('/folder/{id}')
  @response(200, {
    description: 'FolderModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(FolderModel, {includeRelations: true}),
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async findById(
    @param.path.string('id') id: string,
    @param.filter(FolderModel, {exclude: 'where'})
    filter?: FilterExcludingWhere<FolderModel>,
  ): Promise<FolderModel | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    // const orgMembers = await getUsersOrganizationMembers(userId);
    // logger.info(`route</folder/{id}> Fetching folder- ${id}`);
    // logger.debug(`Finding folder- ${id} with filter- ${JSON.stringify(filter)}`);
    this.logger.info(
      `FolderController - findById - Fetching folder ${id} for user ${userId}`,
    );
    return this.folderService.findById([userId], id, filter);
  }

  @patch('/folder/{id}')
  @response(204, {
    description: 'Folder PATCH success',
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(FolderModel, {partial: true}),
        },
      },
    })
    folder: FolderModel,
  ): Promise<void | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - updateById - Updating folder ${id} for user ${userId}`,
    );
    return this.folderService.updateById(userId, id, folder);
  }

  @put('/folder/{id}')
  @response(204, {
    description: 'Folder PUT success',
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async replaceById(
    @param.path.string('id') id: string,
    @requestBody() folder: FolderModel,
  ): Promise<void | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - replaceById - Replacing folder ${id} for user ${userId}`,
    );
    return this.folderService.replaceById(id, userId, folder);
  }

  @del('/folder/{id}')
  @response(204, {
    description: 'Folder DELETE success',
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async deleteById(
    @param.path.string('id') id: string,
  ): Promise<void | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - deleteById - Deleting folder ${id} for user ${userId}`,
    );
    return this.folderService.deleteById(userId, id);
  }

  @get('/folder/duplicate/{id}')
  @response(200, {
    description: 'FolderModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(FolderModel, {includeRelations: true}),
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async duplicate(
    @param.path.string('id') id: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - duplicate - Duplicating folder ${id} for user ${userId}`,
    );
    return this.folderService.duplicate(userId, id);
  }
}
