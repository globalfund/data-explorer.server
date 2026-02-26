import {inject, service} from '@loopback/core';
import {
  get,
  param,
  patch,
  post,
  Request,
  requestBody,
  response,
  RestBindings,
} from '@loopback/rest';
import axios, {AxiosResponse} from 'axios';
import {ReportModel} from 'rb-core-middleware/dist/models';
import {ReportService} from 'rb-core-middleware/dist/services';
import {handleDataApiError} from '../utils/dataApiError';
import {renderChartData} from '../utils/renderChart';

export class ReportBuilderController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private req: Request,
    @service(ReportService) private reportService: ReportService,
  ) {}

  @post('/report-builder/render-chart-data')
  @response(200)
  async renderChart(@requestBody() body: any) {
    try {
      return await renderChartData(body);
    } catch (e) {
      handleDataApiError(e);
    }
  }

  @post('/report-builder/reports')
  @response(200)
  async createReport(@requestBody() body: Omit<ReportModel, 'id'>) {
    try {
      return await this.reportService.create('anonymous', body);
    } catch (e) {
      handleDataApiError(e);
    }
  }

  @get('/report-builder/reports')
  @response(200)
  async getReports() {
    try {
      return await this.reportService.find('anonymous');
    } catch (e) {
      handleDataApiError(e);
    }
  }
  @patch('/report-builder/reports/{id}')
  @response(200)
  async patchReport(
    @param.path.string('id') id: string,
    @requestBody() body: ReportModel,
  ) {
    try {
      return await this.reportService.updateById('anonymous', id, body);
    } catch (e) {
      handleDataApiError(e);
    }
  }

  @get('/report-builder/reports/{id}')
  @response(200)
  async getReport(@param.path.string('id') id: string) {
    try {
      return await this.reportService.findById(['anonymous'], id);
    } catch (e) {
      handleDataApiError(e);
    }
  }

  @get('/report-builder/gf-sample-dataset/{datasetId}')
  @response(200)
  async getSampleGFDataset(@param.path.string('datasetId') datasetId: string) {
    return axios
      .get(`${process.env.BACKEND_API_BASE_URL}/sample-data/${datasetId}`, {
        headers: {
          Authorization: 'ZIMMERMAN',
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
          Authorization: 'ZIMMERMAN',
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
