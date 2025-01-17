import { ContentVisibility, RevisionPage, Space } from '@gitbook/api';
import { headers } from 'next/headers';

import {
    getCollectionSpaces,
    getCollection,
    ContentPointer,
    getRevisionPageByPath,
    getDocument,
    getSpaceData,
    ContentTarget,
} from '@/lib/api';
import { resolvePagePath, resolvePageId } from '@/lib/pages';

export interface PagePathParams {
    pathname?: string[];
}

export interface PageIdParams {
    pageId: string;
}

/**
 * Get the current content pointer from the params.
 */
export function getContentPointer() {
    const headerSet = headers();
    const spaceId = headerSet.get('x-gitbook-content-space');
    if (!spaceId) {
        throw new Error(
            'getContentPointer is called outside the scope of a request processed by the middleware',
        );
    }

    const content: ContentPointer = {
        spaceId,
        revisionId: headerSet.get('x-gitbook-content-revision') ?? undefined,
        changeRequestId: headerSet.get('x-gitbook-content-changerequest') ?? undefined,
    };

    return content;
}

/**
 * Fetch all the data needed to render the space layout.
 */
export async function fetchSpaceData() {
    const content = getContentPointer();
    const { space, contentTarget, pages, customization, scripts } = await getSpaceData(content);
    const collection = await fetchParentCollection(space);

    return {
        content,
        contentTarget,
        space,
        pages,
        customization,
        scripts,
        ancestors: [],
        ...collection,
    };
}

/**
 * Fetch all the data needed to render the content.
 * Optimized to fetch in parallel as much as possible.
 */
export async function fetchPageData(params: PagePathParams | PageIdParams) {
    const content = getContentPointer();
    const { space, contentTarget, pages, customization, scripts } = await getSpaceData(content);

    const page = await resolvePage(contentTarget, pages, params);
    const [collection, document] = await Promise.all([
        fetchParentCollection(space),
        page?.page.documentId ? getDocument(space.id, page.page.documentId) : null,
    ]);

    return {
        content,
        contentTarget,
        space,
        pages,
        customization,
        scripts,
        ancestors: [],
        ...page,
        ...collection,
        document,
    };
}

/**
 * Resolve a page from the params.
 * If the path can't be found, we try to resolve it from the API to handle redirects.
 */
async function resolvePage(
    contentTarget: ContentTarget,
    pages: RevisionPage[],
    params: PagePathParams | PageIdParams,
) {
    if ('pageId' in params) {
        return resolvePageId(pages, params.pageId);
    }

    const rawPathname = getPathnameParam(params);
    const pathname = normalizePathname(rawPathname);

    // When resolving a page, we use the lowercased pathname
    const page = resolvePagePath(pages, pathname);
    if (page) {
        return page;
    }

    // If page can't be found, we try with the API, in case we have a redirect
    // We use the raw pathname to handle special/malformed redirects setup by users in the GitSync.
    // The page rendering will take care of redirecting to a normalized pathname.
    //
    // We don't test path that are too long as GitBook doesn't support them and will return a 404 anyway.
    if (rawPathname.length <= 512) {
        const resolved = await getRevisionPageByPath(
            contentTarget.spaceId,
            contentTarget.revisionId,
            rawPathname,
        );
        if (resolved) {
            return resolvePageId(pages, resolved.id);
        }
    }

    return undefined;
}

async function fetchParentCollection(space: Space) {
    const parentCollectionId =
        space.visibility === ContentVisibility.InCollection ? space.parent : undefined;
    const [collection, collectionSpaces] = await Promise.all([
        parentCollectionId ? getCollection(parentCollectionId) : null,
        parentCollectionId ? getCollectionSpaces(parentCollectionId) : ([] as Space[]),
    ]);

    return { collection, collectionSpaces };
}

/**
 * Get the page path from the params.
 */
export function getPathnameParam(params: PagePathParams): string {
    const { pathname } = params;
    return pathname ? pathname.map((part) => decodeURIComponent(part)).join('/') : '';
}

/**
 * Normalize the URL pathname into the format used in the revision page path.
 */
export function normalizePathname(pathname: string) {
    return pathname.toLowerCase();
}
