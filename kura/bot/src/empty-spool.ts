// An empty spool has nothing to recover. Do not call /recover: that endpoint
// intentionally reopens failed recordings with audio, which would erase the
// original join error when no audio was ever captured.
export async function finishEmptySpool(
  files: string[],
  markStopped: () => Promise<unknown>,
  removeEmpty: () => Promise<unknown>,
): Promise<boolean> {
  if (files.length) return false;
  await markStopped(); // The API preserves an existing terminal failure.
  await removeEmpty();
  return true;
}
