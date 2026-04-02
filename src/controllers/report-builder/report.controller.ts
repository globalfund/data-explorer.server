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
import axios, {AxiosResponse} from 'axios';
import fs from 'fs/promises';
import _ from 'lodash';
import {ReportModel} from 'rb-core-middleware/dist/models';
import {ReportService} from 'rb-core-middleware/dist/services';
import {Logger} from 'winston';
import {handleDataApiError} from '../../utils/dataApiError';
import {renderChartData} from '../../utils/renderChart';

export class ReportController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private req: Request,
    @inject('services.logger') private logger: Logger,
    @inject('services.ReportService') private reportService: ReportService,
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

  @get('/report/dummy')
  @response(200)
  async dummy() {
    this.logger.info('ReportController - dummy - Dummy endpoint called');
    return this.reportService.create('dummy-user', {
      name: 'Dummy Report',
      nameLower: 'dummy report',
      description: 'This is a dummy report',
      items: [],
      public: false,
      baseline: false,
      owner: 'dummy-user',
      updatedDate: new Date().toISOString(),
      createdDate: new Date().toISOString(),
      settings: {
        width: 800,
        height: 600,
        paddingLeft: 10,
        paddingTop: 10,
        paddingRight: 10,
        paddingBottom: 10,
        stroke: 0,
        strokeColor: '#000000',
        backgroundColor: '#FFFFFF',
        borderRadius: 0,
      },
      getId: function () {
        return '';
      },
      getIdObject: function () {
        return {};
      },
      toJSON: function () {
        return {};
      },
      toObject: function () {
        return {};
      },
    });
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
  ): Promise<ReportModel[]> {
    const userId = _.get(this.req, 'user.sub', 'anonymous');
    this.logger.info(
      `ReportController - find - Fetching reports for user ${userId}`,
    );
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
    return this.reportService.updateById(userId, id, report);
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
}
