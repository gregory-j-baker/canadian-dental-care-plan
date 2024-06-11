import { SyntheticEvent, useState } from 'react';

import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { useFetcher, useLoaderData, useParams } from '@remix-run/react';

import { UTCDate } from '@date-fns/utc';
import { faChevronLeft, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useTranslation } from 'react-i18next';
import invariant from 'tiny-invariant';
import { z } from 'zod';

import pageIds from '../../../../page-ids.json';
import { Address } from '~/components/address';
import { Button } from '~/components/buttons';
import { DebugPayload } from '~/components/debug-payload';
import { DescriptionListItem } from '~/components/description-list-item';
import { InlineLink } from '~/components/inline-link';
import { Progress } from '~/components/progress';
import { toBenefitApplicationRequestFromApplyAdultState } from '~/mappers/benefit-application-service-mappers.server';
import { loadApplyAdultStateForReview } from '~/route-helpers/apply-adult-route-helpers.server';
import { clearApplyState, saveApplyState } from '~/route-helpers/apply-route-helpers.server';
import { getHCaptchaRouteHelpers } from '~/route-helpers/h-captcha-route-helpers.server';
import { getBenefitApplicationService } from '~/services/benefit-application-service.server';
import { getLookupService } from '~/services/lookup-service.server';
import { parseDateString, toLocaleDateString } from '~/utils/date-utils';
import { getEnv } from '~/utils/env.server';
import { useHCaptcha } from '~/utils/hcaptcha-utils';
import { getNameByLanguage, getTypedI18nNamespaces } from '~/utils/locale-utils';
import { getFixedT, getLocale } from '~/utils/locale-utils.server';
import { getLogger } from '~/utils/logging.server';
import { mergeMeta } from '~/utils/meta-utils';
import { RouteHandleData, getPathById } from '~/utils/route-utils';
import { getTitleMetaTags } from '~/utils/seo-utils';
import { formatSin } from '~/utils/sin-utils';

enum FormAction {
  Back = 'back',
  Submit = 'submit',
}

export const handle = {
  i18nNamespaces: getTypedI18nNamespaces('apply-adult', 'apply', 'gcweb'),
  pageIdentifier: pageIds.public.apply.adult.reviewInformation,
  pageTitleI18nKey: 'apply-adult:review-information.page-title',
} as const satisfies RouteHandleData;

export const meta: MetaFunction<typeof loader> = mergeMeta(({ data }) => {
  return data ? getTitleMetaTags(data.meta.title) : [];
});

