import {securityId} from '@loopback/security';
import {expect, sinon} from '@loopback/testlab';
import http from 'http';
import {AddressInfo} from 'net';
import {DatasetService} from 'rb-core-middleware/dist/services';
import {Logger} from 'winston';
import {DatasetController} from '../../controllers/report-builder/dataset.controller';

const USER = 'auth0|me';
const WHO_DATASET = {
  name: 'Life expectancy - Data file: Life expectancy',
  url: 'https://ghoapi.azureedge.net/api/WHOSIS_000001',
  source: 'WHO',
};

const expectStatus = async (promise: Promise<unknown>, status: number) => {
  try {
    await promise;
  } catch (e) {
    expect(e.statusCode).to.equal(status);
    return;
  }
  throw new Error(`expected a ${status} error`);
};

// The service itself is covered in rb-core-middleware.
const givenController = (response = {} as http.ServerResponse) => {
  const service = {
    findOwn: sinon.stub().resolves([]),
    findPublic: sinon.stub().resolves([]),
    externalSourceCounts: sinon.stub().resolves({WHO: 1}),
    searchExternalSources: sinon.stub().resolves([]),
    connectExternalDataset: sinon.stub().resolves({id: 'abc123'}),
    uploadDataset: sinon.stub().resolves({id: 'abc123'}),
  };
  const controller = new DatasetController(
    {} as never,
    {info: sinon.stub(), error: sinon.stub()} as unknown as Logger,
    service as unknown as DatasetService,
    response as never,
    {[securityId]: USER, id: USER},
  );
  return {controller, service};
};

describe('DatasetController (unit)', () => {
  afterEach(() => sinon.restore());

  it('lists the datasets of the current user', async () => {
    const {controller, service} = givenController();
    await controller.findOwn();
    expect(service.findOwn.firstCall.args).to.eql([USER]);
  });

  it('only lists public datasets on the open route', async () => {
    const {controller, service} = givenController();
    await controller.find({limit: 5});
    expect(service.findPublic.firstCall.args).to.eql([{limit: 5}]);
  });

  it('searches the known external sources through the backend', async () => {
    const {controller, service} = givenController();
    await controller.externalSourceSearch('WHO', 'life', 20, 40, 'owner');

    const [params, backend] = service.searchExternalSources.firstCall.args;
    // Only sorting by name is passed on.
    expect(params).to.eql({
      source: 'WHO',
      q: 'life',
      limit: 20,
      offset: 40,
      sortBy: undefined,
    });
    expect(backend.baseUrl).to.be.a.String();

    await expectStatus(controller.externalSourceSearch('HDX'), 400);
    expect(service.searchExternalSources.calledOnce).to.be.true();
  });

  it('connects datasets of the known external sources for the user', async () => {
    const {controller, service} = givenController();
    await controller.connectExternalDataset(WHO_DATASET);
    expect(service.connectExternalDataset.firstCall.args.slice(0, 2)).to.eql([
      USER,
      WHO_DATASET,
    ]);

    await expectStatus(
      controller.connectExternalDataset({...WHO_DATASET, source: 'HDX'}),
      400,
    );
    expect(service.connectExternalDataset.calledOnce).to.be.true();
  });

  describe('uploadDataset', () => {
    let server: http.Server;
    let service: ReturnType<typeof givenController>['service'];

    const upload = async (form: FormData) => {
      const {port} = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}`, {
        method: 'POST',
        body: form,
      });
      return res.status;
    };

    beforeEach(done => {
      server = http.createServer((req, res) => {
        const given = givenController(res);
        service = given.service;
        given.controller
          .uploadDataset(req as never)
          .then(() => 200)
          .catch(e => e.statusCode ?? 500)
          .then(status => {
            res.writeHead(status);
            res.end();
          });
      });
      server.listen(0, '127.0.0.1', done);
    });

    afterEach(done => {
      server.close(done);
    });

    it('passes the uploaded file on for the user, with its utf8 name', async () => {
      const form = new FormData();
      form.append('file', new Blob(['a,b\n1,2\n']), 'Résultats 2024.csv');
      expect(await upload(form)).to.equal(200);

      const [userId, file] = service.uploadDataset.firstCall.args;
      expect(userId).to.equal(USER);
      expect(file.fileName).to.equal('Résultats 2024.csv');
      expect(file.content.toString()).to.equal('a,b\n1,2\n');
    });

    it('rejects requests without a file', async () => {
      const form = new FormData();
      form.append('name', 'No file');
      expect(await upload(form)).to.equal(400);
      expect(service.uploadDataset.called).to.be.false();
    });
  });
});
