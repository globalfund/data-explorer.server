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
  put,
  Request,
  requestBody,
  Response,
  response,
  RestBindings,
} from '@loopback/rest';
import {securityId, UserProfile} from '@loopback/security';
import axios, {AxiosResponse} from 'axios';
import fs from 'fs/promises';
import _ from 'lodash';
import {FolderModel, ReportModel} from 'rb-core-middleware/dist/models';
import {FolderService, ReportService} from 'rb-core-middleware/dist/services';
import {getCache, setCache} from 'rb-core-middleware/dist/utils/redis';
import {Logger} from 'winston';
import {queueReportThumbnailGeneration} from '../../queues/report.queue';
import {handleDataApiError} from '../../utils/dataApiError';
import {ExportFormat, exportReport} from '../../utils/exportReport';
import {
  filterDataset,
  getFilterOptions,
  SortOption,
} from '../../utils/filterDataset';
import {rateLimitErrorReport} from '../../utils/rateLimit';
import {renderChartData} from '../../utils/renderChart';
import {sendErrorReportToSlack} from '../../utils/slackWebhook';

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

export class ReportController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private request: Request,
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @inject('services.logger') private logger: Logger,
    @inject('services.ReportService') private reportService: ReportService,
    @inject('services.FolderService') private folderService: FolderService,
    @inject(AuthenticationBindings.CURRENT_USER, {optional: true})
    private currentUserProfile?: UserProfile,
  ) {}

  private getCurrentUser() {
    return this.currentUserProfile;
  }

  private getCurrentUserId(): string {
    const user = this.getCurrentUser();
    return (
      user?.id ??
      (typeof user?.[securityId] === 'string' ? user[securityId] : undefined) ??
      'anonymous'
    );
  }

  @post('/report/render-chart-data')
  @response(200)
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async renderChart(@requestBody() body: any) {
    try {
      return await renderChartData(body);
    } catch (e) {
      handleDataApiError(e);
    }
  }

  @post('/report/filter-dataset')
  @response(200)
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async filterDataset(
    @param.query.string('page') page: string,
    @param.query.string('pageSize') pageSize: string,
    @requestBody()
    body: {
      filters: Record<string, any[]>;
      sorting: SortOption[];
      datasetId: string;
      limitToTop: boolean;
      limitToTopValue: string;
      groupRemainderAsOther: boolean;
    },
  ) {
    try {
      return await filterDataset({
        appliedFilters: body.filters,
        sortOptions: body.sorting,
        datasetId: body.datasetId,
        page: page,
        pageSize: pageSize,
        limitToTop: body.limitToTop,
        limitToTopValue: body.limitToTopValue,
        groupRemainderAsOther: body.groupRemainderAsOther,
      });
    } catch (e) {
      handleDataApiError(e);
    }
  }

  @post('/report/filter-options')
  @response(200)
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async getFilterOptions(
    @requestBody() body: {filters: any; datasetId: string},
  ) {
    try {
      return await getFilterOptions({
        appliedFilters: body.filters,
        datasetId: body.datasetId,
      });
    } catch (e) {
      handleDataApiError(e);
    }
  }

  @post('/report')
  @response(200, {
    description: 'ReportModel instance',
    content: {'application/json': {schema: getModelSchemaRef(ReportModel)}},
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(ReportModel, {
            title: 'NewReport',
            exclude: ['id'],
          }),
        },
      },
    })
    report: Omit<ReportModel, 'id'>,
  ): Promise<ReportModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ReportController - create - Creating report for user ${userId}`,
    );
    const result = await this.reportService.create(userId, report);
    const reportId = _.get(result, 'id');
    if (reportId) {
      try {
        await fs.copyFile(
          `./public/report-thumbnail/default.png`,
          `./public/report-thumbnail/${reportId}.png`,
        );
      } catch (error) {
        this.logger.info(
          `ReportController - create - Default thumbnail not found, skipping thumbnail creation for report ${reportId}`,
        );
      }
    }
    return result;
  }

  @get('/reports')
  @response(200, {
    description: 'Array of ReportModel instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(ReportModel, {includeRelations: true}),
        },
      },
    },
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async find(
    @param.filter(ReportModel) filter?: Filter<ReportModel>,
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
      reportCount?: number;
      folderCount?: number;
      locationPath: string;
    }[]
  > {
    const userId = this.getCurrentUserId();
    console.log(userId);
    this.logger.info(
      `ReportController - find - Fetching reports for user ${userId}`,
    );
    const reports = await this.reportService.find(userId, filter);
    const allFolders = await this.folderService.find(
      userId,
      JSON.parse(folderFilter || '{}') as Filter<FolderModel>,
    );

    const folderById = new Map<string, FolderModel>(
      allFolders.map(f => [f.id, f]),
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

    const reportsWithPath = _.filter(
      reports,
      report => !onlyRootLevel || !report.folderId,
    ).map(report => {
      const locationPath = buildFolderPath(report.folderId);
      return {
        ..._.omit(report, ['folderId']),
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
          ...reportsWithPath,
          ...foldersWithPath.map(folder => ({
            id: folder.id,
            name: folder.name,
            public: false,
            owner: folder.owner,
            createdDate: folder.createdDate,
            updatedDate: folder.updatedDate,
            description: '',
            isFolder: true,
            reportCount: folder.reports ? folder.reports.length : 0,
            folderCount: folder.children ? folder.children.length : 0,
            locationPath: folder.locationPath,
          })),
        ],
        [orderByField],
        [orderByDirection.toLowerCase() as 'asc' | 'desc'],
      );
    }
    return reportsWithPath;
  }

  @get('/report/{id}')
  @response(200, {
    description: 'ReportModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(ReportModel, {includeRelations: true}),
      },
    },
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async findById(
    @param.path.string('id') id: string,
    @param.filter(ReportModel, {exclude: 'where'})
    filter?: FilterExcludingWhere<ReportModel>,
  ): Promise<ReportModel | {error: string}> {
    const userId = this.getCurrentUserId();
    // const orgMembers = await getUsersOrganizationMembers(userId);
    // logger.info(`route</report/{id}> Fetching report- ${id}`);
    // logger.debug(`Finding report- ${id} with filter- ${JSON.stringify(filter)}`);
    this.logger.info(
      `ReportController - findById - Fetching report ${id} for user ${userId}`,
    );
    return this.reportService.findById([userId], id, filter);
  }

  @patch('/report/{id}')
  @response(204, {
    description: 'Report PATCH success',
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(ReportModel, {partial: true}),
        },
      },
    })
    report: ReportModel,
  ): Promise<void | {error: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ReportController - updateById - Updating report ${id} for user ${userId}`,
    );
    const updateResult = await this.reportService.updateById(
      userId,
      id,
      report,
    );
    await queueReportThumbnailGeneration(id, {
      authorization: this.request.headers.authorization,
      apiOrigin: getRequestOrigin(this.request),
    });
    return updateResult;
  }

  @put('/report/{id}')
  @response(204, {
    description: 'Report PUT success',
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async replaceById(
    @param.path.string('id') id: string,
    @requestBody() report: ReportModel,
  ): Promise<void | {error: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ReportController - replaceById - Replacing report ${id} for user ${userId}`,
    );
    return this.reportService.replaceById(id, userId, report);
  }

  @del('/report/{id}')
  @response(204, {
    description: 'Report DELETE success',
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async deleteById(
    @param.path.string('id') id: string,
  ): Promise<void | {error: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ReportController - deleteById - Deleting report ${id} for user ${userId}`,
    );
    try {
      await fs.unlink(`./public/report-thumbnail/${id}.png`);
    } catch (error) {
      this.logger.info(
        `ReportController - deleteById - Thumbnail not found for report ${id}`,
      );
    }
    return this.reportService.deleteById(userId, id);
  }

  @get('/report/duplicate/{id}')
  @response(200, {
    description: 'ReportModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(ReportModel, {includeRelations: true}),
      },
    },
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async duplicate(
    @param.path.string('id') id: string,
  ): Promise<ReportModel | {error: string; errorType: string}> {
    const userId = this.getCurrentUserId();
    this.logger.info(
      `ReportController - duplicate - Duplicating report ${id} for user ${userId}`,
    );
    const result = await this.reportService.duplicate(userId, id);
    const newReportId = _.get(result, 'id');
    if (newReportId) {
      try {
        await fs.copyFile(
          `./public/report-thumbnail/${id}.png`,
          `./public/report-thumbnail/${newReportId}.png`,
        );
      } catch (error) {
        this.logger.info(
          `ReportController - duplicate - Thumbnail not found for report ${id}, skipping thumbnail duplication`,
        );
      }
    }
    return result;
  }

  @get('/report-builder/gf-sample-dataset/{datasetId}')
  @response(200)
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async getSampleGFDataset(@param.path.string('datasetId') datasetId: string) {
    const cachedData = await getCache(`sample-data-${datasetId}`);
    if (cachedData) {
      this.logger.info(
        `ReportController - getSampleGFDataset - Returning cached sample dataset`,
      );
      return {data: cachedData};
    }
    return axios
      .get(`${process.env.BACKEND_API_BASE_URL}/sample-data/${datasetId}`, {
        headers: {
          Authorization: process.env.GF_BACKEND_API_KEY,
        },
      })
      .then((resp: AxiosResponse) => {
        const dataToCache = resp.data;
        setCache(`sample-data-${datasetId}`, dataToCache);
        return {data: dataToCache};
      })
      .catch(handleDataApiError);
  }

  @get('/report-builder/gf-dataset/{datasetId}')
  @response(200)
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async getGFDataset(
    @param.path.string('datasetId') datasetId: string,
    @param.query.number('pageSize') pageSize: number,
    @param.query.number('page') page: number,
  ) {
    return axios
      .get(`${process.env.BACKEND_API_BASE_URL}/dataset/${datasetId}`, {
        headers: {
          Authorization: process.env.GF_BACKEND_API_KEY,
        },
        params: {
          page: page,
          page_size: pageSize,
        },
      })
      .then((resp: AxiosResponse) => {
        return {data: resp.data};
      })
      .catch(handleDataApiError);
  }

  @get('/report/{id}/export/{format}')
  @response(200, {
    description: 'ReportModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(ReportModel, {includeRelations: true}),
      },
    },
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async exportReport(
    @param.path.string('id') id: string,
    @param.path.string('format') format: ExportFormat,
    @param.query.boolean('asset') asset: boolean = false,
  ) {
    const result = await exportReport(id, format, asset, {
      authorization: this.request.headers.authorization,
      apiOrigin: getRequestOrigin(this.request),
    });

    this.response.setHeader('Content-Type', result.mimeType);
    this.response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    this.response.setHeader('Content-Length', result.data.length);

    this.response.send(result.data);

    return this.response;
  }

  @post('/report/report-an-error')
  @response(200, {
    description: 'ReportModel instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(ReportModel, {includeRelations: true}),
      },
    },
  })
  @authenticate({strategy: 'auth0', options: {scopes: ['greet']}})
  async reportError(
    @requestBody()
    body: {
      reportId: string;
      reportName: string;
      errorMessage: string;
      details: string;
      action: string;
    },
  ): Promise<{message: string}> {
    const user = this.getCurrentUser();
    const userId = this.getCurrentUserId();
    await rateLimitErrorReport(userId);
    await sendErrorReportToSlack({...body, userId});
    this.logger.info(
      `ReportController - reportError - Error report submitted by ${userId} (${user?.email ?? 'no-email'})`,
    );
    return {message: 'Error reported successfully'};
  }
}
