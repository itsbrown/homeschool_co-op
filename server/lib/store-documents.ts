import {
  getProgramDeliveryDocumentIds,
  getSchoolDocumentsByIds,
} from './store-storage';

export async function resolveStoreDeliveryDocuments(
  schoolId: number,
  programLines: Array<{ listingType: string; sourceId: number }>,
) {
  const docIdSet = new Set<number>();
  for (const line of programLines) {
    if (line.listingType !== 'session' && line.listingType !== 'class') continue;
    const ids = await getProgramDeliveryDocumentIds(
      schoolId,
      line.listingType as 'session' | 'class',
      line.sourceId,
    );
    ids.forEach((id) => docIdSet.add(id));
  }
  return getSchoolDocumentsByIds([...docIdSet]);
}
