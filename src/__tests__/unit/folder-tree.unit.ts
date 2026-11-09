import {expect} from '@loopback/testlab';
import {
  buildFolderTree,
  createFolderPathResolver,
} from '../../utils/folderTree';

describe('folder tree utils', () => {
  it('builds workspace paths and stops at missing parents', () => {
    const pathOf = createFolderPathResolver([
      {id: 'a', name: 'A'},
      {id: 'b', name: 'B', parentId: 'a'},
      {id: 'c', name: 'C', parentId: 'deleted'},
    ]);
    expect(pathOf(undefined)).to.equal('My Workspace');
    expect(pathOf('b')).to.equal('My Workspace > A > B');
    expect(pathOf('c')).to.equal('My Workspace > C');
    expect(pathOf('unknown')).to.equal('My Workspace');
  });

  it('does not recurse forever on a parent loop', () => {
    const pathOf = createFolderPathResolver([
      {id: 'a', name: 'A', parentId: 'b'},
      {id: 'b', name: 'B', parentId: 'a'},
    ]);
    expect(pathOf('a')).to.equal('My Workspace > B > A');
  });

  it('nests folders and lists orphans and loops at the root', () => {
    const tree = buildFolderTree([
      {id: 'a', name: 'A'},
      {id: 'b', name: 'B', parentId: 'a'},
      {id: 'orphan', name: 'Orphan', parentId: 'deleted'},
      {id: 'x', name: 'X', parentId: 'y'},
      {id: 'y', name: 'Y', parentId: 'x'},
    ]) as {id: string; children: {id: string}[]}[];
    expect(tree.map(node => node.id)).to.eql(['a', 'orphan', 'x', 'y']);
    expect(tree[0].children.map(node => node.id)).to.eql(['b']);
  });
});