export async function loader({ context: { session }, params, request }: LoaderFunctionArgs) {
  const state = loadApplyAdultStateForReview({ params, request, session });

  // apply state is valid then edit mode can be set to true
  saveApplyState({ params, session, state: { editMode: true } });

  const { ENABLED_FEATURES, HCAPTCHA_SITE_KEY } = getEnv();
  const t = await getFixedT(request, handle.i18nNamespaces);
  const locale = getLocale(request);
  const lookupService = getLookupService();

  // Getting province by Id
  const allRegions = lookupService.getAllRegions();
  const provinceMailing = allRegions.find((region) => region.provinceTerritoryStateId === state.contactInformation.mailingProvince);
  const provinceHome = allRegions.find((region) => region.provinceTerritoryStateId === state.contactInformation.homeProvince);

  // Getting Country by Id
  const allCountries = lookupService.getAllCountries();
  const countryMailing = allCountries.find((country) => country.countryId === state.contactInformation.mailingCountry);
  const countryHome = allCountries.find((country) => country.countryId === state.contactInformation.homeCountry);
  invariant(countryMailing, `Unexpected mailing address country: ${state.contactInformation.mailingCountry}`);
  invariant(countryHome, `Unexpected home address country: ${state.contactInformation.homeCountry}`);

  // Getting CommunicationPreference by Id
  const communicationPreferences = lookupService.getAllPreferredCommunicationMethods();
  const communicationPreference = communicationPreferences.find((obj) => obj.id === state.communicationPreferences.preferredMethod);
  invariant(communicationPreference, `Unexpected communication preference: ${state.communicationPreferences.preferredMethod}`);

  const maritalStatuses = lookupService.getAllMaritalStatuses();
  const maritalStatusDict = maritalStatuses.find((obj) => obj.id === state.applicantInformation.maritalStatus)!;
  const maritalStatus = getNameByLanguage(locale, maritalStatusDict);

  const userInfo = {
    firstName: state.applicantInformation.firstName,
    lastName: state.applicantInformation.lastName,
    phoneNumber: state.contactInformation.phoneNumber,
    altPhoneNumber: state.contactInformation.phoneNumberAlt,
    preferredLanguage: state.communicationPreferences.preferredLanguage,
    birthday: toLocaleDateString(parseDateString(state.dateOfBirth), locale),
    sin: state.applicantInformation.socialInsuranceNumber,
    maritalStatus,
    contactInformationEmail: state.contactInformation.email,
    communicationPreferenceEmail: state.communicationPreferences.email,
    communicationPreference: getNameByLanguage(locale, communicationPreference),
  };

  const spouseInfo = state.partnerInformation
    ? {
        firstName: state.partnerInformation.firstName,
        lastName: state.partnerInformation.lastName,
        birthday: toLocaleDateString(parseDateString(state.partnerInformation.dateOfBirth), locale),
        sin: state.partnerInformation.socialInsuranceNumber,
        consent: state.partnerInformation.confirm,
      }
    : undefined;

  const preferredLanguage = lookupService.getPreferredLanguage(userInfo.preferredLanguage);

  const mailingAddressInfo = {
    address: state.contactInformation.mailingAddress,
    city: state.contactInformation.mailingCity,
    province: provinceMailing,
    postalCode: state.contactInformation.mailingPostalCode,
    country: countryMailing,
    apartment: state.contactInformation.mailingApartment,
  };

  const homeAddressInfo = {
    address: state.contactInformation.homeAddress,
    city: state.contactInformation.homeCity,
    province: provinceHome,
    postalCode: state.contactInformation.homePostalCode,
    country: countryHome,
    apartment: state.contactInformation.homeApartment,
  };

  const dentalInsurance = state.dentalInsurance;

  const allFederalSocialPrograms = lookupService.getAllFederalSocialPrograms();
  const allProvincialTerritorialSocialPrograms = lookupService.getAllProvincialTerritorialSocialPrograms();
  const selectedFederalBenefits = allFederalSocialPrograms
    .filter((obj) => obj.id === state.dentalBenefits.federalSocialProgram)
    .map((obj) => getNameByLanguage(locale, obj))
    .join(', ');
  const selectedProvincialBenefits = allProvincialTerritorialSocialPrograms
    .filter((obj) => obj.id === state.dentalBenefits.provincialTerritorialSocialProgram)
    .map((obj) => getNameByLanguage(locale, obj))
    .join(', ');

  const dentalBenefit = {
    federalBenefit: {
      access: state.dentalBenefits.hasFederalBenefits,
      benefit: selectedFederalBenefits,
    },
    provTerrBenefit: {
      access: state.dentalBenefits.hasProvincialTerritorialBenefits,
      province: state.dentalBenefits.province,
      benefit: selectedProvincialBenefits,
    },
  };

  const hCaptchaEnabled = ENABLED_FEATURES.includes('hcaptcha');
  const viewPayloadEnabled = ENABLED_FEATURES.includes('view-payload');

  const csrfToken = String(session.get('csrfToken'));
  const meta = { title: t('gcweb:meta.title.template', { title: t('apply-adult:review-information.page-title') }) };

  const payload = viewPayloadEnabled ? toBenefitApplicationRequestFromApplyAdultState(state) : undefined;

  return json({
    id: state.id,
    userInfo,
    spouseInfo,
    preferredLanguage,
    homeAddressInfo,
    mailingAddressInfo,
    dentalInsurance,
    dentalBenefit,
    payload,
    csrfToken,
    meta,
    siteKey: HCAPTCHA_SITE_KEY,
    hCaptchaEnabled,
  });
}

