import {
  AuthenticationComponent,
  registerAuthenticationStrategy,
} from '@loopback/authentication';
import {BootMixin} from '@loopback/boot';
import {
  ApplicationConfig,
  BindingFromClassOptions,
  BindingScope,
} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {RestApplication} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import dotenv from 'dotenv';
import path from 'path';
import {
  RbCoreMiddlewareComponent,
  RbCoreMiddlewareComponentOptions,
} from 'rb-core-middleware';
import {Logger} from 'winston';
import {Auth0Strategy} from './authentication-strategies';
import {DbDataSource, DbDataSourceConfig} from './datasources';
import {LoggerProvider} from './providers/logger.provider';

dotenv.config();

dotenv.config();

export {ApplicationConfig};

export class ApiApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    this.component(AuthenticationComponent);

    registerAuthenticationStrategy(this, Auth0Strategy);

    // Set up default home page
    this.static('/', path.join(__dirname, '../public'));

    this.bind('datasources.config.db').to(DbDataSourceConfig);
    this.bind('datasources.db')
      .toClass(DbDataSource)
      .inScope(BindingScope.SINGLETON);

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/api-explorer',
      indexTitle: 'The Data Explorer API',
    });
    this.component(RestExplorerComponent);

    const RbCoreMiddlewareComponentConfig: RbCoreMiddlewareComponentOptions = {
      REDIS_PORT: process.env.REDIS_PORT,
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      REDIS_USERNAME: process.env.REDIS_USERNAME,
    };

    this.component(
      RbCoreMiddlewareComponent,
      RbCoreMiddlewareComponentConfig as BindingFromClassOptions,
    );
    this.bind<Logger>('services.logger').toProvider(LoggerProvider);

    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };
  }
}
