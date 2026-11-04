import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {Filter, FilterExcludingWhere} from '@loopback/filter/dist/query';
import {
  del,
  get,
  getModelSchemaRef,
  HttpErrors,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {securityId, UserProfile} from '@loopback/security';
import _ from 'lodash';
import {FolderModel} from 'rb-core-middleware/dist/models';
import {FolderService} from 'rb-core-middleware/dist/services';
import {handleDeleteCache} from 'rb-core-middleware/dist/utils/redis';
import {Logger} from 'winston';
import {
  assertOwner,
  assertServiceResult,
  omitServerManagedFields,
} from '../../utils/access';
import {
  buildFolderTree,
  createFolderPathResolver,
} from '../../utils/folderTree';

const ROOT_FOLDER_ID = '__root__';

export class FolderController {
  constructor(
    @inject('services.logger') private logger: Logger,
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

  /**
   * Walks up from the target parent; reaching the moved folder means the move
   * would create a cycle (which makes folder path building recurse forever).
   */
  private async assertNotMovingIntoItself(
    folderId: string,
    targetParentId: string,
  ) {
    const visited = new Set<string>();
    let currentId: string | undefined = targetParentId;
    while (currentId && !visited.has(currentId)) {
      if (currentId === folderId) {
        throw new HttpErrors.BadRequest(
          'Cannot move a folder into itself or one of its subfolders',
        );
      }
      visited.add(currentId);
      const current: FolderModel | null =
        await this.folderService.folderRepository.findOne({
          where: {id: currentId},
        });
      currentId = current?.parentId;
    }
  }

  @post('/folder')
  @response(200, {
    description: 'FolderModel instance',
    content: {'application/json': {schema: getModelSchemaRef(FolderModel)}},
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
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
    const userId = this.getCurrentUserId();
    this.logger.info(
      `FolderController - create - Creating folder for user ${userId}`,
    );
    const newFolder = omitServerManagedFields(folder);
    if (newFolder.parentId === ROOT_FOLDER_ID) {
      delete (newFolder as Partial<FolderModel>).parentId;
    }
    if (newFolder.parentId) {
      const parent = await this.folderService.folderRepository.findById(
        newFolder.parentId,
      );
      assertOwner(parent, userId);
    }
    return this.folderService.create(userId, newFolder);
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
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async find(
    @param.filter(FolderModel) filter?: Filter<FolderModel>,
    @param.query.string('includeSubFolders') includeSubFolders?: string,
  ): Promise<any[]> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `FolderController - find - Fetching folders for user ${userId}`,
    );
    if (Boolean(includeSubFolders)) {
      // Built here rather than with getAllFoldersWithSubfolders, which throws
      // when a folder's parent is missing from the results.
      return buildFolderTree(await this.folderService.find(userId, filter));
    } else {
      const folders = await this.folderService.find(userId, filter);
      const buildFolderPath = createFolderPathResolver(folders);

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

  @get('/folder/{id}')
  @response(200, {
    description: 'FolderModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(FolderModel, {includeRelations: true}),
      },
    },
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async findById(
    @param.path.string('id') id: string,
    @param.filter(FolderModel, {exclude: 'where'})
    filter?: FilterExcludingWhere<FolderModel>,
  ): Promise<FolderModel> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `FolderController - findById - Fetching folder ${id} for user ${userId}`,
    );
    return assertServiceResult(
      await this.folderService.findById([userId], id, filter),
    );
  }

  @patch('/folder/{id}')
  @response(204, {
    description: 'Folder PATCH success',
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
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
  ): Promise<void> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `FolderController - updateById - Updating folder ${id} for user ${userId}`,
    );
    // Moves go through /folder/add-folder so the parent ownership and cycle
    // checks can't be bypassed.
    assertServiceResult(
      await this.folderService.updateById(
        userId,
        id,
        omitServerManagedFields(folder, ['parentId']),
      ),
    );
  }

  @del('/folder/{id}')
  @response(204, {
    description: 'Folder DELETE success',
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async deleteById(@param.path.string('id') id: string): Promise<void> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `FolderController - deleteById - Deleting folder ${id} for user ${userId}`,
    );
    const folder = await this.folderService.folderRepository.findById(id);
    assertOwner(folder, userId);
    // The service only deletes the folder document. Move its contents up to
    // its parent (or the workspace root) so they aren't left pointing at a
    // folder that no longer exists, which hides them from every listing.
    const parentId = folder.parentId ?? undefined;
    const updatedDate = new Date().toISOString();
    await Promise.all([
      this.folderService.reportRepository.updateAll(
        {folderId: parentId, updatedDate},
        {folderId: id},
      ),
      this.folderService.assetRepository.updateAll(
        {folderId: parentId, updatedDate},
        {folderId: id},
      ),
      this.folderService.folderRepository.updateAll(
        {parentId, updatedDate},
        {parentId: id},
      ),
    ]);
    assertServiceResult(await this.folderService.deleteById(userId, id));
    if (parentId) {
      await handleDeleteCache({asset: 'folder', assetId: parentId, userId});
    }
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
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async duplicate(
    @param.path.string('id') id: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `FolderController - duplicate - Duplicating folder ${id} for user ${userId}`,
    );
    assertServiceResult(await this.folderService.findById([userId], id));
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
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async addAssetToFolder(
    @param.path.string('id') id: string,
    @param.query.string('assetId') assetId: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `FolderController - addAssetToFolder - Adding asset ${assetId} to folder ${id} for user ${userId}`,
    );
    // The service also accepts public/baseline assets, but moving one would
    // pull it out of its owner's folder.
    const asset = await this.folderService.assetRepository.findById(assetId);
    assertOwner(asset, userId);
    if (id === ROOT_FOLDER_ID) {
      // addAsset has no root branch (unlike addReport) and would 404 looking
      // up a folder called __root__.
      await this.folderService.assetRepository.updateById(assetId, {
        folderId: undefined,
        updatedDate: new Date().toISOString(),
      });
      if (asset.folderId) {
        await handleDeleteCache({
          asset: 'folder',
          assetId: asset.folderId,
          userId,
        });
      }
      return {id: ROOT_FOLDER_ID, name: 'My Workspace'} as FolderModel;
    }
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
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async removeAssetFromFolder(
    @param.path.string('id') id: string,
    @param.query.string('assetId') assetId: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
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
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async addReportToFolder(
    @param.path.string('id') id: string,
    @param.query.string('reportId') reportId: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `FolderController - addReportToFolder - Adding report ${reportId} to folder ${id} for user ${userId}`,
    );
    // Required for every target, including the root which the service
    // doesn't check at all.
    const report = await this.folderService.reportRepository.findById(reportId);
    assertOwner(report, userId);
    return this.folderService.addReport(
      userId,
      id,
      reportId,
      report.folderId ?? undefined,
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
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async removeReportFromFolder(
    @param.path.string('id') id: string,
    @param.query.string('reportId') reportId: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
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
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async addFolderToFolder(
    @param.path.string('id') id: string,
    @param.query.string('folderId') folderId: string,
  ): Promise<FolderModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `FolderController - addFolderToFolder - Adding folder ${folderId} to folder ${id} for user ${userId}`,
    );
    const folder = await this.folderService.folderRepository.findById(folderId);
    assertOwner(folder, userId);
    if (id !== ROOT_FOLDER_ID) {
      await this.assertNotMovingIntoItself(folderId, id);
    }
    return this.folderService.addFolder(
      userId,
      id,
      folderId,
      folder.parentId ?? undefined,
    );
  }
}
