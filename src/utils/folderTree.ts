type FolderLike = {id: string; name: string; parentId?: string};

export const ROOT_LOCATION = 'My Workspace';

/**
 * Returns a lookup for "My Workspace > A > B" paths. A missing parent ends the
 * path at the workspace, and a parent loop stops there instead of recursing
 * forever.
 */
export const createFolderPathResolver = (folders: FolderLike[]) => {
  const folderById = new Map(folders.map(folder => [folder.id, folder]));
  const pathCache = new Map<string, string>();

  const resolve = (
    folderId: string | undefined,
    visiting: Set<string>,
  ): string => {
    if (!folderId) return ROOT_LOCATION;
    const cached = pathCache.get(folderId);
    if (cached !== undefined) return cached;
    const folder = folderById.get(folderId);
    if (!folder || visiting.has(folderId)) return ROOT_LOCATION;
    visiting.add(folderId);
    const path = `${resolve(folder.parentId, visiting)} > ${folder.name}`;
    pathCache.set(folderId, path);
    return path;
  };

  return (folderId: string | undefined) => resolve(folderId, new Set());
};

/**
 * Nests folders under their parents. Folders whose parent is missing (deleted
 * or not visible to this user) or that sit in a parent loop are listed at the
 * root rather than dropped.
 */
export const buildFolderTree = <T extends FolderLike>(folders: T[]) => {
  const nodes = new Map(
    folders.map(folder => [folder.id, {...folder, children: [] as unknown[]}]),
  );

  const reachesRoot = (folder: T) => {
    const seen = new Set<string>();
    let current: T | undefined = folder;
    while (current?.parentId && nodes.has(current.parentId)) {
      if (seen.has(current.id)) return false;
      seen.add(current.id);
      current = nodes.get(current.parentId) as T | undefined;
    }
    return true;
  };

  const roots: unknown[] = [];
  for (const folder of folders) {
    const node = nodes.get(folder.id)!;
    const parent = folder.parentId ? nodes.get(folder.parentId) : undefined;
    if (parent && reachesRoot(folder)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
};
