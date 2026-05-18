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
  Response,
  response,
  RestBindings,
} from '@loopback/rest';
import axios, {AxiosResponse} from 'axios';
import fs from 'fs/promises';
import _ from 'lodash';
import {FolderModel, ReportModel} from 'rb-core-middleware/dist/models';
import {FolderService, ReportService} from 'rb-core-middleware/dist/services';
import {Logger} from 'winston';
import {queueReportThumbnailGeneration} from '../../queues/report.queue';
import {handleDataApiError} from '../../utils/dataApiError';
import {ExportFormat, exportReport} from '../../utils/exportReport';
import {renderChartData} from '../../utils/renderChart';

export class ReportController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private req: Request,
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @inject('services.logger') private logger: Logger,
    @inject('services.ReportService') private reportService: ReportService,
    @inject('services.FolderService') private folderService: FolderService,
  ) {}

  @post('/report/render-chart-data')
  @response(200)
  async renderChart(@requestBody() body: any) {
    try {
      return await renderChartData(body);
    } catch (e) {
      handleDataApiError(e);
    }
  }

  @post('/report')
  @response(200, {
    description: 'ReportModel instance',
    content: {'application/json': {schema: getModelSchemaRef(ReportModel)}},
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
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
    const userId = _.get(this.req, 'user.sub', 'anonymous');
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
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async find(
    @param.filter(ReportModel) filter?: Filter<ReportModel>,
    @param.query.string('includeFolders') includeFolders?: boolean,
    @param.filter(FolderModel) folderFilter?: Filter<FolderModel>,
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
      reportCount?: number;
    }[]
  > {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `ReportController - find - Fetching reports for user ${userId}`,
    );
    if (includeFolders) {
      const reports = await this.reportService.find(userId, filter);
      const folders = await this.folderService.find(userId, folderFilter);
      const orderFilter = _.get(filter, 'order[0]', 'createdDate DESC');
      const [orderByField, orderByDirection] = orderFilter.split(' ');
      return _.orderBy(
        [
          ...reports,
          ...folders.map(folder => ({
            id: folder.id,
            name: folder.name,
            public: false,
            owner: folder.owner,
            createdDate: folder.createdDate,
            updatedDate: folder.updatedDate,
            description: '',
            isFolder: true,
            assetCount: folder.assets ? folder.assets.length : 0,
            reportCount: folder.reports ? folder.reports.length : 0,
          })),
        ],
        [orderByField],
        [orderByDirection.toLowerCase() as 'asc' | 'desc'],
      );
    }
    return this.reportService.find(userId, filter);
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
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async findById(
    @param.path.string('id') id: string,
    @param.filter(ReportModel, {exclude: 'where'})
    filter?: FilterExcludingWhere<ReportModel>,
  ): Promise<ReportModel | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
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
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
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
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `ReportController - updateById - Updating report ${id} for user ${userId}`,
    );
    const updateResult = await this.reportService.updateById(
      userId,
      id,
      report,
    );
    await queueReportThumbnailGeneration(id);
    return updateResult;
  }

  @put('/report/{id}')
  @response(204, {
    description: 'Report PUT success',
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async replaceById(
    @param.path.string('id') id: string,
    @requestBody() report: ReportModel,
  ): Promise<void | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `ReportController - replaceById - Replacing report ${id} for user ${userId}`,
    );
    return this.reportService.replaceById(id, userId, report);
  }

  @del('/report/{id}')
  @response(204, {
    description: 'Report DELETE success',
  })
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async deleteById(
    @param.path.string('id') id: string,
  ): Promise<void | {error: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
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
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async duplicate(
    @param.path.string('id') id: string,
  ): Promise<ReportModel | {error: string; errorType: string}> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
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
  async getSampleGFDataset(@param.path.string('datasetId') datasetId: string) {
    return axios
      .get(`${process.env.BACKEND_API_BASE_URL}/sample-data/${datasetId}`, {
        headers: {
          Authorization: process.env.GF_BACKEND_API_KEY,
        },
      })
      .then((resp: AxiosResponse) => {
        return {data: resp.data};
      })
      .catch(handleDataApiError);
  }

  @get('/report-builder/gf-dataset/{datasetId}')
  @response(200)
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
  // @authenticate({strategy: 'auth0-jwt', options: {scopes: ['greet']}})
  async exportReport(
    @param.path.string('id') id: string,
    @param.path.string('format') format: ExportFormat,
  ) {
    const result = await exportReport(id, format);

    this.response.setHeader('Content-Type', result.mimeType);
    this.response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    this.response.setHeader('Content-Length', result.data.length);

    this.response.send(result.data);

    return this.response;
  }
}
