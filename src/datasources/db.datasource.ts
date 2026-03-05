import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';
import dotenv from 'dotenv';

dotenv.config();

export const DbDataSourceConfig = {
  name: 'DbDataSource',
  connector: 'mongodb',
  url: '',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 27017,
  user: process.env.DB_USERNAME || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'data-explorer-rb-db',
  useNewUrlParser: true,
  authSource: process.env.DB_AUTHSOURCE || 'admin',
};

// Observe application's life cycle to disconnect the datasource when
// application is stopped. This allows the application to be shut down
// gracefully. The `stop()` method is inherited from `juggler.DataSource`.
// Learn more at https://loopback.io/doc/en/lb4/Life-cycle.html
@lifeCycleObserver('datasource')
export class DbDataSource
  extends juggler.DataSource
  implements LifeCycleObserver
{
  static dataSourceName = 'DbDataSource';
  static readonly defaultConfig = DbDataSourceConfig;

  constructor(
    @inject('datasources.config.DbDataSource', {optional: true})
    dsConfig: object = DbDataSourceConfig,
  ) {
    super(dsConfig);
  }
}
