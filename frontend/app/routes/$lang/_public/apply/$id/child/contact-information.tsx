import { useEffect, useMemo, useState } from 'react';

import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { useFetcher, useLoaderData, useParams } from '@remix-run/react';

import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { isValidPhoneNumber, parsePhoneNumber } from 'libphonenumber-js';
import { useTranslation } from 'react-i18next';
import validator from 'validator';
import { z } from 'zod';

import pageIds from '../../../../page-ids.json';
import { Button, ButtonLink } from '~/components/buttons';
import { useErrorSummary } from '~/components/error-summary';
import { InputCheckbox } from '~/components/input-checkbox';
import { InputField } from '~/components/input-field';
import type { InputOptionProps } from '~/components/input-option';
import { InputPhoneField } from '~/components/input-phone-field';
import { InputSanitizeField } from '~/components/input-sanitize-field';
import { InputSelect } from '~/components/input-select';
import { LoadingButton } from '~/components/loading-button';
import { Progress } from '~/components/progress';
import { loadApplyChildState } from '~/route-helpers/apply-child-route-helpers.server';
import type { ContactInformationState } from '~/route-helpers/apply-route-helpers.server';
import { saveApplyState } from '~/route-helpers/apply-route-helpers.server';
import { getLookupService } from '~/services/lookup-service.server';
import { getEnv } from '~/utils/env-utils.server';
import { getTypedI18nNamespaces } from '~/utils/locale-utils';
import { getFixedT, getLocale } from '~/utils/locale-utils.server';
import { getLogger } from '~/utils/logging.server';
import { localizeAndSortCountries, localizeAndSortRegions } from '~/utils/lookup-utils.server';
import { mergeMeta } from '~/utils/meta-utils';
import { formatPostalCode, isValidCanadianPostalCode, isValidPostalCode } from '~/utils/postal-zip-code-utils.server';
import type { RouteHandleData } from '~/utils/route-utils';
import { getPathById } from '~/utils/route-utils';
import { getTitleMetaTags } from '~/utils/seo-utils';
import { isAllValidInputCharacters } from '~/utils/string-utils';
import { transformFlattenedError } from '~/utils/zod-utils.server';

export const handle = {
  i18nNamespaces: getTypedI18nNamespaces('apply-child', 'apply', 'gcweb'),
  pageIdentifier: pageIds.public.apply.child.contactInformation,
  pageTitleI18nKey: 'apply-child:contact-information.page-title',
} as const satisfies RouteHandleData;

export const meta: MetaFunction<typeof loader> = mergeMeta(({ data }) => {
  return data ? getTitleMetaTags(data.meta.title) : [];
});

export async function loader({ context: { session }, params, request }: LoaderFunctionArgs) {
  const lookupService = getLookupService();
  const state = loadApplyChildState({ params, request, session });
  const t = await getFixedT(request, handle.i18nNamespaces);
  const locale = getLocale(request);
  const { CANADA_COUNTRY_ID, USA_COUNTRY_ID, MARITAL_STATUS_CODE_COMMONLAW, MARITAL_STATUS_CODE_MARRIED } = getEnv();

  const countryList = localizeAndSortCountries(lookupService.getAllCountries(), locale);
  const regionList = localizeAndSortRegions(lookupService.getAllRegions(), locale);

  const csrfToken = String(session.get('csrfToken'));
  const meta = { title: t('gcweb:meta.title.template', { title: t('apply-child:contact-information.page-title') }) };

  return json({
    id: state.id,
    csrfToken,
    meta,
    defaultState: state.contactInformation,
    maritalStatus: state.applicantInformation?.maritalStatus,
    countryList,
    regionList,
    CANADA_COUNTRY_ID,
    USA_COUNTRY_ID,
    MARITAL_STATUS_CODE_COMMONLAW,
    MARITAL_STATUS_CODE_MARRIED,
    editMode: state.editMode,
  });
}

