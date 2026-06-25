import {
  getStoreListingBySource,
  upsertStoreListing,
} from './store-storage';

export async function syncStoreListingFromProgram(params: {
  schoolId: number;
  listingType: 'session' | 'class';
  sourceId: number;
  publish: boolean;
  membersOnly?: boolean;
}) {
  return upsertStoreListing({
    schoolId: params.schoolId,
    listingType: params.listingType,
    sourceId: params.sourceId,
    isPublished: params.publish,
    membersOnly: params.membersOnly,
  });
}

export async function getStoreListingState(
  schoolId: number,
  listingType: 'session' | 'class',
  sourceId: number,
) {
  const listing = await getStoreListingBySource(schoolId, listingType, sourceId);
  if (!listing) return null;
  return {
    isPublished: listing.isPublished,
    membersOnly: listing.membersOnly,
  };
}
