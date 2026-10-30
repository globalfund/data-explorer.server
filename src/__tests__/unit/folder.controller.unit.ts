import {securityId} from '@loopback/security';
import {expect, sinon} from '@loopback/testlab';
import {FolderService} from 'rb-core-middleware/dist/services';
import * as redisUtils from 'rb-core-middleware/dist/utils/redis';
import {Logger} from 'winston';
import {FolderController} from '../../controllers/report-builder/folder.controller';

type Doc = {id: string; owner: string; parentId?: string; folderId?: string};

const USER = 'auth0|me';
const OTHER = 'auth0|someone-else';

const byId = (docs: Doc[]) => async (id: string) => {
  const doc = docs.find(d => d.id === id);
  if (!doc) throw Object.assign(new Error('not found'), {statusCode: 404});
  return doc;
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

const givenController = ({
  folders = [] as Doc[],
  reports = [] as Doc[],
  assets = [] as Doc[],
} = {}) => {
  const service = {
    folderRepository: {
      findById: sinon.spy(byId(folders)),
      findOne: async ({where}: {where: {id: string}}) =>
        folders.find(f => f.id === where.id) ?? null,
      updateAll: sinon.stub().resolves({count: 0}),
    },
    reportRepository: {
      findById: sinon.spy(byId(reports)),
      updateAll: sinon.stub().resolves({count: 0}),
    },
    assetRepository: {
      findById: sinon.spy(byId(assets)),
      updateById: sinon.stub().resolves(),
      updateAll: sinon.stub().resolves({count: 0}),
    },
    create: sinon.stub().resolves({id: 'new'}),
    findById: sinon.stub().resolves({id: 'f1'}),
    updateById: sinon.stub().resolves(),
    deleteById: sinon.stub().resolves(),
    duplicate: sinon.stub().resolves({id: 'copy'}),
    addReport: sinon.stub().resolves({id: 'f1'}),
    addAsset: sinon.stub().resolves({id: 'f1'}),
    addFolder: sinon.stub().resolves({id: 'f1'}),
  };
  const logger = {info: () => undefined} as unknown as Logger;
  const controller = new FolderController(
    logger,
    service as unknown as FolderService,
    {[securityId]: USER, id: USER},
  );
  return {controller, service};
};

describe('FolderController (unit)', () => {
  describe('create', () => {
    it('ignores client-supplied owner/visibility and sets the current user', async () => {
      const {controller, service} = givenController();
      await controller.create({
        name: 'F',
        owner: OTHER,
        public: true,
        baseline: true,
      } as never);
      sinon.assert.calledWith(service.create, USER, {name: 'F'});
    });

    it('rejects creating inside a folder the user does not own', async () => {
      const {controller, service} = givenController({
        folders: [{id: 'theirs', owner: OTHER}],
      });
      await expectStatus(
        controller.create({name: 'F', parentId: 'theirs'} as never),
        403,
      );
      sinon.assert.notCalled(service.create);
    });

    it('treats the __root__ parent as no parent', async () => {
      const {controller, service} = givenController();
      await controller.create({name: 'F', parentId: '__root__'} as never);
      sinon.assert.calledWith(service.create, USER, {name: 'F'});
    });
  });

  describe('updateById', () => {
    it('maps the service unauthorized result to a 403', async () => {
      const {controller, service} = givenController();
      service.updateById.resolves({error: 'Unauthorized'});
      await expectStatus(controller.updateById('f1', {} as never), 403);
    });

    it('does not let a PATCH move the folder', async () => {
      const {controller, service} = givenController();
      await controller.updateById('f1', {name: 'N', parentId: 'x'} as never);
      sinon.assert.calledWith(service.updateById, USER, 'f1', {name: 'N'});
    });
  });

  describe('deleteById', () => {
    it('moves the contents up to the parent before deleting', async () => {
      const deleteCache = sinon
        .stub(redisUtils, 'handleDeleteCache')
        .resolves();
      try {
        const {controller, service} = givenController({
          folders: [{id: 'f1', owner: USER, parentId: 'parent'}],
        });
        await controller.deleteById('f1');
        const moved = {folderId: 'parent'};
        sinon.assert.calledWithMatch(
          service.reportRepository.updateAll,
          moved,
          {folderId: 'f1'},
        );
        sinon.assert.calledWithMatch(service.assetRepository.updateAll, moved, {
          folderId: 'f1',
        });
        sinon.assert.calledWithMatch(
          service.folderRepository.updateAll,
          {parentId: 'parent'},
          {parentId: 'f1'},
        );
        sinon.assert.calledWith(service.deleteById, USER, 'f1');
        sinon.assert.callOrder(
          service.reportRepository.updateAll,
          service.deleteById,
        );
      } finally {
        deleteCache.restore();
      }
    });

    it("moves a root folder's contents to the workspace root", async () => {
      const {controller, service} = givenController({
        folders: [{id: 'f1', owner: USER}],
      });
      await controller.deleteById('f1');
      sinon.assert.calledWithMatch(
        service.reportRepository.updateAll,
        {folderId: undefined},
        {folderId: 'f1'},
      );
    });

    it("leaves someone else's folder and its contents alone", async () => {
      const {controller, service} = givenController({
        folders: [{id: 'f1', owner: OTHER}],
      });
      await expectStatus(controller.deleteById('f1'), 403);
      sinon.assert.notCalled(service.reportRepository.updateAll);
      sinon.assert.notCalled(service.deleteById);
    });
  });

  describe('duplicate', () => {
    it('requires read access to the source folder', async () => {
      const {controller, service} = givenController();
      service.findById.resolves({error: 'Unauthorized', name: 'F'});
      await expectStatus(controller.duplicate('f1'), 403);
      sinon.assert.notCalled(service.duplicate);
    });
  });

  describe('addReportToFolder', () => {
    it("rejects moving someone else's report, including to the root", async () => {
      const {controller, service} = givenController({
        reports: [{id: 'r1', owner: OTHER}],
      });
      await expectStatus(controller.addReportToFolder('__root__', 'r1'), 403);
      await expectStatus(controller.addReportToFolder('f1', 'r1'), 403);
      sinon.assert.notCalled(service.addReport);
    });

    it('passes the previous folder of an owned report', async () => {
      const {controller, service} = givenController({
        reports: [{id: 'r1', owner: USER, folderId: 'old'}],
      });
      await controller.addReportToFolder('f1', 'r1');
      sinon.assert.calledWith(service.addReport, USER, 'f1', 'r1', 'old');
    });
  });

  describe('addAssetToFolder', () => {
    it("rejects moving someone else's asset", async () => {
      const {controller, service} = givenController({
        assets: [{id: 'a1', owner: OTHER}],
      });
      await expectStatus(controller.addAssetToFolder('f1', 'a1'), 403);
      await expectStatus(controller.addAssetToFolder('__root__', 'a1'), 403);
      sinon.assert.notCalled(service.addAsset);
      sinon.assert.notCalled(service.assetRepository.updateById);
    });

    it('moves an owned asset to the root without looking up a __root__ folder', async () => {
      const deleteCache = sinon
        .stub(redisUtils, 'handleDeleteCache')
        .resolves();
      try {
        const {controller, service} = givenController({
          assets: [{id: 'a1', owner: USER, folderId: 'old'}],
        });
        const result = await controller.addAssetToFolder('__root__', 'a1');
        expect(result).to.containEql({id: '__root__'});
        sinon.assert.notCalled(service.addAsset);
        sinon.assert.calledWithMatch(service.assetRepository.updateById, 'a1', {
          folderId: undefined,
        });
        sinon.assert.calledWithMatch(deleteCache, {
          asset: 'folder',
          assetId: 'old',
          userId: USER,
        });
      } finally {
        deleteCache.restore();
      }
    });
  });

  describe('addFolderToFolder', () => {
    const folders = [
      {id: 'a', owner: USER, parentId: undefined},
      {id: 'b', owner: USER, parentId: 'a'},
      {id: 'c', owner: USER, parentId: 'b'},
      {id: 'theirs', owner: OTHER},
    ];

    it('rejects moving a folder into itself or a descendant', async () => {
      const {controller, service} = givenController({folders});
      await expectStatus(controller.addFolderToFolder('a', 'a'), 400);
      await expectStatus(controller.addFolderToFolder('c', 'a'), 400);
      sinon.assert.notCalled(service.addFolder);
    });

    it("rejects moving someone else's folder", async () => {
      const {controller, service} = givenController({folders});
      await expectStatus(
        controller.addFolderToFolder('__root__', 'theirs'),
        403,
      );
      sinon.assert.notCalled(service.addFolder);
    });

    it('moves an owned folder and passes its previous parent', async () => {
      const {controller, service} = givenController({folders});
      await controller.addFolderToFolder('a', 'c');
      sinon.assert.calledWith(service.addFolder, USER, 'a', 'c', 'b');
    });
  });
});
