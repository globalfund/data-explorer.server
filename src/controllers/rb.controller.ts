import {inject} from '@loopback/core';
import {
  get,
  param,
  post,
  Request,
  requestBody,
  response,
  RestBindings,
} from '@loopback/rest';
import axios, {AxiosResponse} from 'axios';
import {handleDataApiError} from '../utils/dataApiError';
import {renderChartData} from '../utils/renderChart';

let host = process.env.BACKEND_SUBDOMAIN
  ? 'data-explorer-backend'
  : 'localhost';
if (process.env.ENV_TYPE !== 'prod')
  host = process.env.ENV_TYPE
    ? `data-explorer-backend-${process.env.ENV_TYPE}`
    : host;

export class ReportBuilderController {
  constructor(@inject(RestBindings.Http.REQUEST) private req: Request) {}

  @post('/report-builder/render-chart-data')
  @response(200)
  async renderChart(@requestBody() body: any) {
    try {
      return await renderChartData(body);
    } catch (e) {
      handleDataApiError(e);
    }
  }

  @get('/report-builder/gf-sample-dataset/{datasetId}')
  @response(200)
  async getSampleGFDataset(@param.path.string('datasetId') datasetId: string) {
    return axios
      .get(`http://${host}:5000/sample-data/${datasetId}`, {
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
      .get(`http://${host}:5000/dataset/${datasetId}`, {
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
