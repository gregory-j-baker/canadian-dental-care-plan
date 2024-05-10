import { Session, redirect } from '@remix-run/node';
import { Params } from '@remix-run/react';

import { ApplyState, loadApplyState } from '~/route-helpers/apply-route-helpers.server';
import { getEnv } from '~/utils/env.server';
import { getLogger } from '~/utils/logging.server';
import { getPathById } from '~/utils/route-utils';

const log = getLogger('apply-route-helpers.server');

interface LoadApplyAdultChildStateArgs {
  params: Params;
  request: Request;
  session: Session;
}

/**
 * Loads apply adult child(ren) state.
 * @param args - The arguments.
 * @returns The loaded adult child(ren) state.
 */
export function loadApplyAdultChildState({ params, request, session }: LoadApplyAdultChildStateArgs) {
  const { pathname } = new URL(request.url);
  const applyState = loadApplyState({ params, session });

  if (applyState.typeOfApplication !== 'adult-child') {
    throw redirect(getPathById('$lang+/_public+/apply+/$id+/type-application', params));
  }

  // Redirect to the confirmation page if the application has been submitted and
  // the current route is not the confirmation page.
  const confirmationRouteUrl = getPathById('$lang+/_public+/apply+/$id+/adult-child/confirmation', params);
  if (applyState.submissionInfo && !pathname.endsWith(confirmationRouteUrl)) {
    log.warn('Redirecting user to "%s" since the application has been submitted; sessionId: [%s], ', applyState.id, confirmationRouteUrl);
    throw redirect(confirmationRouteUrl);
  }

  // Redirect to the first flow page if the application has not been submitted and
  // the current route is the confirmation page.
  const termsAndConditionsRouteUrl = getPathById('$lang+/_public+/apply+/$id+/terms-and-conditions', params);
  if (!applyState.submissionInfo && pathname.endsWith(confirmationRouteUrl)) {
    log.warn('Redirecting user to "%s" since the application has not been submitted; sessionId: [%s], ', applyState.id, termsAndConditionsRouteUrl);
    //throw redirect(termsAndConditionsRouteUrl);
    //TODO: re-add throw when apply adult-child flow is completed
  }

  return applyState;
}

interface ApplicantInformationStateHasPartnerArgs {
  maritalStatus: string;
}

export function applicantInformationStateHasPartner({ maritalStatus }: ApplicantInformationStateHasPartnerArgs) {
  const { MARITAL_STATUS_CODE_MARRIED, MARITAL_STATUS_CODE_COMMONLAW } = getEnv();
  return [MARITAL_STATUS_CODE_MARRIED, MARITAL_STATUS_CODE_COMMONLAW].includes(Number(maritalStatus));
}

interface ValidateStateForReviewArgs {
  params: Params;
  state: ApplyState;
}

export function validateApplyAdultChildStateForReview({ params, state }: ValidateStateForReviewArgs) {
  if (state.typeOfApplication === undefined) {
    throw redirect(getPathById('$lang+/_public+/apply+/$id+/type-application', params));
  }

  if (state.typeOfApplication === 'delegate') {
    throw redirect(getPathById('$lang+/_public+/apply+/$id+/application-delegate', params));
  }

  if (state.typeOfApplication !== 'adult-child') {
    throw redirect(getPathById('$lang+/_public+/apply+/$id+/type-application', params));
  }

  if (state.taxFiling2023 === undefined) {
    throw redirect(getPathById('$lang+/_public+/apply+/$id+/adult-child/tax-filing', params));
  }

  if (!state.taxFiling2023) {
    throw redirect(getPathById('$lang+/_public+/apply+/$id+/adult-child/file-taxes', params));
  }

  if (state.dateOfBirth === undefined) {
    throw redirect(getPathById('$lang+/_public+/apply+/$id+/adult-child/date-of-birth', params));
  }

  // TODO: Need to create routes for adult-child flow
  // if (state.applicantInformation === undefined) {
  //   throw redirect(getPathById('$lang+/_public+/apply+/$id+/adult/applicant-information', params));
  // }

  // if (state.partnerInformation === undefined && applicantInformationStateHasPartner(state.applicantInformation)) {
  //   throw redirect(getPathById('$lang+/_public+/apply+/$id+/adult/partner-information', params));
  // }

  // if (state.partnerInformation !== undefined && !applicantInformationStateHasPartner(state.applicantInformation)) {
  //   throw redirect(getPathById('$lang+/_public+/apply+/$id+/adult/applicant-information', params));
  // }

  // if (state.personalInformation === undefined) {
  //   throw redirect(getPathById('$lang+/_public+/apply+/$id+/adult/personal-information', params));
  // }

  // if (state.communicationPreferences === undefined) {
  //   throw redirect(getPathById('$lang+/_public+/apply+/$id+/adult/communication-preference', params));
  // }

  // if (state.dentalInsurance === undefined) {
  //   throw redirect(getPathById('$lang+/_public+/apply+/$id+/adult/dental-insurance', params));
  // }

  // if (state.dentalBenefits === undefined) {
  //   throw redirect(getPathById('$lang+/_public+/apply+/$id+/adult/federal-provincial-territorial-benefits', params));
  // }
}
