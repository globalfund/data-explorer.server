import {expect} from '@loopback/testlab';
import {
  assertOwner,
  assertSafeId,
  assertServiceResult,
  isSafeId,
  omitServerManagedFields,
} from '../../utils/access';

describe('access utils', () => {
  describe('omitServerManagedFields', () => {
    it('drops ownership, visibility and id fields', () => {
      const body = {
        id: 'x',
        owner: 'attacker',
        public: true,
        baseline: true,
        createdDate: 'a',
        updatedDate: 'b',
        name: 'Report',
        items: [],
      };
      expect(omitServerManagedFields(body)).to.eql({name: 'Report', items: []});
    });

    it('drops extra fields when asked', () => {
      expect(
        omitServerManagedFields({name: 'R', folderId: 'f'}, ['folderId']),
      ).to.eql({name: 'R'});
    });
  });

  describe('assertServiceResult', () => {
    it('turns unauthorized service results into 403s', () => {
      expect(() =>
        assertServiceResult({error: 'Unauthorized', name: 'Report'}),
      ).to.throw(/Unauthorized/);
      try {
        assertServiceResult({error: 'Forbidden: nope'});
      } catch (e) {
        expect(e.statusCode).to.equal(403);
      }
    });

    it('turns other service errors into 400s', () => {
      try {
        assertServiceResult({error: 'Cannot move folder to itself'});
        throw new Error('expected to throw');
      } catch (e) {
        expect(e.statusCode).to.equal(400);
      }
    });

    it('passes entities through, even ones carrying an error field', () => {
      const entity = {id: '1', name: 'R', error: 'user content'};
      expect(assertServiceResult(entity)).to.equal(entity);
      expect(assertServiceResult(undefined)).to.be.undefined();
    });
  });

  describe('assertOwner', () => {
    it('throws 403 for other owners', () => {
      try {
        assertOwner({owner: 'a'}, 'b');
        throw new Error('expected to throw');
      } catch (e) {
        expect(e.statusCode).to.equal(403);
      }
      expect(() => assertOwner({owner: 'a'}, 'a')).to.not.throw();
    });
  });

  describe('ids', () => {
    it('accepts mongo ids and dataset names', () => {
      expect(isSafeId('6650c1f2a4b5c6d7e8f90123')).to.be.true();
      expect(isSafeId('gf_grant_budgets')).to.be.true();
    });

    it('rejects anything that could escape a path or URL segment', () => {
      for (const value of [
        '../package',
        'a/b',
        'a\\b',
        '..',
        '',
        'a.json',
        'a?b',
        undefined,
        42,
      ]) {
        expect(isSafeId(value)).to.be.false();
      }
      try {
        assertSafeId('../secrets', 'datasetId');
        throw new Error('expected to throw');
      } catch (e) {
        expect(e.statusCode).to.equal(400);
        expect(e.message).to.equal('Invalid datasetId');
      }
    });
  });
});