export async function action({ context: { session }, params, request }: ActionFunctionArgs) {
  const log = getLogger('apply/adult/review-information');

  const state = loadApplyAdultStateForReview({ params, request, session });

  const { ENABLED_FEATURES } = getEnv();
  const benefitApplicationService = getBenefitApplicationService();
  const hCaptchaRouteHelpers = getHCaptchaRouteHelpers();

  const formData = await request.formData();
  const expectedCsrfToken = String(session.get('csrfToken'));
  const submittedCsrfToken = String(formData.get('_csrf'));

  if (expectedCsrfToken !== submittedCsrfToken) {
    log.warn('Invalid CSRF token detected; expected: [%s], submitted: [%s]', expectedCsrfToken, submittedCsrfToken);
    throw new Response('Invalid CSRF token', { status: 400 });
  }

  const formAction = z.nativeEnum(FormAction).parse(formData.get('_action'));
  if (formAction === FormAction.Back) {
    saveApplyState({ params, session, state: { editMode: false } });
    return redirect(getPathById('$lang/_public/apply/$id/adult/federal-provincial-territorial-benefits', params));
  }

  const hCaptchaEnabled = ENABLED_FEATURES.includes('hcaptcha');
  if (hCaptchaEnabled) {
    const hCaptchaResponse = String(formData.get('h-captcha-response') ?? '');
    if (!(await hCaptchaRouteHelpers.verifyHCaptchaResponse(hCaptchaResponse, request))) {
      clearApplyState({ params, session });
      return redirect(getPathById('$lang/_public/unable-to-process-request', params));
    }
  }

  const benefitApplicationRequest = toBenefitApplicationRequestFromApplyAdultState(state);
  const confirmationCode = await benefitApplicationService.submitApplication(benefitApplicationRequest);
  const submissionInfo = { confirmationCode, submittedOn: new UTCDate().toISOString() };

  saveApplyState({ params, session, state: { submissionInfo } });

  return redirect(getPathById('$lang/_public/apply/$id/adult/confirmation', params));
}

