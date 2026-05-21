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
import {FolderService, ReportService} from 'rb-core-middleware/dist/services';
import {Logger} from 'winston';

export class FolderController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private req: Request,
    @inject('services.logger') private logger: Logger,
    @inject('services.FolderService') private folderService: FolderService,
    @inject('services.ReportService') private reportService: ReportService,
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
    @param.query.string('includeSubFolders') includeSubFolders?: string,
  ): Promise<any[]> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - find - Fetching folders for user ${userId}`,
    );
    if (Boolean(includeSubFolders)) {
      return this.folderService.getAllFoldersWithSubfolders(userId, filter);
    } else {
      const folders = await this.folderService.find(userId, filter);
      const folderById = new Map<string, FolderModel>(
        folders.map(f => [f.id, f]),
      );
      const pathCache = new Map<string, string>();
      const buildFolderPath = (folderId: string | undefined): string => {
        if (!folderId) return 'My Workspace';
        const cached = pathCache.get(folderId);
        if (cached !== undefined) return cached;
        const folder = folderById.get(folderId);
        if (!folder) return 'My Workspace';
        const parentPath = buildFolderPath(folder.parentId);
        const path =
          parentPath === 'My Workspace'
            ? `My Workspace > ${folder.name}`
            : `${parentPath} > ${folder.name}`;
        pathCache.set(folderId, path);
        return path;
      };

      const foldersWithPath = _.filter(folders, folder => !folder.parentId).map(
        folder => {
          const locationPath = buildFolderPath(folder.parentId);
          return {
            ...folder,
            locationPath,
          };
        },
      );
      return foldersWithPath;
    }
  }

  @get('/folders-structure')
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
  async getFoldersStructure(
    @param.filter(FolderModel) filter?: Filter<FolderModel>,
  ): Promise<FolderModel[]> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - getFoldersStructure - Fetching folder structure for user ${userId}`,
    );
    return this.folderService.getFolderTree(userId);
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

  @get('/folder/add-asset/{id}')
  @response(200, {
    description: 'FolderModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(FolderModel, {includeRelations: true}),
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async addAssetToFolder(
    @param.path.string('id') id: string,
    @param.query.string('assetId') assetId: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - addAssetToFolder - Adding asset ${assetId} to folder ${id} for user ${userId}`,
    );
    return this.folderService.addAsset(userId, id, assetId);
  }

  @get('/folder/remove-asset/{id}')
  @response(200, {
    description: 'FolderModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(FolderModel, {includeRelations: true}),
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async removeAssetFromFolder(
    @param.path.string('id') id: string,
    @param.query.string('assetId') assetId: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - removeAssetFromFolder - Removing asset ${assetId} from folder ${id} for user ${userId}`,
    );
    return this.folderService.removeAsset(userId, id, assetId);
  }

  @get('/folder/add-report/{id}')
  @response(200, {
    description: 'FolderModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(FolderModel, {includeRelations: true}),
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async addReportToFolder(
    @param.path.string('id') id: string,
    @param.query.string('reportId') reportId: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - addReportToFolder - Adding report ${reportId} to folder ${id} for user ${userId}`,
    );
    const reportPrevFolder = await this.reportService.findById(
      [userId],
      reportId,
    );
    return this.folderService.addReport(
      userId,
      id,
      reportId,
      // @ts-ignore
      reportPrevFolder?.folderId ?? undefined,
    );
  }

  @get('/folder/remove-report/{id}')
  @response(200, {
    description: 'FolderModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(FolderModel, {includeRelations: true}),
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async removeReportFromFolder(
    @param.path.string('id') id: string,
    @param.query.string('reportId') reportId: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - removeReportFromFolder - Removing report ${reportId} from folder ${id} for user ${userId}`,
    );
    return this.folderService.removeReport(userId, id, reportId);
  }

  @get('/folder/add-folder/{id}')
  @response(200, {
    description: 'FolderModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(FolderModel, {includeRelations: true}),
      },
    },
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async addFolderToFolder(
    @param.path.string('id') id: string,
    @param.query.string('folderId') folderId: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `FolderController - addFolderToFolder - Adding folder ${folderId} to folder ${id} for user ${userId}`,
    );
    const folderPrevFolder = await this.folderService.findById(
      [userId],
      folderId,
    );
    return this.folderService.addFolder(
      userId,
      id,
      folderId,
      // @ts-ignore
      folderPrevFolder?.folderId ?? undefined,
    );
  }
}
