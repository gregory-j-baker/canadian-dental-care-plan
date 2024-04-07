import { LoaderFunctionArgs, redirect } from '@remix-run/node';

import { getApplyRouteHelpers } from '~/route-helpers/apply-route-helpers.server';
import { getPathById } from '~/utils/route-utils';

export async function loader({ context: { session }, params, request }: LoaderFunctionArgs) {
  const applyRouteHelpers = getApplyRouteHelpers();
  const state = await applyRouteHelpers.loadState({ params, request, session });

  await applyRouteHelpers.saveState({ params, request, session, state });
  return redirect(getPathById('$lang+/_public+/apply+/$id+/type-application', params));
}
