import { useMemo, useState } from 'react';

import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { useFetcher, useLoaderData, useParams } from '@remix-run/react';

import { Trans, useTranslation } from 'react-i18next';
import validator from 'validator';
import { z } from 'zod';

import pageIds from '../../page-ids.json';
import { Button, ButtonLink } from '~/components/buttons';
import { ErrorSummary, createErrorSummaryItems } from '~/components/error-summary';
import { InputRadios } from '~/components/input-radios';
import { InputSelect } from '~/components/input-select';
import { getInstrumentationService } from '~/services/instrumentation-service.server';
import { getLookupService } from '~/services/lookup-service.server';
import { getRaoidcService } from '~/services/raoidc-service.server';
import { featureEnabled, getEnv } from '~/utils/env.server';
import { getNameByLanguage, getTypedI18nNamespaces } from '~/utils/locale-utils';
import { getFixedT } from '~/utils/locale-utils.server';
import { getLogger } from '~/utils/logging.server';
import { mergeMeta } from '~/utils/meta-utils';
import { getPathById } from '~/utils/route-utils';
import type { RouteHandleData } from '~/utils/route-utils';
import { getTitleMetaTags } from '~/utils/seo-utils';

enum HasFederalBenefitsOption {
  No = 'no',
  Yes = 'yes',
}

enum HasProvincialTerritorialBenefitsOption {
  No = 'no',
  Yes = 'yes',
}

interface FederalBenefitsState {
  hasFederalBenefits: boolean;
  federalSocialProgram?: string;
}

interface ProvincialTerritorialBenefitsState {
  hasProvincialTerritorialBenefits: boolean;
  provincialTerritorialSocialProgram?: string;
  province?: string;
}

export type DentalBenefitsState = FederalBenefitsState & ProvincialTerritorialBenefitsState;

export const handle = {
  breadcrumbs: [
    // prettier-ignore
    { labelI18nKey: 'access-to-governmental-benefits:access-to-governmental-benefits.edit.page-title' },
  ],
  i18nNamespaces: getTypedI18nNamespaces('access-to-governmental-benefits', 'gcweb'),
  pageIdentifier: pageIds.protected.accessToGovermentalBenefits.edit,
  pageTitleI18nKey: 'access-to-governmental-benefits:access-to-governmental-benefits.edit.page-title',
} as const satisfies RouteHandleData;

export const meta: MetaFunction<typeof loader> = mergeMeta(({ data }) => {
  return data ? getTitleMetaTags(data.meta.title) : [];
});

export async function loader({ context: { session }, params, request }: LoaderFunctionArgs) {
  featureEnabled('update-governmental-benefit');
  const instrumentationService = getInstrumentationService();
  const raoidcService = await getRaoidcService();
  const csrfToken = String(session.get('csrfToken'));

  const { CANADA_COUNTRY_ID } = getEnv();
  const lookupService = getLookupService();

  const federalSocialPrograms = await lookupService.getAllFederalSocialPrograms();
  const allRegions = await lookupService.getAllRegions();
  const regions = allRegions.filter((region) => region.countryId === CANADA_COUNTRY_ID);
  const provincialTerritorialSocialPrograms = await lookupService.getAllProvincialTerritorialSocialPrograms();

  await raoidcService.handleSessionValidation(request, session);

  const t = await getFixedT(request, handle.i18nNamespaces);
  const meta = { title: t('gcweb:meta.title.template', { title: t('access-to-governmental-benefits:access-to-governmental-benefits.edit.page-title') }) };

  instrumentationService.countHttpStatus('access-to-governmental-benefits.edit', 200);
  return json({ meta, t, federalSocialPrograms, regions, provincialTerritorialSocialPrograms, csrfToken });
}