export async function action({ context: { session }, params, request }: ActionFunctionArgs) {
  const log = getLogger('apply/child/contact-information');

  const state = loadApplyChildState({ params, request, session });
  const t = await getFixedT(request, handle.i18nNamespaces);
  const { CANADA_COUNTRY_ID, USA_COUNTRY_ID, COMMUNICATION_METHOD_EMAIL_ID } = getEnv();

  const personalInformationSchema = z
    .object({
      phoneNumber: z
        .string()
        .trim()
        .max(100)
        .refine((val) => !val || isValidPhoneNumber(val, 'CA'), t('apply-child:contact-information.error-message.phone-number-valid'))
        .optional(),
      phoneNumberAlt: z
        .string()
        .trim()
        .max(100)
        .refine((val) => !val || isValidPhoneNumber(val, 'CA'), t('apply-child:contact-information.error-message.phone-number-alt-valid'))
        .optional(),
      email: z.string().trim().max(64).optional(),
      confirmEmail: z.string().trim().max(64).optional(),
      mailingAddress: z.string().trim().min(1, t('apply-child:contact-information.error-message.mailing-address.address-required')).max(30).refine(isAllValidInputCharacters, t('apply-child:contact-information.error-message.characters-valid')),
      mailingApartment: z.string().trim().max(30).refine(isAllValidInputCharacters, t('apply-child:contact-information.error-message.characters-valid')).optional(),
      mailingCountry: z.string().trim().min(1, t('apply-child:contact-information.error-message.mailing-address.country-required')),
      mailingProvince: z.string().trim().min(1, t('apply-child:contact-information.error-message.mailing-address.province-required')).optional(),
      mailingCity: z.string().trim().min(1, t('apply-child:contact-information.error-message.mailing-address.city-required')).max(100).refine(isAllValidInputCharacters, t('apply-child:contact-information.error-message.characters-valid')),
      mailingPostalCode: z.string().trim().max(100).refine(isAllValidInputCharacters, t('apply-child:contact-information.error-message.characters-valid')).optional(),
      copyMailingAddress: z.boolean(),
      homeAddress: z.string().trim().max(30).refine(isAllValidInputCharacters, t('apply-child:contact-information.error-message.characters-valid')).optional(),
      homeApartment: z.string().trim().max(30).refine(isAllValidInputCharacters, t('apply-child:contact-information.error-message.characters-valid')).optional(),
      homeCountry: z.string().trim().optional(),
      homeProvince: z.string().trim().optional(),
      homeCity: z.string().trim().max(100).refine(isAllValidInputCharacters, t('apply-child:contact-information.error-message.characters-valid')).optional(),
      homePostalCode: z.string().trim().max(100).refine(isAllValidInputCharacters, t('apply-child:contact-information.error-message.characters-valid')).optional(),
    })
    .superRefine((val, ctx) => {
      if (val.email ?? val.confirmEmail) {
        if (typeof val.email !== 'string' || validator.isEmpty(val.email)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.email-required'), path: ['email'] });
        } else if (!validator.isEmail(val.email)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.email-valid'), path: ['email'] });
        }

        if (typeof val.confirmEmail !== 'string' || validator.isEmpty(val.confirmEmail)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.confirm-email-required'), path: ['confirmEmail'] });
        } else if (!validator.isEmail(val.confirmEmail)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.confirm-email-valid'), path: ['confirmEmail'] });
        } else if (val.email !== val.confirmEmail) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.email-match'), path: ['confirmEmail'] });
        }
      }

      if (val.mailingCountry === CANADA_COUNTRY_ID || val.mailingCountry === USA_COUNTRY_ID) {
        if (!val.mailingProvince || validator.isEmpty(val.mailingProvince)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.mailing-address.province-required'), path: ['mailingProvince'] });
        }

        if (!val.mailingPostalCode || validator.isEmpty(val.mailingPostalCode)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.mailing-address.postal-code-required'), path: ['mailingPostalCode'] });
        } else if (!isValidPostalCode(val.mailingCountry, val.mailingPostalCode)) {
          const message = val.mailingCountry === CANADA_COUNTRY_ID ? t('apply-child:contact-information.error-message.mailing-address.postal-code-valid') : t('apply-child:contact-information.error-message.mailing-address.zip-code-valid');
          ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['mailingPostalCode'] });
        } else if (val.mailingCountry === CANADA_COUNTRY_ID && val.mailingProvince && !isValidCanadianPostalCode(val.mailingProvince, val.mailingPostalCode)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.mailing-address.invalid-postal-code-for-province'), path: ['mailingPostalCode'] });
        }
      }

      if (val.mailingCountry && val.mailingCountry !== CANADA_COUNTRY_ID && val.mailingPostalCode && isValidPostalCode(CANADA_COUNTRY_ID, val.mailingPostalCode)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.mailing-address.invalid-postal-code-for-country'), path: ['mailingCountry'] });
      }

      if (val.copyMailingAddress === false) {
        if (!val.homeAddress || validator.isEmpty(val.homeAddress)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.home-address.address-required'), path: ['homeAddress'] });
        }

        if (!val.homeCountry || validator.isEmpty(val.homeCountry)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.home-address.country-required'), path: ['homeCountry'] });
        }

        if (!val.homeCity || validator.isEmpty(val.homeCity)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.home-address.city-required'), path: ['homeCity'] });
        }

        if (val.homeCountry === CANADA_COUNTRY_ID || val.homeCountry === USA_COUNTRY_ID) {
          if (!val.homeProvince || validator.isEmpty(val.homeProvince)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.home-address.province-required'), path: ['homeProvince'] });
          }

          if (!val.homePostalCode || validator.isEmpty(val.homePostalCode)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.home-address.postal-code-required'), path: ['homePostalCode'] });
          } else if (!isValidPostalCode(val.homeCountry, val.homePostalCode)) {
            const message = val.homeCountry === CANADA_COUNTRY_ID ? t('apply-child:contact-information.error-message.home-address.postal-code-valid') : t('apply-child:contact-information.error-message.home-address.zip-code-valid');
            ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['homePostalCode'] });
          } else if (val.homeCountry === CANADA_COUNTRY_ID && val.homeProvince && !isValidCanadianPostalCode(val.homeProvince, val.homePostalCode)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.home-address.invalid-postal-code-for-province'), path: ['homePostalCode'] });
          }

          if (val.homeCountry && val.homeCountry !== CANADA_COUNTRY_ID && val.homePostalCode && isValidPostalCode(CANADA_COUNTRY_ID, val.homePostalCode)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('apply-child:contact-information.error-message.home-address.invalid-postal-code-for-country'), path: ['homeCountry'] });
          }
        }
      }
    })
    .transform((val) => ({
      ...val,
      homePostalCode: val.homeCountry && val.homePostalCode ? formatPostalCode(val.homeCountry, val.homePostalCode) : val.homePostalCode,
      mailingPostalCode: val.mailingCountry && val.mailingPostalCode ? formatPostalCode(val.mailingCountry, val.mailingPostalCode) : val.mailingPostalCode,
      phoneNumber: val.phoneNumber ? parsePhoneNumber(val.phoneNumber, 'CA').formatInternational() : val.phoneNumber,
      phoneNumberAlt: val.phoneNumberAlt ? parsePhoneNumber(val.phoneNumberAlt, 'CA').formatInternational() : val.phoneNumberAlt,
    })) satisfies z.ZodType<ContactInformationState>;

  const formData = await request.formData();

  const expectedCsrfToken = String(session.get('csrfToken'));
  const submittedCsrfToken = String(formData.get('_csrf'));

  if (expectedCsrfToken !== submittedCsrfToken) {
    log.warn('Invalid CSRF token detected; expected: [%s], submitted: [%s]', expectedCsrfToken, submittedCsrfToken);
    throw new Response('Invalid CSRF token', { status: 400 });
  }

  const data = {
    phoneNumber: formData.get('phoneNumber') ? String(formData.get('phoneNumber')) : undefined,
    phoneNumberAlt: formData.get('phoneNumberAlt') ? String(formData.get('phoneNumberAlt')) : undefined,
    email: formData.get('email') ? String(formData.get('email')) : undefined,
    confirmEmail: formData.get('confirmEmail') ? String(formData.get('confirmEmail')) : undefined,
    mailingAddress: String(formData.get('mailingAddress') ?? ''),
    mailingApartment: formData.get('mailingApartment') ? String(formData.get('mailingApartment')) : undefined,
    mailingCountry: String(formData.get('mailingCountry') ?? ''),
    mailingProvince: formData.get('mailingProvince') ? String(formData.get('mailingProvince')) : undefined,
    mailingCity: String(formData.get('mailingCity') ?? ''),
    mailingPostalCode: formData.get('mailingPostalCode') ? String(formData.get('mailingPostalCode')) : undefined,
    copyMailingAddress: formData.get('copyMailingAddress') === 'copy',
    homeAddress: formData.get('homeAddress') ? String(formData.get('homeAddress')) : undefined,
    homeApartment: formData.get('homeApartment') ? String(formData.get('homeApartment')) : undefined,
    homeCountry: formData.get('homeCountry') ? String(formData.get('homeCountry')) : undefined,
    homeProvince: formData.get('homeProvince') ? String(formData.get('homeProvince')) : undefined,
    homeCity: formData.get('homeCity') ? String(formData.get('homeCity')) : undefined,
    homePostalCode: formData.get('homePostalCode') ? String(formData.get('homePostalCode')) : undefined,
  };
  const parsedDataResult = personalInformationSchema.safeParse(data);

  if (!parsedDataResult.success) {
    return json({
      errors: transformFlattenedError(parsedDataResult.error.flatten()),
    });
  }

  const updatedData = parsedDataResult.data.copyMailingAddress
    ? {
        ...parsedDataResult.data,
        homeAddress: parsedDataResult.data.mailingAddress,
        homeApartment: parsedDataResult.data.mailingApartment,
        homeCountry: parsedDataResult.data.mailingCountry,
        homeProvince: parsedDataResult.data.mailingProvince,
        homeCity: parsedDataResult.data.mailingCity,
        homePostalCode: parsedDataResult.data.mailingPostalCode,
      }
    : parsedDataResult.data;

  saveApplyState({ params, session, state: { contactInformation: updatedData } });

  // if email is defined and comm. pref. preferredMethod is EMAIL then sync email
  if (updatedData.email && state.communicationPreferences?.preferredMethod === COMMUNICATION_METHOD_EMAIL_ID) {
    saveApplyState({ params, session, state: { communicationPreferences: { ...state.communicationPreferences, email: updatedData.email } } });
  }

  if (state.editMode) {
    return redirect(getPathById('$lang/_public/apply/$id/child/review-adult-information', params));
  }

  return redirect(getPathById('$lang/_public/apply/$id/child/communication-preference', params));
}

