Module['nappletBuild'] = true;
Module['nappletAssetUrls'] = new Map();
Module['nappletAssetUrl'] = source => {
  const path = source.startsWith('/') ? source : '/' + source;
  const cached = Module['nappletAssetUrls'].get(path);
  if (cached) return cached;
  const bytes = FS.readFile(path);
  const url = URL.createObjectURL(new Blob([bytes]));
  Module['nappletAssetUrls'].set(path, url);
  return url;
};
