import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, FilterExcludingWhere} from '@loopback/filter/dist/query';
import {
  del,
  get,
  getModelSchemaRef,
  param,
  patch,
  post,
  Request,
  requestBody,
  RestBindings,
  response,
} from '@loopback/rest';
import {securityId, UserProfile} from '@loopback/security';
import _ from 'lodash';
import {AssetModel, FolderModel} from 'rb-core-middleware/dist/models';
import {AssetService, FolderService} from 'rb-core-middleware/dist/services';
import {Logger} from 'winston';
import {queueAssetThumbnailGeneration} from '../../queues/report.queue';
import {assertServiceResult, omitServerManagedFields} from '../../utils/access';
import {createFolderPathResolver} from '../../utils/folderTree';

const getRequestOrigin = (request: Request) => {
  const host = request.headers.host;
  if (!host) return undefined;

  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol =
    (typeof forwardedProto === 'string'
      ? forwardedProto.split(',')[0].trim()
      : undefined) ??
    ((request.socket as {encrypted?: boolean}).encrypted ? 'https' : 'http');

  return `${protocol}://${host}`;
};

export class AssetController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private request: Request,
    @inject('services.logger') private logger: Logger,
    @inject('services.AssetService') private assetService: AssetService,
    @inject('services.FolderService') private folderService: FolderService,
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

  @post('/asset')
  @response(200, {
    description: 'AssetModel instance',
    content: {'application/json': {schema: getModelSchemaRef(AssetModel)}},
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
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
    const userId = this.getCurrentUserId();
    this.logger.info(
      `AssetController - create - Creating asset for user ${userId}`,
    );
    const result = await this.assetService.create(
      userId,
      omitServerManagedFields(asset, ['folderId']),
    );

    void queueAssetThumbnailGeneration((result as AssetModel)?.id, {
      authorization: this.request.headers.authorization,
      apiOrigin: getRequestOrigin(this.request),
    });
    return result;
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
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async find(
    @param.filter(AssetModel) filter?: Filter<AssetModel>,
    @param.query.string('folderFilter') folderFilter?: string,
    @param.query.string('onlyRootLevel') onlyRootLevel?: boolean,
    @param.query.string('includeFolders') includeFolders?: boolean,
  ): Promise<
    {
      id: string;
      name: string;
      owner: string;
      public: boolean;
      description: string;
      createdDate: string;
      updatedDate: string;
      isFolder?: boolean;
      assetCount?: number;
      folderCount?: number;
      locationPath: string;
    }[]
  > {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `AssetController - find - Fetching assets for user ${userId}`,
    );
    const assets = await this.assetService.find(userId, filter);
    const allFolders = await this.folderService.find(
      userId,
      JSON.parse(folderFilter || '{}') as Filter<FolderModel>,
    );

    const buildFolderPath = createFolderPathResolver(allFolders);

    const assetsWithPath = _.filter(
      assets,
      asset => !onlyRootLevel || !asset.folderId,
    ).map(asset => {
      const locationPath = buildFolderPath(asset.folderId);
      return {
        ..._.omit(asset, ['folderId']),
        locationPath,
      };
    });

    const foldersWithPath = _.filter(
      allFolders,
      folder => !onlyRootLevel || !folder.parentId,
    ).map(folder => {
      const locationPath = buildFolderPath(folder.parentId);
      return {
        ..._.omit(folder, ['parentId']),
        locationPath,
      };
    });

    if (includeFolders) {
      const orderFilter = _.get(filter, 'order[0]', 'createdDate DESC');
      const [orderByField, orderByDirection] = orderFilter.split(' ');
      return _.orderBy(
        [
          ...assetsWithPath,
          ...foldersWithPath.map(folder => ({
            id: folder.id,
            name: folder.name,
            public: false,
            owner: folder.owner,
            createdDate: folder.createdDate,
            updatedDate: folder.updatedDate,
            description: '',
            isFolder: true,
            assetCount: folder.assets ? folder.assets.length : 0,
            folderCount: folder.children ? folder.children.length : 0,
            locationPath: folder.locationPath,
          })),
        ],
        [orderByField],
        [orderByDirection.toLowerCase() as 'asc' | 'desc'],
      );
    }
    return assetsWithPath;
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
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async findById(
    @param.path.string('id') id: string,
    @param.filter(AssetModel, {exclude: 'where'})
    filter?: FilterExcludingWhere<AssetModel>,
  ): Promise<AssetModel> {
    const userId = this.getCurrentUserId();
    // const orgMembers = await getUsersOrganizationMembers(userId);
    // logger.info(`route</asset/{id}> Fetching asset- ${id}`);
    // logger.debug(`Finding asset- ${id} with filter- ${JSON.stringify(filter)}`);
    this.logger.info(
      `AssetController - findById - Fetching asset ${id} for user ${userId}`,
    );
    return assertServiceResult(
      await this.assetService.findById([userId], id, filter),
    );
  }

  @patch('/asset/{id}')
  @response(204, {
    description: 'Asset PATCH success',
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
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
  ): Promise<void> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `AssetController - updateById - Updating asset ${id} for user ${userId}`,
    );
    // Folder moves go through /folder/add-asset.
    assertServiceResult(
      await this.assetService.updateById(
        userId,
        id,
        omitServerManagedFields(asset, ['folderId']),
      ),
    );
    void queueAssetThumbnailGeneration(id, {
      authorization: this.request.headers.authorization,
      apiOrigin: getRequestOrigin(this.request),
    });
  }

  @del('/asset/{id}')
  @response(204, {
    description: 'Asset DELETE success',
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async deleteById(@param.path.string('id') id: string): Promise<void> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `AssetController - deleteById - Deleting asset ${id} for user ${userId}`,
    );
    assertServiceResult(await this.assetService.deleteById(userId, id));
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
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async duplicate(
    @param.path.string('id') id: string,
  ): Promise<AssetModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `AssetController - duplicate - Duplicating asset ${id} for user ${userId}`,
    );
    // The service copies any asset by id, so check read access first.
    assertServiceResult(await this.assetService.findById([userId], id));
    return this.assetService.duplicate(userId, id);
  }
}