export async function action({ context: { session }, params, request }: ActionFunctionArgs) {
  const log = getLogger('access-to-governmental-benefits/edit');
  const t = await getFixedT(request, handle.i18nNamespaces);

  // NOTE: state validation schemas are independent otherwise user have to anwser
  // both question first before the superRefine can be executed
  const federalBenefitsSchema = z
    .object({
      hasFederalBenefits: z.boolean({ errorMap: () => ({ message: t('access-to-governmental-benefits:access-to-governmental-benefits.edit.error-message.federal-benefit-required') }) }),
      federalSocialProgram: z.string().trim().optional(),
    })
    .superRefine((val, ctx) => {
      if (val.hasFederalBenefits) {
        if (!val.federalSocialProgram || validator.isEmpty(val.federalSocialProgram)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('access-to-governmental-benefits:access-to-governmental-benefits.edit.error-message.federal-benefit-program-required'), path: ['federalSocialProgram'] });
        }
      }
    })
    .transform((val) => {
      return {
        ...val,
        federalSocialProgram: val.hasFederalBenefits ? val.federalSocialProgram : undefined,
      };
    }) satisfies z.ZodType<FederalBenefitsState>;

  const provincialTerritorialBenefitsSchema = z
    .object({
      hasProvincialTerritorialBenefits: z.boolean({ errorMap: () => ({ message: t('access-to-governmental-benefits:access-to-governmental-benefits.edit.error-message.provincial-benefit-required') }) }),
      provincialTerritorialSocialProgram: z.string().trim().optional(),
      province: z.string().trim().optional(),
    })
    .superRefine((val, ctx) => {
      if (val.hasProvincialTerritorialBenefits) {
        if (!val.province || validator.isEmpty(val.province)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('access-to-governmental-benefits:access-to-governmental-benefits.edit.error-message.provincial-territorial-required'), path: ['province'] });
        } else if (!val.provincialTerritorialSocialProgram || validator.isEmpty(val.provincialTerritorialSocialProgram)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('access-to-governmental-benefits:access-to-governmental-benefits.edit.error-message.provincial-benefit-program-required'), path: ['provincialTerritorialSocialProgram'] });
        }
      }
    })
    .transform((val) => {
      return {
        ...val,
        province: val.hasProvincialTerritorialBenefits ? val.province : undefined,
        provincialTerritorialSocialProgram: val.hasProvincialTerritorialBenefits ? val.provincialTerritorialSocialProgram : undefined,
      };
    }) satisfies z.ZodType<ProvincialTerritorialBenefitsState>;

  const formData = await request.formData();
  const expectedCsrfToken = String(session.get('csrfToken'));
  const submittedCsrfToken = String(formData.get('_csrf'));

  if (expectedCsrfToken !== submittedCsrfToken) {
    log.warn('Invalid CSRF token detected; expected: [%s], submitted: [%s]', expectedCsrfToken, submittedCsrfToken);
    throw new Response('Invalid CSRF token', { status: 400 });
  }

  const dentalBenefits = {
    hasFederalBenefits: formData.get('hasFederalBenefits') ? formData.get('hasFederalBenefits') === HasFederalBenefitsOption.Yes : undefined,
    federalSocialProgram: formData.get('federalSocialProgram') ? String(formData.get('federalSocialProgram')) : undefined,
    hasProvincialTerritorialBenefits: formData.get('hasProvincialTerritorialBenefits') ? formData.get('hasProvincialTerritorialBenefits') === HasProvincialTerritorialBenefitsOption.Yes : undefined,
    provincialTerritorialSocialProgram: formData.get('provincialTerritorialSocialProgram') ? String(formData.get('provincialTerritorialSocialProgram')) : undefined,
    province: formData.get('province') ? String(formData.get('province')) : undefined,
  };

  const parsedFederalBenefitsResult = federalBenefitsSchema.safeParse(dentalBenefits);
  const parsedProvincialTerritorialBenefitsResult = provincialTerritorialBenefitsSchema.safeParse(dentalBenefits);

  if (!parsedFederalBenefitsResult.success || !parsedProvincialTerritorialBenefitsResult.success) {
    return json({
      errors: {
        ...(!parsedFederalBenefitsResult.success ? parsedFederalBenefitsResult.error.format() : {}),
        ...(!parsedProvincialTerritorialBenefitsResult.success ? parsedProvincialTerritorialBenefitsResult.error.format() : {}),
      },
    });
  }

  const instrumentationService = getInstrumentationService();
  const raoidcService = await getRaoidcService();
  await raoidcService.handleSessionValidation(request, session);

  instrumentationService.countHttpStatus('access-to-governmental-benefits.edit', 302);
  // TODO: Add service call to update user's federal and provinical tax benefits
  session.set('personal-info-updated', true);
  return redirect(getPathById('$lang+/_protected+/access-to-governmental-benefits+/view', params));
}