export default function ApplyFlowPersonalInformation() {
  const { t } = useTranslation(handle.i18nNamespaces);
  const { csrfToken, defaultState, countryList, maritalStatus, regionList, CANADA_COUNTRY_ID, USA_COUNTRY_ID, MARITAL_STATUS_CODE_COMMONLAW, MARITAL_STATUS_CODE_MARRIED, editMode } = useLoaderData<typeof loader>();
  const params = useParams();
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== 'idle';
  const [selectedMailingCountry, setSelectedMailingCountry] = useState(defaultState?.mailingCountry);
  const [mailingCountryRegions, setMailingCountryRegions] = useState<typeof regionList>([]);
  const [copyAddressChecked, setCopyAddressChecked] = useState(defaultState?.copyMailingAddress === true);
  const [selectedHomeCountry, setSelectedHomeCountry] = useState(defaultState?.homeCountry);
  const [homeCountryRegions, setHomeCountryRegions] = useState<typeof regionList>([]);

  const errors = fetcher.data?.errors;
  const errorSummary = useErrorSummary(errors, {
    phoneNumber: 'phone-number',
    phoneNumberAlt: 'phone-number-alt',
    email: 'email',
    confirmEmail: 'confirm-email',
    mailingAddress: 'mailing-address',
    mailingApartment: 'mailing-apartment',
    mailingProvince: 'mailing-province',
    mailingCountry: 'mailing-country',
    mailingCity: 'mailing-city',
    mailingPostalCode: 'mailing-postal-code',
    copyMailingAddress: 'copy-mailing-address',
    homeAddress: 'home-address',
    homeApartment: 'home-apartment',
    homeProvince: 'home-province',
    homeCountry: 'home-country',
    homeCity: 'home-city',
    homePostalCode: 'home-postal-code',
  });

  const checkHandler = () => {
    setCopyAddressChecked((curState) => !curState);
  };

  useEffect(() => {
    const filteredRegions = regionList.filter((region) => region.countryId === selectedMailingCountry);
    setMailingCountryRegions(filteredRegions);
  }, [selectedMailingCountry, regionList]);

  const mailingCountryChangeHandler = (event: React.SyntheticEvent<HTMLSelectElement>) => {
    setSelectedMailingCountry(event.currentTarget.value);
  };

  const countries = useMemo<InputOptionProps[]>(
    () =>
      countryList.map(({ countryId, name }) => ({
        children: name,
        value: countryId,
      })),
    [countryList],
  );

  // populate mailing region/province/state list with selected country or current address country
  const mailingRegions: InputOptionProps[] = mailingCountryRegions.map(({ provinceTerritoryStateId, name }) => ({
    children: name,
    value: provinceTerritoryStateId,
  }));

  useEffect(() => {
    const filteredRegions = regionList.filter((region) => region.countryId === selectedHomeCountry);
    setHomeCountryRegions(filteredRegions);
  }, [selectedHomeCountry, regionList]);

  const homeCountryChangeHandler = (event: React.SyntheticEvent<HTMLSelectElement>) => {
    setSelectedHomeCountry(event.currentTarget.value);
  };

  // populate home region/province/state list with selected country or current address country
  const homeRegions: InputOptionProps[] = homeCountryRegions.map(({ provinceTerritoryStateId, name }) => ({
    children: name,
    value: provinceTerritoryStateId,
  }));

  const dummyOption: InputOptionProps = { children: t('apply-child:contact-information.address-field.select-one'), value: '' };

  const postalCodeRequiredContries = [CANADA_COUNTRY_ID, USA_COUNTRY_ID];
  const mailingPostalCodeRequired = selectedMailingCountry !== undefined && postalCodeRequiredContries.includes(selectedMailingCountry);
  const homePostalCodeRequired = selectedHomeCountry !== undefined && postalCodeRequiredContries.includes(selectedHomeCountry);

  return (
    <>
      <div className="my-6 sm:my-8">
        <Progress value={60} size="lg" label={t('apply:progress.label')} />
      </div>
      <div className="max-w-prose">
        <p className="mb-4 italic">{t('apply:optional-label')}</p>
        <errorSummary.ErrorSummary />
        <fetcher.Form method="post" noValidate>
          <input type="hidden" name="_csrf" value={csrfToken} />
          <fieldset className="mb-6">
            <legend className="mb-4 font-lato text-2xl font-bold">{t('apply-child:contact-information.phone-header')}</legend>
            <p className="mb-4" id="adding-phone">
              {t('apply-child:contact-information.add-phone')}
            </p>
            <div className="grid items-end gap-6">
              <InputPhoneField
                id="phone-number"
                name="phoneNumber"
                type="tel"
                inputMode="tel"
                className="w-full"
                autoComplete="tel"
                defaultValue={defaultState?.phoneNumber ?? ''}
                errorMessage={errors?.phoneNumber}
                label={t('apply-child:contact-information.phone-number')}
                maxLength={100}
                aria-describedby="adding-phone"
              />
              <InputPhoneField
                id="phone-number-alt"
                name="phoneNumberAlt"
                type="tel"
                inputMode="tel"
                className="w-full"
                autoComplete="tel"
                defaultValue={defaultState?.phoneNumberAlt ?? ''}
                errorMessage={errors?.phoneNumberAlt}
                label={t('apply-child:contact-information.phone-number-alt')}
                maxLength={100}
                aria-describedby="adding-phone"
              />
            </div>
          </fieldset>
          <fieldset className="mb-6">
            <legend className="mb-4 font-lato text-2xl font-bold">{t('apply-child:contact-information.email-header')}</legend>
            <p id="adding-email" className="mb-4">
              {t('apply-child:contact-information.add-email')}
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <InputField
                id="email"
                name="email"
                type="email"
                inputMode="email"
                className="w-full"
                autoComplete="email"
                defaultValue={defaultState?.email ?? ''}
                errorMessage={errors?.['email']}
                label={t('apply-child:contact-information.email')}
                maxLength={64}
                aria-describedby="adding-email"
              />
              <InputField
                id="confirm-email"
                name="confirmEmail"
                type="email"
                inputMode="email"
                className="w-full"
                autoComplete="email"
                defaultValue={defaultState?.email ?? ''}
                errorMessage={errors?.confirmEmail}
                label={t('apply-child:contact-information.confirm-email')}
                maxLength={64}
                aria-describedby="adding-email"
              />
            </div>
          </fieldset>
          <fieldset className="mb-6">
            <legend className="mb-4 font-lato text-2xl font-bold">{t('apply-child:contact-information.mailing-address.header')}</legend>
            <div className="space-y-6">
              <InputSanitizeField
                id="mailing-address"
                name="mailingAddress"
                className="w-full"
                label={t('apply-child:contact-information.address-field.address')}
                maxLength={30}
                helpMessagePrimary={t('apply-child:contact-information.address-field.address-note')}
                helpMessagePrimaryClassName="text-black"
                autoComplete="address-line1"
                defaultValue={defaultState?.mailingAddress ?? ''}
                errorMessage={errors?.mailingAddress}
                required
              />
              <InputSanitizeField
                id="mailing-apartment"
                name="mailingApartment"
                className="w-full"
                label={t('apply-child:contact-information.address-field.apartment')}
                maxLength={30}
                autoComplete="address-line2"
                defaultValue={defaultState?.mailingApartment ?? ''}
                errorMessage={errors?.mailingApartment}
              />
              <InputSelect
                id="mailing-country"
                name="mailingCountry"
                className="w-full sm:w-1/2"
                label={t('apply-child:contact-information.address-field.country')}
                autoComplete="country"
                defaultValue={defaultState?.mailingCountry ?? ''}
                errorMessage={errors?.mailingCountry}
                options={[dummyOption, ...countries]}
                onChange={mailingCountryChangeHandler}
                required
              />
              {mailingRegions.length > 0 && (
                <InputSelect
                  id="mailing-province"
                  name="mailingProvince"
                  className="w-full sm:w-1/2"
                  label={t('apply-child:contact-information.address-field.province')}
                  defaultValue={defaultState?.mailingProvince ?? ''}
                  errorMessage={errors?.mailingProvince}
                  options={[dummyOption, ...mailingRegions]}
                  required
                />
              )}
              <div className="grid items-end gap-6 md:grid-cols-2">
                <InputSanitizeField
                  id="mailing-city"
                  name="mailingCity"
                  className="w-full"
                  label={t('apply-child:contact-information.address-field.city')}
                  maxLength={100}
                  autoComplete="address-level2"
                  defaultValue={defaultState?.mailingCity ?? ''}
                  errorMessage={errors?.mailingCity}
                  required
                />
                <InputSanitizeField
                  id="mailing-postal-code"
                  name="mailingPostalCode"
                  className="w-full"
                  label={mailingPostalCodeRequired ? t('apply-child:contact-information.address-field.postal-code') : t('apply-child:contact-information.address-field.postal-code-optional')}
                  maxLength={100}
                  autoComplete="postal-code"
                  defaultValue={defaultState?.mailingPostalCode ?? ''}
                  errorMessage={errors?.mailingPostalCode}
                  required={mailingPostalCodeRequired}
                />
              </div>
            </div>
          </fieldset>
          <fieldset className="mb-8">
            <legend className="mb-4 font-lato text-2xl font-bold">{t('apply-child:contact-information.home-address.header')}</legend>
            <div className="space-y-6">
              <InputCheckbox id="copyMailingAddress" name="copyMailingAddress" value="copy" checked={copyAddressChecked} onChange={checkHandler}>
                {t('apply-child:contact-information.home-address.use-mailing-address')}
              </InputCheckbox>
              {!copyAddressChecked && (
                <>
                  <InputSanitizeField
                    id="home-address"
                    name="homeAddress"
                    className="w-full"
                    label={t('apply-child:contact-information.address-field.address')}
                    helpMessagePrimary={t('apply-child:contact-information.address-field.address-note')}
                    helpMessagePrimaryClassName="text-black"
                    maxLength={30}
                    autoComplete="address-line1"
                    defaultValue={defaultState?.homeAddress ?? ''}
                    errorMessage={errors?.homeAddress}
                    required
                  />
                  <InputSanitizeField
                    id="home-apartment"
                    name="homeApartment"
                    className="w-full"
                    label={t('apply-child:contact-information.address-field.apartment')}
                    maxLength={30}
                    autoComplete="address-line2"
                    defaultValue={defaultState?.homeApartment ?? ''}
                    errorMessage={errors?.homeApartment}
                  />
                  <InputSelect
                    id="home-country"
                    name="homeCountry"
                    className="w-full sm:w-1/2"
                    label={t('apply-child:contact-information.address-field.country')}
                    autoComplete="country"
                    defaultValue={defaultState?.homeCountry ?? ''}
                    errorMessage={errors?.homeCountry}
                    options={[dummyOption, ...countries]}
                    onChange={homeCountryChangeHandler}
                    required
                  />
                  {homeRegions.length > 0 && (
                    <InputSelect
                      id="home-province"
                      name="homeProvince"
                      className="w-full sm:w-1/2"
                      label={t('apply-child:contact-information.address-field.province')}
                      defaultValue={defaultState?.homeProvince ?? ''}
                      errorMessage={errors?.homeProvince}
                      options={[dummyOption, ...homeRegions]}
                      required
                    />
                  )}
                  <div className="mb-6 grid items-end gap-6 md:grid-cols-2">
                    <InputSanitizeField
                      id="home-city"
                      name="homeCity"
                      className="w-full"
                      label={t('apply-child:contact-information.address-field.city')}
                      maxLength={100}
                      autoComplete="address-level2"
                      defaultValue={defaultState?.homeCity ?? ''}
                      errorMessage={errors?.homeCity}
                      required
                    />
                    <InputSanitizeField
                      id="home-postal-code"
                      name="homePostalCode"
                      className="w-full"
                      label={homePostalCodeRequired ? t('apply-child:contact-information.address-field.postal-code') : t('apply-child:contact-information.address-field.postal-code-optional')}
                      maxLength={100}
                      autoComplete="postal-code"
                      defaultValue={defaultState?.homePostalCode ?? ''}
                      errorMessage={errors?.homePostalCode}
                      required={homePostalCodeRequired}
                    />
                  </div>
                </>
              )}
            </div>
          </fieldset>
          {editMode ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" id="continue-button" disabled={isSubmitting} data-gc-analytics-customclick="ESDC-EDSC:CDCP Online Application Form-Child:Save - Personal information click">
                {t('apply-child:contact-information.save-btn')}
              </Button>
              <ButtonLink
                id="back-button"
                routeId="$lang/_public/apply/$id/child/review-adult-information"
                params={params}
                disabled={isSubmitting}
                data-gc-analytics-customclick="ESDC-EDSC:CDCP Online Application Form-Child:Cancel - Personal information click"
              >
                {t('apply-child:contact-information.cancel-btn')}
              </ButtonLink>
            </div>
          ) : (
            <div className="flex flex-row-reverse flex-wrap items-center justify-end gap-3">
              <LoadingButton variant="primary" id="continue-button" loading={isSubmitting} endIcon={faChevronRight} data-gc-analytics-customclick="ESDC-EDSC:CDCP Online Application Form-Child:Continue - Personal information click">
                {t('apply-child:contact-information.continue')}
              </LoadingButton>
              <ButtonLink
                id="back-button"
                routeId={[MARITAL_STATUS_CODE_COMMONLAW, MARITAL_STATUS_CODE_MARRIED].includes(Number(maritalStatus)) ? '$lang/_public/apply/$id/child/partner-information' : '$lang/_public/apply/$id/child/applicant-information'}
                params={params}
                disabled={isSubmitting}
                startIcon={faChevronLeft}
                data-gc-analytics-customclick="ESDC-EDSC:CDCP Online Application Form-Child:Back - Personal information click"
              >
                {t('apply-child:contact-information.back')}
              </ButtonLink>
            </div>
          )}
        </fetcher.Form>
      </div>
    </>
  );
}
