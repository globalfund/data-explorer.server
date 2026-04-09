import {
  AuthenticationComponent,
  registerAuthenticationStrategy,
} from '@loopback/authentication';
import {BootMixin} from '@loopback/boot';
import {ApplicationConfig, BindingFromClassOptions} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {RestApplication} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import {
  RbCoreMiddlewareComponent,
  RbCoreMiddlewareComponentOptions,
} from 'rb-core-middleware';
import {Logger} from 'winston';
import {
  JWTAuthenticationStrategy,
  JWTServiceProvider,
  KEY,
} from './authentication-strategies';
import {DbDataSource, DbDataSourceConfig} from './datasources';
import {FILE_UPLOAD_SERVICE, STORAGE_DIRECTORY} from './keys';
import {LoggerProvider} from './providers/logger.provider';

dotenv.config();

dotenv.config();

export {ApplicationConfig};

const RbCoreMiddlewareComponentConfig: RbCoreMiddlewareComponentOptions = {
  REDIS_PORT: process.env.REDIS_PORT,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_USERNAME: process.env.REDIS_USERNAME,
  datasourceDB: new DbDataSource(),
};

export class ApiApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    this.component(AuthenticationComponent);

    this.service(JWTServiceProvider);

    registerAuthenticationStrategy(this, JWTAuthenticationStrategy);
    this.configure(KEY).to({
      jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256'],
    });

    // Set up default home page
    this.static('/', path.join(__dirname, '../public'));

    this.bind('datasources.config.db').to(DbDataSourceConfig);
    this.bind('datasources.db').toClass(DbDataSource);

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/api-explorer',
      indexTitle: 'The Data Explorer API',
    });
    this.component(RestExplorerComponent);
    this.component(
      RbCoreMiddlewareComponent,
      RbCoreMiddlewareComponentConfig as BindingFromClassOptions,
    );
    this.bind<Logger>('services.logger').toProvider(LoggerProvider);

    // Configure file upload with multer options
    this.configureFileUpload(options.fileStorageDirectory);

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

  /**
   * Configure `multer` options for file upload
   */
  protected configureFileUpload(destination?: string) {
    // Upload files to `dist/.sandbox` by default
    destination =
      destination ?? path.join(__dirname, '../public/report-thumbnail');
    this.bind(STORAGE_DIRECTORY).to(destination);
    const multerOptions: multer.Options = {
      storage: multer.diskStorage({
        destination,
        // Use the original file name as is
        filename: (req, file, cb) => {
          cb(null, file.originalname);
        },
      }),
    };
    // Configure the file upload service with multer options
    this.configure(FILE_UPLOAD_SERVICE).to(multerOptions);
  }
}