export default function ReviewInformation() {
  const params = useParams();
  const { i18n, t } = useTranslation(handle.i18nNamespaces);
  const { userInfo, spouseInfo, preferredLanguage, homeAddressInfo, mailingAddressInfo, dentalInsurance, dentalBenefit, payload, csrfToken, siteKey, hCaptchaEnabled } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== 'idle';
  const { captchaRef } = useHCaptcha();
  const [submitAction, setSubmitAction] = useState<string>();

  function handleSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget, event.nativeEvent.submitter);
    setSubmitAction(String(formData.get('_action')));

    if (hCaptchaEnabled && captchaRef.current) {
      try {
        const response = captchaRef.current.getResponse();
        formData.set('h-captcha-response', response);
      } catch (error) {
        /* intentionally ignore and proceed with submission */
      } finally {
        captchaRef.current.resetCaptcha();
      }
    }

    fetcher.submit(formData, { method: 'POST' });
  }

  return (
    <>
      <div className="my-6 sm:my-8">
        <p id="progress-label" className="sr-only mb-2">
          {t('apply:progress.label')}
        </p>
        <Progress aria-labelledby="progress-label" value={100} size="lg" />
      </div>
      <div className="max-w-prose">
        <p className="mb-8 text-lg">{t('apply-adult:review-information.read-carefully')}</p>
        <div className="space-y-10">
          <section className="space-y-6">
            <h2 className="font-lato text-2xl font-bold">{t('apply-adult:review-information.page-sub-title')}</h2>
            <dl className="divide-y border-y">
              <DescriptionListItem term={t('apply-adult:review-information.full-name-title')}>
                <p>{`${userInfo.firstName} ${userInfo.lastName}`}</p>
                <div className="mt-4">
                  <InlineLink id="change-full-name" routeId="$lang/_public/apply/$id/adult/applicant-information" params={params}>
                    {t('apply-adult:review-information.full-name-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
              <DescriptionListItem term={t('apply-adult:review-information.dob-title')}>
                <p>{userInfo.birthday}</p>
                <div className="mt-4">
                  <InlineLink id="change-date-of-birth" routeId="$lang/_public/apply/$id/adult/date-of-birth" params={params}>
                    {t('apply-adult:review-information.dob-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
              <DescriptionListItem term={t('apply-adult:review-information.sin-title')}>
                <p>{formatSin(userInfo.sin)}</p>
                <div className="mt-4">
                  <InlineLink id="change-sin" routeId="$lang/_public/apply/$id/adult/applicant-information" params={params}>
                    {t('apply-adult:review-information.sin-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
              <DescriptionListItem term={t('apply-adult:review-information.marital-title')}>
                <p>{userInfo.maritalStatus}</p>
                <div className="mt-4">
                  <InlineLink id="change-martial-status" routeId="$lang/_public/apply/$id/adult/applicant-information" params={params}>
                    {t('apply-adult:review-information.marital-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
            </dl>
          </section>
          {spouseInfo && (
            <section className="space-y-6">
              <h2 className="font-lato text-2xl font-bold">{t('apply-adult:review-information.spouse-title')}</h2>
              <dl className="divide-y border-y">
                <DescriptionListItem term={t('apply-adult:review-information.full-name-title')}>
                  <p>{`${spouseInfo.firstName} ${spouseInfo.lastName}`}</p>
                  <div className="mt-4">
                    <InlineLink id="change-spouse-full-name" routeId="$lang/_public/apply/$id/adult/partner-information" params={params}>
                      {t('apply-adult:review-information.full-name-change')}
                    </InlineLink>
                  </div>
                </DescriptionListItem>
                <DescriptionListItem term={t('apply-adult:review-information.dob-title')}>
                  <p>{spouseInfo.birthday}</p>
                  <div className="mt-4">
                    <InlineLink id="change-spouse-date-of-birth" routeId="$lang/_public/apply/$id/adult/partner-information" params={params}>
                      {t('apply-adult:review-information.dob-change')}
                    </InlineLink>
                  </div>
                </DescriptionListItem>
                <DescriptionListItem term={t('apply-adult:review-information.sin-title')}>
                  <p>{formatSin(spouseInfo.sin)}</p>
                  <div className="mt-4">
                    <InlineLink id="change-spouse-sin" routeId="$lang/_public/apply/$id/adult/partner-information" params={params}>
                      {t('apply-adult:review-information.sin-change')}
                    </InlineLink>
                  </div>
                </DescriptionListItem>
                <DescriptionListItem term={t('apply-adult:review-information.spouse-consent.label')}>{spouseInfo.consent ? t('apply-adult:review-information.spouse-consent.yes') : t('apply-adult:review-information.spouse-consent.no')}</DescriptionListItem>
              </dl>
            </section>
          )}
          <section className="space-y-6">
            <h2 className="font-lato text-2xl font-bold">{t('apply-adult:review-information.contact-info-title')}</h2>
            <dl className="divide-y border-y">
              <DescriptionListItem term={t('apply-adult:review-information.phone-title')}>
                <p>{userInfo.phoneNumber}</p>
                <div className="mt-4">
                  <InlineLink id="change-phone-number" routeId="$lang/_public/apply/$id/adult/contact-information" params={params}>
                    {t('apply-adult:review-information.phone-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
              <DescriptionListItem term={t('apply-adult:review-information.alt-phone-title')}>
                <p>{userInfo.altPhoneNumber}</p>
                <div className="mt-4">
                  <InlineLink id="change-alternate-phone-number" routeId="$lang/_public/apply/$id/adult/contact-information" params={params}>
                    {t('apply-adult:review-information.alt-phone-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
              <DescriptionListItem term={t('apply-adult:review-information.email')}>
                <p>{userInfo.contactInformationEmail}</p>
                <div className="mt-4">
                  <InlineLink id="change-email" routeId="$lang/_public/apply/$id/adult/contact-information" params={params}>
                    {t('apply-adult:review-information.email-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
              <DescriptionListItem term={t('apply-adult:review-information.mailing-title')}>
                <Address
                  address={mailingAddressInfo.address}
                  city={mailingAddressInfo.city}
                  provinceState={mailingAddressInfo.province?.abbr}
                  postalZipCode={mailingAddressInfo.postalCode}
                  country={i18n.language === 'en' ? mailingAddressInfo.country.nameEn : mailingAddressInfo.country.nameFr}
                  apartment={mailingAddressInfo.apartment}
                />
                <div className="mt-4">
                  <InlineLink id="change-mailing-address" routeId="$lang/_public/apply/$id/adult/contact-information" params={params}>
                    {t('apply-adult:review-information.mailing-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
              <DescriptionListItem term={t('apply-adult:review-information.home-title')}>
                <Address
                  address={homeAddressInfo.address ?? ''}
                  city={homeAddressInfo.city ?? ''}
                  provinceState={homeAddressInfo.province?.abbr}
                  postalZipCode={homeAddressInfo.postalCode}
                  country={i18n.language === 'en' ? homeAddressInfo.country.nameEn : homeAddressInfo.country.nameFr}
                  apartment={homeAddressInfo.apartment}
                />
                <div className="mt-4">
                  <InlineLink id="change-home-address" routeId="$lang/_public/apply/$id/adult/contact-information" params={params}>
                    {t('apply-adult:review-information.home-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
            </dl>
          </section>
          <section className="space-y-6">
            <h2 className="font-lato text-2xl font-bold">{t('apply-adult:review-information.comm-title')}</h2>
            <dl className="divide-y border-y">
              <DescriptionListItem term={t('apply-adult:review-information.comm-pref-title')}>
                <p>{userInfo.communicationPreference}</p>
                {userInfo.communicationPreferenceEmail && <p>{userInfo.communicationPreferenceEmail}</p>}
                <p>
                  <InlineLink id="change-communication-preference" routeId="$lang/_public/apply/$id/adult/communication-preference" params={params}>
                    {t('apply-adult:review-information.comm-pref-change')}
                  </InlineLink>
                </p>
              </DescriptionListItem>
              {preferredLanguage && (
                <DescriptionListItem term={t('apply-adult:review-information.lang-pref-title')}>
                  <p>{getNameByLanguage(i18n.language, preferredLanguage)}</p>
                  <div className="mt-4">
                    <InlineLink id="change-language-preference" routeId="$lang/_public/apply/$id/adult/communication-preference" params={params}>
                      {t('apply-adult:review-information.lang-pref-change')}
                    </InlineLink>
                  </div>
                </DescriptionListItem>
              )}
            </dl>
          </section>
          <section className="space-y-6">
            <h2 className="font-lato text-2xl font-bold">{t('apply-adult:review-information.dental-title')}</h2>
            <dl className="divide-y border-y">
              <DescriptionListItem term={t('apply-adult:review-information.dental-insurance-title')}>
                <p>{dentalInsurance ? t('apply-adult:review-information.yes') : t('apply-adult:review-information.no')}</p>
                <div className="mt-4">
                  <InlineLink id="change-access-dental" routeId="$lang/_public/apply/$id/adult/dental-insurance" params={params}>
                    {t('apply-adult:review-information.dental-insurance-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
              <DescriptionListItem term={t('apply-adult:review-information.dental-benefit-title')}>
                {dentalBenefit.federalBenefit.access || dentalBenefit.provTerrBenefit.access ? (
                  <>
                    <p>{t('apply-adult:review-information.yes')}</p>
                    <p>{t('apply-adult:review-information.dental-benefit-has-access')}</p>
                    <ul className="ml-6 list-disc">
                      {dentalBenefit.federalBenefit.access && <li>{dentalBenefit.federalBenefit.benefit}</li>}
                      {dentalBenefit.provTerrBenefit.access && <li>{dentalBenefit.provTerrBenefit.benefit}</li>}
                    </ul>
                  </>
                ) : (
                  <p>{t('apply-adult:review-information.no')}</p>
                )}
                <div className="mt-4">
                  <InlineLink id="change-dental-benefits" routeId="$lang/_public/apply/$id/adult/federal-provincial-territorial-benefits" params={params}>
                    {t('apply-adult:review-information.dental-benefit-change')}
                  </InlineLink>
                </div>
              </DescriptionListItem>
            </dl>
          </section>
          <section className="space-y-4">
            <h2 className="font-lato text-2xl font-bold">{t('apply-adult:review-information.submit-app-title')}</h2>
            <p>{t('apply-adult:review-information.submit-p-proceed')}</p>
            <p>{t('apply-adult:review-information.submit-p-false-info')}</p>
            <p>{t('apply-adult:review-information.submit-p-repayment')}</p>
          </section>
        </div>
        <fetcher.Form onSubmit={handleSubmit} method="post" className="mt-8 flex flex-row-reverse flex-wrap items-center justify-end gap-3">
          <input type="hidden" name="_csrf" value={csrfToken} />
          {hCaptchaEnabled && <HCaptcha size="invisible" sitekey={siteKey} ref={captchaRef} />}
          <Button id="confirm-button" name="_action" value={FormAction.Submit} variant="green" disabled={isSubmitting} data-gc-analytics-customclick="ESDC-EDSC:CDCP Online Application Form-Adult:Submit - Review your information click">
            {t('apply-adult:review-information.submit-button')}
            {isSubmitting && submitAction === FormAction.Submit && <FontAwesomeIcon icon={faSpinner} className="ms-3 block size-4 animate-spin" />}
          </Button>
          <Button id="back-button" name="_action" value={FormAction.Back} disabled={isSubmitting} data-gc-analytics-customclick="ESDC-EDSC:CDCP Online Application Form-Adult:Exit - Review your information click">
            <FontAwesomeIcon icon={faChevronLeft} className="me-3 block size-4" />
            {t('apply-adult:review-information.back-button')}
          </Button>
        </fetcher.Form>
        <InlineLink routeId="$lang/_public/apply/$id/adult/exit-application" params={params} className="mt-6 block font-lato font-semibold">
          {t('apply-adult:review-information.exit-button')}
        </InlineLink>
      </div>
      {payload && (
        <div className="mt-8">
          <DebugPayload data={payload} enableCopy></DebugPayload>
        </div>
      )}
    </>
  );
}
