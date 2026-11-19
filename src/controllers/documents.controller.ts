import {inject} from '@loopback/core';
import {get, Request, response, RestBindings} from '@loopback/rest';
import axios, {AxiosResponse} from 'axios';
import _ from 'lodash';
import DocumentsListMapping from '../config/mapping/documents/list.json';
import urls from '../config/urls/index.json';
import {handleDataApiError} from '../utils/dataApiError';
import {filterDocuments} from '../utils/filtering/documents';

export class DocumentsController {
  constructor(@inject(RestBindings.Http.REQUEST) private req: Request) {}

  @get('/documents')
  @response(200)
  async documents() {
    const filterString = await filterDocuments(
      this.req.query,
      DocumentsListMapping.urlParams,
    );
    const url = `${urls.DOCUMENTS}${filterString}`;

    if (url.indexOf('filter()') > -1) {
      console.log('Invalid filter in URL:', url);
      return {data: []};
    }

    return axios
      .get(url)
      .then((resp: AxiosResponse) => {
        const raw = _.get(resp.data, DocumentsListMapping.dataPath, []);

        const groupedByLocation = _.groupBy(
          raw,
          DocumentsListMapping.geography,
        );

        return {
          data: _.orderBy(
            _.map(groupedByLocation, (locationObj, location) => {
              const groupedByType = _.groupBy(
                locationObj,
                DocumentsListMapping.type,
              );

              return {
                name: location,
                documents: Object.keys(locationObj).length,
                _children: _.map(groupedByType, (typeObj, type) => {
                  const groupedBySubType = _.groupBy(
                    typeObj,
                    DocumentsListMapping.subType,
                  );
                  return {
                    name: type,
                    documents: Object.keys(typeObj).length,
                    _children: _.map(
                      groupedBySubType,
                      (subTypeObj, subType) => ({
                        name: subType,
                        documents: Object.keys(subTypeObj).length,
                        _children: _.map(subTypeObj, doc => ({
                          name: _.get(doc, DocumentsListMapping.title, ''),
                          documents: _.get(doc, DocumentsListMapping.url, ''),
                        })),
                      }),
                    ),
                  };
                }),
              };
            }),
            'name',
            'asc',
          ),
        };
      })
      .catch(handleDataApiError);
  }
}
