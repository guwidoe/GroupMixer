export interface AppRouteSeoConfig {
  title: string;
  description: string;
}

export function getAppSeo(pathname: string): AppRouteSeoConfig {
  if (pathname.startsWith('/app/solver')) {
    return {
      title: 'Solver Workspace | GroupMixer App',
      description: 'Advanced solver workspace for saved GroupMixer scenarios. This utility route is not intended for search indexing.',
    };
  }

  if (pathname.startsWith('/app/results')) {
    return {
      title: 'Current Result | GroupMixer App',
      description: 'Detailed GroupMixer workspace for inspecting the active result. This utility route is not intended for search indexing.',
    };
  }

  if (pathname.startsWith('/app/history')) {
    return {
      title: 'Saved Results | GroupMixer App',
      description: 'Saved GroupMixer results workspace for browsing, comparing, and reopening results. This utility route is not intended for search indexing.',
    };
  }

  if (pathname.startsWith('/app/editor')) {
    return {
      title: 'Manual Editor | GroupMixer App',
      description: 'Manual GroupMixer editing workspace. This utility route is not intended for search indexing.',
    };
  }

  return {
    title: 'Expert Workspace | GroupMixer App',
    description: 'Advanced GroupMixer workspace for configuring, solving, and reviewing scenarios. This utility route is not intended for search indexing.',
  };
}
