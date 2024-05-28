import moize from 'moize';
import { z } from 'zod';

import { getAuditService } from '~/services/audit-service.server';
import { getInstrumentationService } from '~/services/instrumentation-service.server';
import { getEnv } from '~/utils/env.server';
import { getLogger } from '~/utils/logging.server';

const log = getLogger('subscription-service.server');

const subscriptionInfoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  msLanguageCode: z.string(),
  alertTypeCode: z.string(),
});

type SubscriptionInfo = z.infer<typeof subscriptionInfoSchema>;

/**
 * Return a singleton instance (by means of memomization) of the subscription service.
 */
export const getSubscriptionService = moize(createSubscriptionService, { onCacheAdd: () => log.info('Creating new subscription service') });

function createSubscriptionService() {
  const { CDCP_API_BASE_URI } = getEnv();

  async function getSubscription(userId: string) {
    const auditService = getAuditService();
    const instrumentationService = getInstrumentationService();
    auditService.audit('alert-subscription.get', { userId });
    //TODO, for a future PR, use HATEOAS links to get the /subscriptions endpoint
    const url = new URL(`${CDCP_API_BASE_URI}/api/v1/users/${userId}/subscriptions`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    instrumentationService.countHttpStatus('http.client.cdcp-api.alert-subscription.gets', response.status);

    const newSchema = z.object({
      _embedded: z.object({
        subscriptions: z.array(
          z.object({
            id: z.string(),
            msLanguageCode: z.string(),
            alertTypeCode: z.string(),
          }),
        ),
      }),
      _links: z.object({
        self: z.object({
          href: z.string(),
        }),
      }),
    });

    const subscriptions = newSchema.parse(await response.json())._embedded.subscriptions.map((subscription) => ({
      id: subscription.id,
      preferredLanguage: subscription.msLanguageCode,
      alertType: subscription.alertTypeCode,
    }));

    //TODO: alertType 'cdcp' is configuarable
    return subscriptions.filter((subscription) => subscription.alertType === 'cdcp').at(0);
  }

  async function updateSubscription(sin: string, subscription: SubscriptionInfo) {
    const auditService = getAuditService();
    const instrumentationService = getInstrumentationService();
    auditService.audit('alert-subscription.update', { sin });

    // TODO: "IT-Security won't like SIN being passed as identifier"
    // TODO: add CDCP_API_BASE_URI
    const userId = sin;
    const url = new URL(`https://api.cdcp.example.com/v1/users/${userId}/subscriptions`);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription),
    });

    instrumentationService.countHttpStatus('http.client.cdcp-api.alert-subscription.posts', response.status);

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      log.error('%j', {
        message: 'Failed to update data',
        status: response.status,
        statusText: response.statusText,
        url: url,
        responseBody: await response.text(),
      });

      throw new Error(`Failed to fetch data. Status: ${response.status}, Status Text: ${response.statusText}`);
    }
  }

  async function validateConfirmationCode(userEmail: string, enteredConfirmationCode: string, userId: string) {
    const auditService = getAuditService();
    const instrumentationService = getInstrumentationService();

    auditService.audit('alert-subscription.validate', { userId });

    const dataToPass = {
      email: userEmail,
      confirmationCode: enteredConfirmationCode,
    };
    // TODO: add CDCP_API_BASE_URI
    const url = new URL(`https://api.cdcp.example.com/v1/codes/verify`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToPass),
    });

    instrumentationService.countHttpStatus('http.client.cdcp-api.codes.verify.posts', response.status);
    if (!response.ok) {
      log.error('%j', {
        message: 'Failed to verify data',
        status: response.status,
        statusText: response.statusText,
        url: url,
        responseBody: await response.text(),
      });

      throw new Error(`Failed to verify data. Status: ${response.status}, Status Text: ${response.statusText}`);
    }

    return response;
  }

  async function requestNewConfirmationCode(userEmail: string, userId: string) {
    const auditService = getAuditService();
    const instrumentationService = getInstrumentationService();

    auditService.audit('alert-subscription.request-confirmation-code', { userId });

    const dataToPass = {
      email: userEmail,
    };
    // TODO: add CDCP_API_BASE_URI
    const url = new URL(`https://api.cdcp.example.com/v1/codes/request`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToPass),
    });

    instrumentationService.countHttpStatus('http.client.cdcp-api.codes.request.posts', response.status);
    if (!response.ok) {
      log.error('%j', {
        message: 'Failed to request data',
        status: response.status,
        statusText: response.statusText,
        url: url,
        responseBody: await response.text(),
      });

      throw new Error(`Failed to request data. Status: ${response.status}, Status Text: ${response.statusText}`);
    }

    return response;
  }

  return { getSubscription, updateSubscription, validateConfirmationCode, requestNewConfirmationCode };
}