export default function AccessToGovernmentalsBenefitsEdit() {
  const { i18n, t } = useTranslation(handle.i18nNamespaces);
  const { csrfToken, federalSocialPrograms, provincialTerritorialSocialPrograms, regions } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const errorSummaryId = 'error-summary';

  // Keys order should match the input IDs order.
  const errorMessages = useMemo(
    () => ({
      'input-radio-has-federal-benefits-option-0': fetcher.data?.errors.hasFederalBenefits?._errors[0],
      'input-radio-federal-social-programs-option-0': fetcher.data?.errors.federalSocialProgram?._errors[0],
      'input-radio-has-provincial-territorial-benefits-option-0': fetcher.data?.errors.hasProvincialTerritorialBenefits?._errors[0],
      province: fetcher.data?.errors.province?._errors[0],
      'input-radio-provincial-territorial-social-programs-option-0': fetcher.data?.errors.provincialTerritorialSocialProgram?._errors[0],
    }),
    [
      fetcher.data?.errors.hasFederalBenefits?._errors,
      fetcher.data?.errors.federalSocialProgram?._errors,
      fetcher.data?.errors.province?._errors,
      fetcher.data?.errors.hasProvincialTerritorialBenefits?._errors,
      fetcher.data?.errors.provincialTerritorialSocialProgram?._errors,
    ],
  );
  const params = useParams();
  const errorSummaryItems = createErrorSummaryItems(errorMessages);
  const [hasFederalBenefitValue, setHasFederalBenefitValue] = useState<boolean>();
  const [provincialTerritorialSocialProgramValue, setProvincialTerritorialSocialProgramValue] = useState<string>();

  const [hasProvincialTerritorialBenefitValue, setHasProvincialTerritorialBenefitValue] = useState<boolean>();
  const [provinceValue, setProvinceValue] = useState<string>();

  const sortedRegions = useMemo(
    () =>
      regions.sort((a, b) => {
        const nameA = i18n.language === 'en' ? a.nameEn : a.nameFr;
        const nameB = i18n.language === 'en' ? b.nameEn : b.nameFr;
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      }),
    [i18n.language, regions],
  );

  function handleOnHasProvincialTerritorialBenefitChanged(e: React.ChangeEvent<HTMLInputElement>) {
    setHasProvincialTerritorialBenefitValue(e.target.value === HasProvincialTerritorialBenefitsOption.Yes);
    if (e.target.value !== HasProvincialTerritorialBenefitsOption.Yes) {
      setProvinceValue(undefined);
      setProvincialTerritorialSocialProgramValue(undefined);
    }
  }

  function handleOnProvincialTerritorialSocialProgramChanged(e: React.ChangeEvent<HTMLInputElement>) {
    setProvincialTerritorialSocialProgramValue(e.target.value);
  }

  function handleOnRegionChanged(e: React.ChangeEvent<HTMLSelectElement>) {
    setProvinceValue(e.target.value);
    setProvincialTerritorialSocialProgramValue(undefined);
  }

  function handleOnHasFederalBenefitChanged(e: React.ChangeEvent<HTMLInputElement>) {
    setHasFederalBenefitValue(e.target.value === HasFederalBenefitsOption.Yes);
  }

  return (
    <div className="max-w-prose">
      <>
        <div className="max-w-prose">
          {errorSummaryItems.length > 0 && <ErrorSummary id={errorSummaryId} errors={errorSummaryItems} />}
          <fetcher.Form method="post" noValidate aria-describedby="access-to-benefits-note eligibility-note form-instructions">
            <input type="hidden" name="_csrf" value={csrfToken} />

            <section>
              <p className="mb-4" id="access-to-benefits-note">
                {t('access-to-governmental-benefits:access-to-governmental-benefits.edit.access-to-dental')}
              </p>
              <p className="mb-4" id="eligibility-note">
                {t('access-to-governmental-benefits:access-to-governmental-benefits.edit.eligibility-criteria')}
              </p>
              <p className="mb-6 italic" id="form-instructions">
                {t('access-to-governmental-benefits:access-to-governmental-benefits.edit.required-label')}
              </p>
              <h2 className="my-6 mb-6 font-lato text-2xl font-bold">{t('access-to-governmental-benefits:access-to-governmental-benefits.edit.federal-benefits.title')}</h2>
              <InputRadios
                id="has-federal-benefits"
                name="hasFederalBenefits"
                legend={t('access-to-governmental-benefits:access-to-governmental-benefits.edit.federal-benefits.legend')}
                options={[
                  {
                    children: <Trans ns={handle.i18nNamespaces} i18nKey="access-to-governmental-benefits:access-to-governmental-benefits.edit.federal-benefits.option-no" />,
                    value: HasFederalBenefitsOption.No,
                    onChange: handleOnHasFederalBenefitChanged,
                  },
                  {
                    children: <Trans ns={handle.i18nNamespaces} i18nKey="access-to-governmental-benefits:access-to-governmental-benefits.edit.federal-benefits.option-yes" />,
                    value: HasFederalBenefitsOption.Yes,
                    onChange: handleOnHasFederalBenefitChanged,
                    append: hasFederalBenefitValue === true && (
                      <InputRadios
                        id="federal-social-programs"
                        name="federalSocialProgram"
                        legend={t('access-to-governmental-benefits:access-to-governmental-benefits.edit.federal-benefits.social-programs.legend')}
                        options={federalSocialPrograms.map((option) => ({
                          children: getNameByLanguage(i18n.language, option),
                          value: option.id,
                        }))}
                      />
                    ),
                  },
                ]}
                required
              />
            </section>
            <section>
              <h2 className="my-6 mb-6 font-lato text-2xl font-bold"> {t('access-to-governmental-benefits:access-to-governmental-benefits.edit.provincial-territorial-benefits.title')}</h2>
              <InputRadios
                id="has-provincial-territorial-benefits"
                name="hasProvincialTerritorialBenefits"
                legend={t('access-to-governmental-benefits:access-to-governmental-benefits.edit.provincial-territorial-benefits.legend')}
                options={[
                  {
                    children: <Trans ns={handle.i18nNamespaces} i18nKey="access-to-governmental-benefits:access-to-governmental-benefits.edit.provincial-territorial-benefits.option-no" />,
                    value: HasProvincialTerritorialBenefitsOption.No,
                    onChange: handleOnHasProvincialTerritorialBenefitChanged,
                  },
                  {
                    children: <Trans ns={handle.i18nNamespaces} i18nKey="access-to-governmental-benefits:access-to-governmental-benefits.edit.provincial-territorial-benefits.option-yes" />,
                    value: HasProvincialTerritorialBenefitsOption.Yes,
                    onChange: handleOnHasProvincialTerritorialBenefitChanged,
                    append: hasProvincialTerritorialBenefitValue === true && (
                      <div className="space-y-6">
                        <InputSelect
                          id="province"
                          name="province"
                          className="w-full sm:w-1/2"
                          label={t('access-to-governmental-benefits:access-to-governmental-benefits.edit.provincial-territorial-benefits.social-programs.input-legend')}
                          onChange={handleOnRegionChanged}
                          options={[
                            { children: t('access-to-governmental-benefits:access-to-governmental-benefits.edit.select-one'), value: '', hidden: true },
                            ...sortedRegions.map((region) => ({
                              key: region.provinceTerritoryStateId,
                              id: region.provinceTerritoryStateId,
                              value: region.provinceTerritoryStateId,
                              children: getNameByLanguage(i18n.language, region),
                            })),
                          ]}
                          required
                        />
                        {
                          <InputRadios
                            id="provincial-territorial-social-programs"
                            name="provincialTerritorialSocialProgram"
                            legend={t('access-to-governmental-benefits:access-to-governmental-benefits.edit.provincial-territorial-benefits.social-programs.radio-legend')}
                            options={provincialTerritorialSocialPrograms
                              .filter((program) => program.provinceTerritoryStateId === provinceValue)
                              .map((option) => ({
                                children: getNameByLanguage(i18n.language, option),
                                value: option.id,
                                checked: provincialTerritorialSocialProgramValue === option.id,
                                onChange: handleOnProvincialTerritorialSocialProgramChanged,
                              }))}
                            required
                          />
                        }
                      </div>
                    ),
                  },
                ]}
                required
              />
            </section>
            <div className="mt-8 flex flex-row-reverse flex-wrap items-center justify-end gap-3">
              <ButtonLink id="back-button" routeId="$lang+/_protected+/access-to-governmental-benefits+/view" params={params}>
                {t('access-to-governmental-benefits:access-to-governmental-benefits.edit.button.back')}
              </ButtonLink>
              <Button id="save-button" variant="primary">
                {t('access-to-governmental-benefits:access-to-governmental-benefits.edit.button.save')}
              </Button>
            </div>
          </fetcher.Form>
        </div>
      </>
    </div>
  );
}
